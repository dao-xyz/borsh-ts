import {
  BinaryReader,
  BinaryWriter,
  FixedArrayKind,
  OptionKind,
  StringType,
  VecKind,
  deserialize,
  field,
  serialize,
  variant,
} from "@dao-xyz/borsh";
import type {
  AbstractType,
  Constructor,
  FieldType,
  IntegerType,
} from "@dao-xyz/borsh";

// Lightweight RPC over Borsh-encoded messages

export interface RpcTransport {
  send(data: Uint8Array): void;
  onMessage(handler: (data: Uint8Array) => void): () => void; // returns unsubscribe
}

type StreamSpec = { stream: FieldType };
type MethodSchema = {
  args?: FieldType | FieldType[]; // if omitted, no payload; if array, multiple args
  returns?: FieldType | "void" | StreamSpec; // 'void' means awaitable completion with empty payload; stream enables AsyncIterable
};

export type RpcSchema<T> = Partial<Record<keyof T & string, MethodSchema>>;

type Pending = {
  resolve: (value: any) => void;
  reject: (err: any) => void;
  decode: (reader: BinaryReader) => any;
};

class AsyncQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private waiters: {
    resolve: (v: IteratorResult<T>) => void;
    reject: (e: any) => void;
  }[] = [];
  private ended = false;
  private error: any = undefined;
  enqueue(v: T) {
    if (this.ended || this.error) return;
    if (this.waiters.length)
      this.waiters.shift()!.resolve({ value: v, done: false });
    else this.values.push(v);
  }
  close() {
    if (this.ended) return;
    this.ended = true;
    while (this.waiters.length)
      this.waiters.shift()!.resolve({ value: undefined as any, done: true });
  }
  fail(e: any) {
    if (this.error || this.ended) return;
    this.error = e;
    while (this.waiters.length) this.waiters.shift()!.reject(e);
  }
  private async _next(): Promise<IteratorResult<T>> {
    if (this.error) return Promise.reject(this.error);
    if (this.values.length) return { value: this.values.shift()!, done: false };
    if (this.ended) return { value: undefined as any, done: true };
    return new Promise<IteratorResult<T>>((resolve, reject) =>
      this.waiters.push({ resolve, reject }),
    );
  }
  [Symbol.asyncIterator]() {
    return { next: () => this._next() };
  }
}

// Borsh-encoded message frames
// Using decorated classes to keep encoding consistent with the library

abstract class Message { }

class RequestHeader {
  @field({ type: "u32" }) id: number;
  @field({ type: "string" }) method: string;
  constructor(id?: number, method?: string) {
    this.id = id;
    this.method = method;
  }
}

class ResponseHeader {
  @field({ type: "u32" }) id: number;
  @field({ type: "string" }) method: string;
  constructor(id?: number, method?: string) {
    this.id = id;
    this.method = method;
  }
}

@variant(0)
class Request extends Message {
  @field({ type: RequestHeader }) header: RequestHeader;
  @field({ type: Uint8Array }) payload: Uint8Array; // inner payload encoded according to arg FieldType
  constructor(header?: RequestHeader, payload?: Uint8Array) {
    super();
    this.header = header;
    this.payload = payload;
  }
}

@variant(1)
class Ok extends Message {
  @field({ type: ResponseHeader }) header: ResponseHeader;
  @field({ type: Uint8Array }) payload: Uint8Array; // inner payload
  constructor(header?: ResponseHeader, payload?: Uint8Array) {
    super();
    this.header = header;
    this.payload = payload;
  }
}

@variant(2)
class Err extends Message {
  @field({ type: ResponseHeader }) header: ResponseHeader;
  @field({ type: "string" }) message: string;
  constructor(header?: ResponseHeader, message?: string) {
    super();
    this.header = header;
    this.message = message;
  }
}

@variant(3)
class Stream extends Message {
  @field({ type: ResponseHeader }) header: ResponseHeader;
  @field({ type: Uint8Array }) payload: Uint8Array;
  constructor(header?: ResponseHeader, payload?: Uint8Array) {
    super();
    this.header = header;
    this.payload = payload;
  }
}

@variant(4)
class StreamEnd extends Message {
  @field({ type: ResponseHeader }) header: ResponseHeader;
  constructor(header?: ResponseHeader) {
    super();
    this.header = header;
  }
}

@variant(5)
class StreamErr extends Message {
  @field({ type: ResponseHeader }) header: ResponseHeader;
  @field({ type: "string" }) message: string;
  constructor(header?: ResponseHeader, message?: string) {
    super();
    this.header = header;
    this.message = message;
  }
}

function writeField(value: any, type: FieldType, writer: BinaryWriter) {
  // Tagged union support
  if (isUnionKind(type)) {
    const u = type as UnionKindImpl;
    // pick case: guard when provided, otherwise automatic heuristic per case
    let chosen: UnionCase | undefined;
    for (const c of u.cases) {
      const ok = c.guard ? (c.guard as any)(value) : matchesType(value, c.type);
      if (ok) {
        chosen = c;
        break;
      }
    }
    if (!chosen) {
      throw new Error("UnionKind: could not determine case for value");
    }
    // write tag
    const tagToWrite =
      (chosen as any).tag !== undefined
        ? (chosen as any).tag
        : u.cases.indexOf(chosen);
    if (u.tagType === "string") writer.string(String(tagToWrite));
    else if (u.tagType === "u16") writer.u16(Number(tagToWrite));
    else writer.u8(Number(tagToWrite));
    // write payload (apply optional encode)
    const encoded = chosen.encode ? chosen.encode(value) : value;
    writeField(encoded, chosen.type as any, writer);
    return;
  }
  // Primitive integers, floats, bool, and string
  if (typeof type === "string") {
    return BinaryWriter.write(type as IntegerType | "bool" | "string")(
      value,
      writer,
    );
  }

  // Uint8Array
  if (type === Uint8Array) {
    return BinaryWriter.uint8Array(value, writer);
  }

  // Option
  if (type instanceof OptionKind) {
    if (value == null) {
      writer.u8(0);
      return;
    }
    writer.u8(1);
    return writeField(value, (type as any).elementType, writer);
  }

  // Vec
  if (type instanceof VecKind) {
    const v = type as any;
    const len = (value as any[] | Uint8Array).length;
    // write length using selected encoding
    if ((v as any).sizeEncoding === "u8") writer.u8(len);
    else if ((v as any).sizeEncoding === "u16") writer.u16(len);
    else writer.u32(len);
    for (let i = 0; i < len; i++) {
      writeField(value[i], (v as any).elementType, writer);
    }
    return;
  }

  // FixedArray
  if (type instanceof FixedArrayKind) {
    const f = type as any;
    const len = (value as any[] | Uint8Array).length;
    if (len !== (f as any).length) {
      throw new Error(
        `Fixed array length mismatch: expected ${(f as any).length}, got ${len}`,
      );
    }
    for (let i = 0; i < len; i++) {
      writeField(value[i], (f as any).elementType, writer);
    }
    return;
  }

  // StringType with custom length
  if (type instanceof StringType) {
    const [lenWriter, width] = BinaryWriter.smallNumberEncoding(
      (type as any).sizeEncoding,
    );
    return BinaryWriter.stringCustom(value, writer, lenWriter, width);
  }

  // Class decorated with Borsh schema
  if (typeof type === "function") {
    // rely on class serialize via borsh
    const bytes = serialize(value);
    writer.uint8Array(bytes);
    return;
  }

  throw new Error("Unsupported FieldType in RPC");
}

function readField(reader: BinaryReader, type: FieldType): any {
  // Tagged union support
  if (isUnionKind(type)) {
    const u = type as UnionKindImpl;
    let tag: number | string;
    if (u.tagType === "string") tag = reader.string();
    else if (u.tagType === "u16") tag = reader.u16();
    else tag = reader.u8();
    let c = u.cases.find(
      (x) => x.tag !== undefined && String(x.tag) === String(tag),
    );
    if (!c && typeof tag === "number" && u.tagType !== "string") {
      // fallback: use tag as index when case tags are unspecified
      c = u.cases[tag as number];
    }
    if (!c) throw new Error(`UnionKind: unknown tag ${String(tag)}`);
    const raw = readField(reader, c.type as any);
    return c.decode ? c.decode(raw) : raw;
  }
  if (typeof type === "string") {
    return BinaryReader.read(type as IntegerType | "bool" | "string")(
      reader as any,
    );
  }
  if (type === Uint8Array) {
    return reader.uint8Array();
  }
  // Option
  if (type instanceof OptionKind) {
    const has = reader.u8();
    if (!has) return undefined;
    return readField(reader, (type as any).elementType);
  }
  // Vec
  if (type instanceof VecKind) {
    const sizeEnc = (type as any).sizeEncoding as "u8" | "u16" | "u32";
    const len =
      sizeEnc === "u8"
        ? reader.u8()
        : sizeEnc === "u16"
          ? reader.u16()
          : reader.u32();
    const arr: any[] = new Array(len);
    for (let i = 0; i < len; i++)
      arr[i] = readField(reader, (type as any).elementType);
    return arr;
  }
  // FixedArray
  if (type instanceof FixedArrayKind) {
    const len = (type as any).length as number;
    const arr: any[] = new Array(len);
    for (let i = 0; i < len; i++)
      arr[i] = readField(reader, (type as any).elementType);
    return arr;
  }
  // StringType
  if (type instanceof StringType) {
    const sizeReader = BinaryReader.read(
      (type as any).sizeEncoding,
			/*fromBuffer*/ false,
    ) as (r: BinaryReader) => number;
    return BinaryReader.stringCustom(reader, sizeReader);
  }
  // Class decorated with Borsh schema
  if (typeof type === "function") {
    const payload = reader.uint8Array();
    return deserialize(payload, type as Constructor<any> | AbstractType<any>);
  }
  throw new Error("Unsupported FieldType in RPC");
}

// Type helpers to make proxies always async
export type AsyncifyFunction<F> = F extends (...args: infer A) => infer R
  ? (
    ...args: A
  ) => R extends AsyncIterable<infer U>
    ? AsyncIterable<U>
    : R extends Iterable<infer U>
    ? AsyncIterable<U>
    : Promise<Awaited<R>>
  : never;

export type Asyncify<T> = T extends (...args: any) => any
  ? AsyncifyFunction<T>
  : T extends object
  ? { [K in keyof T]: Asyncify<T[K]> }
  : T;

// Synced field accessor surface
export type SyncedAccessor<T> = {
  // Preferred push-style API
  subscribe(cb: (value: T) => void): () => void; // returns unsubscribe
  unsubscribe(cb: (value: T) => void): void;
  // Convenience pull-style helpers (compat)
  get(): Promise<T>;
  set(value: T): Promise<void>;
  watch(): AsyncIterable<T>;
};

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type IsPrimitive<T> = T extends Primitive ? true : false;

// Proxy shape:
// - method keys => asyncified functions
// - non-function primitive keys => synced accessor
// - non-function object keys => nested RpcProxy
export type RpcProxy<T> = {
  [K in keyof T as T[K] extends (...args: any) => any
  ? K
  : never]: AsyncifyFunction<T[K]>;
} & {
  [K in keyof T as T[K] extends (...args: any) => any ? never : K]: IsPrimitive<
    T[K]
  > extends true
  ? SyncedAccessor<T[K]>
  : RpcProxy<T[K]>;
};

// Compile-time assertion helpers
type IsAsyncReturn<R> =
  R extends Promise<any>
  ? true
  : R extends AsyncIterable<any> | Iterable<any>
  ? true
  : false;
export type MustBeAsync<F> = F extends (...args: any) => infer R
  ? IsAsyncReturn<R> extends true
  ? F
  : never
  : F;
export type AssertServiceAsync<T> = {
  [K in keyof T as T[K] extends (...args: any) => any ? K : never]: MustBeAsync<
    T[K]
  >;
};

// Synced fields metadata and decorator
export const RPC_SYNC_FIELDS_KEY: unique symbol = Symbol.for(
  "borsh-ts.rpc.synced",
);
type SyncedFieldEntry = { type: FieldType };
type SyncedFieldsMap = Record<string, SyncedFieldEntry>; // key is fully-qualified path when flattened

export function syncedField(type: FieldType): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const ctor = target.constructor as RpcDecoratedCtor<any>;
    const existing: Record<string, FieldType> = ((ctor as any)[
      RPC_SYNC_FIELDS_KEY
    ] ??= {});
    existing[String(propertyKey)] = type;
  };
}

export function createRpcProxy<T extends object>(
  transport: RpcTransport,
  schema: Record<string, MethodSchema>,
  syncedFields?: SyncedFieldsMap,
  eventsMap?: Record<
    string,
    { payloadType: FieldType; envelopeCtor: Constructor<any> }
  >,
  presenceMap?: Record<string, { settable: boolean }>,
): RpcProxy<T> {
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const streams = new Map<number, { q: AsyncQueue<any> }>();
  const cache = new Map<string, any>();
  const subscribers = new Map<string, Set<(v: any) => void>>();
  const watching = new Set<string>();
  const unsubscribe = transport.onMessage((data) => {
    // Determine which message variant this is using top-level deserialize to abstract Message
    const r = new BinaryReader(data);
    // Peek discriminator by cloning buffer (deserialize will handle variants)
    const msg = deserialize(
      new Uint8Array(r._buf),
      Message as unknown as Constructor<any>,
    );
    if (msg instanceof Ok) {
      const { id, method } = msg.header;
      const p = pending.get(id);
      if (!p) return;
      try {
        const pr = new BinaryReader(msg.payload);
        const value = p.decode(pr);
        p.resolve(value);
      } catch (e) {
        p.reject(e);
      } finally {
        pending.delete(id);
      }
    } else if (msg instanceof Err) {
      const { id } = msg.header;
      const p = pending.get(id);
      p?.reject(new Error(msg.message));
      pending.delete(id);
    } else if (msg instanceof Stream) {
      const { id, method } = msg.header;
      const s = streams.get(id);
      if (!s) return;
      try {
        const spec = (schema as any)[method] as MethodSchema | undefined;
        if (
          !spec ||
          typeof spec.returns !== "object" ||
          !("stream" in spec.returns)
        )
          return;
        const pr = new BinaryReader(msg.payload);
        const item = readField(pr, (spec.returns as any).stream as FieldType);
        s.q.enqueue(item);
      } catch (e) {
        s.q.fail(e);
      }
    } else if (msg instanceof StreamEnd) {
      const { id } = msg.header;
      const s = streams.get(id);
      if (s) {
        s.q.close();
        streams.delete(id);
      }
    } else if (msg instanceof StreamErr) {
      const { id } = msg.header;
      const s = streams.get(id);
      if (s) {
        s.q.fail(new Error(msg.message));
        streams.delete(id);
      }
    }
  });
  // Allow consumer to clean up
  (transport as any)._rpcUnsub = unsubscribe;

  function callUnary(
    method: string,
    argsSpec: FieldType | FieldType[] | undefined,
    returnsSpec: MethodSchema["returns"],
    callArgs: any[],
  ): Promise<any> | void | AsyncIterable<any> {
    const id = nextId++;
    const payloadWriter = new BinaryWriter();
    if (argsSpec !== undefined) {
      if (Array.isArray(argsSpec)) {
        if (callArgs.length !== argsSpec.length) {
          throw new Error(
            `RPC '${method}' expects ${argsSpec.length} args, got ${callArgs.length}`,
          );
        }
        for (let i = 0; i < argsSpec.length; i++)
          writeField(callArgs[i], argsSpec[i], payloadWriter);
      } else {
        writeField(callArgs[0], argsSpec, payloadWriter);
      }
    }
    const payload = payloadWriter.finalize();
    const frame = new Request(new RequestHeader(id, method), payload);
    const out = serialize(frame);
    if (
      typeof returnsSpec === "object" &&
      returnsSpec &&
      "stream" in returnsSpec
    ) {
      const q = new AsyncQueue<any>();
      streams.set(id, { q });
      transport.send(out);
      return q as AsyncIterable<any>;
    }
    if (returnsSpec === undefined) {
      transport.send(out);
      return; // fire-and-forget
    }
    return new Promise((resolve, reject) => {
      pending.set(id, {
        resolve,
        reject,
        decode: (rdr) => {
          if (returnsSpec === "void") return undefined;
          return readField(rdr, returnsSpec as FieldType);
        },
      });
      transport.send(out);
    });
  }

  // Simple typed EventTarget implementation for client side
  class RpcEventEmitter<
    EventMap extends Record<string, any>,
  > extends EventTarget {
    #listeners = new Map<string, { once: boolean; cb: any }[]>();
    listenerCount(type: string): number {
      return this.#listeners.get(type)?.length ?? 0;
    }
    override addEventListener(
      type: string,
      listener: any,
      options?: boolean | AddEventListenerOptions,
    ): void {
      super.addEventListener(type, listener, options as any);
      const list = this.#listeners.get(type) ?? [];
      list.push({
        cb: listener,
        once:
          (options !== true && options !== false && (options as any)?.once) ??
          false,
      });
      this.#listeners.set(type, list);
    }
    override removeEventListener(
      type: string,
      listener?: any,
      options?: boolean | EventListenerOptions,
    ): void {
      super.removeEventListener(type, listener as any, options as any);
      const list = this.#listeners.get(type);
      if (!list) return;
      this.#listeners.set(
        type,
        list.filter((l) => l.cb !== listener),
      );
    }
    override dispatchEvent(event: Event): boolean {
      const ok = super.dispatchEvent(event);
      const list = this.#listeners.get(event.type);
      if (list)
        this.#listeners.set(
          event.type,
          list.filter((l) => !l.once),
        );
      return ok;
    }
    safeDispatchEvent<Detail>(type: string, detail?: CustomEventInit<Detail>) {
      return this.dispatchEvent(new CustomEvent(type, detail));
    }
  }

  const eventEmitters = new Map<string, InstanceType<any>>();

  function makeProxy(prefix: string): any {
    const handler: ProxyHandler<any> = {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        const full = prefix + prop;
        const spec = (schema as Record<string, MethodSchema | undefined>)[full];
        const hasChildren = Object.keys(schema).some((k) =>
          k.startsWith(full + "."),
        );
        const isSynced = !!syncedFields && !!(syncedFields as any)[full];
        const isEventHost = !!eventsMap && !!(eventsMap as any)[full];
        // Special accessor for presence on child proxies: child.$present
        if (prop === "$present" && presenceMap && prefix.endsWith(".")) {
          const targetPath = prefix.slice(0, -1); // remove trailing dot
          if ((presenceMap as any)[targetPath]) {
            return {
              subscribe: (cb: (v: boolean) => void) => {
                let set = subscribers.get(`$present:${targetPath}`);
                if (!set) {
                  set = new Set();
                  subscribers.set(`$present:${targetPath}`, set);
                }
                set.add(cb as any);
                // Start watch stream
                if (!watching.has(`$present:${targetPath}`)) {
                  watching.add(`$present:${targetPath}`);
                  (async () => {
                    const it = callUnary(
                      `$presentWatch:${targetPath}`,
                      undefined,
                      { stream: "bool" } as any,
                      [],
                    ) as AsyncIterable<boolean>;
                    try {
                      for await (const v of it) {
                        const subs = subscribers.get(`$present:${targetPath}`);
                        if (subs)
                          for (const fn of Array.from(subs))
                            try {
                              (fn as any)(v);
                            } catch { }
                      }
                    } catch {
                    } finally {
                      watching.delete(`$present:${targetPath}`);
                    }
                  })();
                }
                return () => {
                  const s = subscribers.get(`$present:${targetPath}`);
                  if (s) s.delete(cb as any);
                };
              },
              unsubscribe: (cb: (v: boolean) => void) => {
                const s = subscribers.get(`$present:${targetPath}`);
                if (s) s.delete(cb as any);
              },
              get: async () => {
                return (await callUnary(
                  `$present:${targetPath}`,
                  undefined,
                  "bool",
                  [],
                )) as boolean;
              },
              set: async (v: boolean) => {
                if ((presenceMap as any)[targetPath].settable) {
                  await callUnary(`$presentSet:${targetPath}`, "bool", "void", [
                    v,
                  ]);
                } else {
                  throw new Error(
                    "Presence is not settable for this subservice",
                  );
                }
              },
              watch: () =>
                callUnary(
                  `$presentWatch:${targetPath}`,
                  undefined,
                  { stream: "bool" } as any,
                  [],
                ) as AsyncIterable<boolean>,
            } as SyncedAccessor<boolean>;
          }
        }
        if (isEventHost) {
          let emitter = eventEmitters.get(full);
          if (!emitter) {
            emitter = new RpcEventEmitter<any>();
            eventEmitters.set(full, emitter);
            // Start consuming the stream
            (async () => {
              try {
                const it = callUnary(
                  `$events:${full}`,
                  undefined,
                  { stream: (eventsMap as any)[full].envelopeCtor } as any,
                  [],
                ) as AsyncIterable<any>;
                for await (const env of it) {
                  (emitter as any).dispatchEvent(
                    new CustomEvent(env.type, { detail: env.detail }),
                  );
                }
              } catch (_) {
                // stream ended or errored; will restart on next access if needed
                eventEmitters.delete(full);
              }
            })();
          }
          return emitter;
        }
        if (isSynced) {
          const type = (syncedFields as any)[full].type as FieldType;
          return {
            subscribe: (cb: (v: any) => void) => {
              let set = subscribers.get(full);
              if (!set) {
                set = new Set();
                subscribers.set(full, set);
              }
              set.add(cb);
              if (!watching.has(full)) {
                watching.add(full);
                (async () => {
                  const it = callUnary(
                    `$watch:${full}`,
                    undefined,
                    { stream: type } as any,
                    [],
                  ) as AsyncIterable<any>;
                  try {
                    for await (const v of it) {
                      cache.set(full, v);
                      const subs = subscribers.get(full);
                      if (subs)
                        for (const fn of Array.from(subs))
                          try {
                            fn(v);
                          } catch { }
                    }
                  } catch {
                    // stream ended or failed; we'll allow re-subscribe to restart
                  } finally {
                    watching.delete(full);
                  }
                })();
              }
              // return unsubscribe function
              return () => {
                const s = subscribers.get(full);
                if (s) s.delete(cb);
              };
            },
            unsubscribe: (cb: (v: any) => void) => {
              const s = subscribers.get(full);
              if (s) s.delete(cb);
            },
            get: async () => {
              if (cache.has(full)) return cache.get(full);
              const v = (await callUnary(
                `$get:${full}`,
                undefined,
                type,
                [],
              )) as any;
              cache.set(full, v);
              return v;
            },
            set: async (v: any) => {
              await callUnary(`$set:${full}`, type, "void", [v]);
              cache.set(full, v);
              const subs = subscribers.get(full);
              if (subs)
                for (const fn of Array.from(subs))
                  try {
                    fn(v);
                  } catch { }
            },
            watch: () =>
              callUnary(
                `$watch:${full}`,
                undefined,
                { stream: type } as any,
                [],
              ) as AsyncIterable<any>,
          } as SyncedAccessor<any>;
        }
        if (!spec && hasChildren) {
          return new Proxy({}, makeProxy(full + ".") as any);
        }
        if (!spec) {
          // default: fire-and-forget with no payload
          return () => {
            callUnary(full, undefined, undefined, [] as any);
          };
        }
        // streaming return
        if (
          typeof spec.returns === "object" &&
          spec.returns &&
          "stream" in spec.returns
        ) {
          return (...callArgs: any[]) =>
            callUnary(
              full,
              spec.args as any,
              spec.returns as any,
              callArgs,
            ) as AsyncIterable<any>;
        }
        return (...callArgs: any[]) =>
          callUnary(
            full,
            spec.args as any,
            spec.returns as any,
            callArgs,
          ) as any;
      },
      set(_target, prop, value) {
        if (typeof prop !== "string") return false;
        const full = prefix + prop;
        const isSynced = !!syncedFields && !!(syncedFields as any)[full];
        if (isSynced) {
          const type = (syncedFields as any)[full].type as FieldType;
          // fire-and-forget set, update local cache and notify local subscribers
          callUnary(`$set:${full}`, type, "void", [value]);
          cache.set(full, value);
          const subs = subscribers.get(full);
          if (subs)
            for (const fn of Array.from(subs))
              try {
                fn(value);
              } catch { }
          return true;
        }
        // do not actually assign unknown props on the proxy
        return true;
      },
    };
    return handler;
  }

  return new Proxy({}, makeProxy("")) as any;
}

export function bindRpcReceiver<T extends object>(
  instance: T,
  transport: RpcTransport,
  schema: Record<string, MethodSchema>,
) {
  return transport.onMessage(async (data) => {
    const msg = deserialize(
      new Uint8Array(data),
      Message as unknown as Constructor<any>,
    );
    if (!(msg instanceof Request)) return;
    const { id, method } = msg.header;
    const pr = new BinaryReader(msg.payload);
    const spec = (schema as any)[method] as MethodSchema | undefined;
    // Resolve nested target and method name
    let target: any = instance;
    let funcName = method;
    // Handle synced field helpers specially: "$op:path.to.prop"
    if (
      method.startsWith("$get:") ||
      method.startsWith("$set:") ||
      method.startsWith("$watch:")
    ) {
      const idx = method.indexOf(":");
      const op = method.slice(0, idx); // $get / $set / $watch
      const path = method.slice(idx + 1); // e.g. a.b.c
      const parts = path.split(".");
      const prop = parts.pop() as string;
      for (const p of parts) target = target?.[p];
      funcName = `${op}:${prop}`;
    } else if (method.includes(".")) {
      const parts = method.split(".");
      funcName = parts.pop() as string;
      for (const p of parts) {
        target = target?.[p];
      }
    }
    if (!spec || typeof target?.[funcName] !== "function") {
      const out = serialize(
        new Err(new ResponseHeader(id, method), `Unknown method: ${method}`),
      );
      transport.send(out);
      return;
    }
    try {
      let callResult: any;
      if (spec.args === undefined) {
        callResult = await (target as any)[funcName]();
      } else if (Array.isArray(spec.args)) {
        const values: any[] = new Array(spec.args.length);
        for (let i = 0; i < spec.args.length; i++)
          values[i] = readField(pr, spec.args[i]);
        callResult = await (target as any)[funcName](...values);
      } else {
        const single = readField(pr, spec.args);
        callResult = await (target as any)[funcName](single);
      }
      // streaming
      if (
        typeof spec.returns === "object" &&
        spec.returns &&
        "stream" in spec.returns
      ) {
        const header = new ResponseHeader(id, method);
        const sendChunk = (val: any) => {
          const w = new BinaryWriter();
          writeField(val, (spec.returns as any).stream as FieldType, w);
          const payload = w.finalize();
          const out = serialize(new Stream(header, payload));
          transport.send(out);
        };
        const sendEnd = () => transport.send(serialize(new StreamEnd(header)));
        const sendErr = (e: any) =>
          transport.send(
            serialize(new StreamErr(header, String(e?.message || e))),
          );
        (async () => {
          try {
            const it: any = callResult;
            if (it && typeof it[Symbol.asyncIterator] === "function") {
              for await (const v of it as AsyncIterable<any>) sendChunk(v);
            } else if (it && typeof it[Symbol.iterator] === "function") {
              for (const v of it as Iterable<any>) sendChunk(v);
            } else {
              sendErr(new Error("Server method did not return an iterable"));
              return;
            }
            sendEnd();
          } catch (e) {
            sendErr(e);
          }
        })();
        return; // do not send Ok
      }
      if (spec.returns === undefined) {
        return; // fire-and-forget
      }
      const payloadW = new BinaryWriter();
      let payload: Uint8Array;
      if (spec.returns === "void") {
        payload = new Uint8Array(0);
      } else {
        writeField(callResult, spec.returns as FieldType, payloadW);
        payload = payloadW.finalize();
      }
      const out = serialize(new Ok(new ResponseHeader(id, method), payload));
      transport.send(out);
    } catch (e: any) {
      const errMsg = String(e?.message || e);
      const out = serialize(new Err(new ResponseHeader(id, method), errMsg));
      transport.send(out);
    }
  });
}

// In-memory transport pair for testing/demo
export class LoopbackPair {
  a: RpcTransport;
  b: RpcTransport;
  constructor() {
    const aHandlers: Array<(d: Uint8Array) => void> = [];
    const bHandlers: Array<(d: Uint8Array) => void> = [];
    this.a = {
      send: (data) => {
        for (const h of bHandlers.slice()) h(data);
      },
      onMessage: (h) => {
        aHandlers.push(h);
        return () => {
          const i = aHandlers.indexOf(h);
          if (i >= 0) aHandlers.splice(i, 1);
        };
      },
    };
    this.b = {
      send: (data) => {
        for (const h of aHandlers.slice()) h(data);
      },
      onMessage: (h) => {
        bHandlers.push(h);
        return () => {
          const i = bHandlers.indexOf(h);
          if (i >= 0) bHandlers.splice(i, 1);
        };
      },
    };
  }
}

// Decorator-driven ergonomics
export const RPC_SCHEMA_KEY: unique symbol = Symbol.for("borsh-ts.rpc.schema");
export const RPC_CHILDREN_KEY: unique symbol = Symbol.for(
  "borsh-ts.rpc.children",
);
export const RPC_EVENTS_KEY: unique symbol = Symbol.for("borsh-ts.rpc.events");

type ChildMeta = { ctor: RpcDecoratedCtor<any>; lazy?: boolean };

export type RpcDecoratedCtor<T extends object = any> = (new (
  ...args: any[]
) => T) & {
  [RPC_SCHEMA_KEY]?: RpcSchema<T>;
  [RPC_CHILDREN_KEY]?: Record<string, ChildMeta>;
  [RPC_EVENTS_KEY]?: Record<string, FieldType>;
  createProxy?: (transport: RpcTransport) => T;
  bind?: (transport: RpcTransport, instance?: T) => () => void;
  Proxy?: new (transport: RpcTransport) => T;
  rpcSchema?: RpcSchema<T>;
};

function ensureSchema<T extends object>(
  ctor: RpcDecoratedCtor<T>,
): RpcSchema<T> {
  const existing = (ctor as any)[RPC_SCHEMA_KEY] as RpcSchema<T> | undefined;
  if (existing) return existing;
  const created: RpcSchema<T> = {} as any;
  (ctor as any)[RPC_SCHEMA_KEY] = created;
  return created;
}

export function method(spec: MethodSchema): MethodDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const ctor = target.constructor as RpcDecoratedCtor<any>;
    const schema = ensureSchema(ctor);
    schema[String(propertyKey)] = spec;
  };
}

export function subservice(
  childCtor: RpcDecoratedCtor<any>,
  options?: { lazy?: boolean },
): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const ctor = target.constructor as RpcDecoratedCtor<any>;
    const key = String(propertyKey);
    const children = (ctor[RPC_CHILDREN_KEY] ??= {} as Record<
      string,
      ChildMeta
    >);
    children[key] = { ctor: childCtor, lazy: options?.lazy };
  };
}

// Event decorator: marks a property as an event emitter host.
// payloadType is the borsh FieldType for CustomEvent.detail
export function events(payloadType: FieldType): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const ctor = target.constructor as RpcDecoratedCtor<any>;
    const key = String(propertyKey);
    const evs = ((ctor as any)[RPC_EVENTS_KEY] ??= {} as Record<
      string,
      FieldType
    >);
    evs[key] = payloadType;
  };
}

function getLocalSynced(
  ctor: RpcDecoratedCtor<any>,
): Record<string, FieldType> | undefined {
  return (ctor as any)[RPC_SYNC_FIELDS_KEY] as
    | Record<string, FieldType>
    | undefined;
}

function flattenSchema(
  ctor: RpcDecoratedCtor<any>,
  prefix = "",
  collectSynced?: SyncedFieldsMap,
  collectEvents?: Record<
    string,
    { payloadType: FieldType; envelopeCtor: Constructor<any> }
  >,
  collectPresence?: Record<string, { settable: boolean }>,
): Record<string, MethodSchema> {
  const flat: Record<string, MethodSchema> = {};
  const local = (ctor as any)[RPC_SCHEMA_KEY] as RpcSchema<any> | undefined;
  if (local) {
    for (const [k, v] of Object.entries(local)) if (v) flat[prefix + k] = v;
  }
  const synced = getLocalSynced(ctor);
  if (synced) {
    for (const [k, t] of Object.entries(synced)) {
      const fq = prefix + k;
      flat[`$get:${fq}`] = { returns: t };
      flat[`$set:${fq}`] = { args: t, returns: "void" } as any;
      flat[`$watch:${fq}`] = { returns: { stream: t } as any };
      if (collectSynced) collectSynced[fq] = { type: t };
    }
  }
  // Attach event streams for properties marked with @events
  const evs = (ctor as any)[RPC_EVENTS_KEY] as
    | Record<string, FieldType>
    | undefined;
  if (evs) {
    for (const [k, t] of Object.entries(evs)) {
      const fq = prefix + k;
      const Envelope = makeEventEnvelopeType(t);
      flat[`$events:${fq}`] = { returns: { stream: Envelope } as any };
      if (collectEvents)
        collectEvents[fq] = { payloadType: t, envelopeCtor: Envelope as any };
    }
  }
  const children = (ctor as any)[RPC_CHILDREN_KEY] as
    | Record<string, ChildMeta>
    | undefined;
  if (children) {
    for (const [name, meta] of Object.entries(children)) {
      const fq = prefix + name;
      if (meta.lazy) {
        // presence helpers
        (flat as any)[`$present:${fq}`] = { returns: "bool" } as MethodSchema;
        (flat as any)[`$presentWatch:${fq}`] = {
          returns: { stream: "bool" } as any,
        } as MethodSchema;
        // Do not expose set by default; require explicit policy later if needed
        if (collectPresence) collectPresence[fq] = { settable: false };
      }
      const childFlat = flattenSchema(
        meta.ctor,
        fq + ".",
        collectSynced,
        collectEvents,
        collectPresence,
      );
      Object.assign(flat, childFlat);
    }
  }
  return flat;
}

function ensureChildInstances<T extends object>(
  instance: T,
  ctor: RpcDecoratedCtor<T>,
) {
  const children = (ctor as any)[RPC_CHILDREN_KEY] as
    | Record<string, ChildMeta>
    | undefined;
  if (!children) return;
  for (const [name, meta] of Object.entries(children)) {
    const current = (instance as any)[name];
    if (!meta.lazy) {
      if (!current) (instance as any)[name] = new (meta.ctor as any)();
      ensureChildInstances((instance as any)[name], meta.ctor);
    } else {
      if (current) ensureChildInstances(current, meta.ctor);
    }
  }
}

// Hooks for lazy subservices: when a property is assigned, wire handlers
const LAZY_CHILD_VALUES: unique symbol = Symbol.for(
  "borsh-ts.rpc.children.lazy.values",
);
const LAZY_CHILD_PRESENCE: unique symbol = Symbol.for(
  "borsh-ts.rpc.children.lazy.presence",
);
function attachLazyChildHooks(instance: any, ctor: RpcDecoratedCtor<any>) {
  const children = (ctor as any)[RPC_CHILDREN_KEY] as
    | Record<string, ChildMeta>
    | undefined;
  if (!children) return;
  if (!instance[LAZY_CHILD_VALUES])
    instance[LAZY_CHILD_VALUES] = new Map<string, any>();
  if (!instance[LAZY_CHILD_PRESENCE])
    instance[LAZY_CHILD_PRESENCE] = new Map<string, Set<AsyncQueue<boolean>>>();
  const store: Map<string, any> = instance[LAZY_CHILD_VALUES];
  const presenceWatchers: Map<string, Set<AsyncQueue<boolean>>> = instance[
    LAZY_CHILD_PRESENCE
  ];
  for (const [name, meta] of Object.entries(children)) {
    if (!meta.lazy) {
      if (instance[name]) attachLazyChildHooks(instance[name], meta.ctor);
      continue;
    }
    const ownDesc = Object.getOwnPropertyDescriptor(instance, name);
    if (ownDesc && !ownDesc.configurable) {
      // cannot redefine, but recurse if present
      if (instance[name]) attachLazyChildHooks(instance[name], meta.ctor);
      continue;
    }
    if (!store.has(name)) store.set(name, instance[name]);
    Object.defineProperty(instance, name, {
      configurable: true,
      enumerable: true,
      get() {
        return store.get(name);
      },
      set(v: any) {
        const prev = store.get(name);
        // teardown previous if replacing with a different instance or unsetting
        if (prev && prev !== v) {
          const d =
            prev.dispose ||
            prev.close ||
            prev.stop ||
            (prev as any)[Symbol.asyncDispose];
          try {
            const r = typeof d === "function" ? d.call(prev) : undefined;
            if (r && typeof r.then === "function")
              (r as Promise<any>).catch(() => { });
          } catch { }
        }
        store.set(name, v);
        // notify presence watchers
        const set = presenceWatchers.get(name);
        if (set) for (const q of set) q.enqueue(!!v);
        if (v) {
          ensureChildInstances(v, meta.ctor);
          attachSyncedHandlers(v, meta.ctor);
          attachEventHandlers(v, meta.ctor);
          attachLazyChildHooks(v, meta.ctor);
        }
      },
    });
    const existing = store.get(name);
    if (existing) (instance as any)[name] = existing;
    // Presence helper methods
    const fq = name;
    const getName = `$present:${fq}`;
    const watchName = `$presentWatch:${fq}`;
    if (typeof instance[getName] !== "function") {
      Object.defineProperty(instance, getName, {
        value: () => {
          return !!store.get(name);
        },
      });
    }
    if (typeof instance[watchName] !== "function") {
      Object.defineProperty(instance, watchName, {
        value: () => {
          const q = new AsyncQueue<boolean>();
          // emit current presence first
          q.enqueue(!!store.get(name));
          let set = presenceWatchers.get(name);
          if (!set) {
            set = new Set();
            presenceWatchers.set(name, set);
          }
          set.add(q as any);
          return q as AsyncIterable<boolean>;
        },
      });
    }
  }
}

export function service<TBase extends new (...args: any[]) => any>(): <
  C extends TBase,
>(
  ctor: C,
) => C & {
  createProxy: (transport: RpcTransport) => RpcProxy<InstanceType<C>>;
  bind: (transport: RpcTransport, instance?: InstanceType<C>) => () => void;
  Proxy: new (transport: RpcTransport) => RpcProxy<InstanceType<C>>;
  rpcSchema: RpcSchema<InstanceType<C>>;
} {
  return (ctor: any) => {
    const c = ctor as RpcDecoratedCtor<any>;
    const schema = ensureSchema(c);
    // Attach introspection property
    if (!(c as any).rpcSchema) {
      Object.defineProperty(c, "rpcSchema", {
        value: schema,
        writable: false,
        enumerable: false,
      });
    }
    // Static createProxy
    c.createProxy = (transport: RpcTransport) => {
      const synced: SyncedFieldsMap = {};
      const events: Record<
        string,
        { payloadType: FieldType; envelopeCtor: Constructor<any> }
      > = {};
      const presence: Record<string, { settable: boolean }> = {};
      const flat = flattenSchema(c, "", synced, events, presence);
      return createRpcProxy(transport, flat, synced, events, presence) as any;
    };
    // Static bind helper
    c.bind = (transport: RpcTransport, instance?: any) => {
      const inst = instance ?? new (c as any)();
      ensureChildInstances(inst, c);
      attachSyncedHandlers(inst, c);
      attachEventHandlers(inst, c);
      attachLazyChildHooks(inst, c);
      const synced: SyncedFieldsMap = {};
      const flat = flattenSchema(c, "", synced);
      return bindRpcReceiver(inst, transport, flat);
    };
    // new-able Proxy helper
    const Named = {
      [c.name + "Proxy"]: class {
        constructor(t: RpcTransport) {
          const synced: SyncedFieldsMap = {};
          const events: Record<
            string,
            { payloadType: FieldType; envelopeCtor: Constructor<any> }
          > = {};
          const presence: Record<string, { settable: boolean }> = {};
          const flat = flattenSchema(c, "", synced, events, presence);
          return createRpcProxy(t, flat, synced, events, presence) as any;
        }
      },
    } as any;
    c.Proxy = Named[c.name + "Proxy"];
    return c as any;
  };
}

// Backwards-compatible aliases
export const rpcMethod = method;
export const rpcService = service;

export function getRpcSchema<T extends object>(
  ctor: RpcDecoratedCtor<T>,
): RpcSchema<T> | undefined {
  return (ctor as any)[RPC_SCHEMA_KEY] as RpcSchema<T> | undefined;
}

// ---------- Union FieldType helper ----------
export type UnionCase = {
  tag?: number | string;
  type: FieldType;
  guard?: (v: any) => boolean;
  encode?: (v: any) => any;
  decode?: (payload: any) => any;
};
class UnionKindImpl {
  kind = "union" as const;
  tagType: "u8" | "u16" | "string";
  cases: UnionCase[];
  constructor(
    cases: UnionCase[],
    opts?: { tagType?: "u8" | "u16" | "string" },
  ) {
    this.cases = cases;
    this.tagType = opts?.tagType ?? "u8";
  }
}
function isUnionKind(x: any): x is UnionKindImpl {
  return !!x && typeof x === "object" && x.kind === "union";
}
function matchesType(v: any, t: FieldType): boolean {
  if (typeof t === "string") {
    if (t === "string") return typeof v === "string";
    // numbers/bools
    if (t === "bool") return typeof v === "boolean";
    // integer/float encodings map to number/bigint; prefer number
    return typeof v === "number" || typeof v === "bigint";
  }
  if (t === Uint8Array) return v instanceof Uint8Array;
  if (t instanceof OptionKind)
    return v == null || matchesType(v, (t as any).elementType);
  if (t instanceof VecKind) return Array.isArray(v);
  if (t instanceof FixedArrayKind) return Array.isArray(v);
  if (t instanceof StringType) return typeof v === "string";
  if (typeof t === "function") return v instanceof (t as any);
  return false;
}
function isFieldTypeValue(x: any): x is FieldType {
  if (typeof x === "string") return true;
  if (typeof x === "function") return true; // class/constructor
  if (x === Uint8Array) return true;
  if (x instanceof OptionKind) return true;
  if (x instanceof VecKind) return true;
  if (x instanceof FixedArrayKind) return true;
  if (x instanceof StringType) return true;
  return false;
}
export function union(
  cases: Array<UnionCase | FieldType>,
  opts?: { tagType?: "u8" | "u16" | "string" },
): any {
  const normalized: UnionCase[] = cases.map((c) =>
    isFieldTypeValue(c) ? ({ type: c } as UnionCase) : (c as UnionCase),
  );
  return new UnionKindImpl(normalized, opts) as any;
}

// Typed helpers for decorated classes (works with legacy decorators in TS)
export function createProxyFromService<C extends new (...args: any[]) => any>(
  ctor: C,
  transport: RpcTransport,
): RpcProxy<InstanceType<C>> {
  const synced: SyncedFieldsMap = {};
  const events: Record<
    string,
    { payloadType: FieldType; envelopeCtor: Constructor<any> }
  > = {};
  const presence: Record<string, { settable: boolean }> = {};
  const flat = flattenSchema(ctor as any, "", synced, events, presence);
  return createRpcProxy(transport, flat, synced, events, presence) as any;
}

export function bindService<C extends new (...args: any[]) => any>(
  ctor: C,
  transport: RpcTransport,
  instance?: InstanceType<C>,
): () => void {
  const inst = (instance ?? new ctor()) as any;
  ensureChildInstances(inst, ctor as any);
  attachSyncedHandlers(inst, ctor as any);
  attachEventHandlers(inst, ctor as any);
  attachLazyChildHooks(inst, ctor as any);
  const synced: SyncedFieldsMap = {};
  const flat = flattenSchema(ctor as any, "", synced);
  return bindRpcReceiver(inst, transport, flat);
}

// Runtime handler injection for synced fields on the server side
const SYNC_WATCHERS: unique symbol = Symbol.for("borsh-ts.rpc.synced.watchers");
function attachSyncedHandlers(instance: any, ctor: RpcDecoratedCtor<any>) {
  const synced = getLocalSynced(ctor);
  if (synced) {
    if (!instance[SYNC_WATCHERS])
      instance[SYNC_WATCHERS] = new Map<string, Set<AsyncQueue<any>>>();
    const watchers: Map<string, Set<AsyncQueue<any>>> = instance[SYNC_WATCHERS];
    for (const [prop, type] of Object.entries(synced)) {
      const getName = `$get:${prop}`;
      const setName = `$set:${prop}`;
      const watchName = `$watch:${prop}`;
      if (typeof instance[getName] !== "function") {
        Object.defineProperty(instance, getName, {
          value: () => instance[prop],
        });
      }
      if (typeof instance[setName] !== "function") {
        Object.defineProperty(instance, setName, {
          value: (v: any) => {
            instance[prop] = v;
            const set = watchers.get(prop);
            if (set) for (const q of set) q.enqueue(v);
          },
        });
      }
      if (typeof instance[watchName] !== "function") {
        Object.defineProperty(instance, watchName, {
          value: () => {
            const q = new AsyncQueue<any>();
            // emit current value first
            q.enqueue(instance[prop]);
            let set = watchers.get(prop);
            if (!set) {
              set = new Set();
              watchers.set(prop, set);
            }
            set.add(q);
            return q as AsyncIterable<any>;
          },
        });
      }
    }
  }
  const children = (ctor as any)[RPC_CHILDREN_KEY] as
    | Record<string, ChildMeta>
    | undefined;
  if (children) {
    for (const [name, meta] of Object.entries(children)) {
      if (instance[name]) attachSyncedHandlers(instance[name], meta.ctor);
    }
  }
}

// ---- Events support ----

function makeEventEnvelopeType(payloadType: FieldType): Constructor<any> {
  class EventEnvelope {
    @field({ type: "string" }) type: string;
    @field({ type: payloadType as any }) detail: any;
    constructor(type?: string, detail?: any) {
      this.type = type as any;
      this.detail = detail;
    }
  }
  return EventEnvelope as any;
}

const SYNC_EVENT_WATCHERS: unique symbol = Symbol.for(
  "borsh-ts.rpc.events.watchers",
);
function attachEventHandlers(instance: any, ctor: RpcDecoratedCtor<any>) {
  const evs = (ctor as any)[RPC_EVENTS_KEY] as
    | Record<string, FieldType>
    | undefined;
  if (evs) {
    if (!instance[SYNC_EVENT_WATCHERS])
      instance[SYNC_EVENT_WATCHERS] = new Map<string, Set<AsyncQueue<any>>>();
    const watchers: Map<string, Set<AsyncQueue<any>>> = instance[
      SYNC_EVENT_WATCHERS
    ];
    for (const [prop, payloadType] of Object.entries(evs)) {
      // Ensure property exists
      const emitter: any = instance[prop];
      if (!emitter || typeof emitter.dispatchEvent !== "function") {
        // Create a minimal EventTarget-compatible emitter if missing
        instance[prop] = new (class extends (globalThis as any)
          .EventTarget { })();
      }
      const key = prop;
      const Envelope = makeEventEnvelopeType(payloadType);
      const watchName = `$events:${prop}`;
      if (typeof instance[watchName] !== "function") {
        Object.defineProperty(instance, watchName, {
          value: () => {
            const q = new AsyncQueue<any>();
            let set = watchers.get(key);
            if (!set) {
              set = new Set();
              watchers.set(key, set);
            }
            set.add(q);
            return q as AsyncIterable<any>;
          },
        });
      }
      // Patch dispatchEvent once to fan-out events to watchers
      const host: any = instance[prop];
      if (!host.__rpcEventsPatched) {
        host.__rpcEventsPatched = true;
        const orig = host.dispatchEvent.bind(host);
        host.dispatchEvent = (event: Event) => {
          try {
            const set = watchers.get(key);
            if (set && (event as any).type) {
              const detail = (event as any).detail;
              // forward as envelope
              for (const q of set)
                q.enqueue(new (Envelope as any)((event as any).type, detail));
            }
          } catch { }
          return orig(event);
        };
      }
    }
  }
  const children = (ctor as any)[RPC_CHILDREN_KEY] as
    | Record<string, ChildMeta>
    | undefined;
  if (children) {
    for (const [name, meta] of Object.entries(children)) {
      if (instance[name]) attachEventHandlers(instance[name], meta.ctor);
    }
  }
}

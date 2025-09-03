# @dao-xyz/borsh-rpc

[![NPM @dao-xyz/borsh-rpc](https://img.shields.io/npm/v/@dao-xyz/borsh-rpc.svg?style=flat-square)](https://npmjs.com/@dao-xyz/borsh-rpc)

Lightweight RPC over Borsh-encoded messages with decorators and schema-driven proxies.

- Message framing: Request/Ok/Err/Stream/StreamEnd/StreamErr.
- Decorators: `@service`, `@method`, `@subservice`, `@events`, `syncedField` generate schema and helpers.
- Supports primitives and borsh-decorated classes, multiple args, void, promises, and streaming (AsyncIterable).
- Nested services and two-way communication supported.
- Extras: typed events over RPC, lazy subservices with presence, interface-typed subservices, union-typed method args, constructor and function references.

## Install

```bash
npm install @dao-xyz/borsh @dao-xyz/borsh-rpc
# or
yarn add @dao-xyz/borsh @dao-xyz/borsh-rpc
```

## Quick start

```ts
import { field } from "@dao-xyz/borsh";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	method,
	service,
} from "@dao-xyz/borsh-rpc";

class Payload {
	@field({ type: "u8" }) x = 0;
	constructor(x?: number) {
		if (x != null) this.x = x;
	}
}

@service()
class API {
	@method({ args: "u32", returns: "u32" }) addOne(n: number) {
		return n + 1;
	}
	@method({ args: Payload, returns: Payload }) echo(p: Payload) {
		return new Payload(p.x);
	}
}

const loop = new LoopbackPair();
const unsub = bindService(API, loop.a);
const client = createProxyFromService(API, loop.b);

await client.addOne(41); // 42
await client.echo(new Payload(7)); // Payload(7)
unsub();
```

## Multiple args and void returns

```ts
@service()
class MathAPI {
	@method({ args: ["u16", "u16", "u16"], returns: "u32" }) sum(
		a: number,
		b: number,
		c: number,
	) {
		return a + b + c;
	}
	@method({ returns: "void" }) open(): Promise<void> {
		return Promise.resolve();
	}
}
```

## Streaming (AsyncIterable)

```ts
@service()
class StreamAPI {
	@method({ args: "u8", returns: { stream: "u8" } })
	stream(n: number): AsyncIterable<number> {
		async function* gen() {
			for (let i = 0; i < n; i++) yield i;
		}
		return gen();
	}
}
```

## Nested services and two subservices

```ts
@service()
class Left {
	@method({ args: "u32", returns: "u32" }) twice(n: number) {
		return n * 2;
	}
}
@service()
class Right {
	@method({ args: "string", returns: "string" }) shout(s: string) {
		return s + "!";
	}
}
@service()
class Root {
	@subservice(Left) left!: Left;
	@subservice(Right) right!: Right;
}
```

## Two-way communication

Bind two services on each side of a transport and call in both directions.

See full examples in `src/__tests__`.

## Events (typed EventTarget on the client)

Mark a property with `@events(payloadType)` to expose a server-side event host. On the client, that property is an `EventTarget`; you can listen with `addEventListener` (typed if you use a typed event map).

```ts
import { events, service, method } from "@dao-xyz/borsh-rpc";

@service()
class Clock {
	// The host must be EventTarget-compatible (dispatchEvent/addEventListener)
	@events("u32")
	ticks = new EventTarget();

	@method({ returns: "void" })
	start() {
		let i = 0;
		const id = setInterval(() => {
			this.ticks.dispatchEvent(new CustomEvent("tick", { detail: i++ }));
		}, 100);
		(this as any)._id = id;
	}
}

// client side
client.ticks.addEventListener("tick", (e: any) => {
	console.log("tick", e.detail);
});
```

Notes:
- In Node, you may need a tiny `CustomEvent` polyfill in tests.
- Any EventTarget-compatible emitter works (e.g., `TypedEventEmitter` from `@libp2p/interface`).

## Lazy subservices with presence and teardown

Declare a child service as lazy so the host can set/unset it at runtime. The client gets a live presence view and methods that work only while present.

```ts
@service()
class Child {
	@method({ returns: "string" })
	async ping() { return "pong"; }
}

@service()
class Parent {
	@subservice(Child, { lazy: true })
	child?: Child; // may be undefined; host assigns later
}

// Host
const unbind = bindService(Parent, transport, new Parent());
server.child = new Child();      // presence becomes true
server.child = undefined;        // presence becomes false; best-effort teardown

// Client
const client = createProxyFromService(Parent, transport);
// presence accessors
await client.child.$present.get();              // boolean
const stop = client.child.$present.subscribe(v => console.log(v));
for await (const v of client.child.$present.watch()) { /* ... */ }
// methods
await client.child.ping(); // works only while present
```

Teardown on unset/replace: the framework will call `dispose()`, `close()`, `stop()`, or `[Symbol.asyncDispose]()` on the previous instance when you unset it or replace it with a new one.

## Interface-typed subservices (schema-only contract)

You can keep the property typed as an interface and use a schema-only class to define the RPC surface.

```ts
interface ISub { echo(s: string): Promise<string>; }

@service()
class SubContract {
	@method({ args: ["string"], returns: "string" })
	async echo(s: string) { return s; }
}

@service()
class Host {
	@subservice(SubContract, { lazy: true })
	sub?: ISub; // interface here
}

// At runtime you can assign any object that satisfies ISub
class ImplA implements ISub { async echo(s: string) { return `A:${s}` } }
class ImplB implements ISub { async echo(s: string) { return `B:${s}` } }
server.sub = new ImplA();
server.sub = new ImplB(); // previous impl is torn down best-effort
```

The contract class is only for schema metadata; implementations don’t need to extend it.

## Union-typed method arguments

Encode a simple union like `Uint8Array | string | number` using the shorthand `union([...])`.

Features:
- Auto tags: if you don’t specify `tag`, the case index is used.
- Auto guards: if you don’t specify `guard`, we match by `typeof`/`instanceof`.
- Shorthand: just pass FieldTypes: `union([Uint8Array, 'string', 'u32'])`.

```ts
import { service, method, union } from "@dao-xyz/borsh-rpc";

@service()
class API {
	@method({ args: union([Uint8Array, 'string', 'u32']), returns: 'string' })
	async handle(x: any): Promise<string> {
		if (x instanceof Uint8Array) return `U:${x.length}`;
		if (typeof x === 'string')   return `S:${x}`;
		if (typeof x === 'number')   return `N:${x}`;
		return '?';
	}
}
```

Note: For interface-shaped unions, you can provide `encode`/`decode` on cases to map to a concrete FieldType; see `src/__tests__/union.vitest.ts` for a full example.

## Synced fields (push/pull accessors)

Expose primitive fields with automatic get/set/watch methods and a convenient client accessor.

```ts
import { syncedField } from "@dao-xyz/borsh-rpc";

@service()
class Settings {
	@syncedField("u32")
	level = 0;
}

// Client side: level is a SyncedAccessor<number>
await client.level.get();                  // pull current
await client.level.set(3);                 // push update
const off = client.level.subscribe(v => console.log(v)); // push updates
for await (const v of client.level.watch()) { /* stream updates */ }
```

Under the hood, the server exposes `$get:name`, `$set:name`, `$watch:name` and the client presents a type-safe `SyncedAccessor<T>`.

## Passing constructors and callbacks

You can pass a constructor reference or a function (callback) across the RPC boundary.

- Constructors: encode by name, resolve via a per-connection registry.
- Functions: encode by a temporary id; calls from the remote side invoke your local function.

Constructors used in method schemas are auto-detected and registered per connection. You generally don’t need to declare `dependencies`; it’s optional as a fallback when auto-detection isn’t possible.

```ts
import { ctor, fn, method, service } from "@dao-xyz/borsh-rpc";

class L { constructor(public n: number) {} }

@service()
class API {
	// Pass a constructor reference; server returns its registered name
		@method({ args: ctor(L), returns: "string" })
	ctorName(_c: new (...a: any[]) => any) { return "L"; }

	// Pass a callback; server calls it and returns the result
		@method({ args: [fn(["u32"], "u32")], returns: "u32" })
	call(cb: (x: number) => number) { return cb(7); }
}
```

Notes and constraints:
- Constructors referenced by your method schemas (including within unions/structs/fnRef args/returns) are auto-registered from the schema. If you need to force-register extras, you can still use `@service({ dependencies })`.
 - The helpers `ctor` and `fn` are aliases for `ctorRef` and `fnRef` for brevity; the original names continue to work.
- Callback results can be:
	- `void` (use returns: "void"),
	- a value (provide a FieldType for `returns`),
	- a stream (use `returns: { stream: T }` and return an Iterable/AsyncIterable from the callback).
- Internally, callbacks use a `$cb:<id>` method; ids are per-connection.

const INITIAL_LENGTH = 1024;
import { toBigIntLE, toBufferLE } from './bigint';
import { BorshError } from "./error";
import * as encoding from "text-encoding-utf-8";

const ResolvedTextDecoder =
  typeof TextDecoder !== "function" ? encoding.TextDecoder : TextDecoder;
const textDecoder = new ResolvedTextDecoder("utf-8", { fatal: true });

const ResolvedTextEncoder =
  typeof TextEncoder !== "function" ? encoding.TextEncoder : TextEncoder;
const textEncoder = new ResolvedTextEncoder("utf-8");

/// Binary encoder.
export class BinaryWriter {
  _buf: DataView;
  _length: number;

  public constructor() {
    this._buf = new DataView(new ArrayBuffer(INITIAL_LENGTH));
    this._length = 0;
  }

  maybeResize() {
    if (this._buf.byteLength < 64 + this._length) {
      const newArr = new Uint8Array(this._buf.byteLength + INITIAL_LENGTH);
      newArr.set(new Uint8Array(this._buf.buffer));
      newArr.set(new Uint8Array(INITIAL_LENGTH), this._buf.byteLength)
      this._buf = new DataView(newArr.buffer);
    }
  }


  public bool(value: boolean) {
    this.maybeResize();
    this._buf.setUint8(this._length, value ? 1 : 0);
    this._length += 1;
  }

  public u8(value: number) {
    this.maybeResize();
    this._buf.setUint8(this._length, value);
    this._length += 1;
  }

  public u16(value: number) {
    this.maybeResize();
    this._buf.setUint16(this._length, value, true);
    this._length += 2;
  }

  public u32(value: number) {
    this.maybeResize();
    this._buf.setUint32(this._length, value, true);
    this._length += 4;
  }

  public u64(value: number | bigint) {
    this.maybeResize();
    this.buffer(toBufferLE(typeof value === 'number' ? BigInt(value) : value, 8))
  }

  public u128(value: number | bigint) {
    this.maybeResize();
    this.buffer(toBufferLE(typeof value === 'number' ? BigInt(value) : value, 16))
  }

  public u256(value: number | bigint) {
    this.maybeResize();
    this.buffer(toBufferLE(typeof value === 'number' ? BigInt(value) : value, 32))
  }

  public u512(value: number | bigint) {
    this.maybeResize();
    this.buffer(toBufferLE(typeof value === 'number' ? BigInt(value) : value, 64))
  }

  public string(str: string) {
    this.maybeResize();
    const b = textEncoder.encode(str);
    this.u32(b.length);
    this.buffer(b);
  }

  public uint8Array(array: Uint8Array) {
    this.maybeResize();
    this.u32(array.length)
    this.buffer(array);
  }

  private buffer(buffer: Uint8Array) {
    const newBuf = new Uint8Array(this._length + buffer.length + INITIAL_LENGTH);
    newBuf.set(new Uint8Array(this._buf.buffer.slice(0, this._length)));
    newBuf.set(buffer, this._length);
    newBuf.set(new Uint8Array(INITIAL_LENGTH), this._length + buffer.length);
    this._length += buffer.length;
    this._buf = new DataView(newBuf.buffer);
  }

  public array(array: any[], fn: any) {
    this.maybeResize();
    this.u32(array.length);
    for (const elem of array) {
      this.maybeResize();
      fn(elem);
    }
  }

  public toArray(): Uint8Array {
    return new Uint8Array(this._buf.buffer.slice(0, this._length));
  }
}

function handlingRangeError(
  target: any,
  propertyKey: string,
  propertyDescriptor: PropertyDescriptor
) {
  const originalMethod = propertyDescriptor.value;
  propertyDescriptor.value = function (...args: any[]) {
    try {
      return originalMethod.apply(this, args);
    } catch (e) {
      if (e instanceof RangeError) {
        const code = (e as any).code;
        if (
          ["ERR_BUFFER_OUT_OF_BOUNDS", "ERR_OUT_OF_RANGE"].indexOf(code) >= 0
        ) {
          throw new BorshError("Reached the end of buffer when deserializing");
        }
      }
      throw e;
    }
  };
}

export class BinaryReader {
  _buf: DataView;
  _offset: number;

  public constructor(buf: Uint8Array) {
    this._buf = new DataView(buf.buffer);
    this._offset = buf.byteOffset;
  }

  @handlingRangeError
  bool(): boolean {
    const value = this._buf.getUint8(this._offset);
    this._offset += 1;
    return value ? true : false;
  }

  @handlingRangeError
  u8(): number {
    const value = this._buf.getUint8(this._offset);
    this._offset += 1;
    return value;
  }

  @handlingRangeError
  u16(): number {
    const value = this._buf.getUint16(this._offset, true);
    this._offset += 2;
    return value;
  }

  @handlingRangeError
  u32(): number {
    const value = this._buf.getUint32(this._offset, true);
    this._offset += 4;
    return value;
  }

  @handlingRangeError
  u64(): bigint {
    const buf = this.buffer(8);
    return toBigIntLE(buf)
  }

  @handlingRangeError
  u128(): bigint {
    const buf = this.buffer(16);
    return toBigIntLE(buf)
  }

  @handlingRangeError
  u256(): bigint {
    const buf = this.buffer(32);
    return toBigIntLE(buf)
  }

  @handlingRangeError
  u512(): bigint {
    const buf = this.buffer(64);
    return toBigIntLE(buf)
  }

  private buffer(len: number): Uint8Array {
    if (this._offset + len > this._buf.byteLength) {
      throw new BorshError(`Expected buffer length ${len} isn't within bounds`);
    }
    const result = this._buf.buffer.slice(this._offset, this._offset + len);
    this._offset += len;
    return new Uint8Array(result);
  }

  @handlingRangeError
  string(): string {
    const len = this.u32();
    const buf = this.buffer(len);
    try {
      // NOTE: Using TextDecoder to fail on invalid UTF-8
      return textDecoder.decode(buf);
    } catch (e) {
      throw new BorshError(`Error decoding UTF-8 string: ${e}`);
    }
  }

  @handlingRangeError
  uint8Array(): Uint8Array {
    const len = this.u32();
    return new Uint8Array(this.buffer(len));
  }

  @handlingRangeError
  readArray(fn: any): any[] {
    const len = this.u32();
    const result = Array<any>();
    for (let i = 0; i < len; ++i) {
      result.push(fn());
    }
    return result;
  }
}

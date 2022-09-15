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
  buf: DataView;
  length: number;

  public constructor() {
    this.buf = new DataView(new ArrayBuffer(INITIAL_LENGTH));
    this.length = 0;
  }

  maybeResize() {
    if (this.buf.byteLength < 16 + this.length) {
      const newArr = new Uint8Array(this.buf.byteLength + INITIAL_LENGTH);
      newArr.set(new Uint8Array(this.buf.buffer));
      newArr.set(new Uint8Array(INITIAL_LENGTH), this.buf.byteLength)
      this.buf = new DataView(newArr.buffer);
    }
  }

  public writeBool(value: boolean) {
    this.maybeResize();
    this.buf.setUint8(value ? 1 : 0, this.length);
    this.length += 1;
  }

  public writeU8(value: number) {
    this.maybeResize();
    this.buf.setUint8(this.length, value);
    this.length += 1;
  }

  public writeU16(value: number) {
    this.maybeResize();
    this.buf.setUint16(this.length, value, true);
    this.length += 2;
  }

  public writeU32(value: number) {
    this.maybeResize();
    this.buf.setUint32(this.length, value, true);
    this.length += 4;
  }

  public writeU64(value: number | bigint) {
    this.maybeResize();
    this.writeBuffer(toBufferLE(typeof value === 'number' ? BigInt(value) : value, 8))
  }

  public writeU128(value: number | bigint) {
    this.maybeResize();
    this.writeBuffer(toBufferLE(typeof value === 'number' ? BigInt(value) : value, 16))
  }

  public writeU256(value: number | bigint) {
    this.maybeResize();
    this.writeBuffer(toBufferLE(typeof value === 'number' ? BigInt(value) : value, 32))
  }

  public writeU512(value: number | bigint) {
    this.maybeResize();
    this.writeBuffer(toBufferLE(typeof value === 'number' ? BigInt(value) : value, 64))
  }

  private writeBuffer(buffer: Uint8Array) {
    const newBuf = new Uint8Array(this.length + buffer.length + INITIAL_LENGTH);
    newBuf.set(new Uint8Array(this.buf.buffer.slice(0, this.length)));
    newBuf.set(buffer, this.length);
    newBuf.set(new Uint8Array(INITIAL_LENGTH), this.length + buffer.length);
    this.length += buffer.length;
    this.buf = new DataView(newBuf.buffer);
  }

  public writeString(str: string) {
    this.maybeResize();
    const b = textEncoder.encode(str);
    this.writeU32(b.length);
    this.writeBuffer(b);
  }

  public writeFixedArray(array: Uint8Array) {
    this.writeBuffer(array);
  }

  public writeArray(array: any[], fn: any) {
    this.maybeResize();
    this.writeU32(array.length);
    for (const elem of array) {
      this.maybeResize();
      fn(elem);
    }
  }

  public toArray(): Uint8Array {
    return new Uint8Array(this.buf.buffer.slice(0, this.length));
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
  buf: DataView;
  offset: number;

  public constructor(buf: Uint8Array) {
    this.buf = new DataView(buf.buffer);
    this.offset = 0;
  }

  @handlingRangeError
  readBool(): boolean {
    const value = this.buf.getUint8(this.offset);
    this.offset += 1;
    return value ? true : false;
  }

  @handlingRangeError
  readU8(): number {
    const value = this.buf.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  @handlingRangeError
  readU16(): number {
    const value = this.buf.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  @handlingRangeError
  readU32(): number {
    const value = this.buf.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  @handlingRangeError
  readU64(): bigint {
    const buf = this.readBuffer(8);
    return toBigIntLE(buf)
  }

  @handlingRangeError
  readU128(): bigint {
    const buf = this.readBuffer(16);
    return toBigIntLE(buf)
  }

  @handlingRangeError
  readU256(): bigint {
    const buf = this.readBuffer(32);
    return toBigIntLE(buf)
  }

  @handlingRangeError
  readU512(): bigint {
    const buf = this.readBuffer(64);
    return toBigIntLE(buf)
  }

  private readBuffer(len: number): Uint8Array {
    if (this.offset + len > this.buf.byteLength) {
      throw new BorshError(`Expected buffer length ${len} isn't within bounds`);
    }
    const result = this.buf.buffer.slice(this.offset, this.offset + len);
    this.offset += len;
    return new Uint8Array(result);
  }

  @handlingRangeError
  readString(): string {
    const len = this.readU32();
    const buf = this.readBuffer(len);
    try {
      // NOTE: Using TextDecoder to fail on invalid UTF-8
      return textDecoder.decode(buf);
    } catch (e) {
      throw new BorshError(`Error decoding UTF-8 string: ${e}`);
    }
  }

  @handlingRangeError
  readFixedArray(len: number): Uint8Array {
    return new Uint8Array(this.readBuffer(len));
  }

  @handlingRangeError
  readArray(fn: any): any[] {
    const len = this.readU32();
    const result = Array<any>();
    for (let i = 0; i < len; ++i) {
      result.push(fn());
    }
    return result;
  }
}

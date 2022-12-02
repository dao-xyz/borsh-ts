import { toBigIntLE, writeBufferLEBigInt, writeBufferLE, readBufferLE, readBigUIntLE } from './bigint.js';
import { BorshError } from "./error.js";
import utf8 from '@protobufjs/utf8';

const INITIAL_LENGTH = 8;

export class BinaryWriter {
  _buf: Uint8Array;
  _length: number;

  public constructor() {
    this._buf = new Uint8Array(INITIAL_LENGTH);
    this._length = 0;
  }

  maybeResize(toFit: number) {
    if (this._buf.byteLength < toFit + this._length) {
      const newArr = new Uint8Array(this._buf.byteLength + toFit + INITIAL_LENGTH); // add some extra padding (INITIAL_LENGTH)
      newArr.set(this._buf);
      this._buf = newArr;
    }
  }

  public bool(value: boolean) {
    this.maybeResize(1);
    this._buf[this._length] = value ? 1 : 0;
    this._length += 1;
  }

  public u8(value: number) {
    this.maybeResize(1);
    this._buf[this._length] = value;
    this._length += 1;
  }

  public u16(value: number) {
    this.maybeResize(2);
    writeBufferLE(value, this._buf, 2, this._length)
    this._length += 2;
  }

  public u32(value: number) {
    this.maybeResize(4);
    writeBufferLE(value, this._buf, 4, this._length)
    this._length += 4;

  }

  public u64(value: number | bigint) {
    this.maybeResize(8);
    writeBufferLEBigInt(value, 8, this._buf, this._length)
    this._length += 8;
  }

  public u128(value: number | bigint) {
    this.maybeResize(16);
    writeBufferLEBigInt(value, 16, this._buf, this._length)
    this._length += 16;
  }

  public u256(value: number | bigint) {
    this.maybeResize(32);
    writeBufferLEBigInt(value, 32, this._buf, this._length)
    this._length += 32;
  }

  public u512(value: number | bigint) {
    this.maybeResize(64);
    writeBufferLEBigInt(value, 64, this._buf, this._length)
    this._length += 64;
  }

  public string(str: string) {
    const len = utf8.length(str);
    this.u32(len);
    this.maybeResize(len)
    this._length += utf8.write(str, this._buf, this._length);

  }

  public uint8Array(array: Uint8Array) {
    this.maybeResize(array.length + 4);
    this.u32(array.length)
    this.buffer(array);
  }

  private buffer(buffer: Uint8Array) {
    this.maybeResize(buffer.byteLength);
    /* const newBuf = new Uint8Array(this._length + buffer.length + INITIAL_LENGTH);
    newBuf.set(this._buf.slice(0, this._length));
    newBuf.set(buffer, this._length); */
    this._buf.set(buffer, this._length);
    this._length += buffer.byteLength;
  }

  public toArray(): Uint8Array {
    if (this._buf.length !== this._length)
      return this._buf.slice(0, this._length);
    return this._buf
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
  _buf: Uint8Array;
  _offset: number;

  public constructor(buf: Uint8Array) {
    this._buf = buf;
    this._offset = 0;
  }

  @handlingRangeError
  bool(): boolean {
    const value = this._buf[this._offset];
    this._offset += 1;
    return value ? true : false;
  }

  @handlingRangeError
  u8(): number {
    const value = this._buf[this._offset];
    this._offset += 1;
    return value;
  }

  @handlingRangeError
  u16(): number {
    const value = readBufferLE(this._buf, 2, this._offset);
    this._offset += 2;
    return value;
  }

  @handlingRangeError
  u32(): number {
    const value = readBufferLE(this._buf, 4, this._offset);
    this._offset += 4;
    return value;
  }

  @handlingRangeError
  u64(): bigint {
    const value = readBigUIntLE(this._buf, 4, this._offset);
    this._offset += 8;
    return value
  }

  @handlingRangeError
  u128(): bigint {
    const value = readBigUIntLE(this._buf, 8, this._offset);
    this._offset += 16;
    return value
  }

  @handlingRangeError
  u256(): bigint {
    const value = readBigUIntLE(this._buf, 16, this._offset);
    this._offset += 32;
    return value
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
    try {
      // NOTE: Using TextDecoder to fail on invalid UTF-8
      const string = utf8.read(this._buf, this._offset, this._offset + len);
      this._offset += len
      return string;
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

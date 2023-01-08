import { toBigIntLE, writeBufferLEBigInt, writeUInt32LE, readUInt32LE, readUInt16LE, writeUInt16LE, readBigUInt64LE, readUIntLE, checkInt } from './bigint.js';
import { BorshError } from "./error.js";
import utf8 from '@protobufjs/utf8';
import { IntegerType } from './types.js';
const INITIAL_LENGTH = 20;
const allocUnsafe = (len: number): Uint8Array => { // TODO return fn instead for v8 fn optimization 
  if ((globalThis as any).Buffer) {
    return (globalThis as any).Buffer.allocUnsafe(len)
  }
  return new Uint8Array(len)
}


export class BinaryWriter {
  _buf: Uint8Array;
  _length: number;

  public constructor(initialLength = INITIAL_LENGTH) {
    this._buf = allocUnsafe(initialLength);
    this._length = 0;
  }

  maybeResize(toFit: number) {
    if (this._buf.byteLength < toFit + this._length) {
      // console.log('resize!', this._buf.byteLength, toFit, toFit + this._length)
      const newArr = allocUnsafe(this._buf.byteLength + toFit + INITIAL_LENGTH); // add some extra padding (INITIAL_LENGTH)
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
    checkInt(value, 0, 255, 1);
    this._buf[this._length] = value;
    this._length += 1;
  }

  public u16(value: number) {
    this.maybeResize(2);
    writeUInt16LE(value, this._buf, this._length)
    this._length += 2;
  }

  public u32(value: number) {
    this.maybeResize(4);
    writeUInt32LE(value, this._buf, this._length)
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

  public u(value: number | bigint, encoding: IntegerType) {
    if (encoding === 'u8') {
      this.u8(value as number);
    }
    else if (encoding === 'u16') {
      this.u16(value as number);
    }
    else if (encoding === 'u32') {
      this.u32(value as number);
    }
    else if (encoding === 'u64') {
      this.u64(value);
    }
    else if (encoding === 'u128') {
      this.u128(value);
    }
    else if (encoding === 'u256') {
      this.u256(value);
    }
    else if (encoding === 'u512') {
      this.u512(value);
    }
    else {
      throw new Error("Unsupported encoding: " + encoding)
    }
  }

  public string(str: string) {
    const len = utf8.length(str);
    this.u32(len);
    this.maybeResize(len)
    utf8.write(str, this._buf, this._length);
    this._length += len
  }

  public uint8Array(array: Uint8Array) {
    this.maybeResize(array.length + 4);
    this.u32(array.length)
    this.buffer(array);
  }

  private buffer(buffer: Uint8Array) {
    this.maybeResize(buffer.byteLength);
    this._buf.set(buffer, this._length);
    this._length += buffer.byteLength;
  }

  public toArray(): Uint8Array {
    if (this._buf.length !== this._length)
      return this._buf.subarray(0, this._length);
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
    const value = readUInt16LE(this._buf, this._offset);
    this._offset += 2;
    return value;
  }

  @handlingRangeError
  u32(): number {
    const value = readUInt32LE(this._buf, this._offset);
    this._offset += 4;
    return value;
  }

  @handlingRangeError
  u64(): bigint {
    const value = readBigUInt64LE(this._buf, this._offset);
    this._offset += 8;
    return value
  }

  @handlingRangeError
  u128(): bigint {
    const value = readUIntLE(this._buf, this._offset, 16);
    this._offset += 16;
    return value
  }

  @handlingRangeError
  u256(): bigint {
    const value = readUIntLE(this._buf, this._offset, 32);
    this._offset += 32;
    return value
  }

  @handlingRangeError
  u512(): bigint {
    const buf = this.buffer(64);
    return toBigIntLE(buf)
  }


  public u(encoding: IntegerType) {
    if (encoding === 'u8') {
      return this.u8();
    }
    else if (encoding === 'u16') {
      return this.u16();
    }
    else if (encoding === 'u32') {
      return this.u32();
    }
    else if (encoding === 'u64') {
      return this.u64();
    }
    else if (encoding === 'u128') {
      return this.u128();
    }
    else if (encoding === 'u256') {
      return this.u256();
    }
    else if (encoding === 'u512') {
      return this.u512();
    }
    else {
      throw new Error("Unsupported encoding: " + encoding)
    }
  }

  private buffer(len: number): Uint8Array {
    if (this._offset + len > this._buf.byteLength) {
      throw new BorshError(`Expected buffer length ${len} isn't within bounds`);
    }
    const result = this._buf.slice(this._offset, this._offset + len);
    this._offset += len;
    return result;
  }

  @handlingRangeError
  string(): string {
    const len = this.u32();
    try {
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
    return this.buffer(len);
  }

  @handlingRangeError
  readArray(fn: any): any[] {
    const len = this.u32();
    const result = new Array<any>();
    for (let i = 0; i < len; ++i) {
      result.push(fn());
    }
    return result;
  }
}
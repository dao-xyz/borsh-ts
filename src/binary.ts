import { toBigIntLE, writeBufferLEBigInt, writeUInt32LE, readUInt32LE, readUInt16LE, writeUInt16LE, readBigUInt64LE, readUIntLE, checkInt } from './bigint.js';
import { BorshError } from "./error.js";
import utf8 from '@protobufjs/utf8';
import { IntegerType } from './types.js';

const allocUnsafe = (len: number): Uint8Array => { // TODO return fn instead for v8 fn optimization 
  if ((globalThis as any).Buffer) {
    return (globalThis as any).Buffer.allocUnsafe(len)
  }
  return new Uint8Array(len)
}


export class BinaryWriter {
  _buf: Uint8Array;
  totalSize: number;
  _writes: () => void;

  public constructor() {
    this.totalSize = 0;
    this._writes = () => { };
  }



  public bool(value: boolean) {
    let offset = this.totalSize;
    const last = this._writes;
    this._writes = () => {
      last();
      this._buf[offset] = value ? 1 : 0;
    }
    this.totalSize += 1;

  }


  public u8(value: number) {
    let offset = this.totalSize;
    const last = this._writes;
    this._writes = () => {
      last();
      this._buf[offset] = value;
    }
    this.totalSize += 1;

  }

  public u16(value: number) {

    let offset = this.totalSize;
    const last = this._writes;
    this._writes = () => {
      last();
      writeUInt16LE(value, this._buf, offset)
    }
    this.totalSize += 2;
  }

  public u32(value: number) {
    let offset = this.totalSize;
    const last = this._writes;
    this._writes = () => {
      last()
      writeUInt32LE(value, this._buf, offset)
    }
    this.totalSize += 4;

  }

  public u64(value: number | bigint) {
    let offset = this.totalSize;
    const last = this._writes;
    this._writes = () => {
      last();
      writeBufferLEBigInt(value, 8, this._buf, offset)
    }
    this.totalSize += 8;


  }

  public u128(value: number | bigint) {
    let offset = this.totalSize;
    const last = this._writes;
    this._writes = () => {
      last();
      writeBufferLEBigInt(value, 16, this._buf, offset)
    }
    this.totalSize += 16;

  }

  public u256(value: number | bigint) {

    let offset = this.totalSize;
    const last = this._writes;
    this._writes = () => {
      last();
      writeBufferLEBigInt(value, 32, this._buf, offset)
    }
    this.totalSize += 32;

  }

  public u512(value: number | bigint) {
    let offset = this.totalSize;

    const last = this._writes;
    this._writes = () => {
      last();
      writeBufferLEBigInt(value, 64, this._buf, offset)
    }
    this.totalSize += 64;

  }

  public static u(encoding: IntegerType): (value: number | bigint, writer: BinaryWriter) => void {
    if (encoding === 'u8') {
      return (value, writer) => writer.u8(value as number);
    }
    else if (encoding === 'u16') {
      return (value, writer) => writer.u16(value as number);
    }
    else if (encoding === 'u32') {
      return (value, writer) => writer.u32(value as number);
    }
    else if (encoding === 'u64') {
      return (value, writer) => writer.u64(value as number);
    }
    else if (encoding === 'u128') {
      return (value, writer) => writer.u128(value as number);
    }
    else if (encoding === 'u256') {
      return (value, writer) => writer.u256(value as number);
    }
    else if (encoding === 'u512') {
      return (value, writer) => writer.u512(value as number);
    }
    else {
      throw new Error("Unsupported encoding: " + encoding)
    }
  }

  public string(str: string) {
    const len = utf8.length(str);
    let offset = this.totalSize;
    const last = this._writes;
    this._writes = () => {
      last();
      writeUInt32LE(len, this._buf, offset)
      utf8.write(str, this._buf, offset + 4);
    }
    this.totalSize += 4 + len;

  }

  public uint8Array(array: Uint8Array) {
    let offset = this.totalSize;
    const last = this._writes;
    this._writes = () => {
      last();
      writeUInt32LE(array.length, this._buf, offset)
      this._buf.set(array, offset + 4);
    }
    this.totalSize += array.length + 4;

  }


  public finalize(): Uint8Array {
    /* if (this._buf.length !== this._length)
      return this._buf.subarray(0, this._length);
    return this._buf */
    this._buf = allocUnsafe(this.totalSize);
    this._writes()
    return this._buf;

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


  public static u(encoding: IntegerType): ((reader: BinaryReader) => number) | ((reader: BinaryReader) => bigint) {
    if (encoding === 'u8') {
      return (reader) => reader.u8();
    }
    else if (encoding === 'u16') {
      return (reader) => reader.u16();
    }
    else if (encoding === 'u32') {
      return (reader) => reader.u32();
    }
    else if (encoding === 'u64') {
      return (reader) => reader.u64();
    }
    else if (encoding === 'u128') {
      return (reader) => reader.u128();
    }
    else if (encoding === 'u256') {
      return (reader) => reader.u256();
    }
    else if (encoding === 'u512') {
      return (reader) => reader.u512();
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
import { toBigIntLE, writeBufferLEBigInt, writeUInt32LE, readUInt32LE, readUInt16LE, writeUInt16LE, readBigUInt64LE, readUIntLE, checkInt } from './bigint.js';
import { BorshError } from "./error.js";
import utf8 from '@protobufjs/utf8';
import { IntegerType, PrimitiveType } from './types.js';

const allocUnsafe = (len: number): Uint8Array => { // TODO return fn instead for v8 fn optimization 
  if ((globalThis as any).Buffer) {
    return (globalThis as any).Buffer.allocUnsafe(len)
  }
  return new Uint8Array(len)
}


export class BinaryWriter {
  _buf: Uint8Array;
  totalSize: number;
  _writes: () => any;

  public constructor() {
    this.totalSize = 0;
    this._writes = () => { };
  }

  public bool(value: boolean) {
    return BinaryWriter.bool(value, this)
  }

  public static bool(value: boolean, writer: BinaryWriter) {
    let offset = writer.totalSize;
    const last = writer._writes;
    writer._writes = () => {
      last();
      writer._buf[offset] = value ? 1 : 0;
    }
    writer.totalSize += 1;

  }
  public u8(value: number) {
    return BinaryWriter.u8(value, this)
  }

  public static u8(value: number, writer: BinaryWriter) {
    let offset = writer.totalSize;
    const last = writer._writes;
    writer._writes = () => { last(); (writer._buf[offset] = value) };
    writer.totalSize += 1;
  }

  public u16(value: number) {
    return BinaryWriter.u16(value, this)
  }

  public static u16(value: number, writer: BinaryWriter) {
    let offset = writer.totalSize;
    const last = writer._writes;
    writer._writes = () => { last(); writeUInt16LE(value, writer._buf, offset) };
    writer.totalSize += 2;
  }

  public u32(value: number) {
    return BinaryWriter.u32(value, this)
  }

  public static u32(value: number, writer: BinaryWriter) {
    let offset = writer.totalSize;
    const last = writer._writes;
    writer._writes = () => { last(); writeUInt32LE(value, writer._buf, offset) }
    writer.totalSize += 4;

  }

  public u64(value: number | bigint) {
    return BinaryWriter.u64(value, this)
  }

  public static u64(value: number | bigint, writer: BinaryWriter) {
    let offset = writer.totalSize;
    const last = writer._writes;
    writer._writes = () => { last(); writeBufferLEBigInt(value, 8, writer._buf, offset) }
    writer.totalSize += 8;
  }

  public u128(value: number | bigint) {
    return BinaryWriter.u128(value, this)
  }

  public static u128(value: number | bigint, writer: BinaryWriter) {
    let offset = writer.totalSize;
    const last = writer._writes;
    writer._writes = () => { last(); writeBufferLEBigInt(value, 16, writer._buf, offset) }
    writer.totalSize += 16;

  }


  public u256(value: number | bigint) {
    return BinaryWriter.u256(value, this)
  }

  public static u256(value: number | bigint, writer: BinaryWriter) {

    let offset = writer.totalSize;
    const last = writer._writes;
    writer._writes = () => { last(); writeBufferLEBigInt(value, 32, writer._buf, offset) }
    writer.totalSize += 32;

  }

  public u512(value: number | bigint) {
    return BinaryWriter.u512(value, this)
  }

  public static u512(value: number | bigint, writer: BinaryWriter) {
    let offset = writer.totalSize;
    const last = writer._writes;
    writer._writes = () => { last(); writeBufferLEBigInt(value, 64, writer._buf, offset) }
    writer.totalSize += 64;

  }

  public string(str: string) {
    return BinaryWriter.string(str, this)
  }

  public static string(str: string, writer: BinaryWriter) {
    const len = utf8.length(str);
    let offset = writer.totalSize;
    const last = writer._writes;
    writer._writes = () => {
      last();
      writeUInt32LE(len, writer._buf, offset)
      utf8.write(str, writer._buf, offset + 4);
    }
    writer.totalSize += 4 + len;

  }

  public uint8Array(array: Uint8Array) {
    return BinaryWriter.uint8Array(array, this)

  }
  public static uint8Array(array: Uint8Array, writer: BinaryWriter) {
    let offset = writer.totalSize;
    const last = writer._writes;
    writer._writes = () => {
      last();
      writeUInt32LE(array.length, writer._buf, offset)
      writer._buf.set(array, offset + 4);
    }
    writer.totalSize += array.length + 4;

  }


  public static write(encoding: PrimitiveType): (value: number | bigint | string | boolean | string, writer: BinaryWriter) => void {
    if (encoding === 'u8') {
      return BinaryWriter.u8
    }
    else if (encoding === 'u16') {
      return BinaryWriter.u16
    }
    else if (encoding === 'u32') {
      return BinaryWriter.u32
    }
    else if (encoding === 'u64') {
      return BinaryWriter.u64
    }
    else if (encoding === 'u128') {
      return BinaryWriter.u128
    }
    else if (encoding === 'u256') {
      return BinaryWriter.u256
    }
    else if (encoding === 'u512') {
      return BinaryWriter.u512
    }
    else if (encoding === 'bool') {
      return BinaryWriter.bool

    }
    else if (encoding === 'string') {
      return BinaryWriter.string
    }
    else {
      throw new Error("Unsupported encoding: " + encoding)
    }
  }






  public finalize(): Uint8Array {
    this._buf = allocUnsafe(this.totalSize);
    this._writes()
    return this._buf;

  }
}



export class BinaryReader {
  _buf: Uint8Array;
  _offset: number;

  public constructor(buf: Uint8Array) {
    this._buf = buf;
    this._offset = 0;
  }

  bool(): boolean {
    return BinaryReader.bool(this)
  }

  static bool(reader: BinaryReader): boolean {
    const value = reader._buf[reader._offset];
    reader._offset += 1;
    return value ? true : false;
  }

  u8(): number {
    return BinaryReader.u8(this)
  }

  static u8(reader: BinaryReader): number {
    const value = reader._buf[reader._offset];
    reader._offset += 1;
    return value;
  }

  u16(): number {
    return BinaryReader.u16(this)
  }

  static u16(reader: BinaryReader): number {
    const value = readUInt16LE(reader._buf, reader._offset);
    reader._offset += 2;
    return value;
  }


  u32(): number {
    return BinaryReader.u32(this)
  }

  static u32(reader: BinaryReader): number {
    const value = readUInt32LE(reader._buf, reader._offset);
    reader._offset += 4;
    return value;
  }

  u64(): bigint {
    const value = readBigUInt64LE(this._buf, this._offset);
    this._offset += 8;
    return value
  }

  static u64(reader: BinaryReader): bigint {
    const value = readBigUInt64LE(reader._buf, reader._offset);
    reader._offset += 8;
    return value
  }

  u128(): bigint {
    const value = readUIntLE(this._buf, this._offset, 16);
    this._offset += 16;
    return value
  }
  static u128(reader: BinaryReader): bigint {
    const value = readUIntLE(reader._buf, reader._offset, 16);
    reader._offset += 16;
    return value
  }
  u256(): bigint {
    const value = readUIntLE(this._buf, this._offset, 32);
    this._offset += 32;
    return value
  }
  static u256(reader: BinaryReader): bigint {
    const value = readUIntLE(reader._buf, reader._offset, 32);
    reader._offset += 32;
    return value
  }
  u512(): bigint {
    return BinaryReader.u512(this)
  }
  static u512(reader: BinaryReader): bigint {
    const buf = reader.buffer(64);
    return toBigIntLE(buf)
  }

  string(): string {
    return BinaryReader.string(this);
  }

  static string(reader: BinaryReader): string {
    const len = reader.u32();
    try {
      const end = reader._offset + len;
      const string = utf8.read(reader._buf, reader._offset, end);
      reader._offset = end;
      return string;
    } catch (e) {
      throw new BorshError(`Error decoding UTF-8 string: ${e}`);
    }
  }
  public static read(encoding: PrimitiveType): ((reader: BinaryReader) => number) | ((reader: BinaryReader) => bigint) | ((reader: BinaryReader) => boolean) | ((reader: BinaryReader) => string) {
    if (encoding === 'u8') {
      return BinaryReader.u8
    }
    else if (encoding === 'u16') {
      return BinaryReader.u16
    }
    else if (encoding === 'u32') {
      return BinaryReader.u32
    }
    else if (encoding === 'u64') {
      return BinaryReader.u64
    }
    else if (encoding === 'u128') {
      return BinaryReader.u128
    }
    else if (encoding === 'u256') {
      return BinaryReader.u256
    }
    else if (encoding === 'u512') {
      return BinaryReader.u512
    }
    else if (encoding === 'string') {
      return BinaryReader.string
    }
    else if (encoding === 'bool') {
      return BinaryReader.bool
    }
    else {
      throw new Error("Unsupported encoding: " + encoding)
    }
  }

  private buffer(len: number): Uint8Array {
    const end = this._offset + len;
    const result = this._buf.subarray(this._offset, end);
    this._offset = end;
    return result;
  }


  uint8Array(): Uint8Array {
    return BinaryReader.uint8Array(this)
  }

  static uint8Array(reader: BinaryReader, size = reader.u32()): Uint8Array {
    return reader.buffer(size);
  }

  readArray(fn: any): any[] {
    const len = this.u32();
    const result = new Array<any>(len);
    for (let i = 0; i < len; ++i) {
      result[i] = fn();
    }
    return result;
  }
}
/// <reference types="node" />
import { Schema } from "./schema";
import { BinaryWriter, BinaryReader } from "./binary";
export declare class Assignable {
    constructor(properties: any);
}
export declare function baseEncode(value: Uint8Array | string): string;
export declare function baseDecode(value: string): Buffer;
export interface OverrideType<T> {
    serialize: (T: any, writer: BinaryWriter) => void;
    deserialize: (reader: BinaryReader) => T;
}
export declare function serializeField(schema: Schema, fieldName: string, value: any, fieldType: any, // A simple type of a CustomField
writer: any): void;
export declare function serializeStruct(schema: Schema, obj: any, writer: BinaryWriter): void;
export declare function serialize(schema: Schema, obj: any, Writer?: typeof BinaryWriter): Uint8Array;
export declare function deserialize<T>(schema: Schema, classType: {
    new (args: any): T;
}, buffer: Buffer, Reader?: typeof BinaryReader): T;
export declare function deserializeUnchecked<T>(schema: Schema, classType: {
    new (args: any): T;
}, buffer: Buffer, Reader?: typeof BinaryReader): T;

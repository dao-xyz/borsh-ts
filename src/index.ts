import bs58 from "bs58";
import {getVariantIndex, Schema} from "./schema"
import {BorshError} from "./error"
import {BinaryWriter,BinaryReader} from "./binary"
import { extendsClass } from "./utils";

export class Assignable {
  constructor(properties) {
      Object.keys(properties).map((key) => {
          this[key] = properties[key];
      });
  }
}




export function baseEncode(value: Uint8Array | string): string {
  if (typeof value === "string") {
    value = Buffer.from(value, "utf8");
  }
  return bs58.encode(Buffer.from(value));
}

export function baseDecode(value: string): Buffer {
  return Buffer.from(bs58.decode(value));
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
export interface OverrideType <T>  {
    serialize: (T,writer: BinaryWriter) => void,
    deserialize: (reader: BinaryReader) => T
}

export function serializeField(
  schema: Schema,
  fieldName: string,
  value: any,
  fieldType: any, // A simple type of a CustomField
  writer: any
) {
  try {
    // TODO: Handle missing values properly (make sure they never result in just skipped write)
    if (typeof fieldType === "string") {
      writer[`write${capitalizeFirstLetter(fieldType)}`](value);
    } else if (fieldType instanceof Array) {
      if (typeof fieldType[0] === "number") {
        if (value.length !== fieldType[0]) {
          throw new BorshError(
            `Expecting byte array of length ${fieldType[0]}, but got ${value.length} bytes`
          );
        }
        writer.writeFixedArray(value);
      } else if (fieldType.length === 2 && typeof fieldType[1] === "number") {
        if (value.length !== fieldType[1]) {
          throw new BorshError(
            `Expecting byte array of length ${fieldType[1]}, but got ${value.length} bytes`
          );
        }
        for (let i = 0; i < fieldType[1]; i++) {
          serializeField(schema, null, value[i], fieldType[0], writer);
        }
      } else {
        writer.writeArray(value, (item: any) => {
          serializeField(schema, fieldName, item, fieldType[0], writer);
        });
      }
    } 
    else if(typeof fieldType["serialize"] == "function")
    {
      fieldType.serialize(value,writer)
    }
    else if (fieldType.kind !== undefined) {
      switch (fieldType.kind) {
        case "option": {
          if (value === null || value === undefined) {
            writer.writeU8(0);
          } else {
            writer.writeU8(1);
            serializeField(schema, fieldName, value, fieldType.type, writer);
          }
          break;
        }
        default:
          throw new BorshError(`FieldType ${fieldType} unrecognized`);
      }
    } else {
      serializeStruct(schema, value, writer);
    }
  } catch (error) {
    if (error instanceof BorshError) {
      error.addToFieldPath(fieldName);
    }
    throw error;
  }
}

export function serializeStruct(schema: Schema, obj: any, writer: BinaryWriter) {
  if (typeof obj.borshSerialize === "function") {
    obj.borshSerialize(schema,writer);
    return;
  }

  const structSchema = schema.get(obj.constructor);
  if (!structSchema) {
    throw new BorshError(`Class ${obj.constructor.name} is missing in schema`);
  }

  if (structSchema.kind === "struct") {
    structSchema.fields.map(([fieldName, fieldType]: [any, any]) => {
      serializeField(schema, fieldName, obj[fieldName], fieldType, writer);
    });
  } else if (structSchema.kind === "enum") {
    const name = obj[structSchema.field];
    for (let idx = 0; idx < structSchema.values.length; ++idx) {
      const [fieldName, fieldType]: [any, any] = structSchema.values[idx];
      if (fieldName === name) {
        writer.writeU8(idx);
        serializeField(schema, fieldName, obj[fieldName], fieldType, writer);
        break;
      }
    }
  } else {
    throw new BorshError(
      `Unexpected schema kind: ${structSchema.kind} for ${obj.constructor.name}`
    );
  }
}

/// Serialize given object using schema of the form:
/// { class_name -> [ [field_name, field_type], .. ], .. }
export function serialize(
  schema: Schema,
  obj: any,
  Writer = BinaryWriter
): Uint8Array {
  const writer = new Writer();
  serializeStruct(schema, obj, writer);
  return writer.toArray();
}

function deserializeField(
  schema: Schema,
  fieldName: string,
  fieldType: any,
  reader: BinaryReader
): any {
  try {
    if (typeof fieldType === "string") {
      return reader[`read${capitalizeFirstLetter(fieldType)}`]();
    }

    if (fieldType instanceof Array) {
      if (typeof fieldType[0] === "number") {
        return reader.readFixedArray(fieldType[0]);
      } else if (typeof fieldType[1] === "number") {
        const arr = [];
        for (let i = 0; i < fieldType[1]; i++) {
          arr.push(deserializeField(schema, null, fieldType[0], reader));
        }
        return arr;
      } else {
        return reader.readArray(() =>
          deserializeField(schema, fieldName, fieldType[0], reader)
        );
      }
    }
    if(typeof fieldType["deserialize"] == "function")
    {
      return fieldType.deserialize(reader)
    }

    if (fieldType.kind === "option") {
      const option = reader.readU8();
      if (option) {
        return deserializeField(schema, fieldName, fieldType.type, reader);
      }

      return undefined;
    }

    return deserializeStruct(schema, fieldType, reader);
  } catch (error) {
    if (error instanceof BorshError) {
      error.addToFieldPath(fieldName);
    }
    throw error;
  }
}


function deserializeStruct(
  schema: Schema,
  clazz: any,
  reader: BinaryReader
) {
  if (typeof clazz.borshDeserialize === "function") {
    return clazz.borshDeserialize(reader);
  }

  let structSchema = schema.get(clazz);
  let idx = undefined;

  if (!structSchema) {

    // We find the deserialization schema from one of the subclasses

    // it must be an enum
    idx = reader.readU8();

    // Try polymorphic deserialziation (i.e.  get all subclasses and find best
    // class this can be deserialized to)

    // We know that we should serialize into the variant that accounts to the first byte of the read
    for (const actualClazz of schema.keys())
    {
      if(extendsClass(actualClazz, clazz))
      {
        const variantIndex = getVariantIndex(actualClazz);
        if(variantIndex !== undefined && variantIndex === idx)
        {
          clazz = actualClazz;
          structSchema = schema.get(clazz);
        }
      }
    }
    if(!structSchema)
      throw new BorshError(`Class ${clazz.name} is missing in schema`);
  }

  if (structSchema.kind === "struct") {
    const result = {};
    for (const [fieldName, fieldType] of schema.get(clazz).fields) {
      result[fieldName] = deserializeField(
        schema,
        fieldName,
        fieldType,
        reader
      );
    }
    return Object.assign(new clazz(), result);
  }

  if (structSchema.kind === "enum") {
    if(idx === undefined)
      idx = reader.readU8();

    if (idx >= structSchema.values.length) {
      throw new BorshError(`Enum index: ${idx} is out of range`);
    }
    const [fieldName, fieldType] = structSchema.values[idx];
    const fieldValue = deserializeField(schema, fieldName, fieldType, reader);
    return new clazz({ [fieldName]: fieldValue });
  }

  throw new BorshError(
    `Unexpected schema kind: ${structSchema.kind} for ${clazz.constructor.name}`
  );
}

/// Deserializes object from bytes using schema.
export function deserialize<T>(
  schema: Schema,
  classType: { new (args: any): T },
  buffer: Buffer,
  Reader = BinaryReader
): T {
  const reader = new Reader(buffer);
  const result = deserializeStruct(schema, classType, reader);
  if (reader.offset < buffer.length) {
    throw new BorshError(
      `Unexpected ${
        buffer.length - reader.offset
      } bytes after deserialized data`
    );
  }
  return result;
}

/// Deserializes object from bytes using schema, without checking the length read
export function deserializeUnchecked<T>(
  schema: Schema,
  classType: { new (args: any): T },
  buffer: Buffer,
  Reader = BinaryReader
): T {
  const reader = new Reader(buffer);
  return deserializeStruct(schema, classType, reader);
}

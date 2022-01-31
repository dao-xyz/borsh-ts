import bs58 from "bs58";
import { FixedArrayKind, getVariantIndex, OptionKind, Schema, StructKind, VecKind } from "./schema"
import { BorshError } from "./error"
import { BinaryWriter, BinaryReader } from "./binary"
import { extendsClass } from "./utils";

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
export interface OverrideType<T> {
  serialize: (T, writer: BinaryWriter) => void,
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
    } else if (fieldType instanceof VecKind || fieldType instanceof FixedArrayKind) {
      let len = value.length;
      if (fieldType instanceof FixedArrayKind) {
        if (fieldType.length != len) {
          throw new BorshError(
            `Expecting array of length ${fieldType[0]}, but got ${value.length}`
          );
        }
      }
      else {
        writer.writeU32(len) // For dynamically sized array we write the size as u32 according to specification
      }
      for (let i = 0; i < len; i++) {
        serializeField(schema, null, value[i], fieldType.elementType, writer);
      }
    }
    else if (fieldType instanceof OptionKind) {
      if (value === null || value === undefined) {
        writer.writeU8(0);
      } else {
        writer.writeU8(1);
        serializeField(schema, fieldName, value, fieldType.elementType, writer);
      }

    }
    else if (typeof fieldType["serialize"] == "function") {
      fieldType.serialize(value, writer)
    }
    else {
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
    obj.borshSerialize(schema, writer);
    return;
  }

  const structSchema = schema.get(obj.constructor);
  if (!structSchema) {
    throw new BorshError(`Class ${obj.constructor.name} is missing in schema`);
  }

  if (structSchema instanceof StructKind) {
    structSchema.fields.map((field) => {
      serializeField(schema, field.key, obj[field.key], field.type, writer);
    });
  }
  else {
    throw new BorshError(
      `Unexpected schema for ${obj.constructor.name}`
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

    if (fieldType instanceof VecKind || fieldType instanceof FixedArrayKind) {
      let len = fieldType instanceof FixedArrayKind ? fieldType.length : reader.readU32();
      let arr = new Array(len);
      for (let i = 0; i < len; i++) {
        arr[i] = deserializeField(schema, null, fieldType.elementType, reader);
      }
      return arr;
    }
    if (typeof fieldType["deserialize"] == "function") {
      return fieldType.deserialize(reader)
    }

    if (fieldType instanceof OptionKind) {
      const option = reader.readU8();
      if (option) {
        return deserializeField(schema, fieldName, fieldType.elementType, reader);
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
    for (const actualClazz of schema.keys()) {
      if (extendsClass(actualClazz, clazz)) {
        const variantIndex = getVariantIndex(actualClazz);
        if (variantIndex !== undefined && variantIndex === idx) {
          clazz = actualClazz;
          structSchema = schema.get(clazz);
        }
      }
    }
    if (!structSchema)
      throw new BorshError(`Class ${clazz.name} is missing in schema`);
  }
  else if (getVariantIndex(clazz) !== undefined) {
    // It is an enum, but we deserialize into its variant directly
    // This means we should omit the variant index
    reader.readU8();
  }

  if (structSchema instanceof StructKind) {
    const result = {};
    for (const field of schema.get(clazz).fields) {
      result[field.key] = deserializeField(
        schema,
        field.key,
        field.type,
        reader
      );
    }
    return Object.assign(new clazz(), result);
  }
  throw new BorshError(
    `Unexpected schema ${clazz.constructor.name}`
  );
}

/**
 * /// Deserializes object from bytes using schema.
 * @param schema, schemas generated from generateSchemas([ClassA, ClassB..])
 * @param classType, target Class
 * @param buffer, data
 * @param unchecked, if true then any remaining bytes after deserialization will be ignored
 * @param Reader, optional custom reader
 * @returns 
 */
export function deserialize<T>(
  schema: Schema,
  classType: { new(args: any): T },
  buffer: Buffer,
  unchecked: boolean = false,
  Reader = BinaryReader
): T {
  const reader = new Reader(buffer);
  const result = deserializeStruct(schema, classType, reader);
  if (!unchecked && reader.offset < buffer.length) {
    throw new BorshError(
      `Unexpected ${buffer.length - reader.offset
      } bytes after deserialized data`
    );
  }
  return result;
}

/// Deserializes object from bytes using schema, without checking the length read
export function deserializeUnchecked<T>(
  schema: Schema,
  classType: { new(args: any): T },
  buffer: Buffer,
  Reader = BinaryReader
): T {
  const reader = new Reader(buffer);
  return deserializeStruct(schema, classType, reader);
}

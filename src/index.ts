import bs58 from "bs58";
import {
  FixedArrayKind,
  OptionKind,
  Schema,
  Field,
  StructKind,
  VecKind,
  extendsClass,
  SimpleField,
  CustomField,
} from "./types";
import { BorshError } from "./error";
import { BinaryWriter, BinaryReader } from "./binary";
import { OverrideType } from "./types";
import "reflect-metadata";
export * from "./binary";
export * from "./types";

const STRUCT_META_DATA_SYMBOL = "__borsh_struct_metadata__";

export function baseEncode(value: Uint8Array | string): string {
  if (typeof value === "string") {
    value = Buffer.from(value, "utf8");
  }
  return bs58.encode(Buffer.from(value));
}

export function baseDecode(value: string): Buffer {
  return Buffer.from(bs58.decode(value));
}

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
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
    } else if (
      fieldType instanceof VecKind ||
      fieldType instanceof FixedArrayKind
    ) {
      let len = value.length;
      if (fieldType instanceof FixedArrayKind) {
        if (fieldType.length != len) {
          throw new BorshError(
            `Expecting array of length ${(fieldType as any)[0]}, but got ${
              value.length
            }`
          );
        }
      } else {
        writer.writeU32(len); // For dynamically sized array we write the size as u32 according to specification
      }
      for (let i = 0; i < len; i++) {
        serializeField(schema, null, value[i], fieldType.elementType, writer);
      }
    } else if (fieldType instanceof OptionKind) {
      if (value === null || value === undefined) {
        writer.writeU8(0);
      } else {
        writer.writeU8(1);
        serializeField(schema, fieldName, value, fieldType.elementType, writer);
      }
    } else if (typeof fieldType["serialize"] == "function") {
      fieldType.serialize(value, writer);
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

export function serializeStruct(
  schema: Schema,
  obj: any,
  writer: BinaryWriter
) {
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
  } else {
    throw new BorshError(`Unexpected schema for ${obj.constructor.name}`);
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
      return (reader as any)[`read${capitalizeFirstLetter(fieldType)}`]();
    }

    if (fieldType instanceof VecKind || fieldType instanceof FixedArrayKind) {
      let len =
        fieldType instanceof FixedArrayKind
          ? fieldType.length
          : reader.readU32();
      let arr = new Array(len);
      for (let i = 0; i < len; i++) {
        arr[i] = deserializeField(schema, null, fieldType.elementType, reader);
      }
      return arr;
    }
    if (typeof fieldType["deserialize"] == "function") {
      return fieldType.deserialize(reader);
    }

    if (fieldType instanceof OptionKind) {
      const option = reader.readU8();
      if (option) {
        return deserializeField(
          schema,
          fieldName,
          fieldType.elementType,
          reader
        );
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

function deserializeStruct(schema: Schema, clazz: any, reader: BinaryReader) {
  if (typeof clazz.borshDeserialize === "function") {
    return clazz.borshDeserialize(reader);
  }

  let structSchema = schema.get(clazz);
  let idx = undefined;

  if (!structSchema) {
    // We find the deserialization schema from one of the subclasses

    // it must be an enum
    idx = [reader.readU8()];

    // Try polymorphic deserialziation (i.e.  get all subclasses and find best
    // class this can be deserialized to)

    // We know that we should serialize into the variant that accounts to the first byte of the read
    for (const actualClazz of schema.keys()) {
      if (extendsClass(actualClazz, clazz)) {
        const variantIndex = getVariantIndex(actualClazz);
        if (variantIndex !== undefined) {
          if (typeof variantIndex === "number") {
            if (variantIndex == idx[0]) {
              clazz = actualClazz;
              structSchema = schema.get(clazz);
              break;
            }
          } // variant is array, check all values
          else {
            while (idx.length < variantIndex.length) {
              idx.push(reader.readU8());
            }
            // Compare variants
            if (
              idx.length === variantIndex.length &&
              idx.every((value, index) => value === variantIndex[index])
            ) {
              clazz = actualClazz;
              structSchema = schema.get(clazz);
              break;
            }
          }
        }
      }
    }
    if (!structSchema)
      throw new BorshError(`Class ${clazz.name} is missing in schema`);
  } else if (getVariantIndex(clazz) !== undefined) {
    // It is an enum, but we deserialize into its variant directly
    // This means we should omit the variant index
    let index = getVariantIndex(clazz);
    if (typeof index === "number") {
      reader.readU8();
    } else {
      for (const _ of index) {
        reader.readU8();
      }
    }
  }

  if (structSchema instanceof StructKind) {
    const result: { [key: string]: any } = {};
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
  throw new BorshError(`Unexpected schema ${clazz.constructor.name}`);
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
  classType: { new (args: any): T },
  buffer: Buffer,
  unchecked: boolean = false,
  Reader = BinaryReader
): T {
  const reader = new Reader(buffer);
  const result = deserializeStruct(schema, classType, reader);
  if (!unchecked && reader.offset < buffer.length) {
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

//

const structMetaDataKey = (constructorName: string) => {
  return STRUCT_META_DATA_SYMBOL + constructorName;
};

/**
 *
 * @param kind 'struct' or 'variant. 'variant' equivalnt to Rust Enum
 * @returns Schema decorator function for classes
 */
export const variant = (index: number | number[]) => {
  return (ctor: Function) => {
    // Create a custom serialization, for enum by prepend instruction index
    ctor.prototype.borshSerialize = function (
      schema: Schema,
      writer: BinaryWriter
    ) {
      if (typeof index === "number") {
        writer.writeU8(index);
      } else {
        index.forEach((i) => {
          writer.writeU8(i);
        });
      }

      // Serialize content as struct, we do not invoke serializeStruct since it will cause circular calls to this method
      const structSchema: StructKind = schema.get(ctor);

      // If Schema has fields, "structSchema" will be non empty and "fields" will exist
      if (structSchema?.fields)
        for (const field of structSchema.fields) {
          serializeField(
            schema,
            field.key,
            this[field.key],
            field.type,
            writer
          );
        }
    };
    ctor.prototype._borsh_variant_index = function () {
      return index; // creates a function that returns the variant index on the class
    };
  };
};

export const getVariantIndex = (clazz: any): number | number[] | undefined => {
  if (clazz.prototype._borsh_variant_index)
    return clazz.prototype._borsh_variant_index();
  return undefined;
};

/**
 * @param properties, the properties of the field mapping to schema
 * @returns
 */
export function field(properties: SimpleField | CustomField<any>) {
  return (target: {} | any, name?: PropertyKey): any => {
    const metaDataKey = structMetaDataKey(target.constructor.name);
    let schema: StructKind = Reflect.getMetadata(
      metaDataKey,
      target.constructor
    ); // Assume StructKind already exist
    const key = name.toString();
    if (!schema) {
      schema = new StructKind();
    }
    let field: Field = undefined;
    if ((properties as SimpleField)["type"] != undefined) {
      field = {
        key,
        type: (properties as SimpleField)["type"],
      };
    } else {
      field = {
        key,
        type: properties as CustomField<any>,
      };
    }

    if (properties.index === undefined) {
      schema.fields.push(field); // add to the end. This will make property decorator execution order define field order
    } else {
      if (schema.fields[properties.index]) {
        throw new BorshError(
          "Multiple fields defined at the same index: " +
            properties.index +
            ", class: " +
            target.constructor.name
        );
      }
      if (properties.index >= schema.fields.length) {
        resize(schema.fields, properties.index + 1, undefined);
      }
      schema.fields[properties.index] = field;
    }

    Reflect.defineMetadata(metaDataKey, schema, target.constructor);
  };
}

/**
 * @param clazzes
 * @param validate, run validation?
 * @returns Schema map
 */
export const generateSchemas = (clazzes: any[], validate?: boolean): Schema => {
  let ret = new Map<any, StructKind>();
  let dependencies = new Set();
  clazzes.forEach((clazz) => {
    let schema = Reflect.getMetadata(
      structMetaDataKey(clazz.name),
      clazz
    ) as StructKind;
    if (schema) {
      if (validate) {
        validateSchema(schema, clazz);
      }
      ret.set(clazz, schema);
      schema.getDependencies().forEach((depenency) => {
        dependencies.add(depenency);
      });
    }
  });

  // Generate schemas for nested types
  dependencies.forEach((dependency) => {
    if (!ret.has(dependency)) {
      const dependencySchema = generateSchemas([dependency], validate);
      dependencySchema.forEach((value, key) => {
        ret.set(key, value);
      });
    }
  });
  return new Map(ret);
};

const validateSchema = (structSchema: StructKind, clazz: any) => {
  if (!structSchema.fields) {
    throw new BorshError("Missing fields for class: " + clazz.name);
  }
  structSchema.fields.forEach((field) => {
    if (!field) {
      throw new BorshError(
        "Field is missing definition, most likely due to field indexing with missing indices"
      );
    }
  });
};

const resize = (arr: Array<any>, newSize: number, defaultValue: any) => {
  while (newSize > arr.length) arr.push(defaultValue);
  arr.length = newSize;
};

import bs58 from "bs58";
import {
  FixedArrayKind,
  OptionKind,
  Field,
  StructKind,
  VecKind,
  SimpleField,
  CustomField,
  extendingClasses,
} from "./types";
import { BorshError } from "./error";
import { BinaryWriter, BinaryReader } from "./binary";
export * from "./binary";
export * from "./types";


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
            `Expecting array of length ${(fieldType as any)[0]}, but got ${value.length
            }`
          );
        }
      } else {
        writer.writeU32(len); // For dynamically sized array we write the size as u32 according to specification
      }
      for (let i = 0; i < len; i++) {
        serializeField(null, value[i], fieldType.elementType, writer);
      }
    } else if (fieldType instanceof OptionKind) {
      if (value === null || value === undefined) {
        writer.writeU8(0);
      } else {
        writer.writeU8(1);
        serializeField(fieldName, value, fieldType.elementType, writer);
      }
    } else if (typeof fieldType["serialize"] == "function") {
      fieldType.serialize(value, writer);
    } else {
      serializeStruct(value, writer);
    }
  } catch (error) {
    if (error instanceof BorshError) {
      error.addToFieldPath(fieldName);
    }
    throw error;
  }
}

export function serializeStruct(
  obj: any,
  writer: BinaryWriter
) {
  if (typeof obj.borshSerialize === "function") {
    obj.borshSerialize(writer);
    return;
  }

  const structSchema = getSchema(obj.constructor)
  if (!structSchema) {
    throw new BorshError(`Class ${obj.constructor.name} is missing in schema`);
  }

  if (structSchema instanceof StructKind) {
    structSchema.fields.map((field) => {
      serializeField(field.key, obj[field.key], field.type, writer);
    });
  } else {
    throw new BorshError(`Unexpected schema for ${obj.constructor.name}`);
  }
}

/// Serialize given object using schema of the form:
/// { class_name -> [ [field_name, field_type], .. ], .. }
export function serialize(
  obj: any,
  Writer = BinaryWriter
): Uint8Array {
  const writer = new Writer();
  serializeStruct(obj, writer);
  return writer.toArray();
}

function deserializeField(
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
        arr[i] = deserializeField(null, fieldType.elementType, reader);
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
          fieldName,
          fieldType.elementType,
          reader
        );
      }

      return undefined;
    }

    return deserializeStruct(fieldType, reader);
  } catch (error) {
    if (error instanceof BorshError) {
      error.addToFieldPath(fieldName);
    }
    throw error;
  }
}

function deserializeStruct(clazz: any, reader: BinaryReader) {
  if (typeof clazz.borshDeserialize === "function") {
    return clazz.borshDeserialize(reader);
  }

  let structSchema = getSchema(clazz);//schema.get(clazz);
  let idx = undefined;

  if (!structSchema) {
    // We find the deserialization schema from one of the subclasses

    // it must be an enum
    idx = [reader.readU8()];

    // Try polymorphic deserialziation (i.e.  get all subclasses and find best
    // class this can be deserialized to)

    // We know that we should serialize into the variant that accounts to the first byte of the read
    for (const actualClazz of getDependencies(clazz)) {
      const variantIndex = getVariantIndex(actualClazz);
      if (variantIndex !== undefined) {
        if (typeof variantIndex === "number") {
          if (variantIndex == idx[0]) {
            clazz = actualClazz;
            structSchema = getSchema(clazz);
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
            structSchema = getSchema(clazz);
            break;
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
    for (const field of getSchema(clazz).fields) {
      result[field.key] = deserializeField(
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
 * @param buffer, data
 * @param classType, target Class
 * @param unchecked, if true then any remaining bytes after deserialization will be ignored
 * @param Reader, optional custom reader
 * @returns
 */
export function deserialize<T>(
  buffer: Buffer,
  classType: { new(args: any): T },
  unchecked: boolean = false,
  Reader = BinaryReader
): T {
  const reader = new Reader(buffer);
  const result = deserializeStruct(classType, reader);
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
  classType: { new(args: any): T },
  buffer: Buffer,
  Reader = BinaryReader
): T {
  const reader = new Reader(buffer);
  return deserializeStruct(classType, reader);
}


const getOrCreateStructMeta = (clazz: any): StructKind => {
  //const metaDataKey = structMetaDataKey(clazz.name);
  let schema: StructKind = getSchema(clazz)
  if (!schema) {
    schema = new StructKind();
  }
  setSchema(clazz, schema);
  return schema
  /* return {
    metaDataKey,
    schema
  } */
}

const setDependency = (ctor: Function, depenency: Function) => {
  if (!ctor.prototype._borsh_dependency) {
    ctor.prototype._borsh_dependency = []
  }
  ctor.prototype._borsh_dependency.push(depenency);
}

const hasDependencies = (ctor: Function, schema: Map<any, StructKind>): boolean => {
  if (!ctor.prototype._borsh_dependency || ctor.prototype._borsh_dependency.length == 0) {
    return false
  }

  for (const dependency of ctor.prototype._borsh_dependency) {
    if (!schema.has(dependency)) {
      return false;
    }
  }
  return true;
}

const getDependencies = (ctor: Function): Function[] => {
  return ctor.prototype._borsh_dependency ? ctor.prototype._borsh_dependency : []
}

const setSchema = (ctor: Function, schema: StructKind) => {
  ctor.prototype._borsh_schema = schema;
}

export const getSchema = (ctor: Function): StructKind => {
  return ctor.prototype._borsh_schema
}

/**
 *
 * @param kind 'struct' or 'variant. 'variant' equivalnt to Rust Enum
 * @returns Schema decorator function for classes
 */
export const variant = (index: number | number[]) => {
  return (ctor: Function) => {
    getOrCreateStructMeta(ctor);

    // Define Schema for this class, even though it might miss fields since this is a variant

    const clazzes = extendingClasses(ctor);
    let prev = ctor;
    for (const clazz of clazzes) {
      setDependency(clazz, prev); // Super classes are marked so we know they have some importance/meaningfulness
      prev = clazz;
    }


    // Create a custom serialization, for enum by prepend instruction index
    ctor.prototype.borshSerialize = function (
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
      const structSchema: StructKind = getSchema(ctor);

      // If Schema has fields, "structSchema" will be non empty and "fields" will exist
      if (structSchema?.fields)
        for (const field of structSchema.fields) {
          serializeField(
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

    const schema = getOrCreateStructMeta(target.constructor);
    const key = name.toString();

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
  };
}

/**
 * @param clazzes
 * @param validate, run validation?
 * @returns Schema map
 */
export const validate = (clazzes: any[], allowUndefined = false) => {
  return validateIterator(clazzes, allowUndefined, new Set());
};

const validateIterator = (clazzes: any[], allowUndefined: boolean, visited: Set<string>) => {
  let schemas = new Map<any, StructKind>();
  let dependencies = new Set<Function>();
  clazzes.forEach((clazz) => {
    visited.add(clazz.name);
    const schema = getSchema(clazz);
    if (schema) {
      schemas.set(clazz, schema);
      // By field
      schema.getDependencies().forEach((depenency) => {
        dependencies.add(depenency);
      });
    }
    // Class dependencies (inheritance)
    getDependencies(clazz).forEach((dependency) => {
      if (clazzes.find(c => c == dependency) == undefined) {
        dependencies.add(dependency);
      }
    })

  });

  let filteredDependencies: Function[] = [];
  dependencies.forEach((dependency) => {
    if (visited.has(dependency.name)) {
      return;
    }
    filteredDependencies.push(dependency);
    visited.add(dependency.name);
  })


  // Generate schemas for nested types
  filteredDependencies.forEach((dependency) => {
    if (!schemas.has(dependency)) {
      const dependencySchema = validateIterator([dependency], allowUndefined, visited);
      dependencySchema.forEach((value, key) => {
        schemas.set(key, value);
      });
    }
  });
  schemas.forEach((structSchema, clazz) => {
    if (!structSchema.fields && !hasDependencies(clazz, schemas)) {
      throw new BorshError("Missing schema for class " + clazz.name);
    }
    structSchema.fields.forEach((field) => {
      if (!field) {
        throw new BorshError(
          "Field is missing definition, most likely due to field indexing with missing indices"
        );
      }
      if (allowUndefined) {
        return;
      }

      if (field.type instanceof Function) {
        if (!schemas.has(field.type) && !hasDependencies(field.type, schemas)) {
          throw new BorshError("Unknown field type: " + field.type.name);
        }
      }
    });
  })
  return schemas;

}


const resize = (arr: Array<any>, newSize: number, defaultValue: any) => {
  while (newSize > arr.length) arr.push(defaultValue);
  arr.length = newSize;
};

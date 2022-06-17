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
  Constructor,
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


  // Serialize content as struct, we do not invoke serializeStruct since it will cause circular calls to this method
  const structSchemas = getSchemasBottomUp(obj.constructor);

  // If Schema has fields, "structSchema" will be non empty and "fields" will exist
  if (structSchemas.length == 0) {
    throw new BorshError(`Class ${obj.constructor.name} is missing in schema`);
  }

  structSchemas.forEach((v) => {
    if (v.schema instanceof StructKind) {
      const index = v.schema.variant;
      if (index != undefined) {
        if (typeof index === "number") {
          writer.writeU8(index);
        } else if (Array.isArray(index)) {
          index.forEach((i) => {
            writer.writeU8(i);
          });
        }
        else { // is string
          writer.writeString(index);
        }
      }

      v.schema.fields.map((field) => {
        serializeField(field.key, obj[field.key], field.type, writer);
      });
    } else {
      throw new BorshError(`Unexpected schema for ${obj.constructor.name}`);
    }
  })

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

  const result: { [key: string]: any } = {};

  clazz = getSuperMostClass(clazz);

  // assume clazz is super class
  if (getVariantIndex(clazz) !== undefined) {
    // It is an (stupid) enum, but we deserialize into its variant directly
    // This means we should omit the variant index
    let index = getVariantIndex(clazz);
    if (typeof index === "number") {
      reader.readU8();
    } else if (Array.isArray(index)) {
      for (const _ of index) {
        reader.readU8();
      }
    }
    else { // string
      reader.readString();
    }
  }


  // Polymorphic serialization, i.e. reversed prototype iteration using descriminators
  let once = false;
  let currClazz = clazz;
  while ((getSchema(currClazz) || getDependencies(currClazz).size > 0)) {

    let structSchema = getSchema(currClazz);

    once = true;
    let variantsIndex: number[] = undefined;
    let variantString: string = undefined;

    let nextClazz = undefined;
    let dependencies = getNonTrivialDependencies(currClazz);
    if (structSchema) {
      for (const field of structSchema.fields) {
        result[field.key] = deserializeField(
          field.key,
          field.type,
          reader
        );
      }
    }
    // We know that we should serialize into the variant that accounts to the first byte of the read
    for (const [_key, actualClazz] of dependencies) {
      const variantIndex = getVariantIndex(actualClazz);
      if (variantIndex !== undefined) {
        if (typeof variantIndex === "number") {

          if (!variantsIndex) {
            variantsIndex = [reader.readU8()];
          }
          if (variantIndex == variantsIndex[0]) {
            nextClazz = actualClazz;
            break;
          }
        }
        else if (Array.isArray(variantIndex)) { // variant is array, check all values

          if (!variantsIndex) {
            variantsIndex = [];
            while (variantsIndex.length < variantIndex.length) {
              variantsIndex.push(reader.readU8());
            }
          }

          // Compare variants
          if (
            variantsIndex.length === variantIndex.length &&
            (variantsIndex as number[]).every((value, index) => value === variantIndex[index])
          ) {
            nextClazz = actualClazz;
            break;
          }
        }

        else { // is string
          if (variantString == undefined) {
            variantString = reader.readString();
          }
          // Compare variants is just string compare
          if (
            variantString === variantIndex
          ) {
            nextClazz = actualClazz;
            break;
          }
        }
      }
    }
    if (nextClazz == undefined) {
      // do a recursive call and copy result, 
      // this is not computationally performant since we are going to traverse multiple path
      // and possible do deserialziation on bad paths
      if (dependencies.size == 1) // still deterministic
        nextClazz = dependencies.values().next().value;
      else if (dependencies.size > 1) {
        const classes = [...dependencies.values()].map((f) => f.name).join(', ')
        throw new BorshError(`Multiple ambigious deserialization paths from ${currClazz.name} found: ${classes}. This is not allowed, and would not be performant if allowed`)
      }
    }

    if (nextClazz == undefined) {
      break;
    }
    currClazz = nextClazz;
    /* if (!structSchema)
      throw new BorshError(`Class ${clazz.name} is missing in schema`); */
  }
  if (!once) {
    throw new BorshError(`Unexpected schema ${clazz.constructor.name}`);
  }
  return Object.assign(new currClazz(), result);

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
const setDependencyToProtoType = (ctor: Function) => {
  let proto = Object.getPrototypeOf(ctor);
  if (proto.prototype?.constructor != undefined)
    setDependency(proto, ctor);
}

const setDependency = (ctor: Function, dependency: Function) => {
  let dependencies = getDependencies(ctor);
  let key = JSON.stringify(getVariantIndex(dependency));
  if (key != undefined && dependencies.has(key)) {
    if (dependencies.get(key) == dependency) {
      // already added;
      return;
    }
    throw new BorshError(`Conflicting variants: Dependency ${dependencies.get(key).name} and ${dependency.name} share same variant index(es)`)
  }
  if (key == undefined) {
    /**
     * Class is not a variant but a "bridging class" i.e
     * class A {}
     * class B extends A {}
     * 
     * @variant(0)
     * class C extends B {}
     * 
     * class B has no variant even though A is a dependency on it, so it gets the key "A/B" instead
     */
    key = ctor.name + "/" + dependency.name;
  }
  dependencies.set(key, dependency);
  setDependencies(ctor, dependencies);
}
const getSuperMostClass = (clazz: Constructor<any>) => {
  while (Object.getPrototypeOf(clazz).prototype != undefined) {
    clazz = Object.getPrototypeOf(clazz);
  }
  return clazz;
}
const hasDependencies = (ctor: Function, schema: Map<any, StructKind>): boolean => {
  if (!ctor.prototype._borsh_dependency || ctor.prototype._borsh_dependency.size == 0) {
    return false
  }

  for (const [_key, dependency] of getDependenciesRecursively(ctor)) {
    if (!schema.has(dependency)) {
      return false;
    }
  }
  return true;
}

const getDependencyKey = (ctor: Function) => "_borsh_dependency_" + ctor.name

const getDependencies = (ctor: Function): Map<string, Function> => {
  let existing = ctor.prototype.constructor[getDependencyKey(ctor)]
  if (existing)
    return existing;
  return new Map();
}

const getNonTrivialDependencies = (ctor: Function): Map<string, Function> => {
  let ret = new Map<string, Function>();
  let existing = ctor.prototype.constructor[getDependencyKey(ctor)] as Map<string, Function>;
  if (existing)
    existing.forEach((v, k) => {
      let schema = getSchema(v);
      if (schema.fields.length > 0 || schema.variant != undefined) { // non trivial
        ret.set(k, v);
      }
      else { // check recursively
        let req = getNonTrivialDependencies(v);
        req.forEach((rv, rk) => {
          ret.set(rk, rv);
        })
      }

    });
  return ret;
}

const setDependencies = (ctor: Function, dependencies: Map<string, Function>): Map<string, Function> => {
  return ctor.prototype.constructor[getDependencyKey(ctor)] = dependencies
}


/**
 * Flat map class inheritance tree into hashmap where key represents variant key
 * @param ctor 
 * @param mem 
 * @returns a map of dependencies
 */
const getDependenciesRecursively = (ctor: Function, mem: Map<string, Function> = new Map()): Map<string, Function> => {
  let dep = getDependencies(ctor);
  for (const [key, f] of dep) {
    if (mem.has(key)) {
      continue;
    }
    mem.set(key, f);
    getDependenciesRecursively(f, mem);
  }
  return mem
}



const setSchema = (ctor: Function, schema: StructKind) => {

  ctor.prototype.constructor["_borsh_schema_" + ctor.name] = schema
}

export const getSchema = (ctor: Function): StructKind => {
  if (ctor.prototype == undefined) {
    const t = 123;
  }
  return ctor.prototype.constructor["_borsh_schema_" + ctor.name];
}

export const getSchemasBottomUp = (ctor: Function): { clazz: Function, schema: StructKind }[] => {
  let schemas: { clazz: Function, schema: StructKind }[] = [];
  while (ctor.prototype != undefined) {
    let schema = getSchema(ctor);
    if (schema)
      schemas.push({
        clazz: ctor,
        schema
      });
    ctor = Object.getPrototypeOf(ctor);
  }
  return schemas.reverse();

}



/**
 *
 * @param kind 'struct' or 'variant. 'variant' equivalnt to Rust Enum
 * @returns Schema decorator function for classes
 */
export const variant = (index: number | number[] | string) => {
  return (ctor: Function) => {
    let schema = getOrCreateStructMeta(ctor);

    // Create a custom serialization, for enum by prepend instruction index
    schema.variant = index;

    // Define Schema for this class, even though it might miss fields since this is a variant
    const clazzes = extendingClasses(ctor);
    let prev = ctor;
    for (const clazz of clazzes) {
      setDependency(clazz, prev); // Super classes are marked so we know they have some importance/meaningfulness
      prev = clazz;
    }


  };
};

export const getVariantIndex = (clazz: any): number | number[] | string | undefined => {
  return getOrCreateStructMeta(clazz).variant;
};

/**
 * @param properties, the properties of the field mapping to schema
 * @returns
 */
export function field(properties: SimpleField | CustomField<any>) {
  return (target: {} | any, name?: PropertyKey): any => {
    setDependencyToProtoType(target.constructor);
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
export const validate = (clazzes: Constructor<any> | Constructor<any>[], allowUndefined = false) => {
  return validateIterator(clazzes, allowUndefined, new Set());
};

const validateIterator = (clazzes: Constructor<any> | Constructor<any>[], allowUndefined: boolean, visited: Set<string>) => {
  clazzes = Array.isArray(clazzes) ? clazzes : [clazzes];
  let schemas = new Map<any, StructKind>();
  clazzes.forEach((clazz, ix) => {
    clazz = getSuperMostClass(clazz);
    let dependencies = getDependenciesRecursively(clazz);
    dependencies.set('_', clazz);
    dependencies.forEach((v, k) => {
      const schema = getSchema(v);
      if (!schema) {
        return;
      }
      schemas.set(v, schema);
      visited.add(v.name);


    });

    let lastVariant: number | number[] | string = undefined;
    let lastKey: string = undefined;
    getNonTrivialDependencies(clazz).forEach((dependency, key) => {
      if (!lastVariant)
        lastVariant = getVariantIndex(dependency);
      else if (!validateVariantAreCompatible(lastVariant, getVariantIndex(dependency))) {
        throw new BorshError(`Class ${dependency.name} is extended by classes with variants of different types. Expecting only one of number, number[] or string`)
      }

      if (lastKey != undefined && lastVariant == undefined) {
        throw new BorshError(`Classes inherit ${clazz} and are introducing new field without introducing variants. This leads to unoptimized deserialization`)
      }
      lastKey = key;
    })

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
          if (!getSchema(field.type) && !hasDependencies(field.type, schemas)) {
            throw new BorshError("Unknown field type: " + field.type.name);
          }

          // Validate field
          validateIterator(field.type, allowUndefined, visited);
        }
      });
    })
  });


}


const resize = (arr: Array<any>, newSize: number, defaultValue: any) => {
  while (newSize > arr.length) arr.push(defaultValue);
  arr.length = newSize;
};

const validateVariantAreCompatible = (a: number | number[] | string, b: number | number[] | string) => {
  if (typeof a != typeof b) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length != b.length) {
      return false;
    }
  }
  return true;
}
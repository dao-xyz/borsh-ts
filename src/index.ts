import {
  FixedArrayKind,
  OptionKind,
  Field,
  StructKind,
  VecKind,
  SimpleField,
  CustomField,
  Constructor,
  AbstractType,
  PrimitiveType,
  IntegerType,
  getOffset,
} from "./types.js";
export * from "./binary.js";
export * from "./types.js";
export * from './error.js';
import { BorshError } from "./error.js";
import { BinaryWriter, BinaryReader } from "./binary.js";

export function serializeField(
  fieldName: string,
  fieldType: any, // A simple type of a CustomField
  options?: { unchecked: boolean }
): (obj: any, writer: BinaryWriter) => any {
  try {
    // TODO: Handle missing values properly (make sure they never result in just skipped write)

    if (typeof fieldType.serialize == "function") {
      return (obj, writer) => {
        fieldType.serialize(obj, writer);
      }
    }
    else if (fieldType instanceof OptionKind) { // 
      const fieldHandle = serializeField(fieldName, fieldType.elementType);

      return (obj, writer) => {
        if (obj != null) {
          writer.u8(1);
          fieldHandle(obj, writer)
        }
        else {
          writer.u8(0)
        }
      }
      /*  if (value === null || value === undefined) {
         writer.u8(0);
       } else {
 
         throw new BorshError(`Trying to serialize a null value to field "${fieldName}" which is not allowed since the field is not decorated with "option(...)" but "${typeof fieldType === 'function' && fieldType?.name ? fieldType?.name : fieldType}". Most likely you have forgotten to assign this value before serializing`)
       } */
    }
    else if (typeof fieldType === "string") {
      switch (fieldType as PrimitiveType) {
        case "bool":
          return (obj, writer) => {
            writer.bool(obj);
          }
        case "string":
          return (obj, writer) => {
            writer.string(obj);
          }
        default:
          return BinaryWriter.u(fieldType as IntegerType)
      }
    }

    else if (fieldType === Uint8Array) {
      return (obj, writer) => {
        writer.uint8Array(obj as Uint8Array)
      }
    }
    else if (
      fieldType instanceof VecKind ||
      fieldType instanceof FixedArrayKind
    ) {

      const fieldHandle = serializeField(null, fieldType.elementType);;
      const sizeHandle = fieldType instanceof FixedArrayKind ? undefined : BinaryWriter.u(fieldType.sizeEncoding)
      return (obj, writer) => {
        let len = obj.length;
        if (!sizeHandle) {
          if ((fieldType as FixedArrayKind).length != len) {
            throw new BorshError(
              `Expecting array of length ${(fieldType as any)[0]}, but got ${obj.length
              }`
            );
          }
        } else {
          sizeHandle(len, writer); // For dynamically sized array we write the size as uX according to specification
        }
        for (let i = 0; i < len; i++) {
          fieldHandle(obj[i], writer)
        }
      }

    } else {
      //const structHandle = serializeStruct(fieldType);
      return (obj, writer) => {
        if (options?.unchecked && !checkClazzesCompatible(obj.constructor, fieldType)) {
          throw new BorshError(`Field value of field ${fieldName} is not instance of expected Class ${getSuperMostClass(fieldType)?.name}. Got: ${obj.constructor.name}`)
        }
        serializeStruct(obj.constructor)(obj, writer)
      }
    }
  } catch (error) {
    if (error instanceof BorshError) {
      error.addToFieldPath(fieldName);
    }
    throw error;
  }
}


export function serializeStruct(
  ctor: Function
) {
  let handle = (obj: any, writer: BinaryWriter) => { };
  var i = 0;
  let once = false;
  while (true) {
    let prev = handle;
    let schema = getSchemas(ctor, i);
    if (schema) {
      once = true;
      const index = schema.variant;
      if (index != undefined) {
        if (typeof index === "number") {
          handle = (obj, writer) => { prev(obj, writer), writer.u8(index) }
        } else if (Array.isArray(index)) {
          handle = (obj, writer) => {
            prev(obj, writer)
            for (const i of index) {
              writer.u8(i);
            }
          }

        }
        else { // is string
          handle = (obj, writer) => {
            prev(obj, writer);
            writer.string(index);
          }
        }
      }
      for (const field of schema.fields) {
        const fieldHandle = serializeField(field.key, field.type);
        let prev = handle;
        handle = (obj, writer) => {
          prev(obj, writer);
          fieldHandle(obj[field.key], writer)
        }
      }
    }

    else if (once && !getDependencies(ctor, i)?.length) {
      return handle;
    }
    i++;

    if (i > 100 && !once) { // TODO
      throw new BorshError(`Class ${ctor.name} is missing in schema`);
    }
  }
}

/// Serialize given object using schema of the form:
/// { class_name -> [ [field_name, field_type], .. ], .. }
export function serialize(
  obj: any
): Uint8Array {
  const writer = new BinaryWriter();
  let handle = obj.constructor._borsh_serialize
  if (!handle) {
    handle = serializeStruct(obj.constructor)
    obj.constructor._borsh_serialize = handle;
  }
  handle(obj, writer)
  return writer.finalize();
}

function deserializeField(
  fieldName: string,
  fieldType: any,
): (reader: BinaryReader, options: DeserializeStructOptions) => any {
  try {
    if (typeof fieldType === "string") {
      switch (fieldType as PrimitiveType) {
        case "bool":
          return (reader) => reader.bool();
        case "string":
          return (reader) => reader.string();
        default:
          return BinaryReader.u(fieldType as IntegerType)
      }
    }

    if (fieldType === Uint8Array) {
      return (reader) => reader.uint8Array()
    }

    if (fieldType instanceof VecKind || fieldType instanceof FixedArrayKind) {
      let sizeHandle = fieldType instanceof VecKind ? BinaryReader.u(fieldType.sizeEncoding) : () => fieldType.length;
      const fieldHandle = deserializeField(null, fieldType.elementType);
      return (reader, options) => {
        const len = sizeHandle(reader);
        let arr = new Array(len);
        for (let i = 0; i < len; i++) {
          arr[i] = fieldHandle(reader, options);
        }
        return arr;
      }
    }

    if (typeof fieldType["deserialize"] == "function") {
      return (reader) => fieldType.deserialize(reader);
    }

    if (fieldType instanceof OptionKind) {
      const fieldHandle = deserializeField(
        fieldName,
        fieldType.elementType);
      return (reader, options) => {
        const option = reader.u8();
        if (option) {
          return fieldHandle(
            reader,
            options
          );
        }
        return undefined;
      }
    }
    const structHandle = deserializeStruct(fieldType);
    return (reader, options) => {
      const result = structHandle(reader, options);
      return result;
    }

  } catch (error) {
    if (error instanceof BorshError) {
      error.addToFieldPath(fieldName);
    }
    throw error;
  }
}
function deserializeStruct(targetClazz: any): (reader: BinaryReader, options?: DeserializeStructOptions) => any {

  const handle = getCreateDeserializationHandle(targetClazz, 0);
  const ret = (reader: BinaryReader, options?: DeserializeStructOptions) => {
    const result = handle({}, reader, options)
    if (!options?.unchecked && !(options as any)?.object && !checkClazzesCompatible(result.constructor, targetClazz)) {
      throw new BorshError(`Deserialization of ${targetClazz?.name || targetClazz} yielded another Class: ${result.constructor?.name} which are not compatible`);
    }
    return result;
  }
  return ret;

}

const getDeserializationHandle = (clazz: any, offset: number) => {
  return clazz._borsh_deserialize?.[offset]
}

const getCreateDeserializationHandle = (clazz: any, offset: number): (result: any, reader: BinaryReader, options?: DeserializeStructOptions) => any => {
  let handle = getDeserializationHandle(clazz, offset);
  if (!handle) {
    handle = setDeserializationHandle(clazz, offset, createDeserializeStructHandle(clazz, offset))
  }
  return handle;
}

const setDeserializationHandle = (clazz: any, offset: number, handle: (result: any, reader: BinaryReader, options?: DeserializeStructOptions) => any) => {
  if (!clazz._borsh_deserialize) {
    clazz._borsh_deserialize = {};
  }
  clazz._borsh_deserialize[offset] = handle;
  return handle;
}

const createDeserializeStructHandle = (currClazz: Constructor<any>, offset: number): ((result: any, reader: BinaryReader, options?: DeserializeStructOptions) => any) => {
  let handle: (result: any, reader: BinaryReader, options?: DeserializeStructOptions) => any | undefined = undefined;
  let endHandle = (result: any, reader: BinaryReader, options: DeserializeStructOptions) => {
    if ((options as any)?.object) {
      return result;
    }
    return Object.assign((options as any)?.construct ? new currClazz() : Object.create(currClazz.prototype), result);
  }
  let structSchema = getSchemas(currClazz, offset);
  if (structSchema) {
    if (offset === 0) {
      let index = getVariantIndex(structSchema);
      if (index != null) {
        // It is an (stupid) enum, but we deserialize into its variant directly
        // This means we should omit the variant index
        if (typeof index === "number") {
          handle = (_, reader, __) => {
            reader._offset += 1; // read 1 u
          };
        } else if (Array.isArray(index)) {
          handle = (_, reader, __) => {
            reader._offset += (index as Array<any>).length // read all u8's 1 u8 = 1 byte -> shift offset with 1*length
          };
        }
        else { // string
          handle = (_, reader, __) => {
            reader.string();
          };
        }
      }
    }

    for (const field of structSchema.fields) {
      const prev = handle;
      const fieldHandle = deserializeField(
        field.key,
        field.type,
      );
      if (prev) {
        handle = (result, reader: BinaryReader, options?: DeserializeStructOptions) => {
          prev(result, reader, options)
          result[field.key] = fieldHandle(reader,
            options)
        }
      }
      else handle = (result, reader: BinaryReader, options?: DeserializeStructOptions) => {
        result[field.key] = fieldHandle(reader,
          options)
      }


    }
  }

  // We know that we should serialize into the variant that accounts to the first byte of the read
  let dependencies = getAllDependencies(currClazz, offset);
  if (dependencies) {
    let variantToDepndency: [any, any, {
      schema: StructKind;
      offset: number;
    }][] = [];
    let variantType: 'string' | 'number' | number | 'undefined';
    for (const [actualClazz, dependency] of dependencies) {
      const variantIndex = getVariantIndex(dependency.schema);
      let currentVariantType = typeof variantIndex === 'object' ? variantIndex.length : typeof variantIndex as ('string' | 'number');
      if (!variantType) {
        variantType = currentVariantType;
      }
      else if (currentVariantType !== variantType) {
        throw new Error(`Variant extending ${currClazz.name} have different types, expecting either number, number[] (with same sizes) or string, but not a combination of them`)
      }
      variantToDepndency.push([variantIndex, actualClazz, dependency])
    }
    if (variantType === 'undefined') {
      if (dependencies.size === 1) {
        const dep = variantToDepndency[0];
        return (result, reader, options) => {
          handle && handle(result, reader, options)
          return getCreateDeserializationHandle(dep[1], dep[2].offset)(result, reader, options)
        }
      }
      else throw new BorshError(`Multiple deserialization paths from ${currClazz.name} found: but no variants are used which makes deserialization undetermenistic`)

    }

    return (result, reader, options) => {
      handle && handle(result, reader, options)
      let next = undefined;
      let nextOffset = undefined;

      if (variantType === 'number') {
        let agg = reader.u8();
        for (const dep of variantToDepndency) {
          if (agg === dep[0]) {
            return getCreateDeserializationHandle(dep[1], dep[2].offset)(result, reader, options)
          }
        }
      }
      else if (variantType === 'string') {
        let variant = reader.string();
        for (const dep of variantToDepndency) {
          if (variant === dep[0]) {
            return getCreateDeserializationHandle(dep[1], dep[2].offset)(result, reader, options)
          }
        }
      }
      else // array 
      {
        let agg: number[] = [];
        for (let i = 0; i < variantType; i++) {
          agg.push(reader.u8())
        }
        for (const dep of variantToDepndency) {
          let currentVariant = dep[0];
          if (currentVariant.length === agg.length &&
            (currentVariant as number[]).every((value, index) => value === agg[index])) {

            return getCreateDeserializationHandle(dep[1], dep[2].offset)(result, reader, options)
          }
        }
      }

      if (next == undefined && dependencies) {
        // do a recursive call and copy result, 
        // this is not computationally performant since we are going to traverse multiple path
        // and possible do deserialziation on bad paths
        if (dependencies.size == 1) // still deterministic
        {
          const n = dependencies.entries().next().value;
          next = n[0];
          nextOffset = n[1].offset;
        }
        else if (dependencies.size > 1) {
          const classes = [...dependencies.entries()].map(([c]) => c.name).join(', ')
          throw new BorshError(`Multiple deserialization paths from ${currClazz.name} found: ${classes} but no matches the variant read from the buffer.`)
        }
      }
      if (next != null) {
        getCreateDeserializationHandle(next, nextOffset)(result, reader, options)

      }
      else {
        return endHandle
      }

    }

  }
  else {
    if (handle) {
      return (result, reader, options) => {
        handle && handle(result, reader, options)
        return endHandle
      }
    }
    return endHandle
  }


}



const intoUint8Array = (buf: Uint8Array) => {
  if (buf.constructor !== Uint8Array) {
    if (buf instanceof Uint8Array) {
      buf = new Uint8Array(buf, buf.byteOffset, buf.length);
    }
    else {
      throw new BorshError("Expecting Uint8Array, instead got: " + buf["constructor"]?.["name"])
    }
  }
  return buf;
}

/**
 * /// Deserializes object from bytes using schema.
 * @param buffer data
 * @param classType target Class
 * @param options options
 * @param options.unchecked if true then any remaining bytes after deserialization will be ignored
 * @param options.construct if true, constructors will be invoked on deserialization
 * @returns
 */


type DeserializeStructOptions = {
  unchecked?: boolean
} & ({ construct?: boolean } | { object?: boolean });
export function deserialize<T>(
  buffer: Uint8Array,
  classType: Constructor<T> | AbstractType<T>,
  options?: DeserializeStructOptions
): T {
  // buffer = intoUint8Array(buffer);
  const reader = new BinaryReader(buffer);
  const result = deserializeStruct(classType)(reader, options);
  if (!options?.unchecked && reader._offset !== buffer.length) {
    throw new BorshError(
      `Unexpected ${buffer.length - reader._offset
      } bytes after deserialized data`
    );
  }
  return result;
}

/// Deserializes object from bytes using schema, without checking the length read
/**
 * @deprecated use deserialize(..., ..., { unchecked: true }) instead
 */
export function deserializeUnchecked<T>(
  classType: { new(args: any): T },
  buffer: Uint8Array,
  options?: {
    construct?: boolean
  }
): T {
  buffer = intoUint8Array(buffer);
  const reader = new BinaryReader(buffer);
  return deserializeStruct(classType)(reader, options);
}


const getOrCreateStructMeta = (clazz: any, offset: number): StructKind => {

  let schema: StructKind = getSchemas(clazz, offset)
  if (!schema) {
    schema = new StructKind();
  }
  /*  if (!getFlag(clazz)) {
     if (!schemas) {
       schemas = [];
     }
     schemas.push(new StructKind())
     setFlag(clazz)
   } */
  setSchema(clazz, schema, offset);
  return schema
}
const setDependencyToProtoType = (ctor: Function, offset: number) => {
  let proto = Object.getPrototypeOf(ctor);
  //let last = ctor;
  while (proto.prototype?.constructor != undefined) { // TODO break early if already done this!
    let newOffset = --offset;
    let dependencies = getDependencies(proto, newOffset);
    if (dependencies) {
      for (const dependency of dependencies) {
        if (ctor.prototype instanceof dependency || dependency === ctor) {
          return;
        }
      }
    }
    else {
      dependencies = []
    }
    dependencies.push(ctor);
    setDependencies(proto, newOffset, dependencies)

    // last = proto;
    proto = Object.getPrototypeOf(proto);
  }
}

const setDependency = (ctor: Function, offset: number, dependency: Function) => {

  let dependencies = getDependencies(ctor, offset);
  if (!dependencies) {
    dependencies = [dependency];
    setDependencies(ctor, offset, dependencies);

  }
  else if (!dependencies.includes(dependency)) {
    dependencies.push(dependency)
    setDependencies(ctor, offset, dependencies);

  }

  /* const dependencySchemas = getOrCreateStructMeta(dependency, getOffset(dependency));
  let key = JSON.stringify(getVariantIndex(dependencySchemas[dependencySchemas.length - 1]));
  let classPathKey = "__" + getClassID(ctor) + "/" + getClassID(dependency);
  if (dependencies) {
    if (dependencies.has(classPathKey) && key != undefined) {
      dependencies.delete(classPathKey) // superseeded by a depency with an variant
    }
    if (key != undefined && dependencies.has(key)) {
      if (dependencies.get(key) == dependency) {
        // already added;
        return;
      }
      throw new BorshError(`Conflicting variants: Dependency ${dependencies.get(key).name} and ${dependency.name} share same variant index(es)`)
    }
  }
  else {
    dependencies = new Map()
  }
  if (key == undefined) { */
  /**
   * Class is not a variant but a "bridging class" i.e
   * class A {}
   * class B extends A { @field... }
   * 
   * @variant(0)
   * class C extends B {}
   * 
   * class B has no variant even though A is a dependency on it, so it gets the key "A/B" instead
   */
  /*    key = classPathKey;
   }
   dependencies.set(key, dependency);
   setDependencies(ctor, offset, dependencies); */
}
const getSuperMostClass = (clazz: Constructor<any>) => {
  while (Object.getPrototypeOf(clazz).prototype != undefined) {
    clazz = Object.getPrototypeOf(clazz);
  }
  return clazz;
}
/**
 * @param clazzA 
 * @param clazzB 
 * @returns true if A inherit B or B inherit A or A == B, else false
 */
const checkClazzesCompatible = (clazzA: Constructor<any> | AbstractType<any>, clazzB: Constructor<any> | AbstractType<any>) => {
  return clazzA == clazzB || clazzA.isPrototypeOf(clazzB) || clazzB.isPrototypeOf(clazzA)
}

/* const getFullPrototypeName = (clazz: Function) => {
  let str = clazz.name;
  while (Object.getPrototypeOf(clazz).prototype != undefined) {
    clazz = Object.getPrototypeOf(clazz);
    str += '/' + clazz.name
  }
  return str;
}

const getClassID = (ctor: Function) => {
  return getFullPrototypeName(ctor)
}

const getDependencyKey = (ctor: Function) => {

  return 456;// "_borsh_dependency_" + getClassID(ctor);
} */

const getDependencies = (ctor: Function, offset: number): Function[] | undefined => {
  return ctor.prototype[offset + 100]//[getDependencyKey(ctor)]

}

const setDependencies = (ctor: Function, offset: number, dependencies: Function[]) => {
  return ctor.prototype[offset + 100] = dependencies // [getDependencyKey(ctor)] 
}


const getAllDependencies = (ctor: Function, offset: number): Map<Function, { schema: StructKind, offset: number }> | undefined => {
  let existing = ctor.prototype[offset + 100] as Function[];
  if (existing) {
    let ret: Map<Function, { schema: StructKind, offset: number }> = new Map()
    for (const v of existing) {
      let schema = getSubMostSchemas(v);
      if (schema.fields.length > 0 || schema.variant != undefined) { // non trivial
        ret.set(v, { schema, offset: getOffset(v) });
      }
      else { // check recursively
        let req = getAllDependencies(v, offset);
        for (const [rv, rk] of req) {
          ret.set(rv, rk);
        }
      }
    }
    return ret;
  }
}



/**
 * Flat map class inheritance tree into hashmap where key represents variant key
 * @param ctor 
 * @param mem 
 * @returns a map of dependencies
 */
const getDependenciesRecursively = (ctor: Function, offset: number, mem: Function[] = []): Function[] => {
  let dep = getDependencies(ctor, offset);
  if (dep) {
    for (const f of dep) {
      if (mem.includes(f)) {
        continue;
      }
      mem.push(f);
      getDependenciesRecursively(f, offset, mem);
    }
  }
  return mem
}

/* 
export const setFlag = (ctor: Function) => {
  ctor.prototype.constructor["_borsh_schema_" + getClassID(ctor)] = true
}
 
export const getFlag = (ctor: Function): StructKind => {
  return ctor.prototype.constructor["_borsh_schema_" + getClassID(ctor)];
} */



const setSchema = (ctor: Function, schemas: StructKind, offset: number) => {
  //ctor.prototype.constructor["_borsh_schema_" + getClassID(ctor)] = schema
  ctor.prototype[987 + offset] = schemas;

}


export const getSchemas = (ctor: Function, offset: number): StructKind => {
  return ctor.prototype[987 + offset];
}

export const getSubMostSchemas = (ctor: Function): StructKind => {
  let last = undefined;
  for (var i = 0; i < 1000; i++) {
    const curr = ctor.prototype[987 + i];
    if (!curr && last && !getDependencies(ctor, i)?.length) {
      return last;
    }
    last = curr;
  }
  return;
}

export const getSchema = (ctor: Function, offset: number = getOffset(ctor)): StructKind => {
  const schemas = getSchemas(ctor, offset);
  return schemas;
}



export const getSchemasBottomUp = (ctor: Function): StructKind[] => {

  let last = undefined;
  let ret: StructKind[] = [];
  for (var i = 0; i < 1000; i++) {
    const curr = ctor.prototype[987 + i];
    if (!curr) {
      if (last && !getDependencies(ctor, i)?.length) {
        return ret;
      }
    }
    else {
      ret.push(curr);
      last = curr;
    }
  }
  return ret;
}

/* let schema = getSchema(ctor);
return [{ schema, clazz: ctor }] 
return getSchemas(ctor, offset);
 
}
 
/**
 *
 * @param kind 'struct' or 'variant. 'variant' equivalnt to Rust Enum
 * @returns Schema decorator function for classes
 */
export const variant = (index: number | number[] | string) => {
  return (ctor: Function) => {
    const offset = getOffset(ctor);
    setDependencyToProtoType(ctor, offset); // TODO
    let schemas = getOrCreateStructMeta(ctor, offset);

    // Create a custom serialization, for enum by prepend instruction index
    schemas.variant = index;

    // Define Schema for this class, even though it might miss fields since this is a variant
    /* const clazzes = extendingClasses(ctor);
    let prev = ctor;
    for (const [i, clazz] of clazzes.entries()) {
      setDependency(clazz, i, prev); // Super classes are marked so we know they have some importance/meaningfulness
      prev = clazz;
    } */


  };
};

export const getVariantIndex = (schema: StructKind): number | number[] | string | undefined => {
  return schema.variant /* getOrCreateStructMeta(clazz).variant */;
};

/**
 * @param properties, the properties of the field mapping to schema
 * @returns
 */
export function field(properties: SimpleField | CustomField<any>) {
  return (target: {} | any, name?: PropertyKey): any => {
    const offset = getOffset(target.constructor);
    setDependencyToProtoType(target.constructor, offset); // TODO
    const schemas = getOrCreateStructMeta(target.constructor, offset);
    const schema = schemas;
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
    let dependencies = getDependenciesRecursively(clazz, getOffset(clazz));
    dependencies.push(clazz);
    dependencies.forEach((v, k) => {
      const schema = getSchema(v);
      if (!schema) {
        return;
      }
      schemas.set(v, schema);
      visited.add(v.name);


    });

    let lastVariant: number | number[] | string = undefined;
    let lastKey: Function = undefined;
    getAllDependencies(clazz, getOffset(clazz))?.forEach((dependency, key) => {
      if (!lastVariant)
        lastVariant = getVariantIndex(dependency.schema);
      else if (!validateVariantAreCompatible(lastVariant, getVariantIndex(dependency.schema))) {
        throw new BorshError(`Class ${key.name} is extended by classes with variants of different types. Expecting only one of number, number[] or string`)
      }

      if (lastKey != undefined && lastVariant == undefined) {
        throw new BorshError(`Classes inherit ${clazz} and are introducing new field without introducing variants. This leads to unoptimized deserialization`)
      }
      lastKey = key;
    })

    schemas.forEach((structSchema, clazz) => {
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
          if (!getSchema(field.type) && !getAllDependencies(field.type, getOffset(clazz))?.size) {
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

export const getDiscriminator = (constructor: Constructor<any>): Uint8Array => {
  const schemas = getSchemasBottomUp(constructor);
  const writer = new BinaryWriter();
  for (let i = 0; i < schemas.length; i++) {
    const clazz = schemas[i];
    if (i !== schemas.length - 1 && clazz.fields.length > 0) {
      throw new BorshError("Discriminator can not be resolved for inheritance where super class contains fields, undefined behaviour")
    }
    const variant = clazz.variant;
    if (variant == undefined) {
      continue;
    }
    if (typeof variant === 'string') {
      writer.string(variant)
    }
    else if (typeof variant === 'number') {
      writer.u8(variant)
    }
    else if (Array.isArray(variant)) {
      variant.forEach((v) => {
        writer.u8(v)
      })
    }
    else {
      throw new BorshError("Can not resolve discriminator for variant with type: " + (typeof variant))
    }

  }

  return writer.finalize();
}

/* handle = (result, reader, options) => {
     prev(result, reader, options)
     for (const [actualClazz, dependency] of dependencies) {
       const variantIndex = getVariantIndex(dependency.schema);
       if (variantIndex !== undefined) {
         if (typeof variantIndex === "number") {

           if (!variantsIndex) {
             variantsIndex = [reader.u8()];
           }
           if (variantIndex == variantsIndex[0]) {
             next = actualClazz;
             nextOffset = dependency.offset
             break;
           }
         }
         else if (Array.isArray(variantIndex)) { // variant is array, check all values

           if (!variantsIndex) {
             variantsIndex = [];
             while (variantsIndex.length < variantIndex.length) {
               variantsIndex.push(reader.u8());
             }
           }

           // Compare variants
           if (
             variantsIndex.length === variantIndex.length &&
             (variantsIndex as number[]).every((value, index) => value === variantIndex[index])
           ) {
             next = actualClazz;
             nextOffset = dependency.offset
             break;
           }
         }

         else { // is string
           if (variantString == undefined) {
             variantString = reader.string();
           }
           // Compare variants is just string compare
           if (
             variantString === variantIndex
           ) {
             next = actualClazz;
             nextOffset = dependency.offset
             break;
           }
         }
       }
     } 
 }*/
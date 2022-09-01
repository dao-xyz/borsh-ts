import { BinaryReader, BinaryWriter } from "./binary";
import { BorshError } from "./error";

/**
 * Class with constructor
 */
export type Constructor<T> = new (...args: any[]) => T;


export const extendingClasses = (clazz: any): any[] => {
  let ret = [];
  if (clazz instanceof Function) {
    let baseClass = clazz;
    while (baseClass) {
      const newBaseClass = Object.getPrototypeOf(baseClass);
      if (newBaseClass && newBaseClass !== Object && newBaseClass.name) {
        ret.push(newBaseClass)
        baseClass = newBaseClass;
      } else {
        return ret;
      }
    }
  }
  return ret;
};

export interface OverrideType<T> {
  serialize: (arg: T, writer: BinaryWriter) => void;
  deserialize: (reader: BinaryReader) => T;
}
export type PrimitiveFieldType = "bool"
  | "u8"
  | "u16"
  | "u32"
  | "u64"
  | "u128"
  | "u256"
  | "u512"
  | "f32"
  | "f64"
  | "string"
export type FieldType =
  | PrimitiveFieldType
  | Constructor<any>
  | CustomField<any>
  | MapKind
  | WrappedType
export type SimpleField = { type: FieldType; index?: number };
export interface CustomField<T> extends OverrideType<T> {
  index?: number;
}

const dependenciesFromFieldType = (fieldType: FieldType): Constructor<any>[] | undefined => {
  if (typeof fieldType === "function") return [fieldType];
  if (fieldType instanceof WrappedType)
    return fieldType.getDependencies(); // Recursive
  if (fieldType instanceof MapKind) {
    return fieldType.getDependencies(); // Recursive
  }
  return undefined;
}

export class WrappedType {
  elementType: FieldType;
  constructor(elementType: FieldType) {
    this.elementType = elementType;
  }

  getDependencies(): Constructor<any>[] | undefined {
    return dependenciesFromFieldType(this.elementType);
  }
}

export class OptionKind extends WrappedType { }
export const option = (type: FieldType): OptionKind => {
  return new OptionKind(type);
};

export class VecKind extends WrappedType { }
export const vec = (type: FieldType): VecKind => {
  return new VecKind(type);
};

export class FixedArrayKind extends WrappedType {
  length: number;
  constructor(type: FieldType, length: number) {
    super(type);
    this.length = length;
  }
}
export const fixedArray = (type: FieldType, length: number): FixedArrayKind => {
  return new FixedArrayKind(type, length);
};

export class MapKind {
  key: PrimitiveFieldType
  value: FieldType
  constructor(key: PrimitiveFieldType, value: FieldType) {
    this.key = key;
    this.value = value;
  }

  getDependencies(): Constructor<any>[] | undefined {
    const keyDependencies = dependenciesFromFieldType(this.key); // Recursive
    const valueDependencies = dependenciesFromFieldType(this.value); // Recursive
    if (!keyDependencies && !valueDependencies) {
      return undefined;
    }
    if (keyDependencies && !valueDependencies) {
      return keyDependencies;
    }
    if (valueDependencies && !keyDependencies) {
      return valueDependencies;
    }
    return [...keyDependencies, ...valueDependencies]
  }
}
export const map = (key: PrimitiveFieldType, value: FieldType): MapKind => {
  return new MapKind(key, value);
};

export interface Field {
  key: string;
  type: FieldType;
}

export class StructKind {
  variant?: number | number[] | string
  fields: Field[];
  constructor(properties?: { variant?: number | number[] | string, fields: Field[] }) {
    if (properties) {
      this.fields = properties.fields;
      this.variant = properties.variant;
    } else {
      this.fields = [];
    }
  }
  getDependencies(): Constructor<any>[] {
    let ret: Constructor<any>[] = [];
    this.fields.forEach((field, ix) => {
      if (!field) {
        throw new BorshError("Field: " + ix + " is missing specification");
      }
      if (field.type instanceof WrappedType) {
        let dependencies = field.type.getDependencies();
        if (dependencies) {
          dependencies.forEach(dependency => {
            ret.push(dependency);

          });
        }
      } else if (typeof field.type === "function") {
        ret.push(field.type);
      }
    });
    return ret;
  }
}

export interface FieldMetaData {
  alias: string;
  type: string;
}

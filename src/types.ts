import { BinaryReader, BinaryWriter } from "./binary";

/**
 * Class with constructor
 */
export type Constructor<T> = new (...args: any[]) => T;

export const extendsClass = (clazz: any, otherClazz: any): boolean => {
    if (clazz instanceof Function) {
        let baseClass = clazz;
        while (baseClass) {
            const newBaseClass = Object.getPrototypeOf(baseClass);
            if (otherClazz == newBaseClass) {
                return true;
            }
            if (newBaseClass && newBaseClass !== Object && newBaseClass.name) {
                baseClass = newBaseClass;
            } else {
                return false;
            }
        }
    }
    return false;
}

export interface OverrideType<T> {
    serialize: (arg: T, writer: BinaryWriter) => void,
    deserialize: (reader: BinaryReader) => T
}


export type FieldType = 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256' | 'u512' | 'f32' | 'f64' | 'i8' | 'i16' | 'i32' | 'i64' | 'i128' | 'String' | Constructor<any> | WrappedType
export type Schema = Map<Function, StructKind>;
export type SimpleField = { type: FieldType, index?: number };
export interface CustomField<T> extends OverrideType<T> {
    index?: number,
}

export class WrappedType {

    elementType: FieldType
    constructor(elementType: FieldType) {
        this.elementType = elementType;
    }

    getDependency(): Constructor<any> | undefined {
        if (typeof this.elementType === 'function')
            return this.elementType;
        if (this.elementType instanceof WrappedType)
            return this.elementType.getDependency() // Recursive
        return undefined;
    }


}

export class OptionKind extends WrappedType { }
export const option = (type: FieldType): OptionKind => {
    return new OptionKind(type)
}

export class VecKind extends WrappedType { }
export const vec = (type: FieldType): VecKind => {
    return new VecKind(type)
}


export class FixedArrayKind extends WrappedType {
    length: number;
    constructor(type: FieldType, length: number) {
        super(type)
        this.length = length;
    }
}
export const fixedArray = (type: FieldType, length: number): FixedArrayKind => {
    return new FixedArrayKind(type, length)
}

export interface Field {
    key: string,
    type: FieldType | CustomField<any>
}

export class StructKind {
    fields: Field[]
    constructor(properties?: { fields: Field[] }) {
        if (properties) {
            this.fields = properties.fields;
        }
        else {
            this.fields = [];
        }
    }
    getDependencies(): Constructor<any>[] {
        let ret: Constructor<any>[] = []
        this.fields.forEach((field) => {
            if (field.type instanceof WrappedType) {
                let dependency = field.type.getDependency();
                if (dependency)
                    ret.push(dependency)
            }
            else if (typeof field.type === 'function') {
                ret.push(field.type)
            }
        })
        return ret;
    }
}

export interface FieldMetaData {
    alias: string,
    type: string
}
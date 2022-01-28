


import "reflect-metadata";
import { OverrideType, serializeField } from ".";
import { BinaryWriter } from "./binary";
import { BorshError } from "./error";
import { Constructor } from "./utils";
const STRUCT_META_DATA_SYMBOL = '__borsh_struct_metadata__';

const structMetaDataKey = (constructorName: string) => {
    return STRUCT_META_DATA_SYMBOL + constructorName;
}

export type FieldType = 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256' | 'u512' | 'f32' | 'f64' | 'String' | Constructor<any> | WrappedType
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

/**
 * 
 * @param kind 'struct' or 'variant. 'variant' equivalnt to Rust Enum
 * @returns Schema decorator function for classes
 */
export const variant = (index: number) => {
    return (ctor: Function) => {
        // Create a custom serialization, for enum by prepend instruction index
        ctor.prototype.borshSerialize = function (schema: Schema, writer: BinaryWriter) {
            writer.writeU8(index);

            // Serialize content as struct, we do not invoke serializeStruct since it will cause circular calls to this method
            const structSchema: StructKind = schema.get(ctor)
            for (const field of structSchema.fields) {
                serializeField(schema, field.key, this[field.key], field.type, writer);
            }
        }
        ctor.prototype._borsh_variant_index = function () {
            return index; // creates a function that returns the variant index on the class
        }
    }
}

export const getVariantIndex = (clazz: any): number | undefined => {
    if (clazz.prototype._borsh_variant_index)
        return clazz.prototype._borsh_variant_index()
    return undefined
}


/**
 * @param properties, the properties of the field mapping to schema
 * @returns 
 */
export function field(properties: SimpleField | CustomField<any>) {
    return (target: {} | any, name?: PropertyKey): any => {
        const metaDataKey = structMetaDataKey(target.constructor.name);
        let schema: StructKind = Reflect.getMetadata(metaDataKey, target.constructor); // Assume StructKind already exist
        const key = name.toString();
        if (!schema) {
            schema = new StructKind()
        }
        let field: Field = undefined;
        if (properties["type"] != undefined) {
            field = {
                key,
                type: properties["type"]
            }
        }
        else {
            field = {
                key,
                type: properties as CustomField<any>,
            }
        }

        if (properties.index === undefined) {
            schema.fields.push(field) // add to the end. This will make property decorator execution order define field order

        }
        else {

            if (schema.fields[properties.index]) {
                throw new BorshError("Multiple fields defined at the same index: " + properties.index + ", class: " + target.constructor.name)
            }
            if (properties.index >= schema.fields.length) {
                resize(schema.fields, properties.index + 1, undefined)

            }
            schema.fields[properties.index] = field
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
    let ret = new Map<any, StructKind>()
    let dependencies = new Set()
    clazzes.forEach((clazz) => {
        let schema = (Reflect.getMetadata(structMetaDataKey(clazz.name), clazz) as StructKind)
        if (schema) {
            if (validate) {
                validateSchema(schema, clazz)
            }
            ret.set(clazz, schema);
            schema.getDependencies().forEach((depenency) => {
                dependencies.add(depenency);
            })
        }
    })

    // Generate schemas for nested types
    dependencies.forEach((dependency) => {
        if (!ret.has(dependency)) {
            const dependencySchema = generateSchemas([dependency], validate)
            dependencySchema.forEach((value, key) => {
                ret.set(key, value)
            })
        }
    })
    return new Map(ret);
}


const validateSchema = (structSchema: StructKind, clazz: any) => {
    if (!structSchema.fields) {
        throw new BorshError("Missing fields for class: " + clazz.name);
    }
    structSchema.fields.forEach((field) => {
        if (!field) {
            throw new BorshError("Field is missing definition, most likely due to field indexing with missing indices")
        }
    })
}



const resize = (arr: Array<any>, newSize: number, defaultValue: any) => {
    while (newSize > arr.length)
        arr.push(defaultValue);
    arr.length = newSize;
}

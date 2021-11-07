


import "reflect-metadata";
import { serializeField } from ".";
import { BinaryWriter } from "./binary";
import { BorshError } from "./error";
export type Schema = Map<Function, any>;

const STRUCT_META_DATA_SYMBOL = '__borsh_struct_metadata__';
const structMetaDataKey = (constructorName: string) => {
    return STRUCT_META_DATA_SYMBOL + constructorName;
}

export interface StructKind {
    kind: 'struct',
    fields: any[][],
}


export interface OptionKind {
    kind: 'option',
    type: any
}

interface StructKindDependent extends StructKind {
    dependencies: Set<StructKindDependent>
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
export const Variant = (index: number) => {
    return (ctor: Function) => {
        // Create a custom serialization, for enum by prepend instruction index
        ctor.prototype.borshSerialize = function (schema: Schema, writer: BinaryWriter) {
            writer.writeU8(index);

            // Serialize content as struct, we do not invoke serializeStruct since it will cause circular calls to this method
            const structSchema: StructKind = schema.get(ctor)
            for (const [fieldName, fieldType] of structSchema.fields) {
                serializeField(schema, fieldName, this[fieldName], fieldType, writer);
            }
        }
    }
}

export const getSuperClasses = (targetClass) => {

    const ret = [];
    if (targetClass instanceof Function) {
        let baseClass = targetClass;
        while (baseClass) {
            const newBaseClass = Object.getPrototypeOf(baseClass);

            if (newBaseClass && newBaseClass !== Object && newBaseClass.name) {
                baseClass = newBaseClass;
                ret.push(newBaseClass.name);
            } else {
                break;
            }
        }
    }
    return ret;
}


export function Field(fieldInfoPartial: { type: any, option?: boolean, index?: number }) {
    return (target: {} | any, name?: PropertyKey): any => {
        const metaDataKey = structMetaDataKey(target.constructor.name);
        let schema: StructKindDependent = Reflect.getMetadata(metaDataKey, target.constructor); // Assume StructKind already exist
        const key = name.toString();
        if (!schema) {
            schema = {
                fields: [],
                kind: 'struct',
                dependencies: new Set()
            }
        }

        if (typeof fieldInfoPartial.type === 'function') // struct
        {
            schema.dependencies.add(fieldInfoPartial.type)
        }

        let fieldInfo = undefined;
        if (fieldInfoPartial.option) {
            fieldInfo = [key, {
                kind: 'option',
                type: fieldInfoPartial.type
            } as OptionKind] // Convert to array type
        }
        else {
            fieldInfo = [key, fieldInfoPartial.type]
        }

        if (fieldInfoPartial.index === undefined) {
            schema.fields.push(fieldInfo) // add to the end. This will make property decorator execution order define field order

        }
        else {

            if (schema.fields[fieldInfoPartial.index]) {
                throw new BorshError("Multiple fields defined at the same index: " + fieldInfoPartial.index + ", class: " + target.constructor.name)
            }
            if (fieldInfoPartial.index >= schema.fields.length) {
                resize(schema.fields, fieldInfoPartial.index + 1, undefined)

            }
            schema.fields[fieldInfoPartial.index] = fieldInfo
        }

        Reflect.defineMetadata(metaDataKey, schema, target.constructor);


    };
}
/*
const getMergedKindFields = (object:any):Schema =>
{
    const allFields = [];
    getSuperClasses(object.constructor).forEach((clazz)=>
    {
        const fields = (Reflect.getMetadata(fieldMetaDataKey(clazz), object) as KindFields)?.fields;
        if(fields)
            allFields.push(...fields);
    });
    const subClassSchema = (Reflect.getMetadata(fieldMetaDataKey(object.constructor.name), object) as KindFields);
    const ret:KindFields  = {
        fields: [...subClassSchema.fields, ...allFields],
        name: subClassSchema.name,
        id: subClassSchema.id
    }
    return ret;
    
}*/
/*
const validateSchema = (schema:Schema) => 
{
    const fieldKeys = new Set<string>();
    schema.fields.forEach((field) => {
        if(fieldKeys.has(field.key))
        {
            throw new Error('Duplicate field: ' + field.key);
        }
        fieldKeys.add(field.key);
    });
    
}*/

/**
 * @param object 
 */
export const generateSchema = (clazzes: any[], validate?: boolean): Map<any, StructKind> => {
    let ret = new Map<any, StructKind>()
    let dependencies = new Set()
    clazzes.forEach((clazz) => {
        let schema = (Reflect.getMetadata(structMetaDataKey(clazz.name), clazz) as StructKindDependent)
        if (schema) {
            if (validate) {
                validateSchema(schema)
            }

            ret.set(clazz, {
                fields: schema.fields,
                kind: schema.kind
            });

            schema.dependencies.forEach((dependency) => {
                dependencies.add(dependency)
            })
        }
    })

    // Generate schemas for nested types
    dependencies.forEach((dependency) => {
        if (!ret.has(dependency)) {
            const dependencySchema = generateSchema([dependency], validate)
            dependencySchema.forEach((value, key) => {
                ret.set(key, value)
            })
        }
    })
    return new Map(ret);
}

const validateSchema = (structSchema: StructKindDependent) => {
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
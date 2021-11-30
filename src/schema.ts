


import "reflect-metadata";
import { OverrideType, serializeField } from ".";
import { BinaryWriter } from "./binary";
import { BorshError } from "./error";
import { Constructor } from "./utils";
export type Schema = Map<Function, any>;
const STRUCT_META_DATA_SYMBOL = '__borsh_struct_metadata__';

const structMetaDataKey = (constructorName: string) => {
    return STRUCT_META_DATA_SYMBOL + constructorName;
}



export type SimpleField = { type: FieldType, option?: boolean, index?: number };
export interface CustomField<T> extends OverrideType<T> {
    index?: number,
}

export type FieldType = 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256' | 'u512' | 'f32' | 'f64' | 'String' | Constructor<any>

export interface StructKind {
    kind: 'struct',
    fields: any[][],
}


export interface OptionKind {
    kind: 'option',
    type: any
}

interface StructKindDependent extends StructKind {
    dependencies: Set<Constructor<any>>
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
            for (const value of structSchema.fields) {
                const [fieldName, fieldType] = value;
                serializeField(schema, fieldName, this[fieldName], fieldType, writer);
            }
        }
        ctor.prototype._borsh_variant_index = function()  {
            return index; // creates a function that returns the variant index on the class
        }
    }
}

export const getVariantIndex = (clazz:any):number | undefined=> 
{
    if (clazz.prototype._borsh_variant_index)
        return clazz.prototype._borsh_variant_index()
    return undefined
}


/**
 * @param properties, the properties of the field mapping to schema
 * @returns 
 */
export function field(properties: SimpleField | CustomField<any> ) {
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
        let fieldInfoToSave = [key, properties];
        if (properties["type"] != undefined)
        {
            const simpleField = properties as SimpleField
            if (typeof simpleField.type === 'function') // struct
            {
                schema.dependencies.add(simpleField.type)
            }

            let fieldInfo = undefined;
            if (simpleField.option) {
                fieldInfo = [key, {
                    kind: 'option',
                    type: simpleField.type
                } as OptionKind] // Convert to array type
            }
            else {
                fieldInfo = [key, simpleField.type]
            }
            fieldInfoToSave = fieldInfo;
            

        }

        if (properties.index === undefined) {
            schema.fields.push(fieldInfoToSave) // add to the end. This will make property decorator execution order define field order

        }
        else {

            if (schema.fields[properties.index]) {
                throw new BorshError("Multiple fields defined at the same index: " + properties.index + ", class: " + target.constructor.name)
            }
            if (properties.index >= schema.fields.length) {
                resize(schema.fields, properties.index + 1, undefined)

            }
            schema.fields[properties.index] = fieldInfoToSave
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
        let schema = (Reflect.getMetadata(structMetaDataKey(clazz.name), clazz) as StructKindDependent)
        if (schema) {
            if (validate) {
                validateSchema(schema,clazz)
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
            const dependencySchema = generateSchemas([dependency], validate)
            dependencySchema.forEach((value, key) => {
                ret.set(key, value)
            })
        }
    })
    return new Map(ret);
}


const validateSchema = (structSchema: StructKindDependent,clazz:any) => {
    if (!structSchema.fields)
    {
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

import "reflect-metadata";
import { OverrideType } from ".";
import { Constructor } from "./utils";
export declare type Schema = Map<Function, any>;
export declare type SimpleField = {
    type: FieldType;
    option?: boolean;
    index?: number;
};
export interface CustomField<T> extends OverrideType<T> {
    index?: number;
}
export declare type FieldType = 'u8' | 'u16' | 'u32' | 'u64' | 'u128' | 'u256' | 'u512' | 'f32' | 'f64' | 'String' | Constructor<any>;
export interface StructKind {
    kind: 'struct';
    fields: any[][];
}
export interface OptionKind {
    kind: 'option';
    type: any;
}
export interface FieldMetaData {
    alias: string;
    type: string;
}
/**
 *
 * @param kind 'struct' or 'variant. 'variant' equivalnt to Rust Enum
 * @returns Schema decorator function for classes
 */
export declare const variant: (index: number) => (ctor: Function) => void;
export declare const getVariantIndex: (clazz: any) => number | undefined;
/**
 * @param properties, the properties of the field mapping to schema
 * @returns
 */
export declare function field(properties: SimpleField | CustomField<any>): (target: {} | any, name?: PropertyKey) => any;
/**
 * @param clazzes
 * @param validate, run validation?
 * @returns Schema map
 */
export declare const generateSchemas: (clazzes: any[], validate?: boolean) => Map<any, StructKind>;

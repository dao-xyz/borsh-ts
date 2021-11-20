import "reflect-metadata";
export declare type Schema = Map<Function, any>;
declare type Constructor<T> = new (...args: any[]) => T;
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
/**
 * @param properties, the properties of the field mapping to schema
 * @returns
 */
export declare function field(properties: {
    type: FieldType;
    option?: boolean;
    index?: number;
}): (target: {} | any, name?: PropertyKey) => any;
/**
 * @param clazzes
 * @param validate, run validation?
 * @returns Schema map
 */
export declare const generateSchemas: (clazzes: any[], validate?: boolean) => Map<any, StructKind>;
export {};

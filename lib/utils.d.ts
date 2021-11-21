/**
 * Class with constructor
 */
export declare type Constructor<T> = new (...args: any[]) => T;
export declare const getSuperClasses: (targetClass: Constructor<any>) => any[];
export declare const extendsClass: (clazz: any, otherClazz: any) => boolean;
export declare const getSubClasses: (targetClass: Constructor<any>, superClassToSubClass: Map<Constructor<any>, Set<Constructor<any>>>) => Set<Constructor<any>>;

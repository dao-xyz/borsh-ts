"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSubClasses = exports.extendsClass = exports.getSuperClasses = void 0;
exports.getSuperClasses = (targetClass) => {
    const ret = [];
    if (targetClass instanceof Function) {
        let baseClass = targetClass;
        while (baseClass) {
            const newBaseClass = Object.getPrototypeOf(baseClass);
            if (newBaseClass && newBaseClass !== Object && newBaseClass.name) {
                baseClass = newBaseClass;
                ret.push(newBaseClass.name);
            }
            else {
                break;
            }
        }
    }
    return ret;
};
exports.extendsClass = (clazz, otherClazz) => {
    if (clazz instanceof Function) {
        let baseClass = clazz;
        while (baseClass) {
            const newBaseClass = Object.getPrototypeOf(baseClass);
            if (otherClazz == newBaseClass) {
                return true;
            }
            if (newBaseClass && newBaseClass !== Object && newBaseClass.name) {
                baseClass = newBaseClass;
            }
            else {
                return false;
            }
        }
    }
    return false;
};
exports.getSubClasses = (targetClass, superClassToSubClass) => {
    return superClassToSubClass.get(targetClass);
};

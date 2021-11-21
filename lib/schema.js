"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSchemas = exports.field = exports.getVariantIndex = exports.variant = void 0;
require("reflect-metadata");
const _1 = require(".");
const error_1 = require("./error");
const utils_1 = require("./utils");
const STRUCT_META_DATA_SYMBOL = '__borsh_struct_metadata__';
const _SUPERCLASS_TO_SUBCLASS = new Map();
const structMetaDataKey = (constructorName) => {
    return STRUCT_META_DATA_SYMBOL + constructorName;
};
/**
 *
 * @param kind 'struct' or 'variant. 'variant' equivalnt to Rust Enum
 * @returns Schema decorator function for classes
 */
exports.variant = (index) => {
    return (ctor) => {
        // Create a custom serialization, for enum by prepend instruction index
        ctor.prototype.borshSerialize = function (schema, writer) {
            writer.writeU8(index);
            // Serialize content as struct, we do not invoke serializeStruct since it will cause circular calls to this method
            const structSchema = schema.get(ctor);
            for (const value of structSchema.fields) {
                const [fieldName, fieldType] = value;
                _1.serializeField(schema, fieldName, this[fieldName], fieldType, writer);
            }
        };
        ctor.prototype._borsh_variant_index = function () {
            return index; // creates a function that returns the variant index on the class
        };
    };
};
exports.getVariantIndex = (clazz) => {
    if (clazz.prototype._borsh_variant_index)
        return clazz.prototype._borsh_variant_index();
    return undefined;
};
/**
 * Build class inheritance map so we can do Polymorhpic deserialization (later)
 * @param clazz
 */
const _buildClassMap = (subClass) => {
    const superClasses = utils_1.getSuperClasses(subClass);
    for (const superClass of superClasses) {
        if (!_SUPERCLASS_TO_SUBCLASS.has(superClass)) {
            _SUPERCLASS_TO_SUBCLASS.set(superClass, new Set());
        }
        if (_SUPERCLASS_TO_SUBCLASS.get(superClass).has(subClass)) {
            return; // we have been here before!
        }
    }
};
/**
 * @param properties, the properties of the field mapping to schema
 * @returns
 */
function field(properties) {
    return (target, name) => {
        const metaDataKey = structMetaDataKey(target.constructor.name);
        _buildClassMap(target.constructor);
        let schema = Reflect.getMetadata(metaDataKey, target.constructor); // Assume StructKind already exist
        const key = name.toString();
        if (!schema) {
            schema = {
                fields: [],
                kind: 'struct',
                dependencies: new Set()
            };
        }
        let fieldInfoToSave = [key, properties];
        if (properties["type"] != undefined) {
            const simpleField = properties;
            if (typeof simpleField.type === 'function') // struct
             {
                schema.dependencies.add(simpleField.type);
            }
            let fieldInfo = undefined;
            if (simpleField.option) {
                fieldInfo = [key, {
                        kind: 'option',
                        type: simpleField.type
                    }]; // Convert to array type
            }
            else {
                fieldInfo = [key, simpleField.type];
            }
            fieldInfoToSave = fieldInfo;
        }
        if (properties.index === undefined) {
            schema.fields.push(fieldInfoToSave); // add to the end. This will make property decorator execution order define field order
        }
        else {
            if (schema.fields[properties.index]) {
                throw new error_1.BorshError("Multiple fields defined at the same index: " + properties.index + ", class: " + target.constructor.name);
            }
            if (properties.index >= schema.fields.length) {
                resize(schema.fields, properties.index + 1, undefined);
            }
            schema.fields[properties.index] = fieldInfoToSave;
        }
        Reflect.defineMetadata(metaDataKey, schema, target.constructor);
    };
}
exports.field = field;
/**
 * @param clazzes
 * @param validate, run validation?
 * @returns Schema map
 */
exports.generateSchemas = (clazzes, validate) => {
    let ret = new Map();
    let dependencies = new Set();
    clazzes.forEach((clazz) => {
        let schema = Reflect.getMetadata(structMetaDataKey(clazz.name), clazz);
        if (schema) {
            if (validate) {
                validateSchema(schema);
            }
            ret.set(clazz, {
                fields: schema.fields,
                kind: schema.kind
            });
            schema.dependencies.forEach((dependency) => {
                dependencies.add(dependency);
            });
        }
    });
    // Generate schemas for nested types
    dependencies.forEach((dependency) => {
        if (!ret.has(dependency)) {
            const dependencySchema = exports.generateSchemas([dependency], validate);
            dependencySchema.forEach((value, key) => {
                ret.set(key, value);
            });
        }
    });
    return new Map(ret);
};
const validateSchema = (structSchema) => {
    structSchema.fields.forEach((field) => {
        if (!field) {
            throw new error_1.BorshError("Field is missing definition, most likely due to field indexing with missing indices");
        }
    });
};
const resize = (arr, newSize, defaultValue) => {
    while (newSize > arr.length)
        arr.push(defaultValue);
    arr.length = newSize;
};

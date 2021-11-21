"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const binary_1 = require("../binary");
const error_1 = require("../error");
const index_1 = require("../index");
const schema_1 = require("../schema");
describe("struct", () => {
    test("any field by string", () => {
        class TestStruct {
        }
        __decorate([
            schema_1.field({ type: "u8" })
        ], TestStruct.prototype, "a", void 0);
        __decorate([
            schema_1.field({ type: "u16" })
        ], TestStruct.prototype, "b", void 0);
        const generatedSchemas = schema_1.generateSchemas([TestStruct]).get(TestStruct);
        const expectedResult = {
            kind: "struct",
            fields: [
                ["a", "u8"],
                ["b", "u16"],
            ],
        };
        expect(generatedSchemas).toEqual(expectedResult);
    });
    test("struct fields", () => {
        class InnerStruct {
        }
        __decorate([
            schema_1.field({ type: "u8" })
        ], InnerStruct.prototype, "b", void 0);
        class TestStruct {
        }
        __decorate([
            schema_1.field({ type: InnerStruct })
        ], TestStruct.prototype, "a", void 0);
        const generatedSchemas = schema_1.generateSchemas([TestStruct]);
        expect(generatedSchemas.get(TestStruct)).toEqual({
            kind: "struct",
            fields: [["a", InnerStruct]],
        });
        expect(generatedSchemas.get(InnerStruct)).toEqual({
            kind: "struct",
            fields: [["b", "u8"]],
        });
    });
});
describe("enum", () => {
    test("enum base", () => {
        let TestEnum = class TestEnum {
            constructor(a) {
                this.a = a;
            }
        };
        __decorate([
            schema_1.field({ type: "u8" })
        ], TestEnum.prototype, "a", void 0);
        TestEnum = __decorate([
            schema_1.variant(1)
        ], TestEnum);
        const instance = new TestEnum(3);
        const generatedSchemas = schema_1.generateSchemas([TestEnum]);
        const buf = index_1.serialize(generatedSchemas, instance);
        expect(buf).toEqual(Buffer.from([1, 3]));
    });
    test("enum field serialization/deserialization", () => {
        class Super {
        }
        let Enum0 = class Enum0 extends Super {
            constructor(a) {
                super();
                this.a = a;
            }
        };
        __decorate([
            schema_1.field({ type: "u8" })
        ], Enum0.prototype, "a", void 0);
        Enum0 = __decorate([
            schema_1.variant(0)
        ], Enum0);
        let Enum1 = class Enum1 extends Super {
            constructor(b) {
                super();
                this.b = b;
            }
        };
        __decorate([
            schema_1.field({ type: "u8" })
        ], Enum1.prototype, "b", void 0);
        Enum1 = __decorate([
            schema_1.variant(1)
        ], Enum1);
        class TestStruct {
            constructor(value) {
                this.enum = value;
            }
        }
        __decorate([
            schema_1.field({ type: Super })
        ], TestStruct.prototype, "enum", void 0);
        const instance = new TestStruct(new Enum1(4));
        const schemas = schema_1.generateSchemas([Enum0, Enum1, TestStruct]);
        expect(schemas.get(Enum0)).toBeDefined();
        expect(schemas.get(Enum1)).toBeDefined();
        expect(schemas.get(TestStruct)).toBeDefined();
        const serialized = index_1.serialize(schemas, instance);
        expect(serialized).toEqual(Buffer.from([1, 4]));
        const deserialied = index_1.deserialize(schemas, TestStruct, Buffer.from(serialized), binary_1.BinaryReader);
        expect(deserialied.enum).toBeInstanceOf(Enum1);
        expect(deserialied.enum.b).toEqual(4);
    });
});
describe("option", () => {
    test("field option", () => {
        class TestStruct {
        }
        __decorate([
            schema_1.field({ type: "u8", option: true })
        ], TestStruct.prototype, "a", void 0);
        const schema = schema_1.generateSchemas([TestStruct]).get(TestStruct);
        expect(schema).toEqual({
            fields: [
                [
                    "a",
                    {
                        kind: "option",
                        type: "u8",
                    },
                ],
            ],
            kind: "struct",
        });
    });
});
describe("override", () => {
    test("serialize/deserialize", () => {
        class TestStruct {
            constructor(obj) {
                this.obj = obj;
            }
        }
        __decorate([
            schema_1.field({
                serialize: (value, writer) => {
                    writer.writeU16(value.a + value.b);
                },
                deserialize: (reader) => {
                    let value = reader.readU16();
                    return {
                        a: value,
                        b: value * 2,
                    };
                },
            })
        ], TestStruct.prototype, "obj", void 0);
        const schemas = schema_1.generateSchemas([TestStruct]);
        const serialized = index_1.serialize(schemas, new TestStruct({ a: 2, b: 3 }));
        const deserialied = index_1.deserialize(schemas, TestStruct, Buffer.from(serialized), binary_1.BinaryReader);
        expect(deserialied.obj).toBeDefined();
        expect(deserialied.obj.a).toEqual(5);
        expect(deserialied.obj.b).toEqual(10);
    });
});
describe("order", () => {
    test("explicit serialization/deserialization", () => {
        class TestStruct {
            constructor(a, b) {
                this.a = a;
                this.b = b;
            }
        }
        __decorate([
            schema_1.field({ type: "u8", index: 1 })
        ], TestStruct.prototype, "a", void 0);
        __decorate([
            schema_1.field({ type: "u8", index: 0 })
        ], TestStruct.prototype, "b", void 0);
        const schemas = schema_1.generateSchemas([TestStruct]);
        const schema = schemas.get(TestStruct);
        expect(schema).toEqual({
            fields: [
                ["b", "u8"],
                ["a", "u8"],
            ],
            kind: "struct",
        });
        const serialized = index_1.serialize(schemas, new TestStruct(2, 3));
        const deserialied = index_1.deserialize(schemas, TestStruct, Buffer.from(serialized), binary_1.BinaryReader);
        expect(deserialied).toBeDefined();
        expect(deserialied.a).toEqual(2);
        expect(deserialied.b).toEqual(3);
    });
    test("explicit non zero offset", () => {
        class TestStruct {
        }
        __decorate([
            schema_1.field({ type: "u8", index: 1 })
        ], TestStruct.prototype, "a", void 0);
        const thrower = () => {
            schema_1.generateSchemas([TestStruct], true);
        };
        // Error is thrown since 1 field with index 1 is undefined behaviour
        // Expect first index to be 0
        expect(thrower).toThrow(error_1.BorshError);
    });
    test("explicit gaps", () => {
        class TestStruct {
        }
        __decorate([
            schema_1.field({ type: "u8", index: 0 })
        ], TestStruct.prototype, "a", void 0);
        __decorate([
            schema_1.field({ type: "u8", index: 2 })
        ], TestStruct.prototype, "b", void 0);
        const thrower = () => {
            schema_1.generateSchemas([TestStruct], true);
        };
        // Error is thrown since missing field with index 1
        // Expected no gaps
        expect(thrower).toThrow(error_1.BorshError);
    });
    test("implicit", () => {
        class TestStruct {
        }
        __decorate([
            schema_1.field({ type: "u8" })
        ], TestStruct.prototype, "a", void 0);
        __decorate([
            schema_1.field({ type: "u8" })
        ], TestStruct.prototype, "b", void 0);
        const schema = schema_1.generateSchemas([TestStruct]).get(TestStruct);
        expect(schema).toEqual({
            fields: [
                ["a", "u8"],
                ["b", "u8"],
            ],
            kind: "struct",
        });
    });
});

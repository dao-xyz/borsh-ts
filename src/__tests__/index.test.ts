import BN from "bn.js";
import { BinaryReader } from "../binary";
import { BorshError } from "../error";
import {
  deserialize,
  serialize,
  validate,
  field,
  variant,
  getSchema,
} from "../index";
import { StructKind, vec, option, fixedArray } from "../types";

describe("struct", () => {
  test("multifield", () => {
    class TestStruct {
      @field({ type: "u8" })
      public a: number;

      @field({ type: "u64" })
      public b: BN;

      constructor(properties?: { a: number; b: BN }) {
        if (properties) {
          this.a = properties.a;
          this.b = properties.b;
        }
      }
    }
    validate([TestStruct]);
    const expectedResult: StructKind = new StructKind({
      fields: [
        {
          key: "a",
          type: "u8",
        },
        {
          key: "b",
          type: "u64",
        },
      ],
    });
    expect(getSchema(TestStruct)).toEqual(expectedResult);
    const bn123 = new BN(123);
    const instance = new TestStruct({ a: 1, b: bn123 });
    const buf = serialize(instance);
    expect(buf).toEqual(Buffer.from([1, 123, 0, 0, 0, 0, 0, 0, 0]));
    const deserialized = deserialize(Buffer.from(buf), TestStruct);
    expect(deserialized.a).toEqual(1);
    expect(deserialized.b.toNumber()).toEqual(123);
    const bufAgain = serialize(deserialized);
    expect(bufAgain).toEqual(Buffer.from([1, 123, 0, 0, 0, 0, 0, 0, 0]));
  });

  test("struct fields", () => {
    class InnerStruct {
      @field({ type: "u8" })
      public b: number;
    }

    class TestStruct {
      @field({ type: InnerStruct })
      public a: InnerStruct;
    }

    validate([TestStruct]);
    expect(getSchema(TestStruct)).toEqual(
      new StructKind({
        fields: [{ key: "a", type: InnerStruct }],
      })
    );

    expect(getSchema(InnerStruct)).toEqual(
      new StructKind({
        fields: [{ key: "b", type: "u8" }],
      })
    );
  });

  test("gaps", () => {
    class TestStruct {
      @field({ type: "u8" })
      public a: number;

      public b: number;

      @field({ type: "u8" })
      public c: number;
    }

    let schema = validate([TestStruct]).get(TestStruct);
    expect(schema.fields.length).toEqual(2);
    expect(schema.fields[0].key).toEqual("a");
    expect(schema.fields[1].key).toEqual("c");
  });
});

describe("bool", () => {
  test("serialize/deserialize", () => {
    class TestStruct {
      @field({ type: "bool" })
      public a: boolean;

      @field({ type: "bool" })
      public b: boolean;

      constructor(properties?: { a: boolean; b: boolean }) {
        if (properties) {
          this.a = properties.a;
          this.b = properties.b;
        }
      }
    }
    validate([TestStruct]);
    const expectedResult: StructKind = new StructKind({
      fields: [
        {
          key: "a",
          type: "bool",
        },
        {
          key: "b",
          type: "bool",
        },
      ],
    });

    expect(getSchema(TestStruct)).toEqual(expectedResult);
    const instance = new TestStruct({ a: true, b: false });
    const buf = serialize(instance);
    expect(buf).toEqual(Buffer.from([1, 0]));
    const deserialized = deserialize(Buffer.from(buf), TestStruct);
    expect(deserialized.a).toEqual(true);
    expect(deserialized.b).toEqual(false);
    const bufAgain = serialize(deserialized);
    expect(bufAgain).toEqual(Buffer.from([1, 0]));
  });
});

describe("arrays", () => {
  test("vec simple", () => {
    class TestStruct {
      @field({ type: vec("u8") })
      public a: number[];

      constructor(properties?: { a: number[] }) {
        if (properties) {
          this.a = properties.a;
        }
      }
    }

    validate([TestStruct]);
    const buf = serialize(new TestStruct({ a: [1, 2, 3] }));
    expect(buf).toEqual(Buffer.from([3, 0, 0, 0, 1, 2, 3]));
    const deserialized = deserialize(Buffer.from(buf), TestStruct);
    expect(deserialized.a).toEqual([1, 2, 3]);
  });

  test("fixed array simple", () => {
    class TestStruct {
      @field({ type: fixedArray("u8", 3) })
      public a: number[];

      constructor(properties?: { a: number[] }) {
        if (properties) {
          this.a = properties.a;
        }
      }
    }

    validate([TestStruct]);
    const buf = serialize(new TestStruct({ a: [1, 2, 3] }));
    expect(buf).toEqual(Buffer.from([1, 2, 3]));
    const deserialized = deserialize(Buffer.from(buf), TestStruct);
    expect(deserialized.a).toEqual([1, 2, 3]);
  });

  test("fixed array wrong length serialize", () => {
    class TestStruct {
      @field({ type: fixedArray("u8", 3) })
      public a: number[];

      constructor(properties?: { a: number[] }) {
        if (properties) {
          this.a = properties.a;
        }
      }
    }

    validate([TestStruct]);
    expect(() => serialize(new TestStruct({ a: [1, 2] }))).toThrowError();
  });

  test("fixed array wrong length deserialize", () => {
    class TestStruct {
      @field({ type: fixedArray("u8", 3) })
      public a: number[];

      constructor(properties?: { a: number[] }) {
        if (properties) {
          this.a = properties.a;
        }
      }
    }
    validate([TestStruct]);
    expect(() => deserialize(Buffer.from([1, 2]), TestStruct)).toThrowError();
  });

  test("vec struct", () => {
    class Element {
      @field({ type: "u8" })
      public a: number;

      constructor(properties?: { a: number }) {
        if (properties) {
          this.a = properties.a;
        }
      }
    }

    class TestStruct {
      @field({ type: vec(Element) })
      public a: Element[];

      constructor(properties?: { a: Element[] }) {
        if (properties) {
          this.a = properties.a;
        }
      }
    }

    validate([TestStruct]);
    const arr = [
      new Element({ a: 1 }),
      new Element({ a: 2 }),
      new Element({ a: 3 }),
    ];
    const buf = serialize(new TestStruct({ a: arr }));
    expect(buf).toEqual(Buffer.from([3, 0, 0, 0, 1, 2, 3]));
    const deserialized = deserialize(Buffer.from(buf), TestStruct);
    expect(deserialized.a).toEqual(arr);
  });
});

describe("enum", () => {
  test("enum base", () => {
    @variant(1)
    class TestEnum {
      @field({ type: "u8" })
      public a: number;

      constructor(a: number) {
        this.a = a;
      }
    }
    const instance = new TestEnum(3);
    validate([TestEnum]);
    const buf = serialize(instance);
    expect(buf).toEqual(Buffer.from([1, 3]));
    const deserialized = deserialize(Buffer.from(buf), TestEnum);
    expect(deserialized.a).toEqual(3);
  });

  test("empty", () => {
    @variant(1)
    class TestEnum { }
    const instance = new TestEnum();
    validate([TestEnum]);
    const buf = serialize(instance);
    expect(buf).toEqual(Buffer.from([1]));
  });

  test("variant dependency is treaded as struct", () => {
    @variant(0)
    class ImplementationByVariant {
      public someField: number;
      constructor(someField?: number) {
        this.someField = someField;
      }
    }

    class TestStruct {
      @field({ type: ImplementationByVariant })
      public variant: ImplementationByVariant;

      constructor(variant?: ImplementationByVariant) {
        this.variant = variant;
      }
    }
    validate([TestStruct]);
    expect(getSchema(TestStruct)).toBeDefined();
    expect(getSchema(ImplementationByVariant)).toBeDefined();
  });

  test("enum field serialization/deserialization", () => {
    class Super { }

    @variant(0)
    class Enum0 extends Super {
      @field({ type: "u8" })
      public a: number;

      constructor(a: number) {
        super();
        this.a = a;
      }
    }

    @variant(1)
    class Enum1 extends Super {
      @field({ type: "u8" })
      public b: number;

      constructor(b: number) {
        super();
        this.b = b;
      }
    }

    class TestStruct {
      @field({ type: Super })
      public enum: Super;

      constructor(value: Super) {
        this.enum = value;
      }
    }
    const instance = new TestStruct(new Enum1(4));
    validate([Enum0, Enum1, TestStruct]);
    expect(getSchema(Enum0)).toBeDefined();
    expect(getSchema(Enum1)).toBeDefined();
    expect(getSchema(TestStruct)).toBeDefined();
    const serialized = serialize(instance);
    expect(serialized).toEqual(Buffer.from([1, 4]));

    const deserialied = deserialize(
      Buffer.from(serialized),
      TestStruct,
      false,
      BinaryReader
    );
    expect(deserialied.enum).toBeInstanceOf(Enum1);
    expect((deserialied.enum as Enum1).b).toEqual(4);
  });

  test("wrapped enum", () => {
    class Super { }

    @variant(2)
    class Enum2 extends Super {
      @field({ type: "u8" })
      public a: number;

      constructor(a: number) {
        super();
        this.a = a;
      }
    }

    class TestStruct {
      @field({ type: option(Super) })
      public enum: Super | undefined;

      constructor(value: Super | undefined) {
        this.enum = value;
      }
    }
    const instance = new TestStruct(new Enum2(3));
    validate([Enum2, TestStruct]);
    expect(getSchema(Enum2)).toBeDefined();
    expect(getSchema(TestStruct)).toBeDefined();
    const serialized = serialize(instance);
    expect(serialized).toEqual(Buffer.from([1, 2, 3])); // 1 for option, 2 for variant, 3 for value
    const deserialied = deserialize(
      Buffer.from(serialized),
      TestStruct,
      false,
      BinaryReader
    );
    expect(deserialied.enum).toBeInstanceOf(Enum2);
    expect((deserialied.enum as Enum2).a).toEqual(3);
  });

  test("enum variant array", () => {
    class Super { }

    @variant([1, 2, 3])
    class Enum0 extends Super {
      @field({ type: "u8" })
      public a: number;

      constructor(a: number) {
        super();
        this.a = a;
      }
    }

    @variant([1, 2, 4])
    class Enum1 extends Super {
      @field({ type: "u8" })
      public a: number;

      constructor(a: number) {
        super();
        this.a = a;
      }
    }

    class TestStruct {
      @field({ type: Super })
      public enum: Super;

      constructor(value: Super) {
        this.enum = value;
      }
    }
    const instance = new TestStruct(new Enum1(5));
    validate([Enum0, Enum1, TestStruct]);
    expect(getSchema(Enum1)).toBeDefined();
    expect(getSchema(TestStruct)).toBeDefined();
    const serialized = serialize(instance);
    expect(serialized).toEqual(Buffer.from([1, 2, 4, 5]));
    const deserialied = deserialize(
      Buffer.from(serialized),
      TestStruct,
      false,
      BinaryReader
    );
    expect(deserialied.enum).toBeInstanceOf(Enum1);
    expect((deserialied.enum as Enum0).a).toEqual(5);
  });
});

describe("option", () => {
  test("field option", () => {
    class TestStruct {
      @field({ type: option("u8") })
      public a: number | undefined;
      constructor(a: number | undefined) {
        this.a = a;
      }
    }
    validate([TestStruct]);
    const expectedResult: StructKind = new StructKind({
      fields: [
        {
          key: "a",
          type: option("u8"),
        },
      ],
    });
    expect(getSchema(TestStruct)).toEqual(expectedResult);
    const bufSome = serialize(new TestStruct(123));
    expect(bufSome).toEqual(Buffer.from([1, 123]));
    const deserializedSome = deserialize(Buffer.from(bufSome), TestStruct);
    expect(deserializedSome.a).toEqual(123);

    const bufNone = serialize(new TestStruct(undefined));
    expect(bufNone).toEqual(Buffer.from([0]));
    const deserialized = deserialize(Buffer.from(bufNone), TestStruct);
    expect(deserialized.a).toBeUndefined();
  });

  test("field option struct", () => {
    class Element {
      @field({ type: "u8" })
      public a: number | undefined;
      constructor(a: number | undefined) {
        this.a = a;
      }
    }
    class TestStruct {
      @field({ type: option(Element) })
      public a: Element | undefined;
      constructor(a: Element | undefined) {
        this.a = a;
      }
    }
    validate([TestStruct]);
    const expectedResult: StructKind = new StructKind({
      fields: [
        {
          key: "a",
          type: option(Element),
        },
      ],
    });
    expect(getSchema(TestStruct)).toEqual(expectedResult);
    const bufSome = serialize(new TestStruct(new Element(123)));
    expect(bufSome).toEqual(Buffer.from([1, 123]));
    const deserializedSome = deserialize(Buffer.from(bufSome), TestStruct);
    expect(deserializedSome.a).toEqual(new Element(123));

    const bufNone = serialize(new TestStruct(undefined));
    expect(bufNone).toEqual(Buffer.from([0]));
    const deserialized = deserialize(Buffer.from(bufNone), TestStruct);
    expect(deserialized.a).toBeUndefined();
  });
});

describe("override", () => {
  test("serialize/deserialize", () => {
    /**
     * Serialize field with custom serializer and deserializer
     */
    interface ComplexObject {
      a: number;
      b: number;
    }
    class TestStruct {
      @field({
        serialize: (value: ComplexObject, writer) => {
          writer.writeU16(value.a + value.b);
        },
        deserialize: (reader): ComplexObject => {
          const value = reader.readU16();
          return {
            a: value,
            b: value * 2,
          };
        },
      })
      public obj: ComplexObject;
      constructor(obj: ComplexObject) {
        this.obj = obj;
      }
    }

    validate([TestStruct]);
    const serialized = serialize(new TestStruct({ a: 2, b: 3 }));
    const deserialied = deserialize(
      Buffer.from(serialized),
      TestStruct,
      false,
      BinaryReader
    );
    expect(deserialied.obj).toBeDefined();
    expect(deserialied.obj.a).toEqual(5);
    expect(deserialied.obj.b).toEqual(10);
  });
});

describe("order", () => {
  test("explicit serialization/deserialization", () => {
    class TestStruct {
      @field({ type: "u8", index: 1 })
      public a: number;

      @field({ type: "u8", index: 0 })
      public b: number;

      constructor(a?: number, b?: number) {
        this.a = a;
        this.b = b;
      }
    }
    validate([TestStruct]);
    const expectedResult: StructKind = new StructKind({
      fields: [
        {
          key: "b",
          type: "u8",
        },

        {
          key: "a",
          type: "u8",
        },
      ],
    });
    expect(getSchema(TestStruct)).toEqual(expectedResult);
    const serialized = serialize(new TestStruct(2, 3));
    const deserialied = deserialize(
      Buffer.from(serialized),
      TestStruct,
      false,
      BinaryReader
    );
    expect(deserialied).toBeDefined();
    expect(deserialied.a).toEqual(2);
    expect(deserialied.b).toEqual(3);
  });

  test("explicit non zero offset", () => {
    class TestStruct {
      @field({ type: "u8", index: 1 })
      public a: number;
    }
    const thrower = (): void => {
      validate([TestStruct]);
    };

    // Error is thrown since 1 field with index 1 is undefined behaviour
    // Expect first index to be 0
    expect(thrower).toThrow(BorshError);
  });

  test("explicit gaps", () => {
    class TestStruct {
      @field({ type: "u8", index: 0 })
      public a: number;
      @field({ type: "u8", index: 2 })
      public b: number;
    }
    const thrower = (): void => {
      validate([TestStruct]);
    };

    // Error is thrown since missing field with index 1
    // Expected no gaps
    expect(thrower).toThrow(BorshError);
  });

  test("implicit", () => {
    class TestStruct {
      @field({ type: "u8" })
      public a: number;

      @field({ type: "u8" })
      public b: number;
    }
    const schema: StructKind = validate([TestStruct]).get(TestStruct);
    const expectedResult: StructKind = new StructKind({
      fields: [
        {
          key: "a",
          type: "u8",
        },
        {
          key: "b",
          type: "u8",
        },
      ],
    });
    expect(schema).toEqual(expectedResult);
  });
});

describe("Validation", () => {
  test("padding checked/unchecked", () => {
    class TestStruct {
      @field({ type: "u8" })
      public a: number;

      constructor(a?: number) {
        this.a = a;
      }
    }

    const bytes = Uint8Array.from([1, 0]); // has an extra 0
    validate([TestStruct]);
    expect(() =>
      deserialize(Buffer.from(bytes), TestStruct, false)
    ).toThrowError(BorshError);
    expect(deserialize(Buffer.from(bytes), TestStruct, true).a).toEqual(1);
  });

  test("missing struct", () => {
    class MissingImplementation {
      public someField: number;
      constructor(someField?: number) {
        this.someField = someField;
      }
    }

    class TestStruct {
      @field({ type: MissingImplementation })
      public missing: MissingImplementation;

      constructor(missing?: MissingImplementation) {
        this.missing = missing;
      }
    }
    expect(() => validate([TestStruct])).toThrowError(BorshError);
  });

  test("missing variant", () => {
    class Super { }

    @variant(0)
    class Enum0 extends Super {
      constructor() {
        super();
      }
    }
    class TestStruct {
      @field({ type: Super })
      public missing: Super;

      constructor(missing?: Super) {
        this.missing = missing;
      }
    }
    validate([TestStruct]);
    expect(getSchema(Enum0)).toBeDefined();
    expect(getSchema(TestStruct)).toBeDefined();
    expect(getSchema(Super)).toBeUndefined();
  });

  test("missing variant one off", () => {
    class Super { }
    @variant(0)
    class Enum0 extends Super {
      constructor() {
        super();
      }
    }

    @variant(1)
    class Enum1 extends Super {
      constructor() {
        super();
      }
    }
    class TestStruct {
      @field({ type: Super })
      public missing: Super;

      constructor(missing?: Super) {
        this.missing = missing;
      }
    }

    validate([TestStruct]);
    expect(getSchema(Enum0)).toBeDefined();
    expect(getSchema(Enum1)).toBeDefined();
    expect(getSchema(TestStruct)).toBeDefined();
    expect(getSchema(Super)).toBeUndefined();
  });

  test("valid dependency", () => {
    class Implementation {
      @field({ type: "u8" })
      public someField: number;
      constructor(someField?: number) {
        this.someField = someField;
      }
    }

    class TestStruct {
      @field({ type: Implementation })
      public missing: Implementation;

      constructor(missing?: Implementation) {
        this.missing = missing;
      }
    }
    validate([TestStruct]);
  });
});

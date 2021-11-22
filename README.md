# Borsh TS 
[![Project license](https://img.shields.io/badge/license-Apache2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Project license](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![NPM version](https://img.shields.io/npm/v/@solvei/borsh.svg?style=flat-square)](https://npmjs.com/@solvei/borsh)
[![Size on NPM](https://img.shields.io/bundlephobia/minzip/@solvei/borsh.svg?style=flat-square)](https://npmjs.com/@solvei/borsh)

**Borsh TS** is *unofficial* implementation of the [Borsh] binary serialization format for TypeScript projects.

Borsh stands for _Binary Object Representation Serializer for Hashing_. It is meant to be used in security-critical projects as it prioritizes consistency,
safety, speed, and comes with a strict specification.

With this imlementation on can generate serialization/deserialization Schemas using decorators. 


## Examples of schema generation using decorators

**Enum, variant at instruction "slot" 1.** 

```typescript
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
const schemas = generateSchemas([Enum0, Enum1, TestStruct]);

expect(schemas.get(Enum0)).toBeDefined();
expect(schemas.get(Enum1)).toBeDefined();
expect(schemas.get(TestStruct)).toBeDefined();
const serialized = serialize(schemas, instance);
expect(serialized).toEqual(Buffer.from([1, 4]));

const deserialied = deserialize(
    schemas,
    TestStruct,
    Buffer.from(serialized),
    BinaryReader
);
expect(deserialied.enum).toBeInstanceOf(Enum1);
expect((deserialied.enum as Enum1).b).toEqual(4);

```


**Nested Schema generation for structs**


```typescript
class InnerStruct {
    @field({ type: 'typeB' })
    public b: number;

}

class TestStruct {
    @field({ type: InnerStruct })
    public a: InnerStruct;

}

const generatedSchemas = generateSchemas([TestStruct])
expect(generatedSchemas.get(TestStruct)).toEqual({
    kind: 'struct',
    fields: [
        ['a', InnerStruct],
    ]
});
expect(generatedSchemas.get(InnerStruct)).toEqual({
    kind: 'struct',
    fields: [
        ['b', 'typeB'],
    ]
});
```


**Option**
```typescript
class TestStruct {
  @field({ type: 'u8', option: true })
  public a: number;

}
const schema = generateSchemas([TestStruct]).get(TestStruct)
expect(schema).toEqual({
  fields: [
      [
          "a",
          {
              kind: 'option',
              type: 'u8'
          },
      ]
  ],
  kind: "struct",
});
```


**Custom serialization and deserialization**
```typescript

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
            let value = reader.readU16();
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

const schemas = generateSchemas([TestStruct]);
const serialized = serialize(schemas, new TestStruct({ a: 2, b: 3 }));
const deserialied = deserialize(
    schemas,
    TestStruct,
    Buffer.from(serialized),
    BinaryReader
);
expect(deserialied.obj).toBeDefined();
expect(deserialied.obj.a).toEqual(5);
expect(deserialied.obj.b).toEqual(10);
```


**Explicit serialization order of fields**

```typescript
class TestStruct {
    @field({ type: 'u8', index: 1 })
    public a: number;


    @field({ type: 'u8', index: 0 })
    public b: number;
}
const schema = generateSchemas([TestStruct]).get(TestStruct)
expect(schema).toEqual({
    fields: [
        [
            "b",
            "u8",
        ],
        [
            "a",
            "u8",
        ],
    ],
    kind: "struct",
});
```

## Examples of manual schema generation
```typescript
const schemas = new Map([[Test, { kind: 'struct', fields: [['x', 'u8'], ['y', 'u64'], ['z', 'string'], ['q', [3]]] }]]);
```


## Serializing an object
```typescript
const value = new Test({ x: 255, y: 20, z: '123', q: [1, 2, 3] });
const buffer = serialize(SCHEMAS, value);
```

## Deserializing an object
```typescript
const value = new Test({ x: 255, y: 20, z: '123', q: [1, 2, 3] });
const newValue = deserialize(SCHEMAS, SomeClass, buffer);
```

In order for 'SomeClass' be deserialized into, it has to support empty constructor, i. e.

```typescript
class SomeClass
{
    constructor(data = undefined)
    {
        if(data)
        {
            ...
        }
    }
}
```

## Type Mappings

| Borsh                 | TypeScript     |
|-----------------------|----------------|
| `u8` integer          | `number`       |
| `u16` integer         | `number`       |
| `u32` integer         | `number`       |
| `u64` integer         | `BN`           |
| `u128` integer        | `BN`           |
| `u256` integer        | `BN`           |
| `u512` integer        | `BN`           |
| `f32` float           | N/A            |
| `f64` float           | N/A            |
| fixed-size byte array | `Uint8Array`   |
| UTF-8 string          | `string`       |
| option                | `null` or type |
| map                   | N/A            |
| set                   | N/A            |
| structs               | `any`          |

## Contributing

Install dependencies:
```bash
yarn install
```

Continuously build with:
```bash
yarn dev
```

Run tests:
```bash
yarn test
```

Run linter
```bash
yarn lint
```

# License
This repository is distributed under the terms of both the MIT license and the Apache License (Version 2.0).
See [LICENSE-MIT](LICENSE-MIT.txt) and [LICENSE-APACHE](LICENSE-APACHE) for details.

For official releases see:
[Borsh]:          https://borsh.io

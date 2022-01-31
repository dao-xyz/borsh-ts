## Due to organisation name change, the project has been moved [here](https://github.com/s2gprotocol/borsh-ts)

**Borsh TS** is *unofficial* implementation of the [Borsh] binary serialization format for TypeScript projects. The motivation behind this library is to provide more convinient methods using field and class decorators.

Borsh stands for _Binary Object Representation Serializer for Hashing_. It is meant to be used in security-critical projects as it prioritizes consistency,
safety, speed, and comes with a strict specification.

With this imlementation on can generate serialization/deserialization Schemas using decorators. 

## Installation

```
npm install @s2g/borsh
```
or 
```
yarn add @s2g/borsh
```


## Serializing and deserializing

### Serializing an object
*SomeClass* class is decorated using decorators explained later
```typescript
const schemas = generateSchemas([SomeClass])
const value = new SomeClass({ x: 255, y: 20, z: '123', q: [1, 2, 3] });

// Serialize
const buffer = serialize(schemas, value);

// Deserialize
const deserializedValue = deserialize(schemas, SomeClass, buffer);
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
## Examples of schema generation using decorators
For more examples, see the [tests](./src/__tests__index.test.ts).

**Enum, variant at instruction "slot" 1.** 

```typescript
class Super {}

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

```


**Nested Schema generation for structs**
```typescript
class InnerStruct {

    @field({ type: 'u32' })
    public b: number;

}

class TestStruct {

    @field({ type: InnerStruct })
    public a: InnerStruct;

}
```


**Arrays**

***Dynamically sized***
```typescript
class TestStruct {
  @field({ type: vec('u8') })
  public vec: number[];
}
```

***Fixed length***
```typescript
class TestStruct {
  @field({ type: fixedArray('u8', 3) }) // Fixed array of length 3
  public fixedLengthArray: number[];
}
```

**Option**
```typescript
class TestStruct {
  @field({ type: option('u8') })
  public a: number;

}
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
```

This will make *b* serialized into the buffer before *a*.

## Inheritance
Schema generation with class inheritance is not supported (yet)


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
[Borsh]: https://borsh.io

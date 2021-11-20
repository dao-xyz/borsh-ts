# Borsh TS

[![Project license](https://img.shields.io/badge/license-Apache2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Project license](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![NPM version](https://img.shields.io/npm/v/borsh.svg?style=flat-square)](https://npmjs.com/@quantleaf/borsh)
[![Size on NPM](https://img.shields.io/bundlephobia/minzip/borsh.svg?style=flat-square)](https://npmjs.com/@quantleaf/borsh)

**Borsh TS** is *unofficial* implementation of the [Borsh] binary serialization format for TypeScript projects.

Borsh stands for _Binary Object Representation Serializer for Hashing_. It is meant to be used in security-critical projects as it prioritizes consistency,
safety, speed, and comes with a strict specification.

With this imlementation on can generate serialization/deserialization Schemas using decorators. 


## Examples of schema generation using decorators

**Enum, variant at instruction "slot" 1.** 

```typescript
import { generateSchemas, field, variant } from "../schema";

@variant(1)
class TestEnum {
    @field({ type: 'u8' })
    public a: number;

    constructor(a: number) {
        this.a = a

    }
}

class TestStruct {
    @field({ type: TestEnum })
    public enum: TestEnum;

    constructor(value: TestEnum) {
        this.enum = value
    }
}
const instance = new TestStruct(new TestEnum(4));
const generatedSchemas = generatesSchema([TestStruct])
const buf = serialize(generatedSchemas, instance);
expect(buf).toEqual(Buffer.from([1, 4]));

```


**Nested Schema generation for structs**


```typescript
import { generateSchemas, field } from "../schema";

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
import { generateSchemas, field } from "../schema";

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
**Explicit serialization order of fields**

```typescript
import { generateSchemas, field } from "../schema";

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
const buffer = borsh.serialize(SCHEMAS, value);
```

## Deserializing an object
```typescript
const value = new Test({ x: 255, y: 20, z: '123', q: [1, 2, 3] });
const newValue = borsh.deserialize(SCHEMAS, Test, buffer);
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

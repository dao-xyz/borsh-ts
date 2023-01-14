import { field, serialize, deserialize } from '../src/index.js'
import B from 'benchmark'
import protobuf from "protobufjs";

// Run with "node --loader ts-node/esm ./benchmark/u64.ts"
/*
* borsh bigint x 4,188,537 ops/sec ±0.37% (394 runs sampled)
* protobujs bigint x 7,031,425 ops/sec ±0.26% (396 runs sampled)
* borsh number x 4,112,788 ops/sec ±0.23% (396 runs sampled)
* protobujs number x 5,016,302 ops/sec ±0.09% (396 runs sampled)
*/

function getRandomInt(max: number) {
    return Math.floor(Math.random() * max);
}


class Test {

    @field({ type: 'u64' })
    age: bigint | number;

    constructor(age: bigint | number) {
        this.age = age;

    }
}
const protoRoot = protobuf.loadSync('benchmark/u64.proto')
const ProtoMessage = protoRoot.lookupType("Message");
const createObject = () => {
    return new Test(BigInt(+new Date))
}
const createObjectNumber = () => {
    return new Test(+new Date)
}
const numTestObjects = 10000
const testObjectsBigint = ((new Array(numTestObjects)).fill(createObject()));
const testObjectsNumber = ((new Array(numTestObjects)).fill(createObjectNumber()));

const getTestObjectBigint = () => testObjectsBigint[getRandomInt(numTestObjects)];
const getTestObjectNumber = () => testObjectsNumber[getRandomInt(numTestObjects)];

const borshArgs = { unchecked: true, object: true }

const suite = new B.Suite()
suite
    .add("borsh bigint", () => {
        deserialize(serialize(getTestObjectBigint()), Test, borshArgs)
    }, { minSamples: 300 }
    ).add('protobujs bigint', () => {
        ProtoMessage.toObject(ProtoMessage.decode(ProtoMessage.encode(getTestObjectBigint()).finish()))
    }, { minSamples: 300 })
    .add("borsh number", () => {
        deserialize(serialize(getTestObjectNumber()), Test, borshArgs)
    }, { minSamples: 300 })
    .add('protobujs number', () => {
        ProtoMessage.toObject(ProtoMessage.decode(ProtoMessage.encode(getTestObjectNumber()).finish()))
    }, { minSamples: 300 }).on('cycle', (event: any) => {
        console.log(String(event.target));
    })
    .on('complete', function () {
        console.log('Fastest is ' + this.filter('fastest').map('name'));
    })
    .run()


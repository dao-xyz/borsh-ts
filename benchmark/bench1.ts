import { field, serialize, deserialize, BinaryReader, BinaryWriter } from '../src/index.js'
import B from 'benchmark'
import protobuf from "protobufjs";

// Run with "node --loader ts-node/esm ./benchmark/bench1.ts"
/*
* json x 2,910,221 ops/sec ±0.46% (98 runs sampled)
* borsh x 9,893,398 ops/sec ±0.60% (245 runs sampled)
* protobujs x 9,513,112 ops/sec ±0.13% (244 runs sampled)
*/

function getRandomInt(max: number) {
    return Math.floor(Math.random() * max);
}


class Test {

    @field({ type: 'u32' })
    age: number;

    constructor(age: number) {
        this.age = age;

    }
}

const protoRoot = protobuf.loadSync('benchmark/bench1.proto')
const ProtoMessage = protoRoot.lookupType("Message");
const createObject = () => {
    return new Test(getRandomInt(254))
}
const numTestObjects = 10000
const testObjects = ((new Array(numTestObjects)).fill(createObject()));
const getTestObject = () => testObjects[getRandomInt(numTestObjects)];
const borshArgs = { unchecked: true, object: true }

const suite = new B.Suite()
suite.add("json", () => {
    JSON.parse(JSON.stringify(getTestObject()))
}).add("borsh", () => {
    deserialize(serialize(getTestObject()), Test, borshArgs)
}, { minSamples: 150 }).add('protobujs', () => {
    ProtoMessage.toObject(ProtoMessage.decode(ProtoMessage.encode(getTestObject()).finish()))
}, { minSamples: 150 }).on('cycle', (event: any) => {
    console.log(String(event.target));
}).on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
}).run()


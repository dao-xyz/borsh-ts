import { field, serialize, deserialize, BinaryReader, BinaryWriter } from '../src/index.js'
import B from 'benchmark'
import protobuf from "protobufjs";
import crypto from 'crypto';

// Run with "node --loader ts-node/esm ./benchmark/bench3.ts"


/* 
* borsh x 2,442,475 ops/sec ±0.44% (243 runs sampled)
* protobujs x 2,229,004 ops/sec ±0.50% (243 runs sampled)
*/

function getRandomInt(max: number) {
    return Math.floor(Math.random() * max);
}


class Test {

    @field({ type: 'string' })
    name: string;

    @field({ type: 'u32' })
    age: number;

    @field({ type: Uint8Array })
    id: Uint8Array;


    constructor(name: string, age: number, id: Uint8Array) {
        this.name = name;
        this.age = age;
        this.id = id;
    }
}

const protoRoot = protobuf.loadSync('benchmark/bench3.proto')
const ProtoMessage = protoRoot.lookupType("Message");
const createObject = () => {
    return new Test("name-🍍" + getRandomInt(254), getRandomInt(254), crypto.randomBytes(32))
}
const numTestObjects = 10000
const testObjects = ((new Array(numTestObjects)).fill(createObject()));
const getTestObject = () => testObjects[getRandomInt(numTestObjects)];
const borshArgs = { unchecked: true, object: true }

const suite = new B.Suite()
suite.add("borsh", () => {
    deserialize(serialize(getTestObject()), Test, borshArgs);
}, { minSamples: 150 }).add('protobujs', () => {
    ProtoMessage.toObject(ProtoMessage.decode(ProtoMessage.encode(getTestObject()).finish()))
}, { minSamples: 150 }).on('cycle', (event: any) => {
    console.log(String(event.target));
}).on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
}).run()


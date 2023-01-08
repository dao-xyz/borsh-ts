import { field, serialize, deserialize, BinaryReader, BinaryWriter } from '../src/index.js'
import B from 'benchmark'
import protobuf from "protobufjs";
import crypto from 'crypto';

// Run with "node --loader ts-node/esm ./benchmark/bench1.ts"

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
const suite = new B.Suite()
const createObject = () => {
    return new Test("name-🍍" + getRandomInt(254), getRandomInt(254), crypto.randomBytes(399992))
}
const numTestObjects = 10000
const testObjects = ((new Array(numTestObjects)).fill(createObject()));
const getTestObject = () => testObjects[getRandomInt(numTestObjects)];
const borshArgs = { unchecked: true, object: true }
suite.add("borsh", () => {
    serialize(getTestObject())
}).add('protobujs', () => {
    ProtoMessage.encode(getTestObject()).finish()
}).on('cycle', (event: any) => {
    console.log(String(event.target));
}).on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
}).run()


import { field, serialize, deserialize, BinaryReader, BinaryWriter } from '../src/index.js'
import B from 'benchmark'
import protobuf from "protobufjs";

// Run with "node --loader ts-node/esm ./benchmark/bench1.ts"

function getRandomInt(max: number) {
    return Math.floor(Math.random() * max);
}


class Test {

    @field({ type: 'string' })
    name: string;

    @field({ type: 'u32' })
    age: number;

    constructor(name: string, age: number) {
        this.name = name;
        this.age = age;

    }
}

const protoRoot = protobuf.loadSync('benchmark/bench2.proto')
const ProtoMessage = protoRoot.lookupType("Message");
const suite = new B.Suite()
const createObject = () => {
    return new Test("name-🍍" + getRandomInt(254), getRandomInt(254)/* , (new Array(10)).fill("abc-" + getRandomInt(1000)) */)
}
const numTestObjects = 10000
const testObjects = ((new Array(numTestObjects)).fill(createObject()));
const getTestObject = () => testObjects[getRandomInt(numTestObjects)];
const borshArgs = { unchecked: true, object: true }
suite.add("json", () => {
    JSON.parse(JSON.stringify(getTestObject()))
}).add("borsh", () => {
    deserialize(serialize(getTestObject()), Test, borshArgs)
}).add('protobujs', () => {
    ProtoMessage.toObject(ProtoMessage.decode(ProtoMessage.encode(getTestObject()).finish()))
}).on('cycle', (event: any) => {
    console.log(String(event.target));
}).on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
}).run()


import { field, serialize, deserialize, BinaryReader, BinaryWriter } from '../src/index.js'
import B from 'benchmark'
import protobuf from "protobufjs";

// Run with "node --loader ts-node/esm ./benchmark/bench2.ts"

/*** 
 * json x 1,922,772 ops/sec ±0.23% (97 runs sampled)
 * borsh x 3,412,867 ops/sec ±0.58% (94 runs sampled)
 * protobujs x 3,108,237 ops/sec ±2.11% (97 runs sampled)
 */
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
const createObject = () => {
    return new Test("name-🍍" + getRandomInt(254), getRandomInt(254)/* , (new Array(10)).fill("abc-" + getRandomInt(1000)) */)
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


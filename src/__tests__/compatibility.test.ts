import protobuf from "protobufjs";
import { field, serialize, variant } from "../index.js";
const protoRoot = protobuf.loadSync("src/__tests__/compat.proto");
const ProtoMessage = protoRoot.lookupType("Message");

enum Enum {
  X = 0,
  Y = 1,
  Z = 2,
}
class Message {
  @field({ type: "vi32" })
  enum: number;

  @field({ type: "vu32" })
  uint32: number;

  @field({ type: "vsi32" })
  sint32: number;

  @field({ type: "vi32" })
  int32: number;

  constructor(message: Message) {
    Object.assign(this, message);
  }
}
describe("protobuf", () => {
  it("protobuf compat", () => {
    const obj = {
      enum: 1,
      uint32: 567,
      sint32: -1234,
      int32: -5677,
    };
    const proto = ProtoMessage.encode(obj).finish();
    const borsh = serialize(new Message(obj));
    expect(proto).toEqual(borsh);
  });
});

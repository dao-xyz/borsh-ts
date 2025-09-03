import { describe, expect, it } from "vitest";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	fnRef,
	method,
	service,
} from "../index.js";

@service()
class SimpleAPI {
	// @method("string") means args: "string", returns: "void"
	msgs: string[] = [];
	@method("string") push(s: string) {
		this.msgs.push(s);
	}
	@method(["string"]) push2(s: string) {
		this.msgs.push(s);
	}

	// @method("string", "u32") means one string arg and returns a u32
	@method("string", "u32") len(s: string) {
		return s.length;
	}
}

@service()
class CallbackAPI {
	// Callback returns number; server will call cb and propagate thrown error
	@method({ args: [fnRef(["u32"], "u32")], returns: "u32" })
	invoke(cb: (x: number) => number): number {
		return cb(7);
	}
}

describe("method shorthand and callback error propagation", () => {
	it("supports @method shorthands", async () => {
		const loop = new LoopbackPair();
		const unbind = bindService(SimpleAPI, loop.a, new SimpleAPI());
		const client = createProxyFromService(SimpleAPI, loop.b);
		await client.push("a");
		await client.push2("b");
		const n = await client.len("abcd");
		expect(n).toBe(4);
		unbind();
	});

	it("propagates errors thrown inside callbacks", async () => {
		const loop = new LoopbackPair();
		const unbind = bindService(CallbackAPI, loop.a, new CallbackAPI());
		const client = createProxyFromService(CallbackAPI, loop.b);
		await expect(
			client.invoke(() => {
				throw new Error("boom");
			}),
		).rejects.toThrow(/boom/);
		unbind();
	});
});

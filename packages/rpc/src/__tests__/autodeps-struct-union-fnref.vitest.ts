import { field, option } from "@dao-xyz/borsh";
import { describe, expect, it } from "vitest";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	fnRef,
	method,
	service,
	struct,
	union,
} from "../index.js";

class A {
	@field({ type: "string" }) a!: string;
	constructor(a?: string) {
		if (a != null) this.a = a;
	}
}
class B {
	@field({ type: "u32" }) b!: number;
	constructor(b?: number) {
		if (b != null) this.b = b;
	}
}

type ExampleArgs = { simple: string; unionType?: A | B | number };

@service()
class API {
	@method({
		args: [
			fnRef(
				struct({ simple: "string", unionType: option(union([A, B, "u32"])) }),
				"string",
			),
		],
		returns: "string",
	})
	call(cb: (x: ExampleArgs) => string): string {
		return cb({ simple: "ok", unionType: new A("x") });
	}
}

describe("auto-deps with nested struct/union/ctors in fnRef signature", () => {
	it("works without explicit dependencies", async () => {
		const loop = new LoopbackPair();
		const server = bindService(API, loop.a, new API());
		const client = createProxyFromService(API, loop.b);
		const res = await client.call((x: ExampleArgs) => {
			expect(x.simple).toBe("ok");
			expect(x.unionType instanceof A).toBe(true);
			return (x.unionType instanceof A ? x.unionType.a : "?") + "!";
		});
		expect(res).toBe("x!");
		server();
	});
});

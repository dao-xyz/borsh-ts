import { field, variant } from "@dao-xyz/borsh";
import { describe, expect, it } from "vitest";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	ctorRef,
	fnRef,
	method,
	service,
} from "../index.js";

@variant(1)
class L {
	@field({ type: "string" }) v: string;
	constructor(v?: string) {
		this.v = v ?? "";
	}
}

@service({ dependencies: [L] })
class Q {
	// Accept a constructor reference and return its name
	@method({ args: ctorRef(L), returns: "string" as const })
	async fn(c: any): Promise<string> {
		return c.name;
	}

	// Accept a callback; server invokes it and returns its result
	@method({ args: [fnRef(["u32"], "u32")], returns: "u32" })
	async call(cb: (x: number) => number): Promise<number> {
		return cb(7);
	}
}

describe("ctor and fn references", () => {
	it("passes constructor by name and callbacks via $cb", async () => {
		const { a, b } = new LoopbackPair();
		const server = new Q();
		const unbind = bindService(Q, b, server);
		try {
			const client = createProxyFromService(Q, a);
			await expect(client.fn(L as any)).resolves.toBe("L");
			await expect(client.call((x: number) => (x + 1) as any)).resolves.toBe(8);
		} finally {
			unbind();
		}
	});
});

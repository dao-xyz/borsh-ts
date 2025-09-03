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

@variant(7)
class L {
	@field({ type: "string" }) v!: string;
	constructor(v?: string) {
		if (v != null) this.v = v;
	}
}

@service()
class AutoDepsAPI {
	@method({ args: ctorRef(L), returns: "string" })
	async ctorName(c: any): Promise<string> {
		return c.name;
	}

	@method({ args: [fnRef(["u32"], "u32")], returns: "u32" })
	async call(cb: (x: number) => number): Promise<number> {
		return cb(7);
	}
}

describe("auto dependencies for ctorRef/fnRef", () => {
	it("works without explicit @service({dependencies})", async () => {
		const loop = new LoopbackPair();
		const unbind = bindService(AutoDepsAPI, loop.a, new AutoDepsAPI());
		try {
			const client = createProxyFromService(AutoDepsAPI, loop.b);
			await expect(client.ctorName(L as any)).resolves.toBe("L");
			await expect(client.call((x: number) => (x + 1) as any)).resolves.toBe(8);
		} finally {
			unbind();
		}
	});
});

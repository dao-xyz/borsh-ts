import { describe, expect, it } from "vitest";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	ctor,
	method,
	registerDependencies,
	service,
} from "../index.js";

class Alpha {}
class Beta {}

@service()
class Svc {
	@method(ctor("any"), "string")
	async nameOf(c: any): Promise<string> {
		return c?.name ?? "none";
	}
}

describe("runtime dependency registration", () => {
	it("fails before registration, succeeds after registering deps", async () => {
		const pair = new LoopbackPair();
		const unbind = bindService(Svc, pair.a, new Svc());
		const client = createProxyFromService(Svc, pair.b);

		await expect(client.nameOf(Alpha)).rejects.toThrow(
			/CtorRef: unknown constructor/,
		);

		// register at runtime on the service class
		registerDependencies(Svc, [Alpha, Beta]);

		// Rebind to pick up updated registry on server and client sides
		unbind();
		const unbind2 = bindService(Svc, pair.a, new Svc());

		// Recreate client proxy to include new registry
		const client2 = createProxyFromService(Svc, pair.b);

		await expect(client2.nameOf(Alpha)).resolves.toBe("Alpha");
		await expect(client2.nameOf(Beta)).resolves.toBe("Beta");

		unbind2();
	});
});

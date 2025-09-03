import { describe, expect, it, vi } from "vitest";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	method,
	service,
	subservice,
} from "../index.js";

@service()
class Child {
	@method({ returns: "void" })
	async ping(): Promise<void> {}

	// For teardown verification
	closed = false;
	close() {
		this.closed = true;
	}
}

@service()
class Parent {
	// Declare subservice as lazy and optional
	@subservice(Child as any, { lazy: true })
	maybe?: Child;
}

describe("lazy subservice", () => {
	it("enables child RPC after assignment", async () => {
		const { a, b } = new LoopbackPair();
		const server = new Parent();
		const unbind = bindService(Parent, b, server);
		try {
			const client = createProxyFromService(Parent, a);

			// Child not assigned yet; calling should error as unknown method
			await expect((client.maybe as any).ping()).rejects.toThrow();

			// Assign child on server; should be wired automatically
			server.maybe = new Child();

			// Now ping should succeed
			await expect((client.maybe as any).ping()).resolves.toBeUndefined();
		} finally {
			unbind();
		}
	});

	it("presence watch, method availability, and teardown across undefined → defined → undefined", async () => {
		const { a, b } = new LoopbackPair();
		const server = new Parent();
		const unbind = bindService(Parent, b, server);
		try {
			const client = createProxyFromService(Parent, a);

			// Track presence changes from the client
			const seen: boolean[] = [];
			const unsub = (client.maybe as any).$present.subscribe((v: boolean) => {
				seen.push(v);
			});

			// Initial state is undefined
			await expect((client.maybe as any).$present.get()).resolves.toBe(false);
			await expect((client.maybe as any).ping()).rejects.toThrow();

			// Define child on server
			const child = new Child();
			server.maybe = child;

			// Client should observe presence = true and calls should succeed
			// give the presence stream a tick
			await new Promise((r) => setTimeout(r, 0));
			await expect((client.maybe as any).$present.get()).resolves.toBe(true);
			await expect((client.maybe as any).ping()).resolves.toBeUndefined();

			// Now unset child on server; teardown should run
			server.maybe = undefined;

			// give the presence stream a tick
			await new Promise((r) => setTimeout(r, 0));
			await expect((client.maybe as any).$present.get()).resolves.toBe(false);
			await expect((client.maybe as any).ping()).rejects.toThrow();
			expect(child.closed).toBe(true);

			// Sequence of events seen should include the initial emit, then true, then false
			// Note: presence watch emits current state immediately on subscribe
			// so first value is false; then true after set; then false after unset
			expect(seen[0]).toBe(false);
			expect(seen).toContain(true);
			expect(seen[seen.length - 1]).toBe(false);

			unsub();
		} finally {
			unbind();
		}
	});
});

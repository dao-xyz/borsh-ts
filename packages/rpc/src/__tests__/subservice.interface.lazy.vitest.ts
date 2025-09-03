import { describe, expect, it } from "vitest";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	method,
	service,
	subservice,
} from "../index.js";
import type { RpcProxy, SyncedAccessor } from "../index.js";

// Interface shape for the subservice (no classes here)
interface ISub {
	echo(msg: string): Promise<string>;
}

// Schema-only contract describing the interface; implementations do NOT need to extend it
@service()
class SubContract implements ISub {
	@method({ args: ["string"], returns: "string" })
	async echo(_msg: string): Promise<string> {
		// not used at runtime; real calls go to the assigned implementation
		return _msg;
	}
}

// Two different implementations that satisfy ISub (do not extend SubContract)
class ImplA implements ISub {
	closed = false;
	async echo(msg: string): Promise<string> {
		return `A:${msg}`;
	}
	close() {
		this.closed = true;
	}
}

class ImplB implements ISub {
	closed = false;
	async echo(msg: string): Promise<string> {
		return `B:${msg}`;
	}
	stop() {
		this.closed = true;
	}
}

@service()
class Parent {
	// Interface-typed, lazily assigned subservice
	@subservice(SubContract as any, { lazy: true })
	sub?: ISub;
}

describe("interface-typed lazy subservice", () => {
	it("supports assigning different implementations, presence, and teardown on unset", async () => {
		const { a, b } = new LoopbackPair();
		const server = new Parent();
		const unbind = bindService(Parent, b, server);
		try {
			const client = createProxyFromService(Parent, a);
			type SubProxy = RpcProxy<ISub> & { $present: SyncedAccessor<boolean> };
			const sub = client.sub as unknown as SubProxy;

			// Observe presence changes
			const seen: boolean[] = [];
			const unsub = sub.$present.subscribe((v: boolean) => seen.push(v));

			// Initially undefined
			await expect(sub.$present.get()).resolves.toBe(false);
			await expect(sub.echo("x")).rejects.toThrow();

			// Assign ImplA
			const aImpl = new ImplA();
			server.sub = aImpl;
			await new Promise((r) => setTimeout(r, 0));
			await expect(sub.$present.get()).resolves.toBe(true);
			await expect(sub.echo("hi")).resolves.toBe("A:hi");

			// Swap to ImplB
			const bImpl = new ImplB();
			server.sub = bImpl;
			await new Promise((r) => setTimeout(r, 0));
			await expect(sub.echo("yo")).resolves.toBe("B:yo");
			// Previous impl should have been closed via teardown
			expect(aImpl.closed).toBe(true);

			// Unset (teardown)
			server.sub = undefined;
			await new Promise((r) => setTimeout(r, 0));
			await expect(sub.$present.get()).resolves.toBe(false);
			await expect(sub.echo("z")).rejects.toThrow();
			expect(bImpl.closed).toBe(true);

			// Presence stream should have emitted false (initial), true (after A), true (after B), false (after unset)
			expect(seen[0]).toBe(false);
			expect(seen).toContain(true);
			expect(seen[seen.length - 1]).toBe(false);

			unsub();
		} finally {
			unbind();
		}
	});
});

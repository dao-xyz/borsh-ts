import { describe, expect, it } from "vitest";
import {
	LoopbackPair,
	type RpcProxy,
	bindService,
	createProxyFromService,
	events,
	method,
	service,
	subservice,
	syncedField,
} from "../index.js";

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message = `Timed out after ${ms}ms`,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(message)), ms);
		promise.then(
			(v) => {
				clearTimeout(t);
				resolve(v);
			},
			(e) => {
				clearTimeout(t);
				reject(e);
			},
		);
	});
}

// Minimal CustomEvent polyfill for Node test envs lacking it
if (typeof globalThis.CustomEvent === "undefined") {
	class NodeCustomEvent<T = unknown> extends Event {
		detail: T;
		constructor(type: string, init?: CustomEventInit<T>) {
			super(type);
			this.detail = init?.detail as T;
		}
	}
	(globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent =
		NodeCustomEvent as unknown as typeof CustomEvent;
}

@service()
class Leaf {
	@syncedField("u32")
	count: number = 0;

	@events("string")
	ev: EventTarget;

	constructor() {
		this.ev = new EventTarget();
	}

	@method({ returns: "void" })
	async inc(): Promise<void> {
		this.count = (this.count | 0) + 1;
	}

	@method({ returns: "void" })
	async ping(): Promise<void> {}

	@method({ returns: { stream: "u32" } })
	async tick(): Promise<AsyncIterable<number>> {
		async function* gen(start: number) {
			yield start;
			yield start + 1;
		}
		return gen(this.count);
	}

	@method({ returns: { stream: "u32" } })
	boomStream(): AsyncIterable<number> {
		throw new Error("boom");
	}
}

@service()
class Child {
	@subservice(Leaf)
	leaf: Leaf = new Leaf();

	@subservice(Leaf as any, { lazy: true })
	maybe?: Leaf;
}

@service()
class Parent {
	child = new Child();

	@method({ returns: Child })
	async createChild(): Promise<Child> {
		return this.child;
	}
}

describe("subservice reference return and helper ops", () => {
	it("supports synced/events/presence helpers through $ref", async () => {
		const { a, b } = new LoopbackPair();
		const server = new Parent();
		const unbind = bindService(Parent, b, server);
		try {
			const client = createProxyFromService(Parent, a);
			const child = (await withTimeout(
				client.createChild(),
				250,
				"Timed out awaiting subservice proxy (thenable regression)",
			)) as unknown as RpcProxy<Child>;

			// Synced field helper should work on nested subservice paths: "$get/$set:$ref:<id>.leaf.count"
			await expect(child.leaf.count.get()).resolves.toBe(0);
			await expect(child.leaf.count.set(2)).resolves.toBeUndefined();
			await expect(child.leaf.count.get()).resolves.toBe(2);

			// Event helper should work on nested subservice paths: "$events:$ref:<id>.leaf.ev"
			const got = new Promise<string>((resolve) => {
				(child.leaf.ev as unknown as EventTarget).addEventListener(
					"hello",
					(evt) => resolve((evt as CustomEvent<string>).detail),
					{ once: true },
				);
			});
			server.child.leaf.ev.dispatchEvent(
				new CustomEvent("hello", { detail: "world" }),
			);
			await expect(got).resolves.toBe("world");

			// Presence helper should work on subservice refs: "$present/$presentWatch:$ref:<id>.maybe"
			const seen: boolean[] = [];
			const unsub = (child.maybe as any).$present.subscribe((v: boolean) => {
				seen.push(v);
			});

			await expect((child.maybe as any).$present.get()).resolves.toBe(false);
			await expect((child.maybe as any).ping()).rejects.toThrow();

			server.child.maybe = new Leaf();
			await new Promise((r) => setTimeout(r, 0));
			await expect((child.maybe as any).$present.get()).resolves.toBe(true);
			await expect((child.maybe as any).ping()).resolves.toBeUndefined();

			server.child.maybe = undefined;
			await new Promise((r) => setTimeout(r, 0));
			await expect((child.maybe as any).$present.get()).resolves.toBe(false);
			await expect((child.maybe as any).ping()).rejects.toThrow();

			expect(seen[0]).toBe(false);
			expect(seen).toContain(true);
			expect(seen[seen.length - 1]).toBe(false);

			unsub();
		} finally {
			unbind();
		}
	});

	it("fails stream AsyncIterable when server responds with Err", async () => {
		const { a, b } = new LoopbackPair();
		const server = new Parent();
		const unbind = bindService(Parent, b, server);
		try {
			const client = createProxyFromService(Parent, a);
			const child = (await withTimeout(
				client.createChild(),
				250,
			)) as unknown as RpcProxy<Child>;

			const consume = (async () => {
				for await (const _ of child.leaf.boomStream()) {
					/* consume */
				}
			})();

			await expect(
				withTimeout(consume, 250, "Timed out waiting for stream to fail"),
			).rejects.toThrow("boom");
		} finally {
			unbind();
		}
	});
});

import { field, variant } from "@dao-xyz/borsh";
import { describe, expect, it } from "vitest";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	events,
	method,
	service,
	syncedField,
	union,
} from "../index.js";

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

@variant(0)
class Foo {
	@field({ type: "string" }) x: string;
	constructor(x?: string) {
		this.x = x ?? "";
	}
}

@service()
class ProtoSvc {
	@syncedField(Foo) // use constructor directly
	state!: Foo;

	@events(Foo)
	host: EventTarget = new EventTarget();

	@method({ args: union([Uint8Array, "string"]) as any, returns: "string" })
	async echo(x: any): Promise<string> {
		if (x instanceof Uint8Array) return `U:${x.length}`;
		if (typeof x === "string") return `S:${x}`;
		return "?";
	}
}

describe("constructor inputs", () => {
	it("accepts class constructors for field types and unions", async () => {
		const { a, b } = new LoopbackPair();
		const server = new ProtoSvc();
		const unbind = bindService(ProtoSvc, b, server);
		try {
			const client = createProxyFromService(ProtoSvc, a);

			// synced field round-trip using constructor type
			await (client as any).state.set(new Foo("ok"));
			await expect((client as any).state.get()).resolves.toBeInstanceOf(Foo);

			// union with Uint8Array works
			await expect(client.echo(new Uint8Array(3) as any)).resolves.toBe("U:3");
			await expect(client.echo("hi" as any)).resolves.toBe("S:hi");

			// events envelope using constructor payload
			const got = new Promise<string>((res) =>
				(client.host as unknown as EventTarget).addEventListener(
					"foo",
					(evt) => res((evt as CustomEvent<Foo>).detail.x),
					{ once: true },
				),
			);
			server.host.dispatchEvent(
				new CustomEvent("foo", { detail: new Foo("E") }),
			);
			await expect(got).resolves.toBe("E");
		} finally {
			unbind();
		}
	});
});

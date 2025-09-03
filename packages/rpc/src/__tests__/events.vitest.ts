import { field, variant } from "@dao-xyz/borsh";
import { describe, expect, it } from "vitest";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	events,
	service,
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
	// Assign polyfill to global in a typed way
	(globalThis as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent =
		NodeCustomEvent as unknown as typeof CustomEvent;
}

class Joined {
	@field({ type: "string" }) id: string;
	constructor(id?: string) {
		this.id = id ?? "";
	}
}

class Left {
	@field({ type: "string" }) id: string;
	constructor(id?: string) {
		this.id = id ?? "";
	}
}

abstract class BaseEvent {}

@variant(1)
class JoinedEvent extends BaseEvent {
	@field({ type: Joined }) value: Joined;
	constructor(v?: Joined) {
		super();
		this.value = v ?? new Joined("");
	}
}

@variant(2)
class LeftEvent extends BaseEvent {
	@field({ type: Left }) value: Left;
	constructor(v?: Left) {
		super();
		this.value = v ?? new Left("");
	}
}

@service()
class TestService {
	// Host-side event emitter; can be a regular EventTarget
	@events(BaseEvent)
	public events: EventTarget;
	constructor() {
		this.events = new EventTarget();
	}
}

describe("rpc events", () => {
	it("streams class-typed events and dispatches on client EventTarget", async () => {
		const { a, b } = new LoopbackPair();
		const server = new TestService();
		const unbind = bindService(TestService, b, server);
		try {
			const client = createProxyFromService(TestService, a);

			const gotJoined = new Promise<string>((resolve) => {
				(client.events as unknown as EventTarget).addEventListener(
					"joined",
					(evt) => {
						const e = evt as CustomEvent<JoinedEvent>;
						expect(e).toBeInstanceOf(Event);
						expect(e.detail).toBeInstanceOf(JoinedEvent);
						expect(e.detail.value).toBeInstanceOf(Joined);
						resolve(e.detail.value.id);
					},
					{ once: true },
				);
			});

			// Emit on server; should stream to client as envelope and redispatch as CustomEvent
			server.events.dispatchEvent(
				new CustomEvent("joined", {
					detail: new JoinedEvent(new Joined("123")),
				}),
			);

			const id = await gotJoined;
			expect(id).toBe("123");
		} finally {
			unbind();
		}
	});

	it("supports multiple event types on the same host", async () => {
		const { a, b } = new LoopbackPair();
		const server = new TestService();
		const unbind = bindService(TestService, b, server);
		try {
			const client = createProxyFromService(TestService, a);

			const gotBoth = Promise.all([
				new Promise<string>((res) =>
					(client.events as unknown as EventTarget).addEventListener(
						"joined",
						(evt) => res((evt as CustomEvent<JoinedEvent>).detail.value.id),
						{ once: true },
					),
				),
				new Promise<string>((res) =>
					(client.events as unknown as EventTarget).addEventListener(
						"left",
						(evt) => res((evt as CustomEvent<LeftEvent>).detail.value.id),
						{ once: true },
					),
				),
			]);

			server.events.dispatchEvent(
				new CustomEvent("joined", { detail: new JoinedEvent(new Joined("A")) }),
			);
			server.events.dispatchEvent(
				new CustomEvent("left", { detail: new LeftEvent(new Left("B")) }),
			);

			const [aId, bId] = await gotBoth;
			expect(aId).toBe("A");
			expect(bId).toBe("B");
		} finally {
			unbind();
		}
	});
});

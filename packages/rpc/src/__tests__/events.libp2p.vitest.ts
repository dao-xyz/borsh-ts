import { field, variant } from "@dao-xyz/borsh";
import type { TypedEventEmitter } from "@libp2p/interface";
import { describe, expect, it } from "vitest";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	events,
	service,
} from "../index.js";

// Define event payload types
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

// Define a typed event map compatible with libp2p's TypedEventEmitter
interface MyEvents {
	joined: CustomEvent<JoinedEvent>;
	left: CustomEvent<LeftEvent>;
}

@service()
class TestServiceLibp2p {
	// Use the TypedEventEmitter type for surface typing; runtime is EventTarget
	@events(BaseEvent)
	public events: TypedEventEmitter<MyEvents> & EventTarget;
	constructor() {
		this.events = new EventTarget() as unknown as TypedEventEmitter<MyEvents> &
			EventTarget;
	}
}

describe("rpc events with @libp2p/interface TypedEventEmitter", () => {
	it("supports TypedEventEmitter-style addEventListener with typed detail", async () => {
		const { a, b } = new LoopbackPair();
		const server = new TestServiceLibp2p();
		const unbind = bindService(TestServiceLibp2p, b, server);
		try {
			const client = createProxyFromService(TestServiceLibp2p, a);

			const got = new Promise<string>((resolve) => {
				// client.events is RpcProxy<EventTarget> at runtime; cast via unknown for structural mismatch
				(client.events as unknown as EventTarget).addEventListener(
					"joined",
					(evt) => resolve((evt as CustomEvent<JoinedEvent>).detail.value.id),
					{ once: true },
				);
			});

			server.events.dispatchEvent(
				new CustomEvent("joined", {
					detail: new JoinedEvent(new Joined("L2")),
				}),
			);

			expect(await got).toBe("L2");
		} finally {
			unbind();
		}
	});
});

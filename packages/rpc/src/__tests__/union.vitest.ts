import { describe, expect, it } from "vitest";
import {
	LoopbackPair,
	bindService,
	createProxyFromService,
	method,
	service,
	union,
} from "../index.js";

// Interface-like shapes (not classes)
type A = { kind: "A"; a: number };
type B = { kind: "B"; b: string };
type C = { kind: "C"; c: Uint8Array };

@service()
class Q {
	// Accept A | B | C | number | string via tagged union
	@method({
		args: union(
			[
				// C case: payload is Uint8Array (encode from object, decode back to object)
				{
					tag: 0,
					type: Uint8Array,
					guard: (v: any) => v && v.kind === "C",
					encode: (v: C) => v.c,
					decode: (raw: Uint8Array) => ({ kind: "C", c: raw }),
				},
				// B case: payload is string (b), and separate raw string case with different tag
				{
					tag: 1,
					type: "string",
					guard: (v: any) => v && v.kind === "B",
					encode: (v: B) => v.b,
					decode: (raw: string) => ({ kind: "B", b: raw }),
				},
				{ tag: 4, type: "string", guard: (v: any) => typeof v === "string" },
				// number case
				{ tag: 2, type: "u32", guard: (v: any) => typeof v === "number" },
				// A case: payload is u32 (a)
				{
					tag: 3,
					type: "u32",
					guard: (v: any) => v && v.kind === "A",
					encode: (v: A) => v.a,
					decode: (raw: number) => ({ kind: "A", a: raw }),
				},
			],
			{ tagType: "u8" },
		),
		returns: "string",
	})
	async someFunction(x: any): Promise<string> {
		if (typeof x === "string") return `str:${x}`;
		if (typeof x === "number") return `num:${x}`;
		if (x && x.kind === "A") return `A:${x.a}`;
		if (x && x instanceof Uint8Array) return `C:${x.length}`;
		if (x && x.kind === "C") return `C:${x.c.length}`;
		if (x && x.kind === "B") return `B:${x.b.length}`;
		return "unknown";
	}
}

describe("union args", () => {
	it("supports A|B|C|number|string via tagged union", async () => {
		const { a, b } = new LoopbackPair();
		const server = new Q();
		const unbind = bindService(Q, b, server);
		try {
			const client = createProxyFromService(Q, a);

			await expect(client.someFunction("hello")).resolves.toBe("str:hello");
			await expect(client.someFunction(42 as any)).resolves.toBe("num:42");
			await expect(
				client.someFunction({ kind: "A", a: 7 } as any),
			).resolves.toBe("A:7");
			await expect(
				client.someFunction({ kind: "B", b: "zz" } as any),
			).resolves.toBe("B:2");
			await expect(
				client.someFunction({ kind: "C", c: new Uint8Array(3) } as any),
			).resolves.toBe("C:3");
		} finally {
			unbind();
		}
	});

	it("supports auto tags (by index) and auto guards (by typeof/instanceof)", async () => {
		@service()
		class AutoQ {
			@method({
				args: union([
					{ type: "string" },
					{ type: "u16" },
					{ type: Uint8Array },
				]),
				returns: "string",
			})
			async f(x: any): Promise<string> {
				if (typeof x === "string") return `S:${x.length}`;
				if (typeof x === "number") return `N:${x}`;
				if (x instanceof Uint8Array) return `U:${x.length}`;
				return "?";
			}
		}

		const { a, b } = new LoopbackPair();
		const server = new AutoQ();
		const unbind = bindService(AutoQ, b, server);
		try {
			const client = createProxyFromService(AutoQ, a);
			await expect(client.f("ab")).resolves.toBe("S:2");
			await expect(client.f(5 as any)).resolves.toBe("N:5");
			await expect(client.f(new Uint8Array(4) as any)).resolves.toBe("U:4");
		} finally {
			unbind();
		}
	});

	it("supports union shorthand array [FieldTypes]", async () => {
		@service()
		class ShorthandQ {
			@method({ args: union([Uint8Array, "string", "u32"]), returns: "string" })
			async f(x: any): Promise<string> {
				if (x instanceof Uint8Array) return `U:${x.length}`;
				if (typeof x === "string") return `S:${x.length}`;
				if (typeof x === "number") return `N:${x}`;
				return "?";
			}
		}

		const { a, b } = new LoopbackPair();
		const server = new ShorthandQ();
		const unbind = bindService(ShorthandQ, b, server);
		try {
			const client = createProxyFromService(ShorthandQ, a);
			await expect(client.f(new Uint8Array(2) as any)).resolves.toBe("U:2");
			await expect(client.f("abc")).resolves.toBe("S:3");
			await expect(client.f(9 as any)).resolves.toBe("N:9");
		} finally {
			unbind();
		}
	});
});

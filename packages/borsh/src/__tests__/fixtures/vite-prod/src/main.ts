import { deserialize, field, serialize, variant } from "@dao-xyz/borsh";

type Result =
	| {
			ok: true;
			superName: string;
			enumSuperName: string;
			bytes: number[];
			decodedIsEnum1: boolean;
			decodedB: number;
	  }
	| { ok: false; error: string; stack?: string };

function makeAnonymousSubclass<T extends abstract new (...args: any[]) => any>(
	Base: T,
): T {
	return class extends Base {} as any;
}

const result: Result = (() => {
	try {
		class SuperSuper {}
		variant(1)(SuperSuper);

		const Super = makeAnonymousSubclass(SuperSuper);
		Object.defineProperty(Super, "name", { value: "", configurable: true });
		variant(2)(Super);

		class Enum1 extends Super {
			b: number;
			constructor(b: number) {
				super();
				this.b = b;
			}
		}

		variant([3, 4])(Enum1);
		field({ type: "u8" })(Enum1.prototype, "b");

		const bytes = Array.from(new Uint8Array(serialize(new Enum1(5))));
		const decoded = deserialize(new Uint8Array(bytes), SuperSuper);

		return {
			ok: true,
			superName: Super.name,
			enumSuperName: Object.getPrototypeOf(Enum1).name,
			bytes,
			decodedIsEnum1: decoded instanceof Enum1,
			decodedB: (decoded as Enum1).b,
		};
	} catch (error) {
		return {
			ok: false,
			error: String(error),
			stack: error instanceof Error ? error.stack : undefined,
		};
	}
})();

(globalThis as any).__E2E_RESULT__ = result;
document.querySelector("#app")!.textContent = JSON.stringify(result);

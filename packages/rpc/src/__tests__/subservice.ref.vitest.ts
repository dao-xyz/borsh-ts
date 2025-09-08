import { describe, expect, it } from "vitest";
import {
    LoopbackPair,
    bindService,
    createProxyFromService,
    method,
    service,
    subservice,
    events,
    syncedField,
} from "../index.js";

@service()
class Leaf {
    @syncedField("u32")
    count: number = 0;

    @method({ returns: "void" })
    async inc(): Promise<void> {
        this.count = (this.count | 0) + 1;
    }

    @method({ returns: { stream: "u32" } })
    async tick(): Promise<AsyncIterable<number>> {
        async function* gen(start: number) {
            yield start;
            yield start + 1;
        }
        return gen(this.count);
    }
}

@service()
class Child {
    @subservice(Leaf)
    leaf: Leaf = new Leaf();

    @method({ returns: "u32" })
    async get(): Promise<number> {
        return this.leaf.count;
    }
}

@service()
class Parent {
    @method({ returns: Child })
    async createChild(): Promise<Child> {
        return new Child();
    }
}

describe.skip("subservice reference return and nested calls", () => {
    it("returns a subservice proxy and supports nested calls", async () => {
        const { a, b } = new LoopbackPair();
        const unbind = bindService(Parent, b, new Parent());
        try {
            const client = createProxyFromService(Parent, a);
            const child = await client.createChild();
            await expect(child.get()).resolves.toBe(0);
        } finally {
            unbind();
        }
    });
});



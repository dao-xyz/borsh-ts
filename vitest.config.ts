import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const borshSrc = fileURLToPath(
	new URL("./packages/borsh/src/index.ts", import.meta.url),
);

export default defineConfig({
	test: {
		include: ["src/**/*.vitest.ts", "src/**/*.test.ts", "src/**/*.spec.ts"],
		environment: "node",
		globals: true,
	},
	resolve: {
		alias: [
			{
				find: "@dao-xyz/borsh",
				replacement: borshSrc,
			},
		],
	},
});

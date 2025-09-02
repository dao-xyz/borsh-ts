import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const borshSrc = fileURLToPath(
	new URL("../borsh/src/index.ts", import.meta.url),
);

export default defineConfig({
	test: {
		include: ["src/__tests__/**/*.{test,vitest}.ts"],
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

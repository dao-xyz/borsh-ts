import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const selfSrc = fileURLToPath(new URL("./src/index.ts", import.meta.url));

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
				replacement: selfSrc,
			},
		],
	},
});

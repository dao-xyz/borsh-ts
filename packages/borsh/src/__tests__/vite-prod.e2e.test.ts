import { cp, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build } from "vite";

const contentTypes: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".svg": "image/svg+xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
};

test("vite production bundle works with anonymous decorated base classes", async () => {
	const borshSrc = fileURLToPath(new URL("../index.ts", import.meta.url));
	const fixtureDir = fileURLToPath(
		new URL("./fixtures/vite-prod", import.meta.url),
	);
	let tmpDir = await mkdtemp(path.join(os.tmpdir(), "borsh-vite-e2e-"));
	tmpDir = await realpath(tmpDir);

	try {
		const projectDir = path.join(tmpDir, "project");
		await cp(fixtureDir, projectDir, { recursive: true });

		await build({
			root: projectDir,
			logLevel: "error",
			resolve: {
				alias: {
					"@dao-xyz/borsh": borshSrc,
				},
			},
			build: {
				outDir: "dist",
				emptyOutDir: true,
				minify: "esbuild",
				sourcemap: false,
			},
		});

		const distDir = path.join(projectDir, "dist");
		const server = createServer((req, res) => {
			void (async () => {
				const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
				const relativePath =
					pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
				const filePath = path.resolve(
					distDir,
					decodeURIComponent(relativePath),
				);
				if (!filePath.startsWith(distDir + path.sep)) {
					res.writeHead(403);
					res.end();
					return;
				}

				try {
					const stat = await readFile(filePath);
					const ext = path.extname(filePath);
					res.writeHead(200, {
						"content-type": contentTypes[ext] ?? "application/octet-stream",
						"cache-control": "no-store",
					});
					res.end(stat);
				} catch {
					res.writeHead(404);
					res.end();
				}
			})();
		});

		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("Failed to start HTTP server for Vite e2e test");
		}

		const browser = await chromium.launch();
		try {
			const page = await browser.newPage();
			await page.goto(`http://127.0.0.1:${address.port}/`, {
				waitUntil: "networkidle",
			});
			await page.waitForFunction(
				() => (globalThis as any).__E2E_RESULT__,
				null,
				{
					timeout: 30_000,
				},
			);

			const result = (await page.evaluate(
				() => (globalThis as any).__E2E_RESULT__,
			)) as
				| {
						ok: true;
						superName: string;
						enumSuperName: string;
						bytes: number[];
						decodedIsEnum1: boolean;
						decodedB: number;
				  }
				| { ok: false; error: string; stack?: string };

			if (!result.ok) {
				throw new Error(
					"stack" in result
						? `${result.error}\n${result.stack}`
						: "error" in result
							? result.error
							: "Unknown error",
				);
			}

			expect(result.superName).toBe("");
			expect(result.enumSuperName).toBe("");
			expect(result.bytes).toEqual([1, 2, 3, 4, 5]);
			expect(result.decodedIsEnum1).toBe(true);
			expect(result.decodedB).toBe(5);
		} finally {
			await browser.close();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	} finally {
		await rm(tmpDir, { recursive: true, force: true });
	}
}, 120_000);

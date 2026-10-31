import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            name: "DokiDeployer",
            formats: ["es", "cjs"],
            fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
        },
        sourcemap: true,
        rollupOptions: {
            external: ["path", "fs", "url"],
        },
    },
});

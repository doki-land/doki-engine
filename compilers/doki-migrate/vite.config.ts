import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        dts({
            include: ["src/**/*.ts"],
            outDir: "dist",
            rollupTypes: true,
        }),
    ],
    build: {
        lib: {
            entry: {
                index: "./src/index.ts",
            },
            name: "DokiMigrate",
            formats: ["es", "cjs"],
            fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
        },
        rollupOptions: {
            external: ["yaml", "smol-toml"],
            output: {
                globals: {
                    yaml: "YAML",
                    "smol-toml": "SmolToml",
                },
            },
        },
        target: "node20",
        ssr: true,
    },
    test: {
        globals: true,
        environment: "node",
        include: ["tests/**/*.test.ts"],
        testTimeout: 30000,
        alias: {
            "@": join(__dirname, "src"),
        },
    },
});

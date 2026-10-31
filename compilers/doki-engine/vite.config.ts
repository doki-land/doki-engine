import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    build: {
        lib: {
            entry: {
                index: "./src/index.ts",
                cli: "./src/cli.ts",
            },
            name: "DokiEngine",
            formats: ["es", "cjs"],
            fileName: (format, entryName) => {
                if (entryName === "cli") {
                    return `cli.${format === "es" ? "mjs" : "js"}`;
                }
                return `index.${format === "es" ? "mjs" : "js"}`;
            },
        },
        rollupOptions: {
            external: [
                "@doki-land/dejavu-engine",
                "commander",
                "chalk",
                "figlet",
                "inquirer",
                "ora",
                "express",
                "chokidar",
                "opn",
                "marked",
                "gray-matter",
                "smol-toml",
            ],
            output: {
                globals: {
                    "@doki-land/dejavu-engine": "DejavuEngine",
                    commander: "Commander",
                    chalk: "Chalk",
                    figlet: "Figlet",
                    inquirer: "Inquirer",
                    ora: "Ora",
                    express: "Express",
                    chokidar: "Chokidar",
                    opn: "Opn",
                    marked: "Marked",
                    "gray-matter": "GrayMatter",
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
        setupFiles: ["./vitest.setup.ts"],
        alias: {
            "@": join(__dirname, "src"),
        },
    },
});

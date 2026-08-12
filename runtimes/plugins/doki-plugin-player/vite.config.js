import { defineConfig } from "vite";

export default defineConfig({
    build: {
        lib: {
            entry: "./src/doki-player.ts",
            name: "DokiPlayer",
            fileName: "doki-player",
            formats: ["es", "umd"],
        },
        rollupOptions: {
            external: [],
            output: {
                globals: {
                    "doki-player": "DokiPlayer",
                },
            },
        },
    },
});

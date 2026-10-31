#!/usr/bin/env node
import { runCli } from "../src/cli.mjs";

runCli(process.argv.slice(2)).catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
});

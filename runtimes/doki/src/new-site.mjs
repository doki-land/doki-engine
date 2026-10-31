import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeDeployConfig } from "./deploy.mjs";

const TEMPLATES_ROOT = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "templates",
);

/**
 * @param {string} targetDir
 * @param {{ template?: string }} [opts]
 */
export function createMinimalSite(targetDir, opts = {}) {
    return createSite(targetDir, opts.template || "minimal");
}

/**
 * @param {string} targetDir
 * @param {string} templateName
 */
export function createSite(targetDir, templateName = "minimal") {
    const root = path.resolve(targetDir);
    if (fs.existsSync(path.join(root, "doki.toml"))) {
        throw new Error(`doki.toml already exists in ${root}`);
    }
    const templateRoot = path.join(TEMPLATES_ROOT, templateName);
    if (!fs.existsSync(templateRoot)) {
        const available = fs
            .readdirSync(TEMPLATES_ROOT, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
        throw new Error(
            `unknown template \`${templateName}\`; available: ${available.join(", ")}`,
        );
    }
    fs.mkdirSync(root, { recursive: true });
    copyDir(templateRoot, root);

    if (templateName === "blog") {
        // Default static-host hint (netlify); overwrite-safe only if absent
        try {
            writeDeployConfig(root, "netlify", { outputDir: "dist" });
        } catch {
            /* already present */
        }
    }

    return { root, template: templateName };
}

function copyDir(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const src = path.join(from, entry.name);
        const dest = path.join(to, entry.name);
        if (entry.isDirectory()) {
            copyDir(src, dest);
        } else {
            fs.copyFileSync(src, dest);
        }
    }
}

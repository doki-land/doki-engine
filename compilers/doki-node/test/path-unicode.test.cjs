const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let core;
try {
    core = require("..");
} catch (err) {
    test("native addon present (path smoke)", {
        skip: `build addon first: ${err.message}`,
    }, () => {});
}

if (core) {
    test("project path with spaces and CJK", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "doki path-"));
        const dir = path.join(root, "站点 with spaces");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
            path.join(dir, "doki.toml"),
            [
                'title = "Unicode Path"',
                'content_dir = "content"',
                'output_dir = "dist"',
                "",
            ].join("\n"),
        );
        fs.mkdirSync(path.join(dir, "content"));
        fs.writeFileSync(
            path.join(dir, "content", "hi.md"),
            "---\ntitle: Hi\n---\n\n# Hi\n",
        );

        const sessionId = core.openProject(dir, false);
        assert.ok(sessionId);
        const plan = core.prepareBuild(sessionId, "production");
        assert.equal(plan.phase, "readyToCommit");
        const result = core.commitBuild(sessionId);
        assert.ok(result.committedFiles.includes("doki-manifest.json"));
        assert.ok(fs.existsSync(path.join(dir, "dist", "pages", "hi.html")));
        core.dispose(sessionId);
    });
}

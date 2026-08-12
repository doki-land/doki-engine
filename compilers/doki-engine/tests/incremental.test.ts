import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
    IncrementalBuilder,
    type BuildManifest,
    type ChangeSet,
    type FileRecord,
} from "../src/incremental";

describe("IncrementalBuilder", () => {
    let tempDir: string;
    let builder: IncrementalBuilder;

    beforeEach(() => {
        tempDir = join(process.cwd(), "temp-incremental-test");
        if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true });
        }
        builder = new IncrementalBuilder(tempDir, join(tempDir, "doki.toml"));
    });

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe("基本功能", () => {
        it("应该正确创建 IncrementalBuilder 实例", () => {
            expect(builder).toBeInstanceOf(IncrementalBuilder);
        });

        it("初始状态应该没有清单", () => {
            const manifest = builder.getManifest();
            expect(manifest).toBeNull();
        });

        it("应该能够初始化清单", () => {
            builder.initManifest("test-config-hash");
            const manifest = builder.getManifest();
            expect(manifest).not.toBeNull();
            expect(manifest?.configHash).toBe("test-config-hash");
            expect(manifest?.timestamp).toBeGreaterThan(0);
            expect(manifest?.files.size).toBe(0);
        });

        it("应该能够更新配置 hash", () => {
            builder.initManifest("old-hash");
            builder.updateConfigHash("new-hash");
            const manifest = builder.getManifest();
            expect(manifest?.configHash).toBe("new-hash");
        });

        it("应该能够清除文件记录", () => {
            builder.initManifest("test-hash");
            builder.recordFile("/test/path.md", "file-hash", []);
            expect(builder.getManifest()?.files.size).toBe(1);

            builder.clearFiles();
            expect(builder.getManifest()?.files.size).toBe(0);
        });
    });

    describe("文件 hash 计算", () => {
        it("应该正确计算文件 hash", async () => {
            const testFile = join(tempDir, "test.md");
            writeFileSync(testFile, "Hello World", "utf-8");

            const hash = await builder.computeFileHash(testFile);
            expect(hash).toHaveLength(64);
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
        });

        it("相同内容应该产生相同的 hash", async () => {
            const file1 = join(tempDir, "file1.md");
            const file2 = join(tempDir, "file2.md");
            writeFileSync(file1, "Same content", "utf-8");
            writeFileSync(file2, "Same content", "utf-8");

            const hash1 = await builder.computeFileHash(file1);
            const hash2 = await builder.computeFileHash(file2);

            expect(hash1).toBe(hash2);
        });

        it("不同内容应该产生不同的 hash", async () => {
            const file1 = join(tempDir, "file1.md");
            const file2 = join(tempDir, "file2.md");
            writeFileSync(file1, "Content A", "utf-8");
            writeFileSync(file2, "Content B", "utf-8");

            const hash1 = await builder.computeFileHash(file1);
            const hash2 = await builder.computeFileHash(file2);

            expect(hash1).not.toBe(hash2);
        });

        it("不存在的文件应该返回空字符串", async () => {
            const hash = await builder.computeFileHash("/nonexistent/file.md");
            expect(hash).toBe("");
        });
    });

    describe("变更检测", () => {
        it("没有清单时应该返回需要全量重建", async () => {
            const files = [
                join(tempDir, "file1.md"),
                join(tempDir, "file2.md"),
            ];
            const changeSet = await builder.detectChanges(files);

            expect(changeSet.needsFullRebuild).toBe(true);
            expect(changeSet.added).toEqual(files);
            expect(changeSet.modified).toHaveLength(0);
            expect(changeSet.deleted).toHaveLength(0);
        });

        it("应该检测新增文件", async () => {
            const existingFile = join(tempDir, "existing.md");
            writeFileSync(existingFile, "Existing content", "utf-8");

            builder.initManifest("config-hash");
            const hash = await builder.computeFileHash(existingFile);
            builder.recordFile(existingFile, hash, []);

            const newFile = join(tempDir, "new.md");
            writeFileSync(newFile, "New content", "utf-8");

            const changeSet = await builder.detectChanges([
                existingFile,
                newFile,
            ]);

            expect(changeSet.needsFullRebuild).toBe(false);
            expect(changeSet.added).toContain(newFile);
            expect(changeSet.modified).toHaveLength(0);
            expect(changeSet.deleted).toHaveLength(0);
        });

        it("应该检测修改的文件", async () => {
            const testFile = join(tempDir, "test.md");
            writeFileSync(testFile, "Original content", "utf-8");

            builder.initManifest("config-hash");
            const originalHash = await builder.computeFileHash(testFile);
            builder.recordFile(testFile, originalHash, []);

            writeFileSync(testFile, "Modified content", "utf-8");

            const changeSet = await builder.detectChanges([testFile]);

            expect(changeSet.needsFullRebuild).toBe(false);
            expect(changeSet.modified).toContain(testFile);
            expect(changeSet.added).toHaveLength(0);
            expect(changeSet.deleted).toHaveLength(0);
        });

        it("应该检测删除的文件", async () => {
            const deletedFile = join(tempDir, "deleted.md");
            const existingFile = join(tempDir, "existing.md");
            writeFileSync(existingFile, "Existing content", "utf-8");

            builder.initManifest("config-hash");
            const hash = await builder.computeFileHash(existingFile);
            builder.recordFile(existingFile, hash, []);
            builder.recordFile(deletedFile, "old-hash", []);

            const changeSet = await builder.detectChanges([existingFile]);

            expect(changeSet.needsFullRebuild).toBe(false);
            expect(changeSet.deleted).toContain(deletedFile);
            expect(changeSet.added).toHaveLength(0);
            expect(changeSet.modified).toHaveLength(0);
        });

        it("未修改的文件不应该出现在变更集中", async () => {
            const testFile = join(tempDir, "unchanged.md");
            writeFileSync(testFile, "Unchanged content", "utf-8");

            builder.initManifest("config-hash");
            const hash = await builder.computeFileHash(testFile);
            builder.recordFile(testFile, hash, []);

            const changeSet = await builder.detectChanges([testFile]);

            expect(changeSet.needsFullRebuild).toBe(false);
            expect(changeSet.added).toHaveLength(0);
            expect(changeSet.modified).toHaveLength(0);
            expect(changeSet.deleted).toHaveLength(0);
        });
    });

    describe("构建清单保存和加载", () => {
        it("应该正确保存清单到文件", async () => {
            builder.initManifest("test-config-hash");
            builder.recordFile("/path/to/file.md", "file-hash-123", [
                "template1.html",
            ]);

            await builder.saveManifest();

            const manifestPath = join(tempDir, ".doki-manifest.json");
            expect(existsSync(manifestPath)).toBe(true);

            const content = readFileSync(manifestPath, "utf-8");
            const data = JSON.parse(content);

            expect(data.configHash).toBe("test-config-hash");
            expect(data.files).toHaveLength(1);
            expect(data.files[0][0]).toBe("/path/to/file.md");
        });

        it("应该正确加载已存在的清单", async () => {
            const manifestPath = join(tempDir, ".doki-manifest.json");
            const manifestData = {
                timestamp: Date.now(),
                configHash: "loaded-config-hash",
                files: [
                    [
                        "/loaded/file.md",
                        {
                            path: "/loaded/file.md",
                            hash: "loaded-hash",
                            mtime: Date.now(),
                            templateDeps: [],
                        },
                    ],
                ],
            };
            writeFileSync(manifestPath, JSON.stringify(manifestData), "utf-8");

            const loadedManifest = await builder.loadManifest();

            expect(loadedManifest).not.toBeNull();
            expect(loadedManifest?.configHash).toBe("loaded-config-hash");
            expect(loadedManifest?.files.size).toBe(1);
            expect(loadedManifest?.files.has("/loaded/file.md")).toBe(true);
        });

        it("清单不存在时加载应该返回 null", async () => {
            const manifest = await builder.loadManifest();
            expect(manifest).toBeNull();
        });

        it("损坏的清单文件应该返回 null", async () => {
            const manifestPath = join(tempDir, ".doki-manifest.json");
            writeFileSync(manifestPath, "invalid json content", "utf-8");

            const manifest = await builder.loadManifest();
            expect(manifest).toBeNull();
        });

        it("保存后重新加载应该保持数据一致", async () => {
            builder.initManifest("consistency-test-hash");
            const testFile = join(tempDir, "consistency.md");
            writeFileSync(testFile, "Test content", "utf-8");
            const hash = await builder.computeFileHash(testFile);
            builder.recordFile(testFile, hash, ["base.html", "layout.html"]);

            await builder.saveManifest();

            const newBuilder = new IncrementalBuilder(tempDir);
            const loadedManifest = await newBuilder.loadManifest();

            expect(loadedManifest?.configHash).toBe("consistency-test-hash");
            expect(loadedManifest?.files.has(testFile)).toBe(true);

            const record = loadedManifest?.files.get(testFile);
            expect(record?.hash).toBe(hash);
            expect(record?.templateDeps).toEqual(["base.html", "layout.html"]);
        });
    });

    describe("全量重建检查", () => {
        it("没有清单时应该需要全量重建", async () => {
            const configFile = join(tempDir, "doki.toml");
            writeFileSync(configFile, "title = 'Test'", "utf-8");

            const needsRebuild = await builder.needsFullRebuild(configFile);
            expect(needsRebuild).toBe(true);
        });

        it("配置文件变更时应该需要全量重建", async () => {
            const configFile = join(tempDir, "doki.toml");
            writeFileSync(configFile, "title = 'Original'", "utf-8");

            builder.initManifest("old-config-hash");

            const needsRebuild = await builder.needsFullRebuild(configFile);
            expect(needsRebuild).toBe(true);
        });

        it("配置文件未变更时不需要全量重建", async () => {
            const configFile = join(tempDir, "doki.toml");
            writeFileSync(configFile, "title = 'Test'", "utf-8");

            const configHash = await builder.computeFileHash(configFile);
            builder.initManifest(configHash);

            const needsRebuild = await builder.needsFullRebuild(configFile);
            expect(needsRebuild).toBe(false);
        });
    });

    describe("文件记录", () => {
        it("应该正确记录文件信息", () => {
            builder.initManifest("test-hash");
            builder.recordFile("/test/file.md", "file-hash", ["template.html"]);

            const manifest = builder.getManifest();
            expect(manifest?.files.size).toBe(1);

            const record = manifest?.files.get("/test/file.md");
            expect(record?.path).toBe("/test/file.md");
            expect(record?.hash).toBe("file-hash");
            expect(record?.templateDeps).toEqual(["template.html"]);
            expect(record?.mtime).toBeGreaterThan(0);
        });

        it("没有初始化清单时记录文件应该自动创建清单", () => {
            builder.recordFile("/auto/create.md", "auto-hash", []);

            const manifest = builder.getManifest();
            expect(manifest).not.toBeNull();
            expect(manifest?.files.has("/auto/create.md")).toBe(true);
        });

        it("重复记录相同文件应该更新记录", () => {
            builder.initManifest("test-hash");
            builder.recordFile("/test/file.md", "hash-v1", []);
            builder.recordFile("/test/file.md", "hash-v2", [
                "new-template.html",
            ]);

            const manifest = builder.getManifest();
            expect(manifest?.files.size).toBe(1);

            const record = manifest?.files.get("/test/file.md");
            expect(record?.hash).toBe("hash-v2");
            expect(record?.templateDeps).toEqual(["new-template.html"]);
        });
    });

    describe("模板变更检查", () => {
        it("没有清单时应该返回需要变更", async () => {
            const hasChanges = await builder.checkTemplateChanges(
                join(tempDir, "templates"),
            );
            expect(hasChanges).toBe(true);
        });

        it("没有模板依赖时应该返回无变更", async () => {
            builder.initManifest("test-hash");
            builder.recordFile("/content/post.md", "content-hash", []);

            const hasChanges = await builder.checkTemplateChanges(
                join(tempDir, "templates"),
            );
            expect(hasChanges).toBe(false);
        });
    });
});

import { describe, expect, it } from "vitest";
import {
    createMigrator,
    getSupportedMigrators,
    HexoMigrator,
    HugoMigrator,
    JekyllMigrator,
} from "../src/index";

describe("doki-migrate", () => {
    it("should export createMigrator", () => {
        expect(createMigrator).toBeDefined();
        expect(typeof createMigrator).toBe("function");
    });

    it("should export getSupportedMigrators", () => {
        expect(getSupportedMigrators).toBeDefined();
        expect(typeof getSupportedMigrators).toBe("function");
        const migrators = getSupportedMigrators();
        expect(migrators).toContain("hugo");
        expect(migrators).toContain("hexo");
        expect(migrators).toContain("jekyll");
        expect(migrators).toContain("wordpress");
    });

    it("should create HugoMigrator", () => {
        const migrator = createMigrator("hugo");
        expect(migrator).toBeInstanceOf(HugoMigrator);
        expect(migrator.name).toBe("hugo");
    });

    it("should create HexoMigrator", () => {
        const migrator = createMigrator("hexo");
        expect(migrator).toBeInstanceOf(HexoMigrator);
        expect(migrator.name).toBe("hexo");
    });

    it("should create JekyllMigrator", () => {
        const migrator = createMigrator("jekyll");
        expect(migrator).toBeInstanceOf(JekyllMigrator);
        expect(migrator.name).toBe("jekyll");
    });

    it("should throw for unknown migrator type", () => {
        expect(() => createMigrator("unknown" as any)).toThrow(
            "未知的迁移器类型: unknown",
        );
    });
});

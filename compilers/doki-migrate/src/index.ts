/**
 * Doki Engine 内容迁移模块
 *
 * 提供从各种静态站点生成器和 CMS 迁移内容到 Doki Engine 的功能。
 */

export {
    BaseMigrator,
    type FileMigrateResult,
    type MigrateOptions,
    type MigrateResult,
} from "./base.js";
export {
    convertFrontmatter,
    detectFrontmatterFormat,
    type FrontmatterFormat,
    mergeFrontmatter,
    normalizeFrontmatter,
    type ParsedFrontmatter,
    parseFrontmatter,
    parseJsonFrontmatter,
    parseTomlFrontmatter,
    parseYamlFrontmatter,
    toFrontmatter,
    toJsonFrontmatter,
    toTomlFrontmatter,
    toYamlFrontmatter,
} from "./frontmatter.js";

export { HexoMigrator } from "./hexo.js";
export { HugoMigrator } from "./hugo.js";
export { JekyllMigrator } from "./jekyll.js";
export {
    convertHexoTemplate,
    convertHugoTemplate,
    convertJekyllTemplate,
    convertTemplate,
    type TemplateEngine,
} from "./template.js";
export { WordPressMigrator } from "./wordpress.js";

import type { BaseMigrator, MigrateOptions, MigrateResult } from "./base.js";
import { HexoMigrator } from "./hexo.js";
import { HugoMigrator } from "./hugo.js";
import { JekyllMigrator } from "./jekyll.js";
import { WordPressMigrator } from "./wordpress.js";

/**
 * 迁移器类型
 */
export type MigratorType = "hugo" | "hexo" | "jekyll" | "wordpress";

/**
 * 迁移器映射表
 */
const migrators: Record<string, new () => BaseMigrator> = {
    hugo: HugoMigrator,
    hexo: HexoMigrator,
    jekyll: JekyllMigrator,
    wordpress: WordPressMigrator,
};

/**
 * 创建迁移器实例
 *
 * @param type 迁移器类型
 * @returns 迁移器实例
 */
export function createMigrator(type: MigratorType): BaseMigrator {
    const MigratorClass = migrators[type];

    if (!MigratorClass) {
        throw new Error(
            `未知的迁移器类型: ${type}。支持的类型: hugo, hexo, jekyll, wordpress`,
        );
    }

    return new MigratorClass();
}

/**
 * 获取所有支持的迁移器类型
 *
 * @returns 迁移器类型列表
 */
export function getSupportedMigrators(): MigratorType[] {
    return Object.keys(migrators) as MigratorType[];
}

/**
 * 执行迁移
 *
 * @param type 迁移器类型
 * @param options 迁移选项
 * @returns 迁移结果
 */
export async function migrate(
    type: MigratorType,
    options: MigrateOptions,
): Promise<MigrateResult> {
    const migrator = createMigrator(type);
    return migrator.migrate(options);
}

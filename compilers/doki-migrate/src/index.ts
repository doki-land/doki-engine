/**
 * Doki Engine 内容迁移模块
 *
 * 提供从各种静态站点生成器和 CMS 迁移内容到 Doki Engine 的功能。
 */

export {
    BaseMigrator,
    type MigrateOptions,
    type MigrateResult,
    type FileMigrateResult,
} from "./base.js";

export { HugoMigrator } from "./hugo.js";

export { HexoMigrator } from "./hexo.js";

export { JekyllMigrator } from "./jekyll.js";

export { WordPressMigrator } from "./wordpress.js";

export {
    type FrontmatterFormat,
    type ParsedFrontmatter,
    parseYamlFrontmatter,
    parseTomlFrontmatter,
    parseJsonFrontmatter,
    parseFrontmatter,
    toYamlFrontmatter,
    toTomlFrontmatter,
    toJsonFrontmatter,
    toFrontmatter,
    convertFrontmatter,
    detectFrontmatterFormat,
    mergeFrontmatter,
    normalizeFrontmatter,
} from "./frontmatter.js";

export {
    type TemplateEngine,
    convertHugoTemplate,
    convertHexoTemplate,
    convertJekyllTemplate,
    convertTemplate,
} from "./template.js";

import {
    BaseMigrator,
    type MigrateOptions,
    type MigrateResult,
} from "./base.js";
import { HugoMigrator } from "./hugo.js";
import { HexoMigrator } from "./hexo.js";
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

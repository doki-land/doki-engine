/** Doki Engine — transitional TypeScript SSG shell (frozen).
 * Roles/progress: `决策和进度表/doki-rust-build-kernel.md`. */

import {
  DejavuEngine,
  DejavuLanguage,
  PathTemplateLoader,
  type CanonicalId,
} from "@doki-land/dejavu-engine";

/** Doki 语言配置（使用 {% %} 和 {# #} 定界符） */
export const DOKI_LANGUAGE = new DejavuLanguage().withTemplate({
  codeStart: '{%',
  codeEnd: '%}',
  commentStart: '{#',
  commentEnd: '#}'
});

/** Dejavu 语言配置（使用 <% %> 和 <# #> 定界符） */
export const DEJAVU_LANGUAGE = new DejavuLanguage().withTemplate({
  codeStart: '<%',
  codeEnd: '%>',
  commentStart: '<#',
  commentEnd: '#>'
});

export type TemplateRootName = "theme" | "project";

export type RenderTemplateOptions = {
  onDependency?: (id: CanonicalId) => void;
};

export class DokiEngine {
  private dejavuEngine: DejavuEngine;
  private pathLoader: PathTemplateLoader;

  /** 创建 Doki Engine 实例 */
  constructor() {
    this.pathLoader = new PathTemplateLoader({
      language: DOKI_LANGUAGE.asLanguage(),
      extensions: ["", ".html", ".doki"],
      defaultRoot: "project",
      roots: [
        { name: "theme", priority: 10, scheme: "theme" },
        { name: "project", priority: 20 },
      ],
    });
    this.dejavuEngine = new DejavuEngine({
      language: DOKI_LANGUAGE,
      loader: this.pathLoader,
    });
  }

  /** 返回引擎问候信息 */
  public hello(): string {
    return "Hello from Doki Engine (TypeScript implementation)";
  }

  /**
   * 注册模板（单一真相源：PathTemplateLoader catalog）。
   * `name` 为相对路径（如 `layout.html`）；扩展名探测由 path-v1 loader 处理。
   * 主题模板请用 `root: "theme"`，或 `theme:layout.html` 形式。
   */
  public registerTemplate(
    name: string,
    source: string,
    root: TemplateRootName = "project",
  ): void {
    const schemePrefixed =
      name.startsWith("theme:") || name.startsWith("project:")
        ? name
        : root === "theme"
          ? `theme:${name}`
          : name;
    this.dejavuEngine.registerTemplate(schemePrefixed, source, DOKI_LANGUAGE);
  }

  /** 模板是否可解析（含扩展名与 root 优先级）。 */
  public hasTemplate(name: string): boolean {
    return this.pathLoader.has(name);
  }

  /** 渲染已注册的模板；可选收集 path-v1 依赖 canonical ids。 */
  public renderTemplate(
    name: string,
    context: Record<string, unknown> = {},
    options: RenderTemplateOptions = {},
  ): string {
    return this.dejavuEngine.renderTemplate(name, context, options);
  }

  /** Render and return dependency canonical ids (for incremental builds). */
  public renderTemplateWithDeps(
    name: string,
    context: Record<string, unknown> = {},
  ): { html: string; deps: CanonicalId[] } {
    const deps = new Set<CanonicalId>();
    const html = this.renderTemplate(name, context, {
      onDependency: (id) => deps.add(id),
    });
    return { html, deps: [...deps] };
  }

  /** 一次性渲染模板（无需预先注册） */
  public renderTemplateOnce(
    source: string,
    context: Record<string, unknown> = {},
    language: DejavuLanguage = DOKI_LANGUAGE,
  ): string {
    const tempName = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.html`;
    this.dejavuEngine.registerTemplate(tempName, source, language);
    return this.dejavuEngine.renderTemplate(tempName, context);
  }

  /** 已登记 canonical id 列表（调试 / 插件 / 增量）。 */
  public listTemplateIds(): CanonicalId[] {
    return this.pathLoader.list();
  }

  /** Read-only snapshot for plugin hooks: canonical id → placeholder true. */
  public templateSnapshot(): Map<string, true> {
    const m = new Map<string, true>();
    for (const id of this.listTemplateIds()) m.set(id, true);
    return m;
  }

  /** 构建模板 */
  public async buildTemplate(
    source: string | undefined,
    output: string | undefined,
    _clean: boolean,
  ): Promise<void> {
    if (!source) {
      throw new Error("Source path is required");
    }
    console.log(`Building template from ${source} to ${output || "stdout"}`);
  }

  /** 开发模式运行模板 */
  public async devTemplate(
    source: string | undefined,
    port: number,
  ): Promise<void> {
    if (!source) {
      throw new Error("Source path is required");
    }
    console.log(`Running dev server for ${source} on port ${port}`);
  }

  /** 检查模板语法 */
  public checkTemplate(source: string): void {
    if (!source) {
      throw new Error("Source path is required");
    }
    this.dejavuEngine.checkTemplate(source, DOKI_LANGUAGE);
  }
}

/** 导出单例实例（便捷访问） */
export const engine = new DokiEngine();

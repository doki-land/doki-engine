/** Doki Engine — transitional TypeScript SSG shell (frozen).
 * The build authority is the Rust `doki-core` kernel; this shell renders
 * templates through the `@doki-land/dejavu` facade (N-API binding contract
 * `dejavu.napi/0`). */

import {
    type RenderOptions,
    parse,
    render,
    resolveTemplateRef,
} from "@doki-land/dejavu";

/** Canonical template id (`root:path`, path-v1). */
export type CanonicalId = string;

/** Language + delimiter configuration serialized as the `dejavu.napi/0`
 * `delimiters` wire (camelCase, matching the Rust `dejavu_ir::Language`). */
export type TemplateLanguage = {
    syntaxMode: "template";
    template: {
        codeStart: string;
        codeEnd: string;
        commentStart: string;
        commentEnd: string;
        supportFilterPipe: boolean;
        legacyFor: boolean;
    };
};

/** Doki 语言配置（使用 {% %} 和 {# #} 定界符） */
export const DOKI_LANGUAGE: TemplateLanguage = {
    syntaxMode: "template",
    template: {
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
        supportFilterPipe: true,
        legacyFor: false,
    },
};

/** Dejavu 语言配置（使用 <% %> 和 <# #> 定界符） */
export const DEJAVU_LANGUAGE: TemplateLanguage = {
    syntaxMode: "template",
    template: {
        codeStart: "<%",
        codeEnd: "%>",
        commentStart: "<#",
        commentEnd: "#>",
        supportFilterPipe: true,
        legacyFor: false,
    },
};

/** Extension → language profile, mirroring the Rust `doki-core` kernel:
 * `.doki` / `.dj` use the Doki delimiters, everything else (`.dejavu`,
 * `.html`, no extension) uses the Dejavu default. */
function languageForPath(path: string): TemplateLanguage {
    return /\.(doki|dj)$/i.test(path) ? DOKI_LANGUAGE : DEJAVU_LANGUAGE;
}

export type TemplateRootName = "theme" | "project";

/** path-v1 roots: higher priority resolves first, `theme:` is a scheme. */
const ROOTS: Array<{ name: TemplateRootName; scheme?: string; priority: number }> =
    [
        { name: "theme", scheme: "theme", priority: 10 },
        { name: "project", priority: 20 },
    ];

const EXTENSIONS = ["", ".html", ".doki", ".dj", ".dejavu"];

export type RenderTemplateOptions = {
    onDependency?: (id: CanonicalId) => void;
};

/** Options accepted by the `dejavu.napi/0` `renderSource` wire beyond the
 * public `RenderOptions` fields (catalog / delimiters pass-through). */
type WireRenderOptions = RenderOptions & {
    delimiters?: string;
    catalog?: string;
};

function splitId(id: CanonicalId): { root: TemplateRootName; path: string } {
    const index = id.indexOf(":");
    return {
        root: id.slice(0, index) as TemplateRootName,
        path: id.slice(index + 1),
    };
}

export class DokiEngine {
    private readonly files = new Map<TemplateRootName, Map<string, string>>();
    private readonly irCache = new Map<CanonicalId, string>();

    /** 创建 Doki Engine 实例 */
    constructor() {
        for (const root of ROOTS) this.files.set(root.name, new Map());
    }

    /** 返回引擎问候信息 */
    public hello(): string {
        return "Hello from Doki Engine (TypeScript implementation)";
    }

    /**
     * 注册模板（单一真相源：path-v1 catalog）。
     * `name` 为相对路径（如 `layout.html`）；扩展名探测由 path-v1 解析处理。
     * 主题模板请用 `root: "theme"`，或 `theme:layout.html` 形式。
     */
    public registerTemplate(
        name: string,
        source: string,
        root: TemplateRootName = "project",
    ): void {
        let target = root;
        let path = name;
        if (name.startsWith("theme:")) {
            target = "theme";
            path = name.slice("theme:".length);
        } else if (name.startsWith("project:")) {
            target = "project";
            path = name.slice("project:".length);
        }
        this.files.get(target)!.set(path, source);
        this.irCache.delete(`${target}:${path}`);
    }

    /** 模板是否可解析（含扩展名与 root 优先级）。 */
    public hasTemplate(name: string): boolean {
        return this.resolve(name) !== null;
    }

    /** 渲染已注册的模板；可选收集 path-v1 依赖 canonical ids。 */
    public renderTemplate(
        name: string,
        context: Record<string, unknown> = {},
        options: RenderTemplateOptions = {},
    ): string {
        const id = this.resolve(name);
        if (id === null) {
            throw new Error(`Template "${name}" not found`);
        }
        const { root, path } = splitId(id);
        const source = this.files.get(root)!.get(path)!;
        if (options.onDependency) {
            for (const dep of this.transitiveDeps(id)) {
                options.onDependency(dep);
            }
        }
        const wire: WireRenderOptions = {
            name: id,
            delimiters: JSON.stringify(languageForPath(path)),
            catalog: this.catalogWire(),
        };
        return render(source, context, wire);
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
        language: TemplateLanguage = DOKI_LANGUAGE,
    ): string {
        const wire: WireRenderOptions = {
            delimiters: JSON.stringify(language),
        };
        return render(source, context, wire);
    }

    /** 已登记 canonical id 列表（调试 / 插件 / 增量）。 */
    public listTemplateIds(): CanonicalId[] {
        const ids: CanonicalId[] = [];
        for (const root of ROOTS) {
            for (const path of this.files.get(root.name)!.keys()) {
                ids.push(`${root.name}:${path}`);
            }
        }
        return ids;
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
        console.log(
            `Building template from ${source} to ${output || "stdout"}`,
        );
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
        parse(source, {
            file: "check.doki",
            delimiters: JSON.stringify(DOKI_LANGUAGE),
        });
    }

    /** path-v1 解析：reference → canonical id（或 null）。 */
    private resolve(
        reference: string,
        from?: CanonicalId,
    ): CanonicalId | null {
        const result = resolveTemplateRef({
            reference,
            ...(from ? { from } : {}),
            extensions: EXTENSIONS,
            roots: ROOTS.map((root) => ({
                name: root.name,
                ...(root.scheme ? { scheme: root.scheme } : {}),
                priority: root.priority,
                files: [...this.files.get(root.name)!.keys()],
            })),
        });
        return result.id ?? null;
    }

    /** Serialize the registered catalog for the `dejavu.napi/0` wire:
     * every file is parsed once with its extension profile and cached. */
    private catalogWire(): string {
        return JSON.stringify({
            extensions: EXTENSIONS,
            roots: ROOTS.map((root) => {
                const entries = [...this.files.get(root.name)!.entries()].sort(
                    (a, b) => (a[0] < b[0] ? -1 : 1),
                );
                const files: Record<string, string> = {};
                for (const [path, source] of entries) {
                    files[path] = this.irFor(`${root.name}:${path}`, source);
                }
                return {
                    name: root.name,
                    ...(root.scheme ? { scheme: root.scheme } : {}),
                    priority: root.priority,
                    files,
                };
            }),
        });
    }

    /** IR JSON for one template, parsed with its extension profile. */
    private irFor(id: CanonicalId, source: string): string {
        const cached = this.irCache.get(id);
        if (cached !== undefined) return cached;
        const document = parse(source, {
            file: id,
            delimiters: JSON.stringify(languageForPath(splitId(id).path)),
        });
        const irJson = JSON.stringify(document);
        this.irCache.set(id, irJson);
        return irJson;
    }

    /** Transitively resolved static `include` / `extends` dependencies. */
    private transitiveDeps(entryId: CanonicalId): CanonicalId[] {
        const seen = new Set<CanonicalId>();
        const queue: CanonicalId[] = [entryId];
        while (queue.length > 0) {
            const current = queue.shift()!;
            const { root, path } = splitId(current);
            const source = this.files.get(root)?.get(path);
            if (source === undefined) continue;
            const refs: string[] = [];
            collectStaticRefs(this.irFor(current, source), refs);
            for (const reference of refs) {
                const resolved = this.resolve(reference, current);
                if (resolved !== null && !seen.has(resolved)) {
                    seen.add(resolved);
                    queue.push(resolved);
                }
            }
        }
        return [...seen];
    }
}

/** Collect string-literal targets of `Stmt.Include` / `Stmt.Extends` nodes. */
function collectStaticRefs(node: unknown, out: string[]): void {
    if (Array.isArray(node)) {
        for (const item of node) collectStaticRefs(item, out);
        return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "Stmt.Include" || record.type === "Stmt.Extends") {
        const target = (
            record.type === "Stmt.Include" ? record.path : record.parent
        ) as { type?: string; value?: unknown } | undefined;
        if (target?.type === "Expr.Literal" && typeof target.value === "string") {
            out.push(target.value);
        }
    }
    for (const value of Object.values(record)) {
        collectStaticRefs(value, out);
    }
}

/** 导出单例实例（便捷访问） */
export const engine = new DokiEngine();

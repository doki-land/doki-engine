export {
    DokiEngine,
    engine,
    DOKI_LANGUAGE,
    DEJAVU_LANGUAGE,
} from "./engine.js";
export { DejavuLanguage } from "@doki-land/dejavu-engine";

// 配置模块导出
export {
    type ProjectType,
    type TaxonomyConfig,
    type FeedConfig,
    type SitemapConfig,
    type LanguageConfig,
    type ShortcodeConfig,
    type ImageConfig,
    type SiteConfig,
    type BuildConfig,
    type TemplateConfig,
    type DataConfig,
    type DokiConfig,
    DEFAULT_CONFIG,
    getDefaultTaxonomies,
    loadConfig,
    getSiteVariables,
    getLanguageConfig,
} from "./config.js";

// 短代码模块导出
export {
    type ShortcodeParamType,
    type ShortcodeParam,
    type ShortcodeArgs,
    type RenderContext,
    type Shortcode,
    type ParsedShortcode,
    ShortcodeRegistry,
    ShortcodeParser,
    createImageShortcode,
    createYoutubeShortcode,
    createGistShortcode,
    createCodeShortcode,
    createQuoteShortcode,
    createFigureShortcode,
    createDefaultShortcodeRegistry,
} from "./shortcode.js";

// 图片模块导出
export {
    type ImageFormat,
    type ImageInfo,
    type ImageVariant,
    type ImageConfig as ImageProcessorConfig,
    DEFAULT_IMAGE_CONFIG,
    ImageCache,
    imageCache,
    ImageProcessor,
    getImageExtension,
    isImageFile,
    generateImageHash,
    createImageProcessor,
} from "./image.js";

// 本地化模块导出
export {
    type TranslationEntry,
    type Translation,
    type LocalizedContent,
    type LanguageSwitcherLink,
    TranslationManager,
    LanguageResolver,
    createTranslationManager,
    createLanguageResolver,
    createLocalesContext,
} from "./locales.js";

// Markdown 模块导出
export {
    type Frontmatter,
    type MarkdownParseOptions,
    type MarkdownResult,
    parseMarkdown,
    extractFrontmatter,
    renderMarkdownToHtml,
    getPageVariables,
} from "./markdown.js";

// 内容模块导出
export {
    type Content,
    type ContentCollection,
    type CollectOptions,
    collectContent,
    processContent,
    generateOutputPath,
    sortByDate,
    filterContent,
    getAllContentVariables,
    ensureDir,
    copyDir,
} from "./content.js";

// 数据模块导出
export {
    type DataFileExtension,
    type DataLoadOptions,
    type DataFileInfo,
    loadData,
    watchDataDirectory,
    getSupportedExtensions,
} from "./data.js";

// 构建模块导出
export {
    type BuildResult,
    type BuildOptions,
    Builder,
    buildSite,
} from "./builder.js";

// 分类法模块导出
export {
    type Taxonomy,
    type TaxonomyTerm,
    type TaxonomyCollection,
    type TaxonomyPage,
    extractTaxonomies,
    buildTaxonomyPages,
    getTaxonomyUrl,
} from "./taxonomy.js";

// 分页模块导出
export {
    type Paginator,
    type PageInfo,
    paginate,
    createPaginatedPages,
    getPaginationUrl,
} from "./pagination.js";

// SEO 模块导出
export {
    type SitemapEntry,
    type FeedEntry,
    type SiteVariables as SeoSiteVariables,
    type PageVariables,
    generateSitemap,
    generateRobotsTxt,
    generateAtomFeed,
    generateRssFeed,
    generateOgTags,
    generateCanonicalUrl,
} from "./seo.js";

// 错误处理模块导出
export {
    CliErrorCode,
    type ErrorSeverity,
    getErrorCodeMeta,
    getDocumentationUrl as getErrorCodeDocumentationUrl,
    formatDescription,
    isRecoverable,
    type ErrorCodeMeta,
    type ErrorCodeMetadata,
} from "./error-codes.js";

export {
    type CliErrorType,
    type SourcePosition,
    type SourceRange,
    type SourceContext,
    type ErrorSuggestion,
    type CliError,
    formatCliError,
    printCliError,
    printSuccess,
    printWarning,
    printInfo,
    printProgress,
    createCliError,
    configNotFoundError,
    configParseError,
    templateParseError,
    templateLoadError,
    contentProcessError,
    frontmatterError,
    outputDirError,
    fileNotFoundError,
    directoryError,
    buildError,
    renderError,
    serverStartError,
    portInUseError,
    browserOpenError,
    withErrorHandling,
    type ErrorReport,
    createErrorReport,
    printErrorReportSummary,
    extractSourceContext,
} from "./cli-errors.js";

export {
    type ErrorChainNode,
    buildErrorChain,
    extractSourceContextFromFile,
    extractSourceContextFromSource,
    formatErrorChain,
    collectErrorsFromChain,
    getErrorChainDepth,
    type RelatedErrorGroup,
    groupErrorsByFile,
    groupErrorsByType,
    ErrorContextEnhancer,
    createEnhancedError,
    extractDejavuErrorInfo,
    isDejavuError,
    createErrorSummary,
} from "./error-context.js";

export {
    type SuggestionTemplate,
    SUGGESTION_TEMPLATES,
    getSuggestions,
    getSuggestionTemplate,
    addCustomSuggestions,
    QUICK_FIXES,
    diagnoseError,
} from "./error-suggestions.js";

export {
    BaseMigrator,
    type MigrateOptions,
    type MigrateResult,
    type FileMigrateResult,
    HugoMigrator,
    HexoMigrator,
    JekyllMigrator,
    WordPressMigrator,
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
    type TemplateEngine,
    convertHugoTemplate,
    convertHexoTemplate,
    convertJekyllTemplate,
    convertTemplate,
    type MigratorType,
    createMigrator,
    getSupportedMigrators,
    migrate,
} from "@doki-land/doki-migrate";

export {
    VERSION,
    type DeployPlatform,
    type DeployConfigOptions,
    type DeployTemplate,
    SUPPORTED_PLATFORMS,
    generateNetlifyConfig,
    generateVercelConfig,
    generateGitHubActionsConfig,
    generateCloudflareConfig,
    getConfigFilePath,
    getDeployTemplate,
    generateDeployConfigContent,
    getTemplateFilePath,
    isPlatformSupported,
    getAllDeployTemplates,
} from "@doki-land/doki-deploy";

// 主题模块导出
export {
    type Theme,
    type ThemeManifest,
    ThemeManager,
    loadThemeManifest,
    themeExists,
} from "./theme.js";

// 插件模块导出
export {
    type HookType,
    type HookContext,
    type HookResult,
    type HookFunction,
    type Plugin,
    PluginManager,
} from "./plugin.js";

// 语法高亮模块导出
export {
    type HighlightOptions,
    type Highlighter,
    type ParsedCodeMeta,
    createHighlighter,
    highlightCode,
    parseCodeMeta,
} from "./highlight.js";

// 搜索模块导出
export {
    type SearchIndexEntry,
    type SearchIndex,
    type SegmentFunction,
    SearchIndexBuilder,
    createSegmenter,
    simpleSegment,
    extractPlainText,
    generateSearchComponent,
} from "./search.js";

// Sass 模块导出
export {
    type SassCompileResult,
    type SassCompileOptions,
    SassCompiler,
    isSassFile,
    getOutputPath,
    compileSass,
} from "./sass.js";

// NPM 包发现模块导出
export {
    type PackageType,
    type DiscoveredPackage,
    type DiscoverOptions,
    type VersionCompatibilityResult,
    parsePackageName,
    resolvePackageName,
    loadPackageManifest,
    checkVersionCompatibility,
    getPackagePath,
    discoverPackages,
    getPackageShortName,
    isOfficialPackage,
} from "./npm.js";

// 新配置类型导出
export {
    type ThemeConfig,
    type PluginConfig,
    type HighlightConfig,
    type SearchConfig,
    type SassConfig,
    type MathConfig,
    type MathEngine,
    type MenuItem,
    type MenuConfig,
    type PermalinkConfig,
    getMenuVariables,
} from "./config.js";

// 菜单模块导出
export {
    type MenuTreeNode,
    buildMenuTree,
    getActiveMenu,
    buildMenuContext,
} from "./menu.js";

// 数学模块导出
export {
    type MathRenderResult,
    type ParsedMath,
    type MathRenderer,
    DEFAULT_MATH_CONFIG,
    KatexRenderer,
    MathJaxRenderer,
    createMathRenderer,
    parseMathFormulas,
    renderMathInText,
    getMathHeadTags,
    getMathFooterTags,
    hasMathFormulas,
    MathProcessor,
    createMathProcessor,
} from "./math.js";

// 永久链接模块导出
export {
    type PermalinkContext,
    slugify,
    parsePermalinkPattern,
    buildPermalinkContext,
    generatePermalink,
    validatePermalinkPattern,
    getDefaultPermalinkConfig,
} from "./permalink.js";

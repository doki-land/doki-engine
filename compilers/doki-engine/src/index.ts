export { DejavuLanguage } from "@doki-land/dejavu-engine";
export {
    type DeployConfigOptions,
    type DeployPlatform,
    type DeployTemplate,
    generateCloudflareConfig,
    generateDeployConfigContent,
    generateGitHubActionsConfig,
    generateNetlifyConfig,
    generateVercelConfig,
    getAllDeployTemplates,
    getConfigFilePath,
    getDeployTemplate,
    getTemplateFilePath,
    isPlatformSupported,
    SUPPORTED_PLATFORMS,
    VERSION,
} from "@doki-land/doki-deploy";
export {
    BaseMigrator,
    convertFrontmatter,
    convertHexoTemplate,
    convertHugoTemplate,
    convertJekyllTemplate,
    convertTemplate,
    createMigrator,
    detectFrontmatterFormat,
    type FileMigrateResult,
    type FrontmatterFormat,
    getSupportedMigrators,
    HexoMigrator,
    HugoMigrator,
    JekyllMigrator,
    type MigrateOptions,
    type MigrateResult,
    type MigratorType,
    mergeFrontmatter,
    migrate,
    normalizeFrontmatter,
    type ParsedFrontmatter,
    parseFrontmatter,
    parseJsonFrontmatter,
    parseTomlFrontmatter,
    parseYamlFrontmatter,
    type TemplateEngine,
    toFrontmatter,
    toJsonFrontmatter,
    toTomlFrontmatter,
    toYamlFrontmatter,
    WordPressMigrator,
} from "@doki-land/doki-migrate";
// 构建模块导出
export {
    Builder,
    type BuildOptions,
    type BuildResult,
    buildSite,
} from "./builder.js";
export {
    browserOpenError,
    buildError,
    type CliError,
    type CliErrorType,
    configNotFoundError,
    configParseError,
    contentProcessError,
    createCliError,
    createErrorReport,
    directoryError,
    type ErrorReport,
    type ErrorSuggestion,
    extractSourceContext,
    fileNotFoundError,
    formatCliError,
    frontmatterError,
    outputDirError,
    portInUseError,
    printCliError,
    printErrorReportSummary,
    printInfo,
    printProgress,
    printSuccess,
    printWarning,
    renderError,
    type SourceContext,
    type SourcePosition,
    type SourceRange,
    serverStartError,
    templateLoadError,
    templateParseError,
    withErrorHandling,
} from "./cli-errors.js";
// 配置模块导出
// 新配置类型导出
export {
    type BuildConfig,
    type DataConfig,
    DEFAULT_CONFIG,
    type DokiConfig,
    type FeedConfig,
    getDefaultTaxonomies,
    getLanguageConfig,
    getMenuVariables,
    getSiteVariables,
    type HighlightConfig,
    type ImageConfig,
    type LanguageConfig,
    loadConfig,
    type MathConfig,
    type MathEngine,
    type MenuConfig,
    type MenuItem,
    type PermalinkConfig,
    type PluginConfig,
    type ProjectType,
    type SassConfig,
    type SearchConfig,
    type ShortcodeConfig,
    type SiteConfig,
    type SitemapConfig,
    type TaxonomyConfig,
    type TemplateConfig,
    type ThemeConfig,
} from "./config.js";

// 内容模块导出
export {
    type CollectOptions,
    type Content,
    type ContentCollection,
    collectContent,
    copyDir,
    ensureDir,
    filterContent,
    generateOutputPath,
    getAllContentVariables,
    processContent,
    sortByDate,
} from "./content.js";

// 数据模块导出
export {
    type DataFileExtension,
    type DataFileInfo,
    type DataLoadOptions,
    getSupportedExtensions,
    loadData,
    watchDataDirectory,
} from "./data.js";
export {
    DEJAVU_LANGUAGE,
    DOKI_LANGUAGE,
    DokiEngine,
    engine,
} from "./engine.js";
// 错误处理模块导出
export {
    CliErrorCode,
    type ErrorCodeMeta,
    type ErrorCodeMetadata,
    type ErrorSeverity,
    formatDescription,
    getDocumentationUrl as getErrorCodeDocumentationUrl,
    getErrorCodeMeta,
    isRecoverable,
} from "./error-codes.js";
export {
    buildErrorChain,
    collectErrorsFromChain,
    createEnhancedError,
    createErrorSummary,
    type ErrorChainNode,
    ErrorContextEnhancer,
    extractDejavuErrorInfo,
    extractSourceContextFromFile,
    extractSourceContextFromSource,
    formatErrorChain,
    getErrorChainDepth,
    groupErrorsByFile,
    groupErrorsByType,
    isDejavuError,
    type RelatedErrorGroup,
} from "./error-context.js";
export {
    addCustomSuggestions,
    diagnoseError,
    getSuggestions,
    getSuggestionTemplate,
    QUICK_FIXES,
    SUGGESTION_TEMPLATES,
    type SuggestionTemplate,
} from "./error-suggestions.js";
// 语法高亮模块导出
export {
    createHighlighter,
    type Highlighter,
    type HighlightOptions,
    highlightCode,
    type ParsedCodeMeta,
    parseCodeMeta,
} from "./highlight.js";
// 图片模块导出
export {
    createImageProcessor,
    DEFAULT_IMAGE_CONFIG,
    generateImageHash,
    getImageExtension,
    ImageCache,
    type ImageConfig as ImageProcessorConfig,
    type ImageFormat,
    type ImageInfo,
    ImageProcessor,
    type ImageVariant,
    imageCache,
    isImageFile,
} from "./image.js";
// 本地化模块导出
export {
    createLanguageResolver,
    createLocalesContext,
    createTranslationManager,
    LanguageResolver,
    type LanguageSwitcherLink,
    type LocalizedContent,
    type Translation,
    type TranslationEntry,
    TranslationManager,
} from "./locales.js";
// Markdown 模块导出
export {
    extractFrontmatter,
    type Frontmatter,
    getPageVariables,
    type MarkdownParseOptions,
    type MarkdownResult,
    parseMarkdown,
    renderMarkdownToHtml,
} from "./markdown.js";
// 数学模块导出
export {
    createMathProcessor,
    createMathRenderer,
    DEFAULT_MATH_CONFIG,
    getMathFooterTags,
    getMathHeadTags,
    hasMathFormulas,
    KatexRenderer,
    MathJaxRenderer,
    MathProcessor,
    type MathRenderer,
    type MathRenderResult,
    type ParsedMath,
    parseMathFormulas,
    renderMathInText,
} from "./math.js";
// 菜单模块导出
export {
    buildMenuContext,
    buildMenuTree,
    getActiveMenu,
    type MenuTreeNode,
} from "./menu.js";
// NPM 包发现模块导出
export {
    checkVersionCompatibility,
    type DiscoveredPackage,
    type DiscoverOptions,
    discoverPackages,
    getPackagePath,
    getPackageShortName,
    isOfficialPackage,
    loadPackageManifest,
    type PackageType,
    parsePackageName,
    resolvePackageName,
    type VersionCompatibilityResult,
} from "./npm.js";
// 分页模块导出
export {
    createPaginatedPages,
    getPaginationUrl,
    type PageInfo,
    type Paginator,
    paginate,
} from "./pagination.js";
// 永久链接模块导出
export {
    buildPermalinkContext,
    generatePermalink,
    getDefaultPermalinkConfig,
    type PermalinkContext,
    parsePermalinkPattern,
    slugify,
    validatePermalinkPattern,
} from "./permalink.js";
// 插件模块导出
export {
    type HookContext,
    type HookFunction,
    type HookResult,
    type HookType,
    type Plugin,
    PluginManager,
} from "./plugin.js";

// Sass 模块导出
export {
    compileSass,
    getOutputPath,
    isSassFile,
    type SassCompileOptions,
    type SassCompileResult,
    SassCompiler,
} from "./sass.js";
// 搜索模块导出
export {
    createSegmenter,
    extractPlainText,
    generateSearchComponent,
    type SearchIndex,
    SearchIndexBuilder,
    type SearchIndexEntry,
    type SegmentFunction,
    simpleSegment,
} from "./search.js";
// SEO 模块导出
export {
    type FeedEntry,
    generateAtomFeed,
    generateCanonicalUrl,
    generateOgTags,
    generateRobotsTxt,
    generateRssFeed,
    generateSitemap,
    type PageVariables,
    type SitemapEntry,
    type SiteVariables as SeoSiteVariables,
} from "./seo.js";
// 短代码模块导出
export {
    createCodeShortcode,
    createDefaultShortcodeRegistry,
    createFigureShortcode,
    createGistShortcode,
    createImageShortcode,
    createQuoteShortcode,
    createYoutubeShortcode,
    type ParsedShortcode,
    type RenderContext,
    type Shortcode,
    type ShortcodeArgs,
    type ShortcodeParam,
    type ShortcodeParamType,
    ShortcodeParser,
    ShortcodeRegistry,
} from "./shortcode.js";
// 分类法模块导出
export {
    buildTaxonomyPages,
    extractTaxonomies,
    getTaxonomyUrl,
    type Taxonomy,
    type TaxonomyCollection,
    type TaxonomyPage,
    type TaxonomyTerm,
} from "./taxonomy.js";
// 主题模块导出
export {
    loadThemeManifest,
    type Theme,
    ThemeManager,
    type ThemeManifest,
    themeExists,
} from "./theme.js";

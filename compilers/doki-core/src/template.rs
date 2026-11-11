//! `template.framework.doki`：Doki 页面的模板入口。
//!
//! Doki 有自己的布局候选顺序、主题解析与 i18n `t()` registry；这些宿主扩展留在
//! framework 实现内。语法与渲染仍交给 `template.input.dejavu`，不在宿主重写
//! parser、转义或空白语义。

use dejavu_ir::{CustomRegistry, RenderOptions as IrRenderOptions, render_ir_opts};
use document_template::{
    RenderOptions, TemplateContentKind, TemplateError, TemplateId, TemplateStatus,
};
use document_template_framework::{FrameworkCapability, FrameworkOutput, FrameworkRequest, TemplateFramework};
use document_template_input_dejavu::{
    language_for_path, parse_with, template_error_from_diagnostic, template_error_from_ir,
    ParseError,
};

/// Framework id registered under `template.framework.<id>`.
pub const DOKI_FRAMEWORK_ID: &str = "doki";

/// Framework contract version.
pub const DOKI_FRAMEWORK_CONTRACT: &str = "doki/v0";

/// Input engines this framework drives.
pub const DOKI_FRAMEWORK_ENGINES: &[&str] = &["dejavu"];

/// Doki 的 framework 实现。
///
/// `custom` 是宿主扩展通道（i18n `t()` / `locale()` 等），只在 Doki 边界内可见，
/// 不进入共享 template 合同。
pub struct DokiFramework<'a> {
    /// Host-supplied registry, fixed for the duration of one render.
    pub custom: Option<&'a dyn CustomRegistry>,
}

impl DokiFramework<'_> {
    /// 本 framework 的能力声明。
    #[must_use]
    pub fn capability() -> FrameworkCapability {
        FrameworkCapability {
            id: DOKI_FRAMEWORK_ID,
            status: TemplateStatus::Ready,
            engines: DOKI_FRAMEWORK_ENGINES,
            contract: DOKI_FRAMEWORK_CONTRACT,
        }
    }
}

impl TemplateFramework for DokiFramework<'_> {
    fn id(&self) -> &'static str {
        DOKI_FRAMEWORK_ID
    }

    fn capability(&self) -> FrameworkCapability {
        Self::capability()
    }

    fn render(&self, request: &FrameworkRequest<'_>) -> Result<FrameworkOutput, TemplateError> {
        let id = request
            .loader
            .resolve(request.entry, None, document_template_input_dejavu::EXTENSIONS)?;
        let source = request.loader.source(&id)?;
        let language = language_for_path(id.path());
        let document = parse_with(source, &id.to_string(), &language)
            .map_err(|error: ParseError| template_error_from_diagnostic(parse_error_diagnostic(error)))?;
        let options = IrRenderOptions {
            strict_undefined: request.options.strict_undefined,
            name: Some(id.to_string()),
            custom: self.custom,
            limits: request.options.limits,
            ..IrRenderOptions::default()
        };
        let text = render_ir_opts(&document, request.data, options, None).map_err(template_error_from_ir)?;
        Ok(FrameworkOutput {
            text,
            content: TemplateContentKind::Html,
            dependencies: vec![id],
        })
    }
}

fn parse_error_diagnostic(error: ParseError) -> dejavu_ir::Diagnostic {
    dejavu_ir::parse_error_diagnostic(error)
}

/// Build the single-root loader Doki uses for one layout source.
///
/// The entry path is the layout's basename: Doki resolves layouts on the
/// filesystem first, so the in-memory root only needs one stable, canonical
/// path that keeps the source's extension (and therefore its language profile).
#[must_use]
pub fn layout_loader(layout_id: &str, source: &str) -> (document_template::MapTemplateLoader, TemplateId) {
    let entry_path = layout_entry_path(layout_id);
    let loader = document_template::MapTemplateLoader::new().with_root(
        document_template::TemplateRoot::new("theme", 0).with_file(entry_path.as_str(), source),
    );
    (loader, TemplateId::new("theme", entry_path))
}

fn layout_entry_path(layout_id: &str) -> String {
    let basename = layout_id.rsplit(['/', '\\']).next().unwrap_or(layout_id).trim();
    if basename.is_empty() { "layout".to_string() } else { basename.to_string() }
}

/// Shared render options Doki uses for layout rendering.
#[must_use]
pub fn layout_options() -> RenderOptions {
    RenderOptions::default()
}

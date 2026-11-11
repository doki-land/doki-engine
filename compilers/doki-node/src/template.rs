//! `template.framework.doki` 的 N-API 表面。
//!
//! 只做参数解包、调用 `doki-core` 与把结构化诊断映射成 JSON；不在这里重写
//! parser、转义、空白或布局语义。

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::{json, Value};

use doki_core::{render_layout_source, DokiFramework, DOKI_FRAMEWORK_ID};

/// 本绑定暴露的 framework 能力与可驱动的输入引擎。
#[napi]
pub fn template_capabilities() -> Value {
    let capability = DokiFramework::capability();
    json!({
        "framework": {
            "id": capability.id,
            "status": "ready",
            "engines": capability.engines,
            "contract": capability.contract,
        }
    })
}

/// 按 `template.framework.doki` 渲染一个布局源。
///
/// 请求信封与 `template.render/v0` 对齐：
/// `{ engine, source, entry?, data, strictUndefined? }`。
#[napi]
pub fn render_template(request: Value) -> Result<Value> {
    let engine = request.get("engine").and_then(Value::as_str).unwrap_or(DOKI_FRAMEWORK_ID);
    if engine != DOKI_FRAMEWORK_ID {
        return Ok(failure(vec![diagnostic(
            "template.framework.doki.unknown-engine",
            format!("unknown template framework `{engine}`"),
        )]));
    }

    let Some(source) = request.get("source").and_then(Value::as_str) else {
        return Ok(failure(vec![diagnostic(
            "template.framework.doki.invalid-request",
            "`source` must be a string".to_string(),
        )]));
    };
    let layout_id = request.get("entry").and_then(Value::as_str).unwrap_or("layout");
    let data = request.get("data").cloned().unwrap_or_else(|| json!({}));
    let strict_undefined = request.get("strictUndefined").and_then(Value::as_bool).unwrap_or(false);

    match render_layout_source(layout_id, source, &data, strict_undefined) {
        Ok(output) => Ok(json!({
            "text": output.text,
            "content": format!("{:?}", output.content).to_lowercase(),
            "dependencies": output.dependencies.iter().map(ToString::to_string).collect::<Vec<_>>(),
            "diagnostics": [],
        })),
        Err(error) => Ok(failure(vec![diagnostic(error.code(), error.code().to_string())])),
    }
}

fn failure(diagnostics: Vec<Value>) -> Value {
    json!({
        "text": null,
        "content": null,
        "dependencies": [],
        "diagnostics": diagnostics,
    })
}

fn diagnostic(code: &str, message: String) -> Value {
    json!({
        "code": code,
        "severity": "error",
        "stage": "render",
        "message": message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_names_the_framework_and_its_engines() {
        let capability = template_capabilities();
        assert_eq!(capability["framework"]["id"], "doki");
        assert_eq!(capability["framework"]["engines"], json!(["dejavu"]));
        assert_eq!(capability["framework"]["contract"], "doki/v0");
    }

    #[test]
    fn render_uses_the_dejavu_engine_and_returns_dependencies() {
        let response = render_template(json!({
            "engine": "doki",
            "source": "{% page.title %}",
            "entry": "layouts/page.doki",
            "data": { "page": { "title": "Hi" } },
        }))
        .expect("render");
        assert_eq!(response["text"], "Hi");
        assert_eq!(response["content"], "html");
        assert_eq!(response["dependencies"], json!(["theme:page.doki"]));
    }

    #[test]
    fn unknown_framework_is_reported_not_panicked() {
        let response = render_template(json!({ "engine": "hbs", "source": "x" })).expect("response");
        assert_eq!(response["diagnostics"][0]["code"], "template.framework.doki.unknown-engine");
    }
}

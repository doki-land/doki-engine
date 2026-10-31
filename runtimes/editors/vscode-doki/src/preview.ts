import {
    DEJAVU_LANGUAGE,
    DOKI_LANGUAGE,
    type DokiEngine,
} from "@doki-land/doki-engine";
import * as vscode from "vscode";

/**
 * 渲染结果接口
 */
interface RenderResult {
    /**
     * 渲染后的 HTML 内容
     */
    html: string;

    /**
     * 错误信息（可选）
     */
    error?: {
        /**
         * 错误标题
         */
        title: string;

        /**
         * 错误消息
         */
        message: string;
    };
}

/**
 * Doki 模板预览提供器
 * 实现自定义文本编辑器，提供实时预览功能
 */
export class PreviewProvider implements vscode.CustomTextEditorProvider {
    /**
     * 预览视图类型标识
     */
    public static readonly viewType = "doki.preview";

    /**
     * Doki 引擎实例
     */
    private readonly engine: DokiEngine;

    /**
     * 文档变更订阅映射
     */
    private readonly documentChangeSubscriptions: Map<
        string,
        vscode.Disposable
    > = new Map();

    /**
     * 构造函数
     * @param engine Doki 引擎实例
     */
    constructor(engine: DokiEngine) {
        this.engine = engine;
    }

    /**
     * 注册预览提供器
     * @param context VSCode 扩展上下文
     * @param engine Doki 引擎实例
     * @returns 释放资源函数
     */
    public static register(
        context: vscode.ExtensionContext,
        engine: DokiEngine,
    ): vscode.Disposable {
        const provider = new PreviewProvider(engine);

        const disposable = vscode.window.registerCustomEditorProvider(
            PreviewProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            },
        );

        context.subscriptions.push(disposable);

        const previewCommand = vscode.commands.registerCommand(
            "doki.preview",
            () => {
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor) {
                    vscode.window.showErrorMessage("未找到活动的编辑器");
                    return;
                }

                const document = activeEditor.document;
                const fileName = document.fileName;
                const extension = fileName.split(".").pop()?.toLowerCase();

                if (
                    extension !== "dj" &&
                    extension !== "doki" &&
                    extension !== "dejavu"
                ) {
                    vscode.window.showErrorMessage(
                        "当前文件不是 Doki 模板 (.dj, .doki, .dejavu)",
                    );
                    return;
                }

                vscode.commands.executeCommand(
                    "vscode.openWith",
                    document.uri,
                    PreviewProvider.viewType,
                );
            },
        );

        const previewSideCommand = vscode.commands.registerCommand(
            "doki.previewSide",
            () => {
                const activeEditor = vscode.window.activeTextEditor;
                if (!activeEditor) {
                    vscode.window.showErrorMessage("未找到活动的编辑器");
                    return;
                }

                const document = activeEditor.document;
                const fileName = document.fileName;
                const extension = fileName.split(".").pop()?.toLowerCase();

                if (
                    extension !== "dj" &&
                    extension !== "doki" &&
                    extension !== "dejavu"
                ) {
                    vscode.window.showErrorMessage(
                        "当前文件不是 Doki 模板 (.dj, .doki, .dejavu)",
                    );
                    return;
                }

                vscode.commands.executeCommand(
                    "vscode.openWith",
                    document.uri,
                    PreviewProvider.viewType,
                    { viewColumn: vscode.ViewColumn.Beside },
                );
            },
        );

        context.subscriptions.push(previewCommand, previewSideCommand);

        return disposable;
    }

    /**
     * 解析自定义文本编辑器
     * @param document 文本文档
     * @param webviewPanel WebView 面板
     * @param _token 取消令牌
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
        };

        const initialContent = document.getText();
        const renderResult = this.renderTemplate(
            initialContent,
            document.fileName,
        );
        webviewPanel.webview.html = this.getHtmlForWebview(
            webviewPanel.webview,
            renderResult,
        );

        const changeDocumentSubscription =
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.document.uri.toString() === document.uri.toString()) {
                    const content = document.getText();
                    const result = this.renderTemplate(
                        content,
                        document.fileName,
                    );
                    this.updateWebview(document, webviewPanel.webview, result);
                }
            });

        const saveDocumentSubscription = vscode.workspace.onDidSaveTextDocument(
            (savedDocument) => {
                if (savedDocument.uri.toString() === document.uri.toString()) {
                    const content = document.getText();
                    const result = this.renderTemplate(
                        content,
                        document.fileName,
                    );
                    this.updateWebview(document, webviewPanel.webview, result);
                }
            },
        );

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            saveDocumentSubscription.dispose();
            this.documentChangeSubscriptions.delete(document.uri.toString());
        });

        this.documentChangeSubscriptions.set(document.uri.toString(), {
            dispose: () => {
                changeDocumentSubscription.dispose();
                saveDocumentSubscription.dispose();
            },
        });
    }

    /**
     * 更新 WebView 内容
     * @param document 文本文档
     * @param webview WebView 实例
     * @param renderResult 渲染结果
     */
    private updateWebview(
        _document: vscode.TextDocument,
        webview: vscode.Webview,
        renderResult: RenderResult,
    ): void {
        webview.postMessage({
            type: "update",
            content: renderResult.html,
            error: renderResult.error,
        });
    }

    /**
     * 渲染模板
     * @param content 模板内容
     * @param fileName 文件名
     * @returns 渲染结果
     */
    private renderTemplate(content: string, fileName: string): RenderResult {
        try {
            const extension = fileName.split(".").pop()?.toLowerCase();
            const language =
                extension === "dejavu" ? DEJAVU_LANGUAGE : DOKI_LANGUAGE;

            const rendered = this.engine.renderTemplateOnce(
                content,
                {},
                language,
            );

            const escapedHtml = this.escapeHtml(rendered);

            return {
                html: `<pre class="rendered-content">${escapedHtml}</pre>`,
            };
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            return {
                html: '<div class="error-placeholder">模板渲染失败</div>',
                error: {
                    title: "渲染错误",
                    message: errorMessage,
                },
            };
        }
    }

    /**
     * 转义 HTML 特殊字符
     * @param text 原始文本
     * @returns 转义后的文本
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * 生成 WebView 的 HTML 内容
     * @param webview WebView 实例
     * @param renderResult 渲染结果
     * @returns HTML 字符串
     */
    private getHtmlForWebview(
        webview: vscode.Webview,
        renderResult: RenderResult,
    ): string {
        const errorDisplay = renderResult.error
            ? `<div class="error" id="error-container">
                 <div class="error-title" id="error-title">${this.escapeHtml(renderResult.error.title)}</div>
                 <div class="error-message" id="error-message">${this.escapeHtml(renderResult.error.message)}</div>
               </div>`
            : '<div class="error" id="error-container" style="display: none;">' +
              '<div class="error-title" id="error-title"></div>' +
              '<div class="error-message" id="error-message"></div>' +
              "</div>";

        const contentHtml = renderResult.html;

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
  <title>Doki Preview</title>
  <style>
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      padding: 20px;
      margin: 0;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      line-height: 1.6;
    }
    
    .error {
      background: var(--vscode-inputValidation-errorBackground, #fee2e2);
      border: 1px solid var(--vscode-inputValidation-errorBorder, #ef4444);
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 16px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .error-title {
      color: var(--vscode-errorForeground, #dc2626);
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
    }
    
    .error-title::before {
      content: "⚠";
      margin-right: 8px;
      font-size: 16px;
    }
    
    .error-message {
      color: var(--vscode-errorForeground, #7f1d1d);
      font-size: 13px;
      font-family: var(--vscode-editor-font-family, monospace);
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    .rendered-content {
      background: var(--vscode-textCodeBlock-background, #f5f5f5);
      padding: 16px;
      border-radius: 6px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: var(--vscode-editor-lineHeight, 1.5);
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid var(--vscode-panel-border, #e0e0e0);
    }
    
    .error-placeholder {
      color: var(--vscode-errorForeground, #dc2626);
      font-style: italic;
      padding: 12px;
      text-align: center;
    }
    
    #content {
      min-height: 100px;
    }
    
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground, #666);
    }
    
    .loading::after {
      content: "";
      width: 20px;
      height: 20px;
      border: 2px solid var(--vscode-progressBar-background, #007acc);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-left: 12px;
    }
    
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  </style>
</head>
<body>
  ${errorDisplay}
  
  <div id="content">${contentHtml}</div>
  
  <script>
    (function() {
      const vscode = acquireVsCodeApi();
      
      const errorContainer = document.getElementById('error-container');
      const errorTitle = document.getElementById('error-title');
      const errorMessage = document.getElementById('error-message');
      const contentDiv = document.getElementById('content');
      
      window.addEventListener('message', function(event) {
        const message = event.data;
        
        if (message.type === 'update') {
          contentDiv.innerHTML = message.content;
          
          if (message.error) {
            errorTitle.textContent = message.error.title;
            errorMessage.textContent = message.error.message;
            errorContainer.style.display = 'block';
          } else {
            errorContainer.style.display = 'none';
          }
        }
      });
    })();
  </script>
</body>
</html>`;
    }
}

import * as assert from "node:assert";
import * as vscode from "vscode";

suite("LSP Integration Test Suite", () => {
    suiteSetup(async () => {
        // 激活扩展
        await vscode.extensions
            .getExtension("@doki-land.doki-vscode")
            ?.activate();

        // 等待LSP服务器启动
        await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    test("Should provide code completion for variables", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: '<% let name = "test" %>\n<%= n',
            language: "doki",
        });

        await vscode.window.showTextDocument(doc);

        // 触发代码完成
        const position = new vscode.Position(1, 4);
        const completions =
            await vscode.commands.executeCommand<vscode.CompletionList>(
                "vscode.executeCompletionItemProvider",
                doc.uri,
                position,
            );

        assert.ok(completions);
        assert.ok(completions.items.length > 0);

        // 检查是否包含name变量
        const hasNameCompletion = completions.items.some(
            (item) => item.label === "name",
        );
        assert.ok(
            hasNameCompletion,
            "Should provide completion for 'name' variable",
        );
    });

    test("Should provide code completion for built-in functions", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "<%= le",
            language: "doki",
        });

        await vscode.window.showTextDocument(doc);

        // 触发代码完成
        const position = new vscode.Position(0, 4);
        const completions =
            await vscode.commands.executeCommand<vscode.CompletionList>(
                "vscode.executeCompletionItemProvider",
                doc.uri,
                position,
            );

        assert.ok(completions);
        assert.ok(completions.items.length > 0);

        // 检查是否包含len函数
        const hasLenCompletion = completions.items.some(
            (item) => item.label === "len",
        );
        assert.ok(
            hasLenCompletion,
            "Should provide completion for 'len' function",
        );
    });

    test("Should provide diagnostics for syntax errors", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "<% if true %>\n  <%= missing closing",
            language: "doki",
        });

        await vscode.window.showTextDocument(doc);

        // 等待诊断信息
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const diagnostics = vscode.languages.getDiagnostics(doc.uri);
        assert.ok(
            diagnostics.length > 0,
            "Should provide diagnostics for syntax errors",
        );
    });

    test("Should provide hover information for variables", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: '<% let name = "test" %>\n<%= name %>',
            language: "doki",
        });

        await vscode.window.showTextDocument(doc);

        // 触发悬停
        const position = new vscode.Position(1, 4);
        const hover = await vscode.commands.executeCommand<vscode.Hover>(
            "vscode.executeHoverProvider",
            doc.uri,
            position,
        );

        assert.ok(hover, "Should provide hover information for variables");
        assert.ok(hover.contents.length > 0, "Hover should have content");
    });

    test("Should format document", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "<% if true %><%= test %><% end if %>",
            language: "doki",
        });

        await vscode.window.showTextDocument(doc);

        // 格式化文档
        const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
            "vscode.executeFormatDocumentProvider",
            doc.uri,
        );

        assert.ok(edits, "Should provide format edits");
        assert.ok(edits.length > 0, "Should have format edits");
    });

    test("Should support document symbols", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content:
                '<% let name = "test" %>\n<% micro hello() %>\n  <%= name %>\n<% end micro %>',
            language: "doki",
        });

        await vscode.window.showTextDocument(doc);

        // 获取文档符号
        const symbols = await vscode.commands.executeCommand<
            vscode.DocumentSymbol[]
        >("vscode.executeDocumentSymbolProvider", doc.uri);

        assert.ok(symbols, "Should provide document symbols");
        assert.ok(symbols.length > 0, "Should have document symbols");
    });

    test("Should support go to definition", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: '<% let name = "test" %>\n<%= name %>',
            language: "doki",
        });

        await vscode.window.showTextDocument(doc);

        // 触发转到定义
        const position = new vscode.Position(1, 4);
        const definitions = await vscode.commands.executeCommand<
            vscode.Location[]
        >("vscode.executeDefinitionProvider", doc.uri, position);

        assert.ok(definitions, "Should provide definitions");
        assert.ok(definitions.length > 0, "Should have definitions");
    });

    test("Should support find references", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: '<% let name = "test" %>\n<%= name %>\n<%= name %>',
            language: "doki",
        });

        await vscode.window.showTextDocument(doc);

        // 触发查找引用
        const position = new vscode.Position(0, 6); // 变量定义位置
        const references = await vscode.commands.executeCommand<
            vscode.Location[]
        >("vscode.executeReferenceProvider", doc.uri, position);

        assert.ok(references, "Should provide references");
        assert.ok(references.length > 0, "Should have references");
    });

    test("Should support rename", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: '<% let name = "test" %>\n<%= name %>',
            language: "doki",
        });

        await vscode.window.showTextDocument(doc);

        // 触发重命名
        const position = new vscode.Position(0, 6); // 变量定义位置
        const prepareResult =
            await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
                "vscode.prepareRename",
                doc.uri,
                position,
            );

        assert.ok(prepareResult, "Should support rename preparation");
    });

    test("Should provide code actions", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "<% let x = 1 %>\n<% if x %>\n  <%= x %>\n<% end if %>",
            language: "doki",
        });

        await vscode.window.showTextDocument(doc);

        // 触发代码操作
        const range = new vscode.Range(0, 0, 0, 10);
        const codeActions = await vscode.commands.executeCommand<
            vscode.CodeAction[]
        >("vscode.executeCodeActionProvider", doc.uri, range);

        assert.ok(codeActions, "Should provide code actions");
    });
});

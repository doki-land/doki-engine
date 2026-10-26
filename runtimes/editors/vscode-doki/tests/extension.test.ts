import * as vscode from "vscode";
import * as assert from "assert";

suite("Extension Test Suite", () => {
    suiteSetup(async () => {
        await vscode.extensions
            .getExtension("@doki-land.doki-vscode")
            ?.activate();
    });

    test("Extension should be present", () => {
        assert.ok(vscode.extensions.getExtension("@doki-land.doki-vscode"));
    });

    test("Extension should activate", async () => {
        const extension = vscode.extensions.getExtension(
            "@doki-land.doki-vscode",
        );
        assert.ok(extension);
        await extension!.activate();
        assert.ok(extension!.isActive);
    });

    test("Doki language should be registered", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "<% let x = 1 %>",
            language: "doki",
        });
        assert.strictEqual(doc.languageId, "doki");
    });

    test("Dejavu language should be registered", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "<% let x = 1 %>",
            language: "dejavu",
        });
        assert.strictEqual(doc.languageId, "dejavu");
    });

    test("Compile template command should be registered", async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes("doki.compileTemplate"));
    });

    test("Language configuration should support comments", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "<# comment #>",
            language: "doki",
        });
        assert.ok(doc);
    });

    test("Language configuration should support brackets", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "<% if true %><% end if %>",
            language: "doki",
        });
        assert.ok(doc);
    });
});

suite("Doki Template Syntax Tests", () => {
    test("Should parse variable declaration", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: '<% let name = "world" %>',
            language: "doki",
        });
        assert.ok(doc);
        assert.strictEqual(doc.getText(), '<% let name = "world" %>');
    });

    test("Should parse if statement", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: `<% if true %>
  Yes
<% end if %>`,
            language: "doki",
        });
        assert.ok(doc);
    });

    test("Should parse if-else statement", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: `<% if false %>
  No
<% else %>
  Yes
<% end if %>`,
            language: "doki",
        });
        assert.ok(doc);
    });

    test("Should parse loop statement", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: `<% loop i in 0..10 %>
  <%= i %>
<% end loop %>`,
            language: "doki",
        });
        assert.ok(doc);
    });

    test("Should parse micro function", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: `<% micro greet(name) %>
  Hello, <%= name %>!
<% end micro %>`,
            language: "doki",
        });
        assert.ok(doc);
    });

    test("Should parse match statement", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: `<% match color %>
  <% case "red" %> Red
  <% case _ %> Other
<% end match %>`,
            language: "doki",
        });
        assert.ok(doc);
    });

    test("Should parse nested structures", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: `<% if true %>
  <% loop i in 0..3 %>
    <%= i %>
  <% end loop %>
<% end if %>`,
            language: "doki",
        });
        assert.ok(doc);
    });
});

suite("Dejavu Template Syntax Tests", () => {
    test("Should parse variable declaration with angle brackets", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: '<% let name = "world" %>',
            language: "dejavu",
        });
        assert.ok(doc);
    });

    test("Should parse if statement with angle brackets", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: `<% if true %>
  Yes
<% end if %>`,
            language: "dejavu",
        });
        assert.ok(doc);
    });

    test("Should parse loop with angle brackets", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: `<% loop i in 0..5 %>
  <%= i %>
<% end loop %>`,
            language: "dejavu",
        });
        assert.ok(doc);
    });
});

import { describe, expect, it } from "vitest";
import {
    analyzeTemplateSource,
    classifyCodeHead,
    collectStructuralDiagnostics,
    DOKI_LANGUAGE,
    detectCursorContext,
    languageDelimiters,
    scanTemplateRegions,
} from "../src/template/index";

/** Doki theme delimiters — same TemplateLanguage as engine DOKI_LANGUAGE. */
const doki = languageDelimiters(DOKI_LANGUAGE);

describe("template IR adapters (not AST walk)", () => {
    it("splits markup and code regions for cursor UX offsets only", () => {
        const regions = scanTemplateRegions("Hi {% name %}!", doki);
        expect(regions.map((r) => r.kind)).toEqual([
            "markup",
            "code",
            "markup",
        ]);
        expect(regions[1].inner.trim()).toBe("name");
    });

    it("classifies incomplete-tag heads with IR vocabulary (UX only)", () => {
        expect(classifyCodeHead('extends "base.html"').kind).toBe("extends");
        expect(classifyCodeHead("block title").name).toBe("title");
        expect(classifyCodeHead("loop item in items").kind).toBe("loop");
        expect(classifyCodeHead("end if").kind).toBe("end_if");
    });

    it("builds template facts via parseToIr, not Program.body", () => {
        const src = `{% extends "base.html" %}{% block content %}x{% end block %}`;
        const node = analyzeTemplateSource("child.html", src, DOKI_LANGUAGE);
        expect(node.extendsPath).toBe("base.html");
        expect(node.blocks.has("content")).toBe(true);
    });

    it("detects filter pipe cursor context (|> contract)", () => {
        const src = "{% name |> %}";
        const offset = src.indexOf("|>") + 3;
        const ctx = detectCursorContext(src, offset, doki, DOKI_LANGUAGE);
        expect(ctx.kind).toBe("filter_pipe");
    });

    it("reports parse failures from parseToIr (engine check path)", () => {
        const diags = collectStructuralDiagnostics(
            "{% if x %}hello",
            DOKI_LANGUAGE,
        );
        expect(diags.some((d) => d.code === "parse_error")).toBe(true);
    });
});

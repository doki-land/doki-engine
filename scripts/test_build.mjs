import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// 创建测试项目目录
const testDir = path.join(process.cwd(), "test-project");

// 清理旧的测试目录
if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
}

// 创建测试项目结构
fs.mkdirSync(testDir, { recursive: true });
fs.mkdirSync(path.join(testDir, "content"));
fs.mkdirSync(path.join(testDir, "templates"));
fs.mkdirSync(path.join(testDir, "static", "css"), { recursive: true });

// 创建配置文件
const configContent = `
[site]
title = "Test Site"
description = "A test site for Doki Engine"
lang = "en"
author = "Test Author"

[build]
input_dir = "content"
output_dir = "dist"
static_dir = "static"
incremental = true

[template]
engine = "dejavu"
dir = "templates"
layout = "layout"
`;
fs.writeFileSync(path.join(testDir, "doki.toml"), configContent);

// 创建模板文件
const layoutTemplate = `
<!DOCTYPE html>
<html lang="{{ site.lang }}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ page.frontmatter.title }} - {{ site.title }}</title>
    <link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
    <header>
        <h1>{{ site.title }}</h1>
    </header>
    <main>
        <% block content %><% endblock %>
    </main>
    <footer>
        <p>&copy; {{ year }} {{ site.author }}</p>
    </footer>
</body>
</html>
`;
fs.writeFileSync(
    path.join(testDir, "templates", "layout.dejavu"),
    layoutTemplate,
);

const pageTemplate = `
<% extends "layout" %>

<% block content %>
    <article>
        <h2>{{ page.frontmatter.title }}</h2>
        {{ page.content }}
    </article>
<% endblock %>

`;
fs.writeFileSync(path.join(testDir, "templates", "page.dejavu"), pageTemplate);

// 创建内容文件
const indexContent = `---
title: "Home Page"
date: "2024-01-01"
author: "Test Author"
categories:
  - Home
tags:
  - test
  - home
layout: "page"
---

# Welcome to the Home Page

This is a test page for Doki Engine.

## Features

- Template inheritance
- Markdown parsing
- Static resource handling
- Incremental build
`;
fs.writeFileSync(path.join(testDir, "content", "index.md"), indexContent);

const aboutContent = `---
title: "About Page"
date: "2024-01-02"
author: "Test Author"
categories:
  - About
tags:
  - test
  - about
layout: "page"
---

# About Us

This is the about page for the test site.
`;
fs.writeFileSync(path.join(testDir, "content", "about.md"), aboutContent);

// 创建静态资源
const cssContent = `
body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    margin: 0;
    padding: 0;
}

header {
    background: #333;
    color: white;
    padding: 1rem;
    text-align: center;
}

main {
    padding: 2rem;
}

footer {
    background: #333;
    color: white;
    text-align: center;
    padding: 1rem;
    position: fixed;
    bottom: 0;
    width: 100%;
}
`;
fs.writeFileSync(path.join(testDir, "static", "css", "style.css"), cssContent);

// 创建测试脚本
const testScript = `
use doki_engine::{DokiEngine};
use std::path::Path;

fn main() {
    // 从配置文件创建 Doki Engine 实例
    let engine = DokiEngine::from_config_file(Path::new("doki.toml")).unwrap();
    
    // 构建网站
    match engine.build() {
        Ok(_) => println!("Build completed successfully!"),
        Err(e) => println!("Build failed: {}", e),
    }
}
`;
fs.writeFileSync(path.join(testDir, "build.rs"), testScript);

// 运行测试
console.log("Creating test project...");
console.log("Running build...");

try {
    // 运行构建
    execSync("rustc build.rs -o build && ./build", {
        cwd: testDir,
        stdio: "inherit",
    });

    // 检查输出
    console.log("\nChecking build output...");

    const distDir = path.join(testDir, "dist");
    if (fs.existsSync(distDir)) {
        console.log("✓ dist directory created");

        // 检查 HTML 文件
        const indexHtml = path.join(distDir, "index.html");
        if (fs.existsSync(indexHtml)) {
            console.log("✓ index.html created");
        } else {
            console.log("✗ index.html not created");
        }

        const aboutHtml = path.join(distDir, "about.html");
        if (fs.existsSync(aboutHtml)) {
            console.log("✓ about.html created");
        } else {
            console.log("✗ about.html not created");
        }

        // 检查静态资源
        const cssFile = path.join(distDir, "static", "css", "style.css");
        if (fs.existsSync(cssFile)) {
            console.log("✓ static/css/style.css created");
        } else {
            console.log("✗ static/css/style.css not created");
        }

        console.log("\nTest completed successfully!");
    } else {
        console.log("✗ dist directory not created");
    }
} catch (error) {
    console.error("Build failed:", error.message);
}

// 清理测试目录
fs.rmSync(testDir, { recursive: true, force: true });
console.log("\nTest directory cleaned up.");

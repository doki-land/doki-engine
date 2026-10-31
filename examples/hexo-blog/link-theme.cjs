// 把 hexo-blog/themes/fate 链接到 ../hexo-theme-fate
// Windows: junction (普通 symlink 在非管理员下可能失败)
// macOS / Linux: symlink

const fs = require("node:fs");
const path = require("node:path");

// 脚本位于 doki-engine/examples/hexo-blog/link-theme.cjs
// 目标位于 doki-engine/examples/hexo-theme-fate/
const blogRoot = __dirname; // examples/hexo-blog
const examplesRoot = path.resolve(blogRoot, ".."); // examples/
const linkPath = path.join(blogRoot, "themes", "fate");
const targetPath = path.join(examplesRoot, "hexo-theme-fate");

if (!fs.existsSync(path.join(blogRoot, "themes"))) {
    fs.mkdirSync(path.join(blogRoot, "themes"), { recursive: true });
}

// 如果 themes/fate 已存在并且是有效 symlink，跳过
if (fs.existsSync(linkPath)) {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
        console.log("[link-theme] themes/fate 已是 symlink，跳过");
        process.exit(0);
    }
    if (stat.isDirectory()) {
        // 普通目录：检查是否是占位（只有 README.md / .gitkeep）。如果是，删掉换成 junction
        const entries = fs.readdirSync(linkPath);
        const placeholder = entries.every(
            (e) => e === "README.md" || e === ".gitkeep",
        );
        if (placeholder) {
            console.log(
                "[link-theme] 检测到占位目录 themes/fate，将替换为 junction",
            );
            fs.rmSync(linkPath, { recursive: true, force: true });
        } else {
            console.warn(
                "[link-theme] themes/fate 是包含真实文件的普通目录，跳过。请手动处理",
            );
            process.exit(0);
        }
    }
}

if (!fs.existsSync(targetPath)) {
    console.error(`[link-theme] 主题源不存在：${targetPath}`);
    process.exit(1);
}

const platform = process.platform;
try {
    if (platform === "win32") {
        fs.symlinkSync(targetPath, linkPath, "junction");
        console.log(`[link-theme] 已创建 junction -> ${targetPath}`);
    } else {
        fs.symlinkSync(targetPath, linkPath, "dir");
        console.log(`[link-theme] 已创建 symlink -> ${targetPath}`);
    }
} catch (err) {
    console.error(`[link-theme] 创建链接失败：${err.message}`);
    console.error("请手动执行 PowerShell：");
    console.error(
        '  New-Item -ItemType Junction -Path "' +
            linkPath +
            '" -Target "' +
            targetPath +
            '"',
    );
    process.exit(1);
}

/**
 * Doki Engine 开发服务器
 *
 * 提供带有 HMR (热模块替换) 功能的开发服务器，
 * 支持文件监视、增量构建和浏览器自动刷新。
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import {
    existsSync,
    readFileSync,
    statSync,
    watch as fsWatch,
    type FSWatcher,
} from "fs";
import { join, relative, extname } from "path";
import chalk from "chalk";

/** WebSocket 客户端 */
interface WebSocketClient {
    socket: any;
    readyState: number;
    send: (data: string) => void;
    close: () => void;
}

/** 开发服务器选项 */
export interface DevServerOptions {
    /** 服务器端口 */
    port: number;
    /** 输出目录 */
    outputDir: string;
    /** 静态文件目录 */
    staticDir: string;
    /** 内容目录 */
    contentDir: string;
    /** 模板目录 */
    templateDir: string;
    /** 数据目录 */
    dataDir: string;
    /** 配置文件路径 */
    configPath: string;
    /** 是否自动打开浏览器 */
    open: boolean;
    /** 构建回调 */
    onBuild?: (
        filePath?: string,
    ) => Promise<{ success: boolean; errors: string[] }>;
    /** 错误回调 */
    onError?: (error: Error) => void;
}

/** 开发服务器状态 */
type ServerState = "idle" | "building" | "error";

/** HMR 客户端脚本 */
const HMR_CLIENT_SCRIPT = `
<script>
(function() {
    let ws;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    
    function connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(protocol + '//' + window.location.host + '/__hmr');
        
        ws.onopen = function() {
            console.log('[Doki HMR] Connected');
            reconnectAttempts = 0;
        };
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.type === 'reload') {
                console.log('[Doki HMR] Reloading...');
                window.location.reload();
            } else if (data.type === 'error') {
                showErrorOverlay(data.message, data.details);
            } else if (data.type === 'build-start') {
                hideErrorOverlay();
            }
        };
        
        ws.onclose = function() {
            reconnectAttempts++;
            if (reconnectAttempts < maxReconnectAttempts) {
                setTimeout(connect, 1000);
            }
        };
        
        ws.onerror = function(err) {
            console.error('[Doki HMR] Error:', err);
        };
    }
    
    function showErrorOverlay(message, details) {
        let overlay = document.getElementById('__doki_error_overlay__');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = '__doki_error_overlay__';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);color:#fff;font-family:monospace;padding:20px;z-index:99999;overflow:auto;';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = '<div style="max-width:900px;margin:0 auto;">' +
            '<h2 style="color:#ff6b6b;margin:0 0 15px 0;">⚠ Build Error</h2>' +
            '<pre style="background:#1a1a1a;padding:15px;border-radius:5px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(message) + '</pre>' +
            (details ? '<pre style="background:#1a1a1a;padding:15px;border-radius:5px;margin-top:10px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;">' + escapeHtml(details) + '</pre>' : '') +
            '</div>';
    }
    
    function hideErrorOverlay() {
        const overlay = document.getElementById('__doki_error_overlay__');
        if (overlay) {
            overlay.remove();
        }
    }
    
    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    connect();
})();
</script>
`;

/**
 * 开发服务器类
 */
export class DevServer {
    private options: DevServerOptions;
    private server: ReturnType<typeof createServer> | null = null;
    private wsClients: Set<WebSocketClient> = new Set();
    private watcher: FSWatcher | null = null;
    private state: ServerState = "idle";
    private lastErrors: string[] = [];
    private buildDebounce: NodeJS.Timeout | null = null;

    constructor(options: DevServerOptions) {
        this.options = options;
    }

    /**
     * 启动开发服务器
     */
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.server = createServer((req, res) =>
                    this.handleRequest(req, res),
                );

                this.server.on("upgrade", (req, socket, head) => {
                    if (req.url === "/__hmr") {
                        this.handleWebSocketUpgrade(req, socket, head);
                    }
                });

                this.server.listen(this.options.port, () => {
                    this.startWatcher();
                    resolve();
                });

                this.server.on("error", (err) => {
                    reject(err);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 停止开发服务器
     */
    async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.watcher) {
                this.watcher.close();
                this.watcher = null;
            }

            for (const client of this.wsClients) {
                client.close();
            }
            this.wsClients.clear();

            if (this.server) {
                this.server.close(() => resolve());
            } else {
                resolve();
            }
        });
    }

    /**
     * 处理 HTTP 请求
     */
    private handleRequest(req: IncomingMessage, res: ServerResponse): void {
        const url = req.url || "/";
        let filePath: string;

        if (url === "/" || url === "/index.html") {
            filePath = join(this.options.outputDir, "index.html");
        } else if (url.startsWith("/static/")) {
            filePath = join(this.options.staticDir, url.slice(8));
        } else {
            filePath = join(this.options.outputDir, url);
        }

        if (existsSync(filePath) && statSync(filePath).isFile()) {
            const content = readFileSync(filePath, "utf-8");
            const ext = extname(filePath);
            const contentType = this.getContentType(ext);

            if (ext === ".html") {
                const injectedContent = this.injectHmrScript(content);
                res.writeHead(200, { "Content-Type": contentType });
                res.end(injectedContent);
            } else {
                res.writeHead(200, { "Content-Type": contentType });
                res.end(content);
            }
        } else {
            const indexPath = join(this.options.outputDir, "index.html");
            if (existsSync(indexPath)) {
                const content = readFileSync(indexPath, "utf-8");
                const injectedContent = this.injectHmrScript(content);
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(injectedContent);
            } else {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("Not Found");
            }
        }
    }

    /**
     * 获取内容类型
     */
    private getContentType(ext: string): string {
        const types: Record<string, string> = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
            ".ttf": "font/ttf",
        };
        return types[ext] || "application/octet-stream";
    }

    /**
     * 注入 HMR 脚本
     */
    private injectHmrScript(content: string): string {
        if (content.includes("</head>")) {
            return content.replace("</head>", HMR_CLIENT_SCRIPT + "</head>");
        }
        if (content.includes("</body>")) {
            return content.replace("</body>", HMR_CLIENT_SCRIPT + "</body>");
        }
        return content + HMR_CLIENT_SCRIPT;
    }

    /**
     * 处理 WebSocket 升级
     */
    private handleWebSocketUpgrade(
        req: IncomingMessage,
        socket: any,
        _head: Buffer,
    ): void {
        const key = req.headers["sec-websocket-key"];
        if (!key) {
            socket.destroy();
            return;
        }

        const acceptKey = this.generateAcceptKey(key);

        socket.write(
            "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
                "\r\n",
        );

        const client: WebSocketClient = {
            socket,
            readyState: 1,
            send: (data: string) => {
                try {
                    const frame = this.createWebSocketFrame(data);
                    socket.write(frame);
                } catch {
                    // Ignore send errors
                }
            },
            close: () => {
                client.readyState = 3;
                socket.destroy();
            },
        };

        this.wsClients.add(client);

        socket.on("close", () => {
            this.wsClients.delete(client);
        });

        socket.on("error", () => {
            this.wsClients.delete(client);
        });

        if (this.state === "error" && this.lastErrors.length > 0) {
            client.send(
                JSON.stringify({
                    type: "error",
                    message: "Build Error",
                    details: this.lastErrors.join("\n"),
                }),
            );
        }
    }

    /**
     * 生成 WebSocket Accept Key
     */
    private generateAcceptKey(key: string): string {
        const crypto = require("crypto");
        return crypto
            .createHash("sha1")
            .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
            .digest("base64");
    }

    /**
     * 创建 WebSocket 帧
     */
    private createWebSocketFrame(data: string): Buffer {
        const payload = Buffer.from(data);
        const payloadLength = payload.length;

        let frame: Buffer;
        if (payloadLength <= 125) {
            frame = Buffer.alloc(2 + payloadLength);
            frame[0] = 0x81;
            frame[1] = payloadLength;
            payload.copy(frame, 2);
        } else if (payloadLength <= 65535) {
            frame = Buffer.alloc(4 + payloadLength);
            frame[0] = 0x81;
            frame[1] = 126;
            frame.writeUInt16BE(payloadLength, 2);
            payload.copy(frame, 4);
        } else {
            frame = Buffer.alloc(10 + payloadLength);
            frame[0] = 0x81;
            frame[1] = 127;
            frame.writeBigUInt64BE(BigInt(payloadLength), 2);
            payload.copy(frame, 10);
        }

        return frame;
    }

    /**
     * 启动文件监视器
     */
    private startWatcher(): void {
        const watchPaths = [
            this.options.contentDir,
            this.options.templateDir,
            this.options.staticDir,
            this.options.dataDir,
        ].filter(existsSync);

        if (existsSync(this.options.configPath)) {
            watchPaths.push(this.options.configPath);
        }

        if (watchPaths.length === 0) {
            return;
        }

        this.watcher = fsWatch(
            watchPaths[0],
            { recursive: true, persistent: true },
            (_eventType, filename) => {
                if (!filename) return;
                this.handleFileChange(join(watchPaths[0], filename));
            },
        );

        for (let i = 1; i < watchPaths.length; i++) {
            fsWatch(
                watchPaths[i],
                { recursive: true, persistent: true },
                (_eventType, filename) => {
                    if (!filename) return;
                    this.handleFileChange(join(watchPaths[i], filename));
                },
            );
        }
    }

    /**
     * 处理文件变更
     */
    private handleFileChange(filePath: string): void {
        if (this.buildDebounce) {
            clearTimeout(this.buildDebounce);
        }

        this.buildDebounce = setTimeout(() => {
            this.rebuild(filePath);
        }, 100);
    }

    /**
     * 重新构建
     */
    private async rebuild(filePath: string): Promise<void> {
        if (this.state === "building") return;

        const relativePath = relative(process.cwd(), filePath);
        console.log();
        console.log(chalk.blue("→ 文件已更改:"), chalk.gray(relativePath));

        if (filePath === this.options.configPath) {
            console.log(chalk.yellow("⚠ 配置文件已更改，可能需要重启服务器"));
            return;
        }

        this.state = "building";
        this.broadcast({ type: "build-start" });

        try {
            if (this.options.onBuild) {
                const result = await this.options.onBuild(filePath);

                if (result.success) {
                    this.state = "idle";
                    this.lastErrors = [];
                    console.log(chalk.green("✓ 构建完成"));
                    this.broadcast({ type: "reload" });
                } else {
                    this.state = "error";
                    this.lastErrors = result.errors;
                    console.log(chalk.red("✗ 构建失败"));
                    for (const error of result.errors) {
                        console.log(chalk.red(`  - ${error}`));
                    }
                    this.broadcast({
                        type: "error",
                        message: "Build Error",
                        details: result.errors.join("\n"),
                    });
                }
            }
        } catch (error) {
            this.state = "error";
            const message = (error as Error).message;
            this.lastErrors = [message];
            console.log(chalk.red("✗ 构建错误:"), message);
            this.broadcast({
                type: "error",
                message: "Build Error",
                details: message,
            });
        }
    }

    /**
     * 广播消息到所有 WebSocket 客户端
     */
    private broadcast(message: object): void {
        const data = JSON.stringify(message);
        for (const client of this.wsClients) {
            if (client.readyState === 1) {
                client.send(data);
            }
        }
    }
}

/**
 * 创建开发服务器
 */
export function createDevServer(options: DevServerOptions): DevServer {
    return new DevServer(options);
}

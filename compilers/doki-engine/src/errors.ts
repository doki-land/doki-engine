/**
 * Doki Engine 错误类型定义
 *
 * 定义了 Doki Engine 使用的错误类型，包括语法错误、引擎错误和结果类型。
 */

import type { TextRange } from "./types";

/**
 * 语法错误类型
 *
 * 表示 Doki 模板中的语法错误，包含错误消息和错误位置。
 */
export type SyntaxError = {
    type: "SyntaxError";
    message: string;
    range: TextRange;
};

/**
 * Doki 引擎错误类型
 *
 * 表示 Doki 引擎运行时的错误，包含错误消息。
 */
export type DejavuError = {
    type: "DejavuError";
    message: string;
};

/**
 * Doki 结果类型
 *
 * 表示 Doki 引擎操作的结果，可能是成功值或错误。
 */
export type DejavuResult<T> =
    | {
          type: "ok";
          value: T;
      }
    | {
          type: "err";
          error: SyntaxError | DejavuError;
      };

/**
 * Doki 异常类
 *
 * 用于在 JavaScript/TypeScript 中抛出 Doki 错误。
 */
export class DejavuException extends Error {
    /**
     * 构造函数
     *
     * @param error Doki 错误
     */
    constructor(public error: SyntaxError | DejavuError) {
        super(error.message);
        this.name = "DejavuException";
    }
}

/**
 * 创建语法错误
 *
 * @param message 错误消息
 * @param range 错误位置
 * @returns 语法错误
 */
export function syntaxError(message: string, range: TextRange): SyntaxError {
    return { type: "SyntaxError", message, range };
}

/**
 * 创建 Doki 语法错误
 *
 * @param message 错误消息
 * @param range 错误位置
 * @returns Doki 错误
 */
export function dejavuSyntaxError(
    message: string,
    range: TextRange,
): DejavuError {
    return {
        type: "DejavuError",
        message: `Syntax error: ${message} at position ${range.start}-${range.end}`,
    };
}

/**
 * 创建成功结果
 *
 * @param value 成功值
 * @returns 成功结果
 */
export function ok<T>(value: T): DejavuResult<T> {
    return { type: "ok", value };
}

/**
 * 创建错误结果
 *
 * @param error 错误
 * @returns 错误结果
 */
export function err<T>(error: SyntaxError | DejavuError): DejavuResult<T> {
    return { type: "err", error };
}

/**
 * Doki Engine 基础类型定义
 *
 * 定义了 Doki Engine 使用的基本数据类型，包括值类型、对象类型、URL 类型和文本范围类型。
 */

/**
 * 值类型
 *
 * 表示 Doki 模板中可以使用的值类型。
 */
export type Value =
    | {
          type: "null";
      }
    | {
          type: "bool";
          value: boolean;
      }
    | {
          type: "integer";
          value: number;
      }
    | {
          type: "decimal";
          value: number;
      }
    | {
          type: "string";
          value: string;
      }
    | {
          type: "object";
          value: Object;
      };

/**
 * 对象类型
 *
 * 表示 Doki 模板中使用的对象类型，由键值对组成。
 */
export type Object = {
    [key: string]: Value;
};

/**
 * URL 类型
 *
 * 表示 Doki 模板中使用的 URL 类型。
 */
export type Url = string;

/**
 * 文本范围类型
 *
 * 表示源代码中的文本范围，包含起始和结束位置。
 */
export type TextRange = {
    start: number;
    end: number;
};

/**
 * 创建 null 值
 *
 * @returns null 值
 */
export function nullValue(): Value {
    return { type: "null" };
}

/**
 * 创建布尔值
 *
 * @param value 布尔值
 * @returns 布尔值类型的 Value
 */
export function boolValue(value: boolean): Value {
    return { type: "bool", value };
}

/**
 * 创建整数值
 *
 * @param value 整数值
 * @returns 整数类型的 Value
 */
export function integerValue(value: number): Value {
    return { type: "integer", value: Math.floor(value) };
}

/**
 * 创建小数值
 *
 * @param value 小数值
 * @returns 小数类型的 Value
 */
export function decimalValue(value: number): Value {
    return { type: "decimal", value };
}

/**
 * 创建字符串值
 *
 * @param value 字符串值
 * @returns 字符串类型的 Value
 */
export function stringValue(value: string): Value {
    return { type: "string", value };
}

/**
 * 创建空对象
 *
 * @returns 空对象类型的 Value
 */
export function emptyObject(): Value {
    return { type: "object", value: {} };
}

/**
 * 从键值对创建对象
 *
 * @param obj 键值对对象
 * @returns 对象类型的 Value
 */
export function objectFrom(obj: Object): Value {
    return { type: "object", value: obj };
}

/**
 * 创建文本范围
 *
 * @param start 起始位置
 * @param end 结束位置
 * @returns 文本范围
 */
export function textRange(start: number, end: number): TextRange {
    return { start, end };
}

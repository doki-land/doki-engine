/**
 * Doki Engine 语法树类型定义
 *
 * 定义了 Doki Engine 使用的语法树节点类型，包括模板模式、空白控制、
 * 二元操作、一元操作、模式、过滤器、表达式、导出、模板声明、文本元素、
 * 表达式元素、条件块、循环块、变量声明、调用块、扩展语句、块语句、
 * 包含语句、宏定义、宏调用、元素和模板等类型。
 */

import type { TextRange, Value } from "./types";

/**
 * 模板模式
 *
 * 表示 Doki 模板的渲染模式。
 */
export type TemplateMode =
    | {
          type: "html";
      }
    | {
          type: "json";
      }
    | {
          type: "text";
      }
    | {
          type: "custom";
          name: string;
      };

/**
 * 空白控制
 *
 * 表示 Doki 模板中空白的处理方式。
 */
export type WhitespaceControl =
    | {
          type: "preserve";
      }
    | {
          type: "trim";
      }
    | {
          type: "trim-left";
      }
    | {
          type: "trim-right";
      }
    | {
          type: "trim-space";
      }
    | {
          type: "trim-all";
      };

/**
 * 二元操作
 *
 * 表示 Doki 模板中的二元操作符。
 */
export type BinaryOp =
    | {
          type: "add";
      }
    | {
          type: "sub";
      }
    | {
          type: "mul";
      }
    | {
          type: "div";
      }
    | {
          type: "mod";
      }
    | {
          type: "eq";
      }
    | {
          type: "ne";
      }
    | {
          type: "lt";
      }
    | {
          type: "le";
      }
    | {
          type: "gt";
      }
    | {
          type: "ge";
      }
    | {
          type: "and";
      }
    | {
          type: "or";
      }
    | {
          type: "concat";
      };

/**
 * 一元操作
 *
 * 表示 Doki 模板中的一元操作符。
 */
export type UnaryOp =
    | {
          type: "not";
      }
    | {
          type: "neg";
      };

/**
 * 模式
 *
 * 表示 Doki 模板中的模式匹配。
 */
export type Pattern =
    | {
          type: "identifier";
          name: string;
      }
    | {
          type: "tuple";
          patterns: Pattern[];
      }
    | {
          type: "array";
          pattern: Pattern;
      }
    | {
          type: "object";
          fields: {
              key: string;
              pattern: Pattern;
          }[];
      };

/**
 * 过滤器
 *
 * 表示 Doki 模板中的过滤器。
 */
export type Filter = {
    name: string;
    args: Expr[];
    range: TextRange;
};

/**
 * 表达式
 *
 * 表示 Doki 模板中的表达式。
 */
export type Expr =
    | {
          type: "literal";
          value: Value;
          range: TextRange;
      }
    | {
          type: "variable";
          name: string;
          range: TextRange;
      }
    | {
          type: "binary";
          op: BinaryOp;
          left: Expr;
          right: Expr;
          range: TextRange;
      }
    | {
          type: "unary";
          op: UnaryOp;
          expr: Expr;
          range: TextRange;
      }
    | {
          type: "call";
          callee: Expr;
          args: Expr[];
          range: TextRange;
      }
    | {
          type: "property";
          expr: Expr;
          name: string;
          range: TextRange;
      }
    | {
          type: "method";
          expr: Expr;
          name: string;
          args: Expr[];
          range: TextRange;
      }
    | {
          type: "index";
          expr: Expr;
          index: Expr;
          range: TextRange;
      }
    | {
          type: "array";
          items: Expr[];
          range: TextRange;
      }
    | {
          type: "object";
          fields: {
              key: string;
              value: Expr;
          }[];
          range: TextRange;
      }
    | {
          type: "tuple";
          items: Expr[];
          range: TextRange;
      }
    | {
          type: "group";
          expr: Expr;
          range: TextRange;
      }
    | {
          type: "filter";
          expr: Expr;
          filters: Filter[];
          range: TextRange;
      };

/**
 * 导出
 *
 * 表示 Doki 模板中的导出声明。
 */
export type Export = {
    name: string;
    expr: Expr;
    range: TextRange;
};

/**
 * 模板声明
 *
 * 表示 Doki 模板中的模板声明。
 */
export type TemplateDeclaration = {
    name: string;
    params: Pattern[];
    body: Element[];
    range: TextRange;
};

/**
 * 文本元素
 *
 * 表示 Doki 模板中的文本元素。
 */
export type TextElement = {
    type: "text";
    content: string;
    range: TextRange;
};

/**
 * 表达式元素
 *
 * 表示 Doki 模板中的表达式元素。
 */
export type Expression = {
    type: "expression";
    expr: Expr;
    range: TextRange;
};

/**
 * 条件分支
 *
 * 表示 Doki 模板中的条件分支。
 */
export type IfBranch = {
    condition: Expr;
    body: Element[];
    range: TextRange;
};

/**
 * 条件块
 *
 * 表示 Doki 模板中的条件块。
 */
export type IfBlock = {
    type: "if";
    branches: IfBranch[];
    else_body: Element[];
    range: TextRange;
};

/**
 * 循环块
 *
 * 表示 Doki 模板中的循环块。
 */
export type ForBlock = {
    type: "for";
    pattern: Pattern;
    expr: Expr;
    body: Element[];
    else_body: Element[];
    range: TextRange;
};

/**
 * 变量声明
 *
 * 表示 Doki 模板中的变量声明。
 */
export type LetStatement = {
    type: "let";
    pattern: Pattern;
    expr: Expr;
    body: Element[];
    range: TextRange;
};

/**
 * 调用块
 *
 * 表示 Doki 模板中的调用块。
 */
export type CallBlock = {
    type: "call";
    expr: Expr;
    args: Expr[];
    body: Element[];
    range: TextRange;
};

/**
 * 扩展语句
 *
 * 表示 Doki 模板中的扩展语句。
 */
export type Extends = {
    type: "extends";
    template: Expr;
    range: TextRange;
};

/**
 * 块语句
 *
 * 表示 Doki 模板中的块语句。
 */
export type Block = {
    type: "block";
    name: string;
    body: Element[];
    range: TextRange;
};

/**
 * 包含语句
 *
 * 表示 Doki 模板中的包含语句。
 */
export type Include = {
    type: "include";
    template: Expr;
    args: Expr[];
    range: TextRange;
};

/**
 * 宏定义
 *
 * 表示 Doki 模板中的宏定义。
 */
export type MacroDefinition = {
    type: "macro";
    name: string;
    params: Pattern[];
    body: Element[];
    range: TextRange;
};

/**
 * 宏调用
 *
 * 表示 Doki 模板中的宏调用。
 */
export type MacroCall = {
    type: "macro-call";
    name: string;
    args: Expr[];
    range: TextRange;
};

/**
 * 元素
 *
 * 表示 Doki 模板中的元素。
 */
export type Element =
    | TextElement
    | Expression
    | IfBlock
    | ForBlock
    | LetStatement
    | CallBlock
    | Extends
    | Block
    | Include
    | MacroDefinition
    | MacroCall;

/**
 * 模板
 *
 * 表示 Doki 模板。
 */
export type Template = {
    mode: TemplateMode;
    whitespace: WhitespaceControl;
    elements: Element[];
    exports: Export[];
    declarations: TemplateDeclaration[];
};

/**
 * 创建 HTML 模板模式
 *
 * @returns HTML 模板模式
 */
export function templateModeHtml(): TemplateMode {
    return { type: "html" };
}

/**
 * 创建 JSON 模板模式
 *
 * @returns JSON 模板模式
 */
export function templateModeJson(): TemplateMode {
    return { type: "json" };
}

/**
 * 创建文本模板模式
 *
 * @returns 文本模板模式
 */
export function templateModeText(): TemplateMode {
    return { type: "text" };
}

/**
 * 创建自定义模板模式
 *
 * @param name 自定义模式名称
 * @returns 自定义模板模式
 */
export function templateModeCustom(name: string): TemplateMode {
    return { type: "custom", name };
}

/**
 * 创建保留空白控制
 *
 * @returns 保留空白控制
 */
export function whitespaceControlPreserve(): WhitespaceControl {
    return { type: "preserve" };
}

/**
 * 创建修剪空白控制
 *
 * @returns 修剪空白控制
 */
export function whitespaceControlTrim(): WhitespaceControl {
    return { type: "trim" };
}

/**
 * 创建左侧修剪空白控制
 *
 * @returns 左侧修剪空白控制
 */
export function whitespaceControlTrimLeft(): WhitespaceControl {
    return { type: "trim-left" };
}

/**
 * 创建右侧修剪空白控制
 *
 * @returns 右侧修剪空白控制
 */
export function whitespaceControlTrimRight(): WhitespaceControl {
    return { type: "trim-right" };
}

/**
 * 创建修剪空格空白控制
 *
 * @returns 修剪空格空白控制
 */
export function whitespaceControlTrimSpace(): WhitespaceControl {
    return { type: "trim-space" };
}

/**
 * 创建修剪所有空白控制
 *
 * @returns 修剪所有空白控制
 */
export function whitespaceControlTrimAll(): WhitespaceControl {
    return { type: "trim-all" };
}

/**
 * 创建加法二元操作
 *
 * @returns 加法二元操作
 */
export function binaryOpAdd(): BinaryOp {
    return { type: "add" };
}

/**
 * 创建减法二元操作
 *
 * @returns 减法二元操作
 */
export function binaryOpSub(): BinaryOp {
    return { type: "sub" };
}

/**
 * 创建乘法二元操作
 *
 * @returns 乘法二元操作
 */
export function binaryOpMul(): BinaryOp {
    return { type: "mul" };
}

/**
 * 创建除法二元操作
 *
 * @returns 除法二元操作
 */
export function binaryOpDiv(): BinaryOp {
    return { type: "div" };
}

/**
 * 创建取模二元操作
 *
 * @returns 取模二元操作
 */
export function binaryOpMod(): BinaryOp {
    return { type: "mod" };
}

/**
 * 创建等于二元操作
 *
 * @returns 等于二元操作
 */
export function binaryOpEq(): BinaryOp {
    return { type: "eq" };
}

/**
 * 创建不等于二元操作
 *
 * @returns 不等于二元操作
 */
export function binaryOpNe(): BinaryOp {
    return { type: "ne" };
}

/**
 * 创建小于二元操作
 *
 * @returns 小于二元操作
 */
export function binaryOpLt(): BinaryOp {
    return { type: "lt" };
}

/**
 * 创建小于等于二元操作
 *
 * @returns 小于等于二元操作
 */
export function binaryOpLe(): BinaryOp {
    return { type: "le" };
}

/**
 * 创建大于二元操作
 *
 * @returns 大于二元操作
 */
export function binaryOpGt(): BinaryOp {
    return { type: "gt" };
}

/**
 * 创建大于等于二元操作
 *
 * @returns 大于等于二元操作
 */
export function binaryOpGe(): BinaryOp {
    return { type: "ge" };
}

/**
 * 创建逻辑与二元操作
 *
 * @returns 逻辑与二元操作
 */
export function binaryOpAnd(): BinaryOp {
    return { type: "and" };
}

/**
 * 创建逻辑或二元操作
 *
 * @returns 逻辑或二元操作
 */
export function binaryOpOr(): BinaryOp {
    return { type: "or" };
}

/**
 * 创建连接二元操作
 *
 * @returns 连接二元操作
 */
export function binaryOpConcat(): BinaryOp {
    return { type: "concat" };
}

/**
 * 创建逻辑非一元操作
 *
 * @returns 逻辑非一元操作
 */
export function unaryOpNot(): UnaryOp {
    return { type: "not" };
}

/**
 * 创建取反一元操作
 *
 * @returns 取反一元操作
 */
export function unaryOpNeg(): UnaryOp {
    return { type: "neg" };
}

/**
 * 创建标识符模式
 *
 * @param name 标识符名称
 * @returns 标识符模式
 */
export function patternIdentifier(name: string): Pattern {
    return { type: "identifier", name };
}

/**
 * 创建元组模式
 *
 * @param patterns 模式数组
 * @returns 元组模式
 */
export function patternTuple(patterns: Pattern[]): Pattern {
    return { type: "tuple", patterns };
}

/**
 * 创建数组模式
 *
 * @param pattern 模式
 * @returns 数组模式
 */
export function patternArray(pattern: Pattern): Pattern {
    return { type: "array", pattern };
}

/**
 * 创建对象模式
 *
 * @param fields 字段数组
 * @returns 对象模式
 */
export function patternObject(
    fields: { key: string; pattern: Pattern }[],
): Pattern {
    return { type: "object", fields };
}

/**
 * 创建过滤器
 *
 * @param name 过滤器名称
 * @param args 参数表达式数组
 * @param range 文本范围
 * @returns 过滤器
 */
export function filter(name: string, args: Expr[], range: TextRange): Filter {
    return { name, args, range };
}

/**
 * 创建字面量表达式
 *
 * @param value 值
 * @param range 文本范围
 * @returns 字面量表达式
 */
export function exprLiteral(value: Value, range: TextRange): Expr {
    return { type: "literal", value, range };
}

/**
 * 创建变量表达式
 *
 * @param name 变量名称
 * @param range 文本范围
 * @returns 变量表达式
 */
export function exprVariable(name: string, range: TextRange): Expr {
    return { type: "variable", name, range };
}

/**
 * 创建二元表达式
 *
 * @param op 二元操作
 * @param left 左侧表达式
 * @param right 右侧表达式
 * @param range 文本范围
 * @returns 二元表达式
 */
export function exprBinary(
    op: BinaryOp,
    left: Expr,
    right: Expr,
    range: TextRange,
): Expr {
    return { type: "binary", op, left, right, range };
}

/**
 * 创建一元表达式
 *
 * @param op 一元操作
 * @param expr 表达式
 * @param range 文本范围
 * @returns 一元表达式
 */
export function exprUnary(op: UnaryOp, expr: Expr, range: TextRange): Expr {
    return { type: "unary", op, expr, range };
}

/**
 * 创建调用表达式
 *
 * @param callee 被调用表达式
 * @param args 参数表达式数组
 * @param range 文本范围
 * @returns 调用表达式
 */
export function exprCall(callee: Expr, args: Expr[], range: TextRange): Expr {
    return { type: "call", callee, args, range };
}

/**
 * 创建属性表达式
 *
 * @param expr 表达式
 * @param name 属性名称
 * @param range 文本范围
 * @returns 属性表达式
 */
export function exprProperty(expr: Expr, name: string, range: TextRange): Expr {
    return { type: "property", expr, name, range };
}

/**
 * 创建方法表达式
 *
 * @param expr 表达式
 * @param name 方法名称
 * @param args 参数表达式数组
 * @param range 文本范围
 * @returns 方法表达式
 */
export function exprMethod(
    expr: Expr,
    name: string,
    args: Expr[],
    range: TextRange,
): Expr {
    return { type: "method", expr, name, args, range };
}

/**
 * 创建索引表达式
 *
 * @param expr 表达式
 * @param index 索引表达式
 * @param range 文本范围
 * @returns 索引表达式
 */
export function exprIndex(expr: Expr, index: Expr, range: TextRange): Expr {
    return { type: "index", expr, index, range };
}

/**
 * 创建数组表达式
 *
 * @param items 元素表达式数组
 * @param range 文本范围
 * @returns 数组表达式
 */
export function exprArray(items: Expr[], range: TextRange): Expr {
    return { type: "array", items, range };
}

/**
 * 创建对象表达式
 *
 * @param fields 字段数组
 * @param range 文本范围
 * @returns 对象表达式
 */
export function exprObject(
    fields: { key: string; value: Expr }[],
    range: TextRange,
): Expr {
    return { type: "object", fields, range };
}

/**
 * 创建元组表达式
 *
 * @param items 元素表达式数组
 * @param range 文本范围
 * @returns 元组表达式
 */
export function exprTuple(items: Expr[], range: TextRange): Expr {
    return { type: "tuple", items, range };
}

/**
 * 创建分组表达式
 *
 * @param expr 表达式
 * @param range 文本范围
 * @returns 分组表达式
 */
export function exprGroup(expr: Expr, range: TextRange): Expr {
    return { type: "group", expr, range };
}

/**
 * 创建过滤器表达式
 *
 * @param expr 表达式
 * @param filters 过滤器数组
 * @param range 文本范围
 * @returns 过滤器表达式
 */
export function exprFilter(
    expr: Expr,
    filters: Filter[],
    range: TextRange,
): Expr {
    return { type: "filter", expr, filters, range };
}

/**
 * 创建导出声明
 *
 * @param name 导出名称
 * @param expr 表达式
 * @param range 文本范围
 * @returns 导出声明
 */
export function exportDeclaration(
    name: string,
    expr: Expr,
    range: TextRange,
): Export {
    return { name, expr, range };
}

/**
 * 创建模板声明
 *
 * @param name 模板名称
 * @param params 参数模式数组
 * @param body 元素数组
 * @param range 文本范围
 * @returns 模板声明
 */
export function templateDeclaration(
    name: string,
    params: Pattern[],
    body: Element[],
    range: TextRange,
): TemplateDeclaration {
    return { name, params, body, range };
}

/**
 * 创建文本元素
 *
 * @param content 文本内容
 * @param range 文本范围
 * @returns 文本元素
 */
export function textElement(content: string, range: TextRange): TextElement {
    return { type: "text", content, range };
}

/**
 * 创建表达式元素
 *
 * @param expr 表达式
 * @param range 文本范围
 * @returns 表达式元素
 */
export function expression(expr: Expr, range: TextRange): Expression {
    return { type: "expression", expr, range };
}

/**
 * 创建条件分支
 *
 * @param condition 条件表达式
 * @param body 元素数组
 * @param range 文本范围
 * @returns 条件分支
 */
export function ifBranch(
    condition: Expr,
    body: Element[],
    range: TextRange,
): IfBranch {
    return { condition, body, range };
}

/**
 * 创建条件块
 *
 * @param branches 条件分支数组
 * @param else_body 否则体元素数组
 * @param range 文本范围
 * @returns 条件块
 */
export function ifBlock(
    branches: IfBranch[],
    else_body: Element[],
    range: TextRange,
): IfBlock {
    return { type: "if", branches, else_body, range };
}

/**
 * 创建循环块
 *
 * @param pattern 模式
 * @param expr 表达式
 * @param body 体元素数组
 * @param else_body 否则体元素数组
 * @param range 文本范围
 * @returns 循环块
 */
export function forBlock(
    pattern: Pattern,
    expr: Expr,
    body: Element[],
    else_body: Element[],
    range: TextRange,
): ForBlock {
    return { type: "for", pattern, expr, body, else_body, range };
}

/**
 * 创建变量声明
 *
 * @param pattern 模式
 * @param expr 表达式
 * @param body 体元素数组
 * @param range 文本范围
 * @returns 变量声明
 */
export function letStatement(
    pattern: Pattern,
    expr: Expr,
    body: Element[],
    range: TextRange,
): LetStatement {
    return { type: "let", pattern, expr, body, range };
}

/**
 * 创建调用块
 *
 * @param expr 表达式
 * @param args 参数表达式数组
 * @param body 体元素数组
 * @param range 文本范围
 * @returns 调用块
 */
export function callBlock(
    expr: Expr,
    args: Expr[],
    body: Element[],
    range: TextRange,
): CallBlock {
    return { type: "call", expr, args, body, range };
}

/**
 * 创建扩展语句
 *
 * @param template 模板表达式
 * @param range 文本范围
 * @returns 扩展语句
 */
export function extendsStatement(template: Expr, range: TextRange): Extends {
    return { type: "extends", template, range };
}

/**
 * 创建块语句
 *
 * @param name 块名称
 * @param body 体元素数组
 * @param range 文本范围
 * @returns 块语句
 */
export function block(name: string, body: Element[], range: TextRange): Block {
    return { type: "block", name, body, range };
}

/**
 * 创建包含语句
 *
 * @param template 模板表达式
 * @param args 参数表达式数组
 * @param range 文本范围
 * @returns 包含语句
 */
export function includeStatement(
    template: Expr,
    args: Expr[],
    range: TextRange,
): Include {
    return { type: "include", template, args, range };
}

/**
 * 创建宏定义
 *
 * @param name 宏名称
 * @param params 参数模式数组
 * @param body 体元素数组
 * @param range 文本范围
 * @returns 宏定义
 */
export function macroDefinition(
    name: string,
    params: Pattern[],
    body: Element[],
    range: TextRange,
): MacroDefinition {
    return { type: "macro", name, params, body, range };
}

/**
 * 创建宏调用
 *
 * @param name 宏名称
 * @param args 参数表达式数组
 * @param range 文本范围
 * @returns 宏调用
 */
export function macroCall(
    name: string,
    args: Expr[],
    range: TextRange,
): MacroCall {
    return { type: "macro-call", name, args, range };
}

/**
 * 创建文本元素
 *
 * @param element 文本元素
 * @returns 元素
 */
export function elementText(element: TextElement): Element {
    return element;
}

/**
 * 创建表达式元素
 *
 * @param element 表达式元素
 * @returns 元素
 */
export function elementExpression(element: Expression): Element {
    return element;
}

/**
 * 创建条件块元素
 *
 * @param element 条件块
 * @returns 元素
 */
export function elementIf(element: IfBlock): Element {
    return element;
}

/**
 * 创建循环块元素
 *
 * @param element 循环块
 * @returns 元素
 */
export function elementFor(element: ForBlock): Element {
    return element;
}

/**
 * 创建变量声明元素
 *
 * @param element 变量声明
 * @returns 元素
 */
export function elementLet(element: LetStatement): Element {
    return element;
}

/**
 * 创建调用块元素
 *
 * @param element 调用块
 * @returns 元素
 */
export function elementCall(element: CallBlock): Element {
    return element;
}

/**
 * 创建扩展语句元素
 *
 * @param element 扩展语句
 * @returns 元素
 */
export function elementExtends(element: Extends): Element {
    return element;
}

/**
 * 创建块语句元素
 *
 * @param element 块语句
 * @returns 元素
 */
export function elementBlock(element: Block): Element {
    return element;
}

/**
 * 创建包含语句元素
 *
 * @param element 包含语句
 * @returns 元素
 */
export function elementInclude(element: Include): Element {
    return element;
}

/**
 * 创建宏定义元素
 *
 * @param element 宏定义
 * @returns 元素
 */
export function elementMacroDefinition(element: MacroDefinition): Element {
    return element;
}

/**
 * 创建宏调用元素
 *
 * @param element 宏调用
 * @returns 元素
 */
export function elementMacroCall(element: MacroCall): Element {
    return element;
}

/**
 * 创建模板
 *
 * @param mode 模板模式
 * @param whitespace 空白控制
 * @param elements 元素数组
 * @param exports 导出数组
 * @param declarations 模板声明数组
 * @returns 模板
 */
export function template(
    mode: TemplateMode | undefined,
    whitespace: WhitespaceControl | undefined,
    elements: Element[],
    exports: Export[] = [],
    declarations: TemplateDeclaration[] = [],
): Template {
    return {
        mode: mode || templateModeHtml(),
        whitespace: whitespace || whitespaceControlPreserve(),
        elements,
        exports,
        declarations,
    };
}

/**
 * 创建空模板
 *
 * @returns 空模板
 */
export function emptyTemplate(): Template {
    return template(undefined, undefined, []);
}

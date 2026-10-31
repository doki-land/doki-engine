/** Doki Engine 菜单系统 */

import type { MenuItem } from "./config.js";

/** 带有子菜单的菜单项 */
export interface MenuTreeNode extends MenuItem {
    /** 子菜单项 */
    children?: MenuTreeNode[];
    /** 是否为当前活动菜单项 */
    active?: boolean;
}

/**
 * 构建嵌套菜单树
 * 将扁平的菜单项列表转换为带有层级结构的菜单树
 * @param items 扁平的菜单项数组
 * @returns 嵌套的菜单树数组
 */
export function buildMenuTree(items: MenuItem[]): MenuTreeNode[] {
    const itemMap = new Map<string, MenuTreeNode>();
    const rootItems: MenuTreeNode[] = [];

    for (const item of items) {
        const node: MenuTreeNode = { ...item };
        itemMap.set(item.identifier, node);
    }

    for (const item of items) {
        const node = itemMap.get(item.identifier)!;

        if (item.parent) {
            const parentNode = itemMap.get(item.parent);
            if (parentNode) {
                if (!parentNode.children) {
                    parentNode.children = [];
                }
                parentNode.children.push(node);
            } else {
                rootItems.push(node);
            }
        } else {
            rootItems.push(node);
        }
    }

    sortMenuItems(rootItems);

    for (const node of itemMap.values()) {
        if (node.children && node.children.length > 0) {
            sortMenuItems(node.children);
        }
    }

    return rootItems;
}

/**
 * 对菜单项按权重排序
 * @param items 菜单项数组
 */
function sortMenuItems(items: MenuTreeNode[]): void {
    items.sort((a, b) => {
        const weightA = a.weight ?? 0;
        const weightB = b.weight ?? 0;
        return weightA - weightB;
    });
}

/**
 * 检测当前活动菜单项
 * 根据当前 URL 匹配最合适的菜单项并标记为活动状态
 * @param menu 菜单树数组
 * @param currentUrl 当前页面 URL
 * @returns 匹配的活动菜单项，如果没有匹配则返回 null
 */
export function getActiveMenu(
    menu: MenuTreeNode[],
    currentUrl: string,
): MenuTreeNode | null {
    const normalizedCurrentUrl = normalizeUrl(currentUrl);
    let bestMatch: MenuTreeNode | null = null;
    let bestMatchLength = 0;

    for (const item of menu) {
        const match = findBestMatch(item, normalizedCurrentUrl, 0);
        if (match && match.urlLength > bestMatchLength) {
            bestMatch = match.node;
            bestMatchLength = match.urlLength;
        }
    }

    if (bestMatch) {
        markActive(menu, bestMatch.identifier);
    }

    return bestMatch;
}

/**
 * 递归查找最佳匹配的菜单项
 * @param node 当前菜单节点
 * @param currentUrl 当前 URL
 * @param parentLength 父级匹配长度
 * @returns 匹配结果，包含节点和匹配长度
 */
function findBestMatch(
    node: MenuTreeNode,
    currentUrl: string,
    parentLength: number,
): { node: MenuTreeNode; urlLength: number } | null {
    let bestMatch: { node: MenuTreeNode; urlLength: number } | null = null;
    let currentMatchLength = 0;

    if (node.url) {
        const normalizedMenuUrl = normalizeUrl(node.url);
        if (
            currentUrl === normalizedMenuUrl ||
            currentUrl.startsWith(`${normalizedMenuUrl}/`) ||
            currentUrl.startsWith(`${normalizedMenuUrl}?`)
        ) {
            currentMatchLength = normalizedMenuUrl.length;

            if (currentMatchLength > parentLength) {
                bestMatch = { node, urlLength: currentMatchLength };
            }
        }
    }

    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            const childMatch = findBestMatch(
                child,
                currentUrl,
                currentMatchLength,
            );
            if (
                childMatch &&
                (!bestMatch || childMatch.urlLength > bestMatch.urlLength)
            ) {
                bestMatch = childMatch;
            }
        }
    }

    return bestMatch;
}

/**
 * 标记指定标识的菜单项为活动状态
 * @param menu 菜单树数组
 * @param identifier 目标菜单项标识
 */
function markActive(menu: MenuTreeNode[], identifier: string): void {
    for (const item of menu) {
        if (item.identifier === identifier) {
            item.active = true;
            return;
        }
        if (item.children) {
            markActive(item.children, identifier);
        }
    }
}

/**
 * 规范化 URL
 * 移除末尾斜杠和查询参数，确保一致性比较
 * @param url 原始 URL
 * @returns 规范化后的 URL
 */
function normalizeUrl(url: string): string {
    let normalized = url.split("?")[0].split("#")[0];
    if (normalized.length > 1 && normalized.endsWith("/")) {
        normalized = normalized.slice(0, -1);
    }
    if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
    }
    return normalized;
}

/**
 * 构建菜单上下文数据
 * 将菜单配置转换为模板可用的菜单树结构
 * @param menusConfig 菜单配置对象
 * @param currentUrl 当前页面 URL（可选）
 * @returns 菜单上下文对象
 */
export function buildMenuContext(
    menusConfig: Record<string, MenuItem[]> | undefined,
    currentUrl?: string,
): Record<string, MenuTreeNode[]> {
    if (!menusConfig) {
        return {};
    }

    const context: Record<string, MenuTreeNode[]> = {};

    for (const [menuName, items] of Object.entries(menusConfig)) {
        const menuTree = buildMenuTree(items);

        if (currentUrl) {
            getActiveMenu(menuTree, currentUrl);
        }

        context[menuName] = menuTree;
    }

    return context;
}

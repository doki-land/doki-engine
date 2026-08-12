/**
 * Doki Engine 分页系统模块
 *
 * 提供内容分页功能，支持生成分页信息和导航。
 */

/**
 * 页面信息接口
 *
 * 表示单个分页页面的信息，包含页码、URL 和内容项。
 */
export interface PageInfo<T> {
    /**
     * 页码
     *
     * 从 1 开始的页码索引。
     */
    index: number;

    /**
     * 页面 URL
     *
     * 当前页面的访问地址。
     */
    url: string;

    /**
     * 当前页的内容项
     *
     * 当前页面包含的所有内容项列表。
     */
    items: T[];
}

/**
 * 分页器接口
 *
 * 表示完整的分页信息，包含所有分页和导航信息。
 */
export interface Paginator<T> {
    /**
     * 所有分页
     *
     * 包含所有页面信息的数组。
     */
    pages: PageInfo<T>[];

    /**
     * 当前页码
     *
     * 当前所在的页面索引，从 1 开始。
     */
    currentPage: number;

    /**
     * 总页数
     *
     * 分页后的总页面数量。
     */
    totalPages: number;

    /**
     * 总内容数
     *
     * 所有页面包含的内容项总数。
     */
    totalItems: number;

    /**
     * 每页内容数
     *
     * 每个页面最大包含的内容项数量。
     */
    itemsPerPage: number;

    /**
     * 下一页
     *
     * 下一页的页面信息，如果没有下一页则为 null。
     */
    next: PageInfo<T> | null;

    /**
     * 上一页
     *
     * 上一页的页面信息，如果没有上一页则为 null。
     */
    previous: PageInfo<T> | null;

    /**
     * 第一页
     *
     * 分页中的第一个页面信息。
     */
    first: PageInfo<T>;

    /**
     * 最后一页
     *
     * 分页中的最后一个页面信息。
     */
    last: PageInfo<T>;
}

/**
 * 生成分页 URL
 *
 * 根据基础 URL 和页码生成格式如 `/page/2/` 的分页 URL。
 * 第一页返回基础 URL 本身，其他页返回 `/page/{n}/` 格式的 URL。
 *
 * @param baseUrl 基础 URL
 * @param page 页码，从 1 开始
 * @returns 生成的分页 URL
 */
export function getPaginationUrl(baseUrl: string, page: number): string {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

    if (page <= 1) {
        return normalizedBaseUrl;
    }

    return `${normalizedBaseUrl}page/${page}/`;
}

/**
 * 创建所有分页页面信息
 *
 * 将内容列表分页并创建所有页面的信息。
 *
 * @param items 要分页的内容项列表
 * @param itemsPerPage 每页内容项数量
 * @param baseUrl 基础 URL
 * @returns 所有分页页面的信息数组
 */
export function createPaginatedPages<T>(
    items: T[],
    itemsPerPage: number,
    baseUrl: string,
): PageInfo<T>[] {
    if (items.length === 0) {
        return [
            {
                index: 1,
                url: getPaginationUrl(baseUrl, 1),
                items: [],
            },
        ];
    }

    const pages: PageInfo<T>[] = [];
    const totalPages = Math.ceil(items.length / itemsPerPage);

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        const pageNumber = pageIndex + 1;
        const startIndex = pageIndex * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, items.length);
        const pageItems = items.slice(startIndex, endIndex);

        pages.push({
            index: pageNumber,
            url: getPaginationUrl(baseUrl, pageNumber),
            items: pageItems,
        });
    }

    return pages;
}

/**
 * 执行分页
 *
 * 将内容列表分页并生成完整的分页器对象。
 * 分页器包含所有分页信息和导航功能。
 *
 * @param items 要分页的内容项列表
 * @param itemsPerPage 每页内容项数量
 * @param urlGenerator URL 生成函数，接收页码参数返回对应的 URL
 * @returns 包含所有分页信息的分页器对象
 */
export function paginate<T>(
    items: T[],
    itemsPerPage: number,
    urlGenerator: (page: number) => string,
): Paginator<T> {
    const pages: PageInfo<T>[] = [];
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (totalPages === 0) {
        return {
            pages: [],
            currentPage: 0,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage,
            next: null,
            previous: null,
            first: null as any,
            last: null as any,
        };
    }

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        const pageNumber = pageIndex + 1;
        const startIndex = pageIndex * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, items.length);
        const pageItems = items.slice(startIndex, endIndex);

        pages.push({
            index: pageNumber,
            url: urlGenerator(pageNumber),
            items: pageItems,
        });
    }

    const first = pages[0];
    const last = pages[pages.length - 1];

    return {
        pages,
        currentPage: 1,
        totalPages,
        totalItems,
        itemsPerPage,
        next: pages.length > 1 ? pages[1] : null,
        previous: null,
        first,
        last,
    };
}

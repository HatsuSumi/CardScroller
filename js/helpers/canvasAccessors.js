/**
 * canvasAccessors - Canvas元素访问工具函数
 * 统一管理核心Canvas和Image元素的DOM访问，消除重复的查询和验证逻辑
 * 
 * 当前被使用的模块：
 * - ScrollService (business/ScrollService.js) - 获取滚动Canvas和主图片元素
 * - PlaybackCoordinatorService (business/PlaybackCoordinatorService.js) - 获取入场Canvas元素
 * - CanvasInfoPanel (components/performance/CanvasInfoPanel.js) - 获取Canvas信息
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 * 
 * 架构说明：
 * 本文件创建的主要原因是解决架构层级违规问题：
 * - PlaybackCoordinatorService (Layer 11) 之前通过 DisplayCoordinatorService (Layer 12) 获取Canvas元素
 * - 这违反了"高层不能依赖更高层"的分层原则
 * 
 * 通过将DOM访问逻辑提取为纯函数工具（Layer 4），实现了：
 * 1. 修复架构层级违规（所有服务现在依赖低层工具函数）
 * 2. 消除重复代码（3处相同的getElementById + 验证逻辑）
 * 3. 统一错误消息（便于调试）
 * 4. 单一真理源（元素ID变更只需修改一处）
 */

/**
 * 获取滚动Canvas元素
 * @returns {HTMLCanvasElement}
 * @throws {Error} 当元素不存在或类型错误时抛出错误（Fail Fast）
 */
export function getScrollCanvas() {
    const canvas = document.getElementById('scrollCanvas');
    
    if (!canvas) {
        throw new Error('getScrollCanvas: scrollCanvas element not found in DOM');
    }
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('getScrollCanvas: scrollCanvas must be a valid HTMLCanvasElement');
    }
    
    return canvas;
}

/**
 * 获取入场Canvas元素
 * @returns {HTMLCanvasElement}
 * @throws {Error} 当元素不存在或类型错误时抛出错误（Fail Fast）
 */
export function getEntryCanvas() {
    const canvas = document.getElementById('entryCanvas');
    
    if (!canvas) {
        throw new Error('getEntryCanvas: entryCanvas element not found in DOM');
    }
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('getEntryCanvas: entryCanvas must be a valid HTMLCanvasElement');
    }
    
    return canvas;
}

/**
 * 获取主图片元素
 * @returns {HTMLImageElement}
 * @throws {Error} 当元素不存在或类型错误时抛出错误（Fail Fast）
 */
export function getMainImage() {
    const image = document.getElementById('mainImage');
    
    if (!image) {
        throw new Error('getMainImage: mainImage element not found in DOM');
    }
    if (!(image instanceof HTMLImageElement)) {
        throw new Error('getMainImage: mainImage must be a valid HTMLImageElement');
    }
    
    return image;
}

/**
 * 尝试获取入场Canvas元素（不抛出错误）
 * @returns {HTMLCanvasElement|null}
 */
export function getEntryCanvasSafe() {
    const canvas = document.getElementById('entryCanvas');
    return (canvas && canvas instanceof HTMLCanvasElement) ? canvas : null;
}


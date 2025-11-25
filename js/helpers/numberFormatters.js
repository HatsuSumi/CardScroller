/**
 * numberFormatters - 数字格式化工具函数
 * 纯函数工具，提供通用的数字格式化能力
 * 
 * 当前被使用的模块：
 * - PerformanceReportRenderer (components/performance/PerformanceReportRenderer.js) - 使用百分比格式化
 * - BusinessOrchestrationService (system/BusinessOrchestrationService.js) - 使用MP格式化、百分比格式化
 * - ImageInfoModalService (modal/ImageInfoModalService.js) - 使用MP格式化
 * - ImageInfoPanel (components/performance/ImageInfoPanel.js) - 使用MP格式化
 * - ValidationService (system/ValidationService.js) - 使用MP格式化
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 */

/**
 * 百万像素除数（1 MP = 1,000,000 像素）
 */
const MEGAPIXEL_DIVISOR = 1000000;

/**
 * 格式化百分比
 * 
 * @param {number} value - 百分比值（0-1 或 0-100）
 * @param {boolean} isDecimal - 是否是小数形式（0-1）
 * @returns {string} 格式化后的百分比字符串
 * @throws {Error} 当参数不是有效类型时抛出错误（Fail Fast）
 * 
 * @example
 * formatPercentage(0.666, true); // "66.6%"
 * formatPercentage(66.6, false); // "66.6%"
 */
export function formatPercentage(value, isDecimal) {
    // Fail Fast: 验证参数
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`numberFormatters.formatPercentage: value must be a finite number, got ${value}`);
    }
    if (typeof isDecimal !== 'boolean') {
        throw new Error(`numberFormatters.formatPercentage: isDecimal must be a boolean, got ${typeof isDecimal}`);
    }
    
    const percentage = isDecimal ? value * 100 : value;
    return `${percentage.toFixed(1)}%`;
}

/**
 * 格式化百万像素（MP）
 * 根据像素数量的大小动态调整显示精度
 * 
 * @param {number|null|undefined} pixels - 像素数量
 * @returns {string} 格式化后的MP字符串（如 "12.3 MP"）
 * @throws {Error} 当pixels不是有效的非负数字时抛出错误（Fail Fast）
 * 
 * @example
 * formatMP(12345678); // "12.3 MP"
 * formatMP(1234567);  // "1.23 MP"
 * formatMP(123456);   // "0.123 MP"
 * formatMP(null);     // "-"
 */
export function formatMP(pixels) {
    if (pixels === null || pixels === undefined) {
        return '-';
    }
    
    // Fail Fast: 验证pixels是有效的非负数字
    if (typeof pixels !== 'number' || !Number.isFinite(pixels) || pixels < 0) {
        throw new Error(`numberFormatters.formatMP: pixels must be a finite non-negative number, got ${pixels}`);
    }
    
    const mp = pixels / MEGAPIXEL_DIVISOR;
    
    // 根据大小决定显示精度
    if (mp >= 10) {
        return `${mp.toFixed(1)} MP`;
    } else if (mp >= 1) {
        return `${mp.toFixed(2)} MP`;
    } else {
        return `${mp.toFixed(3)} MP`;
    }
}


/**
 * imageDimensions - 图片尺寸计算与格式化工具函数
 * 纯函数工具，提供图片尺寸相关的计算和格式化能力
 * 
 * 当前被使用的模块：
 * - DisplayCoordinatorService (ui/DisplayCoordinatorService.js) - 计算图片缩放和宽高比
 * - ImageInfoModalService (modal/ImageInfoModalService.js) - 计算宽高比、缩放比例、尺寸文本格式化
 * - ImageInfoPanel (components/performance/ImageInfoPanel.js) - 计算宽高比
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 */

/**
 * 常见宽高比预计算值（性能优化：避免每次调用时重复计算）
 */
const COMMON_RATIOS = {
    RATIO_16_9: 16/9,
    RATIO_4_3: 4/3,
    RATIO_3_2: 3/2,
    RATIO_1_1: 1,
    RATIO_21_9: 21/9
};

/**
 * 宽高比匹配容差（小于此值视为匹配）
 */
const ASPECT_RATIO_TOLERANCE = 0.01;

/**
 * 宽高比小数显示阈值（比例大于此值时用小数形式显示，如 21.33:1）
 */
const DECIMAL_DISPLAY_THRESHOLD = 10;

/**
 * 宽高比化简阈值（化简后数字大于此值时用小数形式显示）
 */
const SIMPLIFICATION_THRESHOLD = 100;

/**
 * 计算图片缩放信息
 * 根据容器高度和图片原始尺寸，计算缩放比例和缩放后的尺寸
 * 
 * @param {number} containerHeight - 容器高度（像素）
 * @param {number} imageHeight - 图片原始高度（像素）
 * @param {number} imageWidth - 图片原始宽度（像素）
 * @returns {{ratio: number, scaledWidth: number, scaledHeight: number}} 缩放信息对象
 * @throws {Error} 当参数不是有效的正数时抛出错误（Fail Fast）
 */
export function calculateScaling(containerHeight, imageHeight, imageWidth) {
    // Fail Fast: 验证参数类型和有效性
    if (typeof containerHeight !== 'number' || typeof imageHeight !== 'number' || typeof imageWidth !== 'number') {
        throw new Error('calculateScaling: all parameters must be numbers');
    }
    if (!Number.isFinite(containerHeight) || !Number.isFinite(imageHeight) || !Number.isFinite(imageWidth)) {
        throw new Error('calculateScaling: all parameters must be finite numbers');
    }
    if (containerHeight <= 0 || imageHeight <= 0 || imageWidth <= 0) {
        throw new Error('calculateScaling: all parameters must be positive numbers');
    }
    
    // 计算缩放比例
    const scalingRatio = containerHeight / imageHeight;
    
    // 计算缩放后的宽度
    const scaledWidth = Math.round(imageWidth * scalingRatio);
    
    return {
        ratio: scalingRatio,
        scaledWidth: scaledWidth,
        scaledHeight: containerHeight
    };
}

/**
 * 计算宽高比
 * @param {number} width - 宽度（像素）
 * @param {number} height - 高度（像素）
 * @returns {string} 格式化的宽高比（如 "16:9", "21.33:1" 等）
 * @throws {Error} 当width或height不是有效的正数时抛出错误（Fail Fast）
 */
export function calculateAspectRatio(width, height) {
    // Fail Fast: 验证参数类型和有效性
    if (typeof width !== 'number' || typeof height !== 'number') {
        throw new Error('Invalid parameters: width and height must be numbers');
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('Invalid parameters: width and height must be positive finite numbers');
    }
    
    // 先尝试常见的宽高比
    const ratio = width / height;
    
    // 常见比例检查（使用预计算的常量，避免重复计算）
    const { RATIO_16_9, RATIO_4_3, RATIO_3_2, RATIO_1_1, RATIO_21_9 } = COMMON_RATIOS;
    const tolerance = ASPECT_RATIO_TOLERANCE;
    
    if (Math.abs(ratio - RATIO_16_9) < tolerance) return '16:9';
    if (Math.abs(ratio - RATIO_4_3) < tolerance) return '4:3';
    if (Math.abs(ratio - RATIO_3_2) < tolerance) return '3:2';
    if (Math.abs(ratio - RATIO_1_1) < tolerance) return '1:1';
    if (Math.abs(ratio - RATIO_21_9) < tolerance) return '21:9';
    
    // 对于长图，如果比例太大，显示小数形式
    if (ratio > DECIMAL_DISPLAY_THRESHOLD) {
        return `${ratio.toFixed(2)}:1`;
    }
    
    // 计算最大公约数来化简
    const gcd = _getGCD(width, height);
    const simplifiedWidth = width / gcd;
    const simplifiedHeight = height / gcd;
    
    // 如果化简后的数字还是很大，使用小数形式
    if (simplifiedWidth > SIMPLIFICATION_THRESHOLD || 
        simplifiedHeight > SIMPLIFICATION_THRESHOLD) {
        return `${ratio.toFixed(2)}:1`;
    }
    
    return `${simplifiedWidth}:${simplifiedHeight}`;
}

/**
 * 计算缩放比例（纯计算方法）
 * @param {number} originalWidth - 原始宽度
 * @param {number} originalHeight - 原始高度
 * @param {number} actualWidth - 实际宽度
 * @param {number} actualHeight - 实际高度
 * @returns {number} 平均缩放比例（百分比）
 * @throws {Error} 当参数不是有效的正数时抛出错误（Fail Fast）
 */
export function calculateScalePercentage(originalWidth, originalHeight, actualWidth, actualHeight) {
    // Fail Fast: 验证所有参数
    if (typeof originalWidth !== 'number' || typeof originalHeight !== 'number' ||
        typeof actualWidth !== 'number' || typeof actualHeight !== 'number') {
        throw new Error('Invalid parameters: all dimensions must be numbers');
    }
    if (originalWidth <= 0 || originalHeight <= 0 || actualWidth <= 0 || actualHeight <= 0) {
        throw new Error('Invalid parameters: all dimensions must be positive');
    }
    
    const widthScale = (actualWidth / originalWidth) * 100;
    const heightScale = (actualHeight / originalHeight) * 100;
    return (widthScale + heightScale) / 2;
}

/**
 * 格式化实际尺寸文本（带缩放信息）
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @param {number} scalePercentage - 缩放百分比
 * @returns {string} 格式化文本
 * @throws {Error} 当参数无效时抛出错误（Fail Fast）
 */
export function formatActualDimensions(width, height, scalePercentage) {
    // Fail Fast: 验证参数
    if (typeof width !== 'number' || typeof height !== 'number' || typeof scalePercentage !== 'number') {
        throw new Error('Invalid parameters: width, height, and scalePercentage must be numbers');
    }
    if (width <= 0 || height <= 0) {
        throw new Error('Invalid parameters: width and height must be positive');
    }
    
    return `${width} × ${height} 像素 (约缩放了${scalePercentage.toFixed(0)}%)`;
}

/**
 * 格式化原始尺寸文本（未缩放）
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @returns {string} 格式化文本
 * @throws {Error} 当参数无效时抛出错误（Fail Fast）
 */
export function formatOriginalDimensions(width, height) {
    // Fail Fast: 验证参数
    if (typeof width !== 'number' || typeof height !== 'number') {
        throw new Error('Invalid parameters: width and height must be numbers');
    }
    if (width <= 0 || height <= 0) {
        throw new Error('Invalid parameters: width and height must be positive');
    }
    
    return `${width} × ${height} 像素 (未缩放)`;
}

/**
 * 计算两个数的最大公约数（递归算法 - 辗转相除法）
 * @param {number} a - 第一个数（必须是正整数）
 * @param {number} b - 第二个数（必须是正整数）
 * @returns {number} 最大公约数
 * @throws {Error} 当参数不是正整数时抛出错误（Fail Fast）
 * @private
 */
function _getGCD(a, b) {
    // Fail Fast: 验证参数必须是正整数
    if (typeof a !== 'number' || typeof b !== 'number' || 
        !Number.isInteger(a) || !Number.isInteger(b) || 
        a <= 0 || b < 0) {
        throw new Error(`Invalid GCD parameters: a=${a}, b=${b}. Must be positive integers (b can be 0)`);
    }
    
    return b === 0 ? a : _getGCD(b, a % b);
}

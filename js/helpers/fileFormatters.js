/**
 * fileFormatters - 文件格式化工具函数
 * 纯函数工具，提供文件相关信息的格式化能力
 * 
 * 当前被使用的模块：
 * - ConfigService (business/ConfigService.js) - 生成配置导出时的文件名
 * - BusinessOrchestrationService (system/BusinessOrchestrationService.js) - 格式化文件大小显示
 * - ValidationService (system/ValidationService.js) - 格式化验证错误消息中的文件大小
 * - ImageInfoModalService (modal/ImageInfoModalService.js) - 格式化文件信息显示内容（文件大小、日期、像素数量）
 * - DisplayCoordinatorService (ui/DisplayCoordinatorService.js) - 格式化图片信息显示中的文件大小和文件格式
 * - ImageInfoPanel (components/performance/ImageInfoPanel.js) - 格式化性能监控页面中的文件大小、像素数量
 * 
 * 当前依赖的模块：
 * - extractFileExtension (helpers/fileUtils.js) - 提取文件扩展名工具函数
 */
import { extractFileExtension } from './fileUtils.js';

/**
 * 文件扩展名到格式名称的映射表
 */
const EXTENSION_TO_FORMAT_MAP = {
    'jpg': 'JPEG',
    'jpeg': 'JPEG',
    'png': 'PNG',
    'gif': 'GIF',
    'webp': 'WebP',
    'bmp': 'BMP',
    'svg': 'SVG',
    'tiff': 'TIFF',
    'tif': 'TIFF',
    'ico': 'ICO'
};

/**
 * MIME类型到格式名称的映射表
 */
const MIME_TO_FORMAT_MAP = {
    'image/jpeg': 'JPEG',
    'image/jpg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'image/bmp': 'BMP',
    'image/svg+xml': 'SVG',
    'image/tiff': 'TIFF',
    'image/tif': 'TIFF',
    'image/x-icon': 'ICO',
    'image/vnd.microsoft.icon': 'ICO'
};

/**
 * 文件大小单位数组
 */
const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];

/**
 * 格式化文件大小
 * @param {number|undefined|null} bytes - 字节数
 * @returns {string} 格式化后的文件大小
 * @throws {Error} 当bytes不是有效数字、为负数、Infinity或NaN时抛出错误（Fail Fast）
 */
export function formatFileSize(bytes) {
    // Fail Fast: 验证参数有效性
    if (bytes === null || bytes === undefined || bytes === 0) {
        return '0 B';
    }
    
    // Fail Fast: 检查类型和特殊值（NaN, Infinity）
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
        throw new Error(`Invalid bytes: ${bytes}. Must be a finite non-negative number.`);
    }
    
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    // Fail Fast: 防止数组越界
    if (i < 0 || i >= FILE_SIZE_UNITS.length) {
        throw new Error(`Calculated size unit index ${i} is out of bounds for bytes: ${bytes}`);
    }
    
    const size = (bytes / Math.pow(k, i)).toFixed(2);
    
    return `${size} ${FILE_SIZE_UNITS[i]}`;
}

/**
 * 格式化日期时间
 * @param {number|undefined|null} timestamp - 时间戳（毫秒）
 * @returns {string} 格式化后的日期时间字符串
 * @throws {Error} 当timestamp不是有效数字或超出有效日期范围时抛出错误（Fail Fast）
 */
export function formatDate(timestamp) {
    if (timestamp === null || timestamp === undefined) {
        return '-';
    }
    
    // Fail Fast: 验证timestamp是有效的数字
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
        throw new Error(`Invalid timestamp: ${timestamp}. Must be a finite number.`);
    }
    
    // Fail Fast: 验证日期有效性
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
        throw new Error(`Invalid date created from timestamp: ${timestamp}`);
    }
    
    return date.toLocaleString('zh-CN');
}

/**
 * 从MIME类型获取文件格式
 * @param {string} mimeType - MIME类型
 * @param {string} fileName - 文件名（可选）
 * @returns {string} 文件格式
 * @throws {Error} 当fileName不是字符串时抛出错误（Fail Fast）
 */
export function getFileFormat(mimeType, fileName = '') {
    // Fail Fast: 验证fileName是字符串（如果提供了的话）
    if (fileName && typeof fileName !== 'string') {
        throw new Error(`Invalid fileName: ${fileName}. Must be a string.`);
    }
    
    // 优先使用MIME类型
    if (MIME_TO_FORMAT_MAP[mimeType]) {
        return MIME_TO_FORMAT_MAP[mimeType];
    }
    
    // 如果MIME类型未知，从文件扩展名推断
    if (fileName) {
        const ext = extractFileExtension(fileName, { throwOnMissing: false });
        if (ext) {
            return EXTENSION_TO_FORMAT_MAP[ext] || 'Unknown';
        }
    }
    
    return 'Unknown';
}

/**
 * 格式化像素数量
 * @param {number|null|undefined} pixels - 像素数量
 * @returns {string} 格式化后的像素数量字符串（如 "12,345,678 像素"）
 * @throws {Error} 当pixels不是有效的非负数字时抛出错误（Fail Fast）
 */
export function formatPixelCount(pixels) {
    if (pixels === null || pixels === undefined) {
        return '-';
    }
    
    // Fail Fast: 验证pixels是有效的非负数字
    if (typeof pixels !== 'number' || !Number.isFinite(pixels) || pixels < 0) {
        throw new Error(`Invalid pixels: ${pixels}. Must be a finite non-negative number.`);
    }
    
    return `${pixels.toLocaleString()} 像素`;
}

/**
 * 生成带时间戳的文件名
 * 用于配置导出等需要生成唯一文件名的场景
 * 
 * @param {string} prefix - 文件名前缀
 * @param {string} extension - 文件扩展名（不含点号）
 * @returns {string} 格式为 "prefix-YYYY-MM-DDTHH-MM-SS.extension" 的文件名
 * @throws {Error} 当参数不是字符串时抛出错误（Fail Fast）
 * 
 * @example
 * generateFileName('cardscroller-config', 'json')
 * // 返回 "cardscroller-config-2025-10-09T15-30-45.json"
 */
export function generateFileName(prefix, extension) {
    // Fail Fast: 验证参数类型
    if (typeof prefix !== 'string' || !prefix) {
        throw new Error(`Invalid prefix: must be a non-empty string.`);
    }
    if (typeof extension !== 'string' || !extension) {
        throw new Error(`Invalid extension: must be a non-empty string.`);
    }
    
    // 生成ISO格式时间戳并转换为文件名友好格式（冒号替换为横杠）
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return `${prefix}-${timestamp}.${extension}`;
}

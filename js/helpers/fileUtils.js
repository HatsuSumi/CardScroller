/**
 * fileUtils - 文件工具函数集合
 * 纯函数工具，提供文件路径解析、文件名处理、MIME类型查询、Base64计算等通用功能。包含文件扩展名提取、MIME类型映射、Base64文件大小计算等文件元数据处理相关的纯函数。
 * 
 * 当前被使用的模块：
 * - ImageProcessingService (services/business/ImageProcessingService.js) - 配置导入时提取文件扩展名、获取MIME类型、计算Base64文件大小
 * - ValidationService (services/system/ValidationService.js) - 验证图片文件名扩展名、计算Base64文件大小、MIME类型映射
 * - FileSaveService (services/utils/FileSaveService.js) - 文件保存时提取扩展名
 * - FileProcessStrategy (patterns/file/FileProcessStrategy.js) - 文件类型判断时使用MIME类型映射
 * - fileFormatters (helpers/fileFormatters.js) - 提取文件扩展名用于格式化
 * - ImageInfoPanel (components/performance/ImageInfoPanel.js) - 获取MIME类型用于显示
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 */

/**
 * 文件扩展名到MIME类型的映射表（常量）
 * 支持的图片格式及其对应的MIME类型
 * 
 * 格式选择标准：
 * 1. 现代浏览器100%支持（Chrome/Firefox/Safari/Edge）
 * 2. 适合滚动视频场景（光栅图，非矢量图）
 * 3. 技术可靠性（浏览器原生Image API支持）
 * 
 * 核心格式：JPEG、PNG、WebP（最佳质量和压缩率）
 * 扩展格式：GIF、BMP（实用性支持）
 * 
 * @constant {Object}
 */
export const EXTENSION_TO_MIME_MAP = {
    // 核心格式（100%支持，最适合滚动视频）
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    
    // 扩展格式（广泛支持，实用性一般）
    'gif': 'image/gif',
    'bmp': 'image/bmp'
};

/**
 * 从文件名提取文件扩展名（纯函数工具）
 * 
 * @param {string} fileName - 文件名
 * @param {Object} [options] - 配置选项
 * @param {boolean} [options.toLowerCase=true] - 是否转换为小写
 * @param {boolean} [options.throwOnMissing=true] - 扩展名缺失时是否抛出错误
 * @returns {string|null} 文件扩展名，如果缺失且不抛出错误则返回 null
 * @throws {Error} 当 fileName 不是字符串或扩展名缺失时抛出错误（根据配置）
 * 
 * @example
 * extractFileExtension('image.jpg') // 'jpg'
 * extractFileExtension('image.JPG') // 'jpg'
 * extractFileExtension('image.JPG', { toLowerCase: false }) // 'JPG'
 * extractFileExtension('noext', { throwOnMissing: false }) // null
 * extractFileExtension('noext') // throws Error
 */
export function extractFileExtension(fileName, options = {}) {
    const { toLowerCase = true, throwOnMissing = true } = options;
    
    // Fail Fast: 验证 fileName 类型
    if (typeof fileName !== 'string') {
        throw new Error('fileName must be a string');
    }
    
    // 性能优化：使用 lastIndexOf 替代 split，避免创建数组
    const lastDotIndex = fileName.lastIndexOf('.');
    
    // 没有扩展名的情况：没有点号或点号在末尾
    if (lastDotIndex === -1 || lastDotIndex === fileName.length - 1) {
        if (throwOnMissing) {
            throw new Error(`Invalid fileName: "${fileName}" has no file extension`);
        }
        return null;
    }
    
    // 提取扩展名（点号后面的部分）
    const extension = fileName.slice(lastDotIndex + 1);
    return toLowerCase ? extension.toLowerCase() : extension;
}

/**
 * 根据文件扩展名获取MIME类型
 * 
 * @param {string} extension - 文件扩展名（不含点号）
 * @param {Object} [options] - 配置选项
 * @param {string} [options.defaultMimeType='image/jpeg'] - 未知扩展名时的默认MIME类型
 * @param {boolean} [options.throwOnUnknown=false] - 未知扩展名时是否抛出错误
 * @returns {string} MIME类型
 * @throws {Error} 当 extension 不是字符串或未知扩展名时抛出错误（根据配置）
 * 
 * @example
 * getMimeTypeByExtension('jpg') // 'image/jpeg'
 * getMimeTypeByExtension('png') // 'image/png'
 * getMimeTypeByExtension('unknown', { throwOnUnknown: true }) // throws Error
 * getMimeTypeByExtension('unknown', { defaultMimeType: 'application/octet-stream' }) // 'application/octet-stream'
 */
export function getMimeTypeByExtension(extension, options = {}) {
    const { defaultMimeType = 'image/jpeg', throwOnUnknown = false } = options;
    
    // Fail Fast: 验证 extension 类型
    if (typeof extension !== 'string') {
        throw new Error('extension must be a string');
    }
    
    // 查找 MIME 类型
    const mimeType = EXTENSION_TO_MIME_MAP[extension.toLowerCase()];
    
    if (!mimeType) {
        if (throwOnUnknown) {
            throw new Error(`Unknown file extension: "${extension}"`);
        }
        return defaultMimeType;
    }
    
    return mimeType;
}

/**
 * 从Base64字符串计算原始文件大小（纯函数工具）
 * 
 * Base64编码原理：每4个字符表示3个字节（3/4 = 0.75），'='为padding字符不计入实际数据
 * 
 * @param {string} base64Data - Base64数据（可能包含data URL前缀，如 "data:image/jpeg;base64,..."）
 * @param {Object} [options] - 配置选项
 * @param {boolean} [options.throwOnInvalid=true] - 无法提取Base64字符串时是否抛出错误
 * @returns {number} 文件大小（字节）
 * @throws {Error} 当base64Data不是字符串或无法提取Base64字符串时抛出错误（根据配置）
 * 
 * @example
 * calculateBase64FileSize('data:image/jpeg;base64,/9j/4AAQ...') // 12345
 * calculateBase64FileSize('/9j/4AAQ...') // 12345
 */
export function calculateBase64FileSize(base64Data, options = {}) {
    const { throwOnInvalid = true } = options;
    
    // Fail Fast: 验证 base64Data 类型
    if (typeof base64Data !== 'string') {
        throw new Error('base64Data must be a string');
    }
    
    // 提取纯base64部分（去掉data URL前缀）
    let base64String = base64Data;
    if (base64Data.includes(',')) {
        base64String = base64Data.split(',')[1];
    }
    
    // Fail Fast: 验证提取后的base64字符串
    if (!base64String) {
        if (throwOnInvalid) {
            throw new Error('Unable to extract base64 string from data');
        }
        return 0;
    }
    
    // 计算padding字符数量
    const paddingCount = (base64String.match(/=/g) || []).length;
    
    // 计算原始字节数
    // Base64: 每4个字符表示3个字节（即3/4 = 0.75），减去padding对应的字节数
    const base64Length = base64String.length;
    const originalBytes = Math.floor((base64Length * 3 / 4) - paddingCount);
    
    return originalBytes;
}


/**
 * FileProcessStrategy - 文件处理策略
 * 文件处理算法策略模式实现，负责不同类型文件的读取、解析和数据提取，纯技术处理层，不包含业务验证和UI格式化。包含：FileProcessStrategy抽象基类、ImageFileStrategy图片策略、ConfigFileStrategy配置策略
 * 
 * 当前被使用的模块：
 * - FileProcessStrategyManager (patterns/file/FileProcessStrategyManager.js) - 文件策略管理器，注册和调用策略
 * 
 * 当前依赖的模块：
 * - EXTENSION_TO_MIME_MAP (helpers/fileUtils.js) - 使用其常量进行MIME类型映射
 * - loadImageFromDataURL (helpers/imageLoader.js) - 图片加载工具函数
 */
import { EXTENSION_TO_MIME_MAP } from '../../helpers/fileUtils.js';
import { loadImageFromDataURL } from '../../helpers/imageLoader.js';

/**
 * 文件处理策略抽象基类
 * 定义文件处理策略的标准接口
 */
export class FileProcessStrategy {
    /**
     * 处理文件
     * @param {File} file - 文件对象
     * @returns {Promise<Object>} 处理结果
     * @throws {Error} 子类必须实现此方法
     */
    async process(file) {
        throw new Error('process() method must be implemented');
    }

    /**
     * 检查是否支持该文件类型
     * @param {File} file - 文件对象
     * @returns {boolean} 是否支持
     * @throws {Error} 子类必须实现此方法
     */
    supports(file) {
        throw new Error('supports() method must be implemented');
    }

    /**
     * 获取策略名称
     * @returns {string} 策略名称
     * @throws {Error} 子类必须实现此方法
     */
    getName() {
        throw new Error('getName() method must be implemented');
    }
}

/**
 * 图片文件处理策略
 * 实现图片文件的读取、格式转换、数据提取等纯技术处理，只返回原始数据。
 */
export class ImageFileStrategy extends FileProcessStrategy {
    /**
     * 创建图片文件处理策略实例
     * 无需外部依赖，只做纯技术处理
     */
    constructor() {
        super();
    }

    /**
     * 处理图片文件
     * 为文件创建Blob URL（支持超大文件），提取图片原始尺寸和元数据。
     * 
     * @param {File} file - 文件对象
     * @returns {Promise<Object>} 处理结果 {fileName, fileSize, width, height, dataUrl, lastModified}
     * @throws {Error} 当文件参数无效或图片文件损坏时抛出错误
     */
    async process(file) {
        // Fail Fast: 检查必需参数
        if (!file) {
            throw new Error('File parameter is required for image processing');
        }
        
        // 使用 Blob URL 代替 Base64
        // 原因：Base64 字符串在大文件（>100MB）时会导致浏览器崩溃或超出字符串长度限制
        // URL.createObjectURL 极其高效，几乎瞬间完成，且内存占用极低
        const blobUrl = URL.createObjectURL(file);
        
        // 获取图片尺寸
        const dimensions = await this._getImageDimensions(blobUrl);
        
        // 返回原始数据，不做任何格式化处理
        return {
            fileName: file.name,
            fileSize: file.size,
            width: dimensions.width,
            height: dimensions.height,
            dataUrl: blobUrl, // 注意：为了保持接口兼容性，字段名仍为dataUrl，但实际内容为Blob URL
            lastModified: file.lastModified 
        };
    }

    /**
     * 检查是否支持该文件类型
     * 
     * 验证策略：基于浏览器的MIME类型识别（准确且安全）
     * - 浏览器基于文件内容识别MIME类型，比扩展名更可靠
     * - 防止用户通过修改文件扩展名伪装文件类型
     * - 使用 EXTENSION_TO_MIME_MAP 作为 Single Source of Truth
     * 
     * @param {File} file - 文件对象
     * @returns {boolean} 是否支持（只支持EXTENSION_TO_MIME_MAP中定义的格式）
     */
    supports(file) {
        // 检查浏览器提供的MIME类型是否在支持列表中
        if (!file.type) {
            // MIME类型为空说明文件异常，直接拒绝（Fail Fast）
            return false;
        }
        
        const supportedMimeTypes = Object.values(EXTENSION_TO_MIME_MAP);
        return supportedMimeTypes.includes(file.type);
    }

    /**
     * 获取策略名称
     * @returns {string} 策略名称
     */
    getName() {
        return 'image';
    }

    /**
     * 获取图片尺寸
     * @param {string} imageUrl - 图片URL (Data URL 或 Blob URL)
     * @returns {Promise<{width: number, height: number}>} 图片尺寸
     * @throws {Error} 当图片文件损坏或格式不支持时抛出错误
     * @private
     */
    async _getImageDimensions(imageUrl) {
        try {
            // 使用统一的图片加载工具函数
            const img = await loadImageFromDataURL(imageUrl);
            
            const result = {
                width: img.naturalWidth,
                height: img.naturalHeight
            };
            
            // 清理引用，帮助垃圾回收
            this._cleanupImageReference(img);
            
            return result;
        } catch (error) {
            // 捕获浏览器底层加载错误（通常是内存溢出或纹理超限）
            throw new Error('图片加载失败！图片尺寸可能超出了当前浏览器的处理极限。\n\n建议尝试：\n1. 将超长图片切分为多张小图（推荐每张宽度 < 30,000px）\n2. 降低图片分辨率');
        }
    }

    /**
     * 清理图片对象引用
     * 帮助垃圾回收，避免内存泄漏
     * @param {Image} img - 图片对象
     * @private
     */
    _cleanupImageReference(img) {
        img.onload = null;
        img.onerror = null;
        img.src = '';
    }

}

/**
 * 配置文件处理策略
 * 实现JSON配置文件的读取和解析，只返回原始数据。
 */
export class ConfigFileStrategy extends FileProcessStrategy {
    /**
     * 创建配置文件处理策略实例
     * 无需外部依赖，只做纯技术处理
     */
    constructor() {
        super();
    }

    /**
     * 处理配置文件
     * 读取JSON文件内容，解析为JavaScript对象。
     * 
     * @param {File} file - 文件对象
     * @returns {Promise<Object>} 处理结果 {fileName, fileSize, data, lastModified}
     * @throws {Error} 当文件参数无效、文件读取失败或JSON格式错误时抛出错误
     */
    async process(file) {
        // Fail Fast: 检查必需参数
        if (!file) {
            throw new Error('File parameter is required for config processing');
        }
        
        // 读取文件为文本
        const text = await this._readAsText(file);
        
        // 解析JSON
        let data;
        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error(`JSON解析失败: ${error.message}`);
        }
        
        // 返回原始数据，不做任何业务验证
        return {
            fileName: file.name,
            fileSize: file.size,
            data: data,
            lastModified: file.lastModified  
        };
    }

    /**
     * 检查是否支持该文件类型
     * 支持两种判断方式：
     * 1. MIME类型判断：file.type包含'json'
     * 2. 文件扩展名判断：.json结尾
     * 
     * @param {File|null|undefined} file - 文件对象
     * @returns {boolean} 是否支持（JSON类型返回true，无效参数返回false）
     */
    supports(file) {
        // 首先检查MIME类型
        if (file?.type && (file.type === 'application/json' || file.type.includes('json'))) {
            return true;
        }
        
        // 如果MIME类型不匹配，通过文件扩展名推断
        // 性能优化：直接检查后缀，避免toLowerCase整个文件名
        if (!file?.name) {
            return false;
        }
        
        return file.name.toLowerCase().endsWith('.json');
    }

    /**
     * 获取策略名称
     * @returns {string} 策略名称
     */
    getName() {
        return 'config';
    }

    /**
     * 读取文件为文本
     * @param {File} file - 文件对象
     * @returns {Promise<string>} 文件文本内容
     * @throws {Error} 当文件读取失败时抛出错误
     * @private
     */
    _readAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target.result;
                // 清理引用，帮助垃圾回收
                reader.onload = null;
                reader.onerror = null;
                resolve(result);
            };
            reader.onerror = (error) => {
                // 清理引用，帮助垃圾回收
                reader.onload = null;
                reader.onerror = null;
                reject(new Error(`文件读取失败: ${error.message || 'Unknown error'}`));
            };
            reader.readAsText(file);
        });
    }

}

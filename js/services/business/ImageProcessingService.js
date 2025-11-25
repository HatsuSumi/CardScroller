import { extractFileExtension, getMimeTypeByExtension, calculateBase64FileSize } from '../../helpers/fileUtils.js';

/**
 * ImageProcessingService - 图片处理服务
 * 专门负责配置导入时的图片数据处理和大图片降采样优化：创建模拟的 fileData 对象、提取 PPI 信息、大图片降采样等
 * 
 * 当前被使用的模块：
 * - ImageService (services/business/ImageService.js) - 图片业务协调服务（loadFromConfig和upload方法）
 * 
 * 当前依赖的模块：
 * - extractFileExtension, getMimeTypeByExtension, calculateBase64FileSize (helpers/fileUtils.js) - 文件工具函数（纯函数导入）
 * - stateManager (core/StateManager.js) - 状态管理器，用于读取大图片优化配置（通过DI注入）
 */

export class ImageProcessingService {
    /**
     * 构造函数
     * @param {StateManager} stateManager - 状态管理器，用于读取大图片优化配置
     * @throws {Error} 当依赖注入失败时抛出错误（Fail Fast）
     */
    constructor(stateManager) {
        // Fail Fast: 验证依赖
        if (!stateManager) {
            throw new Error('StateManager is required for ImageProcessingService');
        }
        
        this.stateManager = stateManager;
    }

    /**
     * 处理配置导入的图片数据 - 创建完整的 fileData
     * 
     * @param {Object} configImageData - 配置中的图片数据
     * @param {string} configImageData.fileName - 图片文件名（必需）
     * @param {number} configImageData.fileSize - 文件大小（字节，必需）
     * @param {number} configImageData.lastModified - 最后修改时间戳（必需）
     * @param {number} [configImageData.ppiX] - X轴PPI（可选）
     * @param {number} [configImageData.ppiY] - Y轴PPI（可选）
     * @returns {Object} 处理结果对象
     * @returns {Object} returns.fileData - 模拟的文件数据对象
     * @returns {string} returns.fileData.name - 文件名
     * @returns {number} returns.fileData.size - 文件大小
     * @returns {string} returns.fileData.type - MIME类型
     * @returns {number} returns.fileData.lastModified - 最后修改时间
     * @returns {Object|null} returns.ppiInfo - PPI信息（如果配置中包含则为对象，否则为null）
     * @returns {number} [returns.ppiInfo.xPPI] - X轴PPI（仅当ppiInfo不为null时存在）
     * @returns {number} [returns.ppiInfo.yPPI] - Y轴PPI（仅当ppiInfo不为null时存在）
     * @throws {Error} 当 configImageData 无效或必需字段缺失时抛出错误（Fail Fast）
     */
    processConfigData(configImageData) {
        // 1. 验证配置数据
        this._validateConfigImageData(configImageData);
        
        // 2. 提取文件扩展名并获取 MIME 类型
        const fileExtension = extractFileExtension(configImageData.fileName);
        const mimeType = this._getMimeType(fileExtension);
        
        // 3. 创建 fileData 对象
        const fileData = this._createFileData(configImageData, mimeType);
        
        // 4. 处理 PPI 信息
        const ppiInfo = this._processPPIInfo(configImageData);

        return {
            fileData,
            ppiInfo
        };
    }

    /**
     * 验证配置图片数据的必需字段
     * @param {Object} configImageData - 配置中的图片数据
     * @throws {Error} 当字段无效或缺失时抛出错误（Fail Fast）
     * @private
     */
    _validateConfigImageData(configImageData) {
        // Fail Fast: 验证对象类型
        if (!configImageData || typeof configImageData !== 'object') {
            throw new Error('Invalid config image data: expected object');
        }
        
        // Fail Fast: 验证 fileName
        if (configImageData.fileName === null || configImageData.fileName === undefined) {
            throw new Error('Invalid config image data: fileName is required');
        }
        if (typeof configImageData.fileName !== 'string') {
            throw new Error('Invalid config image data: fileName must be a string');
        }
        if (configImageData.fileName === '') {
            throw new Error('Invalid config image data: fileName cannot be empty');
        }
        
        // Fail Fast: 验证 fileSize
        if (typeof configImageData.fileSize !== 'number') {
            throw new Error('Invalid config image data: fileSize is required and must be a number');
        }
        
        // Fail Fast: 验证 lastModified
        if (typeof configImageData.lastModified !== 'number') {
            throw new Error('Invalid config image data: lastModified is required and must be a number');
        }
    }

    /**
     * 获取文件扩展名对应的 MIME 类型
     * @param {string} fileExtension - 文件扩展名
     * @returns {string} MIME 类型
     * @throws {Error} 当无法获取 MIME 类型时抛出错误（Fail Fast）
     * @private
     */
    _getMimeType(fileExtension) {
        // 使用 fileUtils 获取 MIME 类型（默认返回 'image/jpeg'）
        return getMimeTypeByExtension(fileExtension);
    }

    /**
     * 创建模拟的 fileData 对象
     * @param {Object} configImageData - 配置中的图片数据
     * @param {string} mimeType - MIME 类型
     * @returns {Object} fileData 对象
     * @private
     */
    _createFileData(configImageData, mimeType) {
        return {
            name: configImageData.fileName,
            size: configImageData.fileSize,
            type: mimeType,
            lastModified: configImageData.lastModified
        };
    }

    /**
     * 处理 PPI 信息
     * @param {Object} configImageData - 配置中的图片数据
     * @returns {Object|null} PPI 信息对象，如果没有 PPI 数据则返回 null
     * @throws {Error} 当 PPI 值类型无效时抛出错误（Fail Fast）
     * @private
     */
    _processPPIInfo(configImageData) {
        // 检查是否同时存在 ppiX 和 ppiY
        if (configImageData.ppiX !== null && configImageData.ppiX !== undefined && 
            configImageData.ppiY !== null && configImageData.ppiY !== undefined) {
            
            // Fail Fast: 验证 PPI 值为有效数字
            if (typeof configImageData.ppiX !== 'number' || typeof configImageData.ppiY !== 'number') {
                throw new Error('Invalid PPI values: ppiX and ppiY must be numbers');
            }
            
            // 配置中有有效的 PPI 数据，转换为标准格式
            return {
                xPPI: configImageData.ppiX,
                yPPI: configImageData.ppiY
            };
        }
        
        // 如果配置中没有 PPI（原图本身就没有），返回 null，UI 层会显示默认值
        return null;
    }

    /**
     * 检测图片是否需要降采样
     * 当图片像素超过阈值时，返回需要降采样的标记
     * 
     * @param {Object} imageData - 图片数据 {dataUrl, width, height}
     * @returns {Object} 检测结果 {needsDownsampling, totalPixels, threshold, targetMaxPixels}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    checkNeedsDownsampling(imageData) {
        // Fail Fast: 验证参数
        if (!imageData || typeof imageData !== 'object') {
            throw new Error('imageData parameter is required and must be an object');
        }
        if (typeof imageData.width !== 'number' || typeof imageData.height !== 'number') {
            throw new Error('imageData must contain valid width and height');
        }
        
        // 从配置获取阈值
        const config = this.stateManager.state.validation.image;
        
        // Fail Fast: 验证配置存在
        if (!config || typeof config.largeImageThreshold !== 'number' || typeof config.targetMaxPixels !== 'number') {
            throw new Error('ImageProcessingService: validation.image.largeImageThreshold and targetMaxPixels configuration is missing or invalid');
        }
        
        const LARGE_IMAGE_THRESHOLD = config.largeImageThreshold;
        const TARGET_MAX_PIXELS = config.targetMaxPixels;
        
        // 计算总像素数
        const totalPixels = imageData.width * imageData.height;
        const needsDownsampling = totalPixels > LARGE_IMAGE_THRESHOLD;
        
        return {
            needsDownsampling,
            totalPixels,
            threshold: LARGE_IMAGE_THRESHOLD,
            targetMaxPixels: TARGET_MAX_PIXELS
        };
    }

    /**
     * 执行图片降采样
     * 将超大图片降采样到目标像素数，减少内存占用
     * 
     * @param {Object} imageData - 图片数据 {dataUrl, width, height, fileSize}
     * @param {File} file - 原始文件对象（用于降采样）
     * @param {number} targetMaxPixels - 目标最大像素数
     * @returns {Promise<Object>} 降采样后的图片数据 {dataUrl, width, height, actualWidth, actualHeight, actualFileSize, isDownsampled}
     *                           - width/height: 仍是原始尺寸（由调用方决定是否更新为 actualWidth/actualHeight）
     *                           - actualWidth/actualHeight: 实际降采样后尺寸
     *                           - actualFileSize: 降采样后的文件大小（字节）
     * @throws {Error} 当参数无效或降采样失败时抛出错误（Fail Fast）
     */
    async downsampleImage(imageData, file, targetMaxPixels) {
        // Fail Fast: 验证参数
        if (!imageData || typeof imageData !== 'object') {
            throw new Error('imageData parameter is required and must be an object');
        }
        if (!file || !(file instanceof File)) {
            throw new Error('file parameter is required and must be a File object');
        }
        if (typeof imageData.width !== 'number' || typeof imageData.height !== 'number') {
            throw new Error('imageData must contain valid width and height');
        }
        if (typeof targetMaxPixels !== 'number' || targetMaxPixels <= 0) {
            throw new Error('targetMaxPixels must be a positive number');
        }
        
        try {
            const totalPixels = imageData.width * imageData.height;
            const downsampledResult = await this._downsampleImage(
                file, 
                imageData.width, 
                imageData.height, 
                totalPixels, 
                targetMaxPixels
            );
            
            // 返回降采样后的数据
            // width/height 保持原始值，由调用方决定是否更新为 actualWidth/actualHeight
            // actualWidth/actualHeight 提供实际降采样后的尺寸
            // actualFileSize 提供降采样后的文件大小
            return {
                ...imageData,
                dataUrl: downsampledResult.dataUrl,            // 替换为降采样后的DataURL
                isDownsampled: true,                           // 添加标记
                actualWidth: downsampledResult.actualWidth,    // 实际降采样后宽度
                actualHeight: downsampledResult.actualHeight,  // 实际降采样后高度
                actualFileSize: downsampledResult.actualFileSize // 实际降采样后文件大小（字节）
            };
        } catch (error) {
            throw new Error(`大图片降采样处理失败: ${error.message}`);
        }
    }

    /**
     * 执行图片降采样
     * 使用createImageBitmap在解码时直接缩放，减少内存占用
     * 
     * @param {File} file - 原始文件对象
     * @param {number} width - 原始宽度
     * @param {number} height - 原始高度
     * @param {number} totalPixels - 总像素数
     * @param {number} targetMaxPixels - 目标最大像素数
     * @returns {Promise<Object>} 降采样结果 {dataUrl, actualWidth, actualHeight, actualFileSize}
     * @throws {Error} 当降采样失败时抛出错误
     * @private
     */
    async _downsampleImage(file, width, height, totalPixels, targetMaxPixels) {
        // 计算降采样比例（保持宽高比）
        const scale = Math.sqrt(targetMaxPixels / totalPixels);
        const targetWidth = Math.floor(width * scale);
        const targetHeight = Math.floor(height * scale);
        
        // 使用 createImageBitmap 在解码时直接缩放
        // resizeQuality: 'high' 确保缩放质量
        const imageBitmap = await createImageBitmap(file, {
            resizeWidth: targetWidth,
            resizeHeight: targetHeight,
            resizeQuality: 'high'
        });
        
        // 保存实际尺寸（在close之前）
        const actualWidth = imageBitmap.width;
        const actualHeight = imageBitmap.height;
        
        // 转换为 DataURL
        // 架构例外：此处使用 createElement 而非 HTML Template
        // 原因：Canvas 是临时的一次性元素，仅用于降采样处理后立即销毁
        // 不属于"频繁创建销毁"的场景，且本服务不应依赖 HTML 结构以保持业务逻辑纯粹性
        const canvas = document.createElement('canvas');
        canvas.width = actualWidth;
        canvas.height = actualHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0);
        
        // 使用 JPEG 格式和较高质量（0.92）来平衡文件大小和质量
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        
        // 使用 fileUtils 纯函数计算降采样后的文件大小
        const actualFileSize = calculateBase64FileSize(dataUrl);
        
        // 清理资源
        imageBitmap.close();
        canvas.width = 0;
        canvas.height = 0;
        
        return {
            dataUrl,
            actualWidth,
            actualHeight,
            actualFileSize
        };
    }

}

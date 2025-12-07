/**
 * imageLoader - 图片加载工具函数
 * 
 * 提供统一的图片加载模式，避免在多个服务中重复相同的加载逻辑
 * 
 * 当前被使用的模块：
 * - ValidationService (services/system/ValidationService.js) - 验证配置文件中的图片尺寸（静态import）
 * - ViewportCalculatorService (services/utils/ViewportCalculatorService.js) - 创建裁剪图片预览（动态import）
 * - PreviewManager (components/entry-animation/PreviewManager.js) - 入场动画预览（动态import）
 * - CardBoundaryEditorService (services/ui/CardBoundaryEditorService.js) - 边界编辑器加载图片（动态import）
 * - ImageFileStrategy (patterns/file/FileProcessStrategy.js) - 图片文件策略，获取图片尺寸（静态import）
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 */

/**
 * 从base64数据URL创建Image对象
 * 
 * @param {string} imageData - Base64图片数据（data:image/...格式）
 * @returns {Promise<HTMLImageElement>} 加载完成的Image对象
 * @throws {Error} 当imageData无效或图片加载失败时抛出错误
 */
export function loadImageFromDataURL(imageData) {
    // Fail Fast: 验证imageData参数
    if (typeof imageData !== 'string' || !imageData) {
        throw new Error('loadImageFromDataURL: imageData must be a non-empty string');
    }
    
    // 验证是否为有效的数据源（支持 Base64 Data URL 或 Blob URL）
    const isDataUrl = imageData.startsWith('data:image/');
    const isBlobUrl = imageData.startsWith('blob:');
    
    if (!isDataUrl && !isBlobUrl) {
        throw new Error('loadImageFromDataURL: imageData must be a valid data URL (starting with "data:image/") or blob URL (starting with "blob:")');
    }

    return new Promise((resolve, reject) => {
        const image = new Image();
        
        image.onload = () => {
            // 验证图片是否成功加载
            if (image.naturalWidth === 0 || image.naturalHeight === 0) {
                reject(new Error('loadImageFromDataURL: Image loaded but has invalid dimensions'));
                return;
            }
            resolve(image);
        };
        
        image.onerror = () => {
            reject(new Error('loadImageFromDataURL: Failed to load image from data URL'));
        };
        
        // 开始加载
        image.src = imageData;
    });
}

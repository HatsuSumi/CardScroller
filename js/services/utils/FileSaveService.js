import { extractFileExtension } from '../../helpers/fileUtils.js';

/**
 * FileSaveService - 文件保存服务
 * 提供统一的文件保存接口，支持现代浏览器的文件系统访问API（File System Access API）和传统下载方式的自动降级
 * 
 * 当前被使用的模块：
 * - ConfigService (business/ConfigService.js) - 配置文件导出
 * 
 * 当前依赖的模块：
 * - extractFileExtension (helpers/fileUtils.js) - 文件工具函数，用于提取文件扩展名
 */

export class FileSaveService {
    /**
     * 创建文件保存服务实例
     * @throws {Error} 当浏览器环境不支持必需的API时抛出错误（Fail Fast）
     */
    constructor() {
        // Fail Fast: 验证浏览器环境
        if (typeof window === 'undefined') {
            throw new Error('FileSaveService requires browser environment');
        }
        
        // Fail Fast: 验证必需的浏览器API
        if (!window.Blob) {
            throw new Error('Browser does not support Blob API, which is required for FileSaveService');
        }
        if (!window.URL || typeof window.URL.createObjectURL !== 'function') {
            throw new Error('Browser does not support URL.createObjectURL, which is required for FileSaveService');
        }
        
        // 性能优化：创建可复用的HTML Template
        this._initDownloadTemplate();
    }
    
    /**
     * 初始化下载链接模板（性能优化）
     * 从HTML中获取预定义的template元素，避免运行时创建DOM
     * @private
     * @throws {Error} 当找不到模板元素时抛出错误（Fail Fast）
     */
    _initDownloadTemplate() {
        // 从HTML中获取预定义的template元素（性能最优：零运行时创建开销）
        const template = document.getElementById('downloadLinkTemplate');
        
        // Fail Fast: 验证模板存在
        if (!template || !(template instanceof HTMLTemplateElement)) {
            throw new Error('下载链接模板未找到或类型错误，请确保HTML中存在id为"downloadLinkTemplate"的<template>元素');
        }
        
        // 缓存template引用，后续使用template.content.cloneNode复用
        this.downloadLinkTemplate = template;
    }

    /**
     * 检查浏览器是否支持文件系统访问API
     * 
     * 说明：File System Access API 是现代浏览器提供的文件保存接口，允许用户选择保存位置
     * - Chrome/Edge 86+ 支持
     * - Safari 和 Firefox 目前不支持（需要降级到传统下载方式）
     * 
     * @returns {boolean} true表示支持，false表示不支持
     */
    isFileSystemAccessSupported() {
        return 'showSaveFilePicker' in window;
    }

    /**
     * 保存文件（统一接口）
     * 
     * 自动选择最佳保存方式：
     * 1. 如果浏览器支持且用户偏好，使用文件系统访问API（可选择保存位置）
     * 2. 否则降级到传统下载方式（自动下载到默认下载文件夹）
     * 
     * @param {string} content - 文件内容
     * @param {string} filename - 文件名（包含扩展名）
     * @param {string} mimeType - MIME类型（如 'application/json', 'text/plain'）
     * @param {Object} options - 保存选项
     * @param {boolean} [options.preferFileSystemAPI=true] - 是否优先使用文件系统API
     * @param {string} [options.fileDescription='文件'] - 文件类型描述（用于文件选择对话框）
     * @returns {Promise<{success: boolean, cancelled: boolean, method: string}>} 保存结果（cancelled 始终存在，表示用户是否取消）
     * @throws {Error} 当参数无效或保存失败时抛出错误（Fail Fast）
     */
    async saveFile(content, filename, mimeType, options = {}) {
        // Fail Fast: 验证参数
        if (typeof content !== 'string') {
            throw new Error(`Invalid content: must be a string, got ${typeof content}`);
        }
        if (typeof filename !== 'string' || !filename.trim()) {
            throw new Error(`Invalid filename: must be a non-empty string, got "${filename}"`);
        }
        if (typeof mimeType !== 'string' || !mimeType.trim()) {
            throw new Error(`Invalid mimeType: must be a non-empty string, got "${mimeType}"`);
        }

        // 提取选项
        const {
            preferFileSystemAPI = true,
            fileDescription = '文件'
        } = options;

        // 根据浏览器支持和用户偏好选择保存方式
        if (preferFileSystemAPI && this.isFileSystemAccessSupported()) {
            return await this._saveViaFileSystemAPI(content, filename, mimeType, fileDescription);
        } else {
            this._saveViaDownload(content, filename, mimeType);
            return { success: true, cancelled: false, method: 'download' };
        }
    }

    /**
     * 通过文件系统访问API保存文件（现代浏览器）
     * 
     * 优点：用户可以选择保存位置和文件名
     * 缺点：需要用户交互，用户可能取消操作
     * 
     * @private
     * @param {string} content - 文件内容
     * @param {string} filename - 建议的文件名
     * @param {string} mimeType - MIME类型
     * @param {string} fileDescription - 文件类型描述
     * @returns {Promise<{success: boolean, cancelled: boolean, method: string}>} 保存结果（cancelled 始终存在）
     * @throws {Error} 当保存失败时抛出错误（用户取消除外）
     */
    async _saveViaFileSystemAPI(content, filename, mimeType, fileDescription) {
        try {
            // 提取文件扩展名（Fail Fast：如果 filename 无扩展名会抛出错误）
            const extension = extractFileExtension(filename);
            
            // 显示文件保存对话框
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: fileDescription,
                    accept: {
                        [mimeType]: [`.${extension}`]
                    }
                }]
            });
            
            // 创建可写流并写入内容
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            
            return { 
                success: true, 
                cancelled: false,
                method: 'file-system-api' 
            };
            
        } catch (error) {
            // 用户取消操作不是错误，正常返回
            if (error.name === 'AbortError') {
                return { 
                    success: true, 
                    cancelled: true, 
                    method: 'file-system-api' 
                };
            }
            
            // 其他错误需要抛出（Fail Fast）
            throw new Error(`通过文件系统API保存文件失败: ${error.message}`);
        }
    }

    /**
     * 通过传统下载方式保存文件（兼容所有浏览器）
     * 
     * 原理：创建Blob → 生成临时URL → 创建隐藏<a>标签 → 触发点击 → 清理资源
     * 
     * 优点：兼容性好，无需用户交互
     * 缺点：文件自动下载到浏览器默认下载文件夹，用户无法选择位置
     * 
     * @private
     * @param {string} content - 文件内容
     * @param {string} filename - 文件名
     * @param {string} mimeType - MIME类型
     * @throws {Error} 当保存失败时抛出错误（Fail Fast）
     */
    _saveViaDownload(content, filename, mimeType) {
        let blob = null;
        let url = null;
        let link = null;
        
        try {
            // 步骤1：创建Blob对象
            blob = new Blob([content], { type: mimeType });
            
            // Fail Fast: 验证Blob创建成功
            if (!blob || blob.size === 0) {
                throw new Error('创建Blob失败，内容可能为空');
            }
            
            // 步骤2：创建对象URL
            url = URL.createObjectURL(blob);
            
            // Fail Fast: 验证URL创建成功
            if (!url) {
                throw new Error('创建对象URL失败');
            }
            
            // 步骤3：从HTML template克隆下载链接（性能优化：使用预定义模板）
            link = this.downloadLinkTemplate.content.firstElementChild.cloneNode(true);
            link.href = url;
            link.download = filename;
            
            // 添加到DOM并触发下载
            document.body.appendChild(link);
            link.click();
            
            // 步骤4：立即移除临时元素
            document.body.removeChild(link);
            
        } catch (error) {
            // 清理：确保临时元素被移除
            if (link && link.parentNode) {
                document.body.removeChild(link);
            }
            
            // Fail Fast: 抛出详细错误信息
            throw new Error(`传统下载方式保存文件失败: ${error.message}`);
            
        } finally {
            // 清理：释放对象URL（无论成功或失败都要执行）
            if (url) {
                URL.revokeObjectURL(url);
            }
        }
    }
}


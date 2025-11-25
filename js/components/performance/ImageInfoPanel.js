/**
 * ImageInfoPanel - 图片信息面板组件
 * 负责显示图片的详细信息，包括文件名、大小、格式、尺寸、降采样信息、长宽比、PPI、像素总数和百万像素值
 * 
 * 职责说明：
 * - 这是一个纯UI渲染组件，专门为 PerformanceReportPage 提供图片信息展示功能
 * - 从图片元数据中读取数据并格式化显示
 * - 支持降采样图片的完整信息展示
 * - 遵循容器-内容分离模式：接收容器元素，自己管理内部DOM
 * 
 * 当前被使用的模块：
 * - PerformanceReportPage (services/ui/PerformanceReportPage.js) - 性能监控主页面
 * 
 * 当前依赖的模块：
 * - formatFileSize, formatPixelCount (helpers/fileFormatters.js) - 文件格式化工具（文件大小、像素数）
 * - formatMP (helpers/numberFormatters.js) - 百万像素格式化工具
 * - getMimeTypeByExtension, extractFileExtension (helpers/fileUtils.js) - 文件工具函数（MIME类型推断、扩展名提取）
 * - calculateAspectRatio (helpers/imageDimensions.js) - 图片尺寸计算工具（长宽比）
 * - ppiExtractorService (utils/PPIExtractorService.js) - PPI信息格式化服务 (通过DI注入)
 * 
 * 架构说明：
 * - DOM 元素通过 init() 方法传入，不在构造函数中初始化（支持动态 DOM）
 * - 使用 Fail Fast 原则验证所有关键参数和DOM元素
 * - 所有格式化逻辑委托给 helpers 和 services，本组件只负责 UI 更新
 */

import { formatFileSize, formatPixelCount } from '../../helpers/fileFormatters.js';
import { formatMP } from '../../helpers/numberFormatters.js';
import { getMimeTypeByExtension, extractFileExtension } from '../../helpers/fileUtils.js';
import { calculateAspectRatio } from '../../helpers/imageDimensions.js';

export class ImageInfoPanel {
    /**
     * 构造函数 - 创建图片信息面板实例
     * @param {PPIExtractorService} ppiExtractorService - PPI信息提取服务
     * @throws {Error} 当ppiExtractorService依赖缺失时抛出错误
     */
    constructor(ppiExtractorService) {
        // Fail Fast: 验证依赖
        if (!ppiExtractorService) {
            throw new Error('ImageInfoPanel requires ppiExtractorService dependency');
        }
        
        this.ppiExtractorService = ppiExtractorService;
        
        // DOM 元素引用（通过 init 传入）
        this.elements = null;
    }
    
    /**
     * 初始化面板（接收容器，自己查找元素）
     * @param {HTMLElement} container - 面板容器元素
     * @returns {void}
     * @throws {Error} 当容器无效或关键元素缺失时立即抛出错误
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('ImageInfoPanel.init: container must be a valid HTMLElement');
        }
        
        // 子组件自己查找需要的元素（封装）
        this.elements = {
            imageFileName: container.querySelector('#imageFileName'),
            imageOriginalFileSize: container.querySelector('#imageOriginalFileSize'),
            imageFileSize: container.querySelector('#imageFileSize'),
            imageFileFormat: container.querySelector('#imageFileFormat'),
            imageOriginalDimensions: container.querySelector('#imageOriginalDimensions'),
            imageDownsampledDimensions: container.querySelector('#imageDownsampledDimensions'),
            imageAspectRatio: container.querySelector('#imageAspectRatio'),
            imagePPIX: container.querySelector('#imagePPIX'),
            imagePPIY: container.querySelector('#imagePPIY'),
            imagePixelCount: container.querySelector('#imagePixelCount'),
            imageDownsampledPixelCount: container.querySelector('#imageDownsampledPixelCount'),
            imageMP: container.querySelector('#imageMP'),
            imageDownsampledMP: container.querySelector('#imageDownsampledMP'),
            // 控制行显示的元素
            imageOriginalFileSizeRow: container.querySelector('#imageOriginalFileSizeRow'),
            imageDownsampledDimensionsRow: container.querySelector('#imageDownsampledDimensionsRow'),
            imageDownsampledPixelCountRow: container.querySelector('#imageDownsampledPixelCountRow'),
            imageDownsampledMPRow: container.querySelector('#imageDownsampledMPRow'),
            // Label元素
            imageFileSizeLabel: container.querySelector('#imageFileSizeLabel'),
            imagePixelCountLabel: container.querySelector('#imagePixelCountLabel'),
            imageMPLabel: container.querySelector('#imageMPLabel')
        };
        
        // Fail Fast: 验证所有元素（包括条件显示的元素）
        const requiredElements = [
            'imageFileName', 'imageOriginalFileSize', 'imageFileSize', 'imageFileFormat',
            'imageOriginalDimensions', 'imageDownsampledDimensions', 'imageAspectRatio',
            'imagePPIX', 'imagePPIY', 'imagePixelCount', 'imageDownsampledPixelCount',
            'imageMP', 'imageDownsampledMP',
            'imageOriginalFileSizeRow', 'imageDownsampledDimensionsRow',
            'imageDownsampledPixelCountRow', 'imageDownsampledMPRow',
            'imageFileSizeLabel', 'imagePixelCountLabel', 'imageMPLabel'
        ];
        
        requiredElements.forEach(elementName => {
            if (!this.elements[elementName]) {
                throw new Error(`ImageInfoPanel.init: #${elementName} not found in container`);
            }
        });
    }
    
    /**
     * 渲染图片信息
     * @param {Object} imageMetadata - 图片元数据对象
     * @param {string} imageMetadata.fileName - 文件名
     * @param {number} imageMetadata.fileSize - 文件大小（字节）
     * @param {number} imageMetadata.width - 当前宽度（降采样后）
     * @param {number} imageMetadata.height - 当前高度（降采样后）
     * @param {number} imageMetadata.originalWidth - 原始宽度
     * @param {number} imageMetadata.originalHeight - 原始高度
     * @param {number} [imageMetadata.originalFileSize] - 原始文件大小（降采样时）
     * @param {Object|null} ppiInfo - PPI信息对象，null表示图片无PPI信息
     * @returns {void}
     * @throws {Error} 当参数缺失或图片元数据无效时立即抛出错误（Fail Fast）
     */
    render(imageMetadata, ppiInfo) {
        // Fail Fast: 验证参数存在性（必须明确传递，即使是null）
        if (arguments.length < 2) {
            throw new Error('ImageInfoPanel.render: both imageMetadata and ppiInfo are required (ppiInfo can be null)');
        }
        // Fail Fast: 验证图片元数据
        if (!imageMetadata) {
            throw new Error('ImageInfoPanel.render: imageMetadata is required');
        }
        if (!imageMetadata.fileName || typeof imageMetadata.fileName !== 'string') {
            throw new Error('ImageInfoPanel.render: imageMetadata.fileName must be a non-empty string');
        }
        if (typeof imageMetadata.fileSize !== 'number') {
            throw new Error('ImageInfoPanel.render: imageMetadata.fileSize must be a number');
        }
        if (typeof imageMetadata.width !== 'number' || typeof imageMetadata.height !== 'number') {
            throw new Error('ImageInfoPanel.render: imageMetadata width/height must be numbers');
        }
        if (typeof imageMetadata.originalWidth !== 'number' || typeof imageMetadata.originalHeight !== 'number') {
            throw new Error('ImageInfoPanel.render: imageMetadata originalWidth/originalHeight must be numbers');
        }
        
        // 推断MIME类型
        const ext = extractFileExtension(imageMetadata.fileName);
        const mimeType = getMimeTypeByExtension(ext);
        
        // 判断是否降采样
        const isDownsampled = imageMetadata.originalWidth !== imageMetadata.width || 
                              imageMetadata.originalHeight !== imageMetadata.height;
        
        // 计算像素总数
        const originalPixelCount = imageMetadata.originalWidth * imageMetadata.originalHeight;
        const currentPixelCount = imageMetadata.width * imageMetadata.height;
        
        // 计算长宽比（使用原始尺寸）
        const aspectRatio = calculateAspectRatio(imageMetadata.originalWidth, imageMetadata.originalHeight);
        
        // 格式化PPI信息（委托给PPIExtractorService）
        const formattedPPIInfo = this.ppiExtractorService.formatPPIInfo(ppiInfo);
        
        // 渲染基本信息
        this.elements.imageFileName.textContent = imageMetadata.fileName;
        this.elements.imageFileFormat.textContent = mimeType;
        this.elements.imageOriginalDimensions.textContent = `${imageMetadata.originalWidth} × ${imageMetadata.originalHeight}`;
        this.elements.imageAspectRatio.textContent = aspectRatio;
        this.elements.imagePPIX.textContent = formattedPPIInfo.x;
        this.elements.imagePPIY.textContent = formattedPPIInfo.y;
        
        // 处理降采样相关信息
        if (isDownsampled) {
            // 显示原始文件大小
            if (imageMetadata.originalFileSize) {
                this.elements.imageOriginalFileSize.textContent = formatFileSize(imageMetadata.originalFileSize);
                this.elements.imageOriginalFileSizeRow.classList.remove('hidden');
            }
            
            // 显示当前（降采样后）文件大小
            this.elements.imageFileSize.textContent = formatFileSize(imageMetadata.fileSize);
            this.elements.imageFileSizeLabel.textContent = '采样后文件大小:';
            
            // 显示降采样尺寸
            this.elements.imageDownsampledDimensions.textContent = `${imageMetadata.width} × ${imageMetadata.height}`;
            this.elements.imageDownsampledDimensionsRow.classList.remove('hidden');
            
            // 显示原始和降采样像素信息
            this.elements.imagePixelCount.textContent = formatPixelCount(originalPixelCount);
            this.elements.imagePixelCountLabel.textContent = '原始像素总数:';
            this.elements.imageDownsampledPixelCount.textContent = formatPixelCount(currentPixelCount);
            this.elements.imageDownsampledPixelCountRow.classList.remove('hidden');
            
            this.elements.imageMP.textContent = formatMP(originalPixelCount);
            this.elements.imageMPLabel.textContent = '原始MP(百万像素):';
            this.elements.imageDownsampledMP.textContent = formatMP(currentPixelCount);
            this.elements.imageDownsampledMPRow.classList.remove('hidden');
        } else {
            // 未降采样：隐藏降采样相关行
            this.elements.imageOriginalFileSizeRow.classList.add('hidden');
            this.elements.imageDownsampledDimensionsRow.classList.add('hidden');
            this.elements.imageDownsampledPixelCountRow.classList.add('hidden');
            this.elements.imageDownsampledMPRow.classList.add('hidden');
            
            // 恢复Label文本
            this.elements.imageFileSizeLabel.textContent = '文件大小:';
            this.elements.imagePixelCountLabel.textContent = '像素总数:';
            this.elements.imageMPLabel.textContent = 'MP(百万像素):';
            
            // 显示当前信息
            this.elements.imageFileSize.textContent = formatFileSize(imageMetadata.fileSize);
            this.elements.imagePixelCount.textContent = formatPixelCount(currentPixelCount);
            this.elements.imageMP.textContent = formatMP(currentPixelCount);
        }
    }
    
    /**
     * 销毁组件，清理引用
     * @returns {void}
     */
    destroy() {
        this.elements = null;
    }
}


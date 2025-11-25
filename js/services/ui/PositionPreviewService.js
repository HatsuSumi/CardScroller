/**
 * PositionPreviewService - 位置预览服务
 * 专门处理模态框图片预览逻辑，负责设置模态框图片、计算预览尺寸、更新预览位置、管理视口边界指示器。保持与主显示区域完全一致的缩放算法，确保预览效果准确。
 * 
 * 当前被使用的模块：
 * - PositionSelectorService (modal/PositionSelectorService.js) - 图片预览功能
 * 
 * 当前依赖的模块：
 * - BaseUIService (base/BaseUIService.js) - UI服务基类，提供DOM缓存和事件管理 (通过继承)
 * - stateManager (core/StateManager.js) - 状态管理 (通过DI注入)
 */
import { BaseUIService } from '../base/BaseUIService.js';

export class PositionPreviewService extends BaseUIService {
    /**
     * 构造函数
     * @param {StateManager} stateManager - 状态管理器
     * @throws {Error} 当核心依赖缺失时抛出错误（Fail Fast）
     */
    constructor(stateManager) {
        super(); // 调用BaseUIService构造函数
        
        // Fail Fast: 检查核心依赖
        if (!stateManager) {
            throw new Error('PositionPreviewService requires stateManager');
        }
        
        this.stateManager = stateManager;
        
        // 技术实现细节：硬编码的UI布局常量
        this.MODAL_PREVIEW_MAX_HEIGHT = 300;  // 模态框预览最大高度（像素）
        
        // 🚀 性能优化：缓存视口边界指示器引用，避免频繁 querySelector
        this.cachedLeftIndicator = null;
        this.cachedRightIndicator = null;
    }


    /**
     * 设置模态框图片
     * 初始化模态框图片的 src、CSS 类和尺寸，准备进行位置预览
     * 同时创建视口边界指示器
     * @param {HTMLElement} modalImage - 模态框图片元素
     * @returns {void}
     * @throws {Error} 当必需的DOM元素或图片数据缺失时抛出错误（Fail Fast）
     */
    setupModalImage(modalImage) {
        // Fail Fast: 检查必需的DOM元素和业务数据
        if (!modalImage) {
            throw new Error('PositionPreviewService.setupModalImage: modalImage element is required');
        }
        
        // 🚀 性能优化：缓存状态引用，避免重复的深层对象属性访问
        const imageState = this.stateManager.state.content.image;
        const imageData = imageState.data;
        
        // Fail Fast: 验证图片业务数据
        this._validateImageState(imageState, 'setupModalImage');
        
        // 🚀 性能优化：只在图片数据变化时才重新设置 src，避免重复解码大图
        if (modalImage.src !== imageData) {
            modalImage.src = imageData;
        }
        
        // 添加CSS类
        modalImage.classList.add('position-modal-image');
        
        // 获取主显示区域的缩放信息
        const { scaledHeight, scaledWidth } = this._getScalingDimensions(imageState);
        
        // 计算预览图片尺寸
        const maxPreviewHeight = this._getMaxPreviewHeight();
        const previewScaleRatio = maxPreviewHeight / scaledHeight;
        const finalImageWidth = Math.round(scaledWidth * previewScaleRatio);
        const finalImageHeight = Math.round(scaledHeight * previewScaleRatio);
        
        modalImage.style.setProperty('--modal-image-width', `${finalImageWidth}px`);
        modalImage.style.setProperty('--modal-image-height', `${finalImageHeight}px`);
        modalImage.style.setProperty('--modal-image-translateX', '0px');
        
        // 🚀 性能优化：清理旧的指示器（从 DOM 中移除）
        if (this.cachedLeftIndicator && this.cachedLeftIndicator.parentNode) {
            this.cachedLeftIndicator.parentNode.removeChild(this.cachedLeftIndicator);
        }
        if (this.cachedRightIndicator && this.cachedRightIndicator.parentNode) {
            this.cachedRightIndicator.parentNode.removeChild(this.cachedRightIndicator);
        }
        
        // 重置指示器缓存，确保新图片重新创建指示器
        this.cachedLeftIndicator = null;
        this.cachedRightIndicator = null;
        
        // 🚀 性能优化：立即创建并设置指示器位置（只在图片加载时执行一次）
        this._ensureViewportIndicators(previewScaleRatio);
    }

    /**
     * 刷新模态框图片尺寸
     * 在 DOM 渲染完成后调用，重新计算并更新预览图片尺寸
     * 并重新计算右指示器位置（因为缩放比例可能变化）
     * @param {HTMLElement} modalImage - 模态框图片元素
     * @param {number} tempPosition - 当前临时位置
     * @returns {void}
     * @throws {Error} 当必需的DOM元素或图片数据缺失时抛出错误（Fail Fast）
     */
    refreshModalImageSize(modalImage, tempPosition) {
        // Fail Fast: 检查必需的DOM元素和业务数据
        if (!modalImage) {
            throw new Error('PositionPreviewService.refreshModalImageSize: modalImage element is required');
        }
        
        // 🚀 性能优化：缓存状态引用，避免重复的深层对象属性访问
        const imageState = this.stateManager.state.content.image;
        
        // Fail Fast: 验证图片业务数据
        this._validateImageState(imageState, 'refreshModalImageSize');
        
        // 重新获取预览窗口尺寸
        const maxPreviewHeight = this._getMaxPreviewHeight();
        
        // 获取主显示区域的缩放信息
        const { scaledHeight, scaledWidth } = this._getScalingDimensions(imageState);
        
        // 重新计算图片尺寸
        const previewHeight = Math.min(maxPreviewHeight, scaledHeight);
        const previewScaleRatio = previewHeight / scaledHeight;
        const finalImageWidth = Math.round(scaledWidth * previewScaleRatio);
        const finalImageHeight = previewHeight;
        
        // 使用CSS自定义属性
        modalImage.style.setProperty('--modal-image-width', `${finalImageWidth}px`);
        modalImage.style.setProperty('--modal-image-height', `${finalImageHeight}px`);
        
        // 🚀 性能优化：只重新计算右指示器位置（因为缩放比例变化）
        this._updateRightIndicatorPosition(previewScaleRatio);
        
        // 重新触发预览更新（只更新图片位置）
        // 使用 ?? 而不是 ||，因为 0 是有效的位置值
        const currentValue = tempPosition ?? 0;
        this.updateModalPreview(modalImage, currentValue);
    }

    /**
     * 更新模态框预览
     * 根据给定的滚动位置，更新预览图片的水平偏移
     * 🚀 性能优化：滑块移动时只更新图片位置，不重新计算指示器位置（避免每帧60次冗余计算）
     * @param {HTMLElement} modalImage - 模态框图片元素
     * @param {number} position - 位置值（滚动距离坐标）
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    updateModalPreview(modalImage, position) {
        // Fail Fast: 检查必需的DOM元素
        if (!modalImage) {
            throw new Error('PositionPreviewService.updateModalPreview: modalImage element is required');
        }

        // 计算预览缩放比例（保持完全相同的算法）
        const previewScaleRatio = this._calculatePreviewScaleRatio();
        
        // 保持完全相同的坐标系算法
        const previewScrollPosition = position * previewScaleRatio;
        const targetImageLeftPosition = -previewScrollPosition;
        
        // 使用CSS自定义属性而非直接transform
        modalImage.style.setProperty('--modal-image-translateX', `${targetImageLeftPosition}px`);
        
        // ✅ 性能优化：不再每次滑块移动都更新指示器位置
        // 指示器位置只在以下时机更新：
        // 1. setupModalImage() - 图片加载时创建并设置初始位置
        // 2. refreshModalImageSize() - 图片尺寸变化时重新计算位置
    }

    /**
     * 确保视口边界指示器存在
     * 🚀 性能优化：只在图片加载时调用一次，创建指示器并设置初始位置
     * @param {number} previewScaleRatio - 预览缩放比例
     * @returns {void}
     * @throws {Error} 当必需的DOM结构缺失时抛出错误（Fail Fast）
     * @private
     */
    _ensureViewportIndicators(previewScaleRatio) {
        const previewViewport = this._querySelector('.preview-viewport');
        
        // Fail Fast: .preview-viewport 是模态框必需的DOM结构
        if (!previewViewport) {
            throw new Error('PositionPreviewService._ensureViewportIndicators: Required DOM element .preview-viewport not found');
        }

        // 计算指示器位置
        const leftBorderPosition = 0;
        const rightBorderPosition = this._calculateRightBorderPosition(previewScaleRatio);
        
        // 创建左指示器（位置永远是0）
        if (!this.cachedLeftIndicator) {
            this.cachedLeftIndicator = this._createIndicatorFromTemplate('left', leftBorderPosition);
            previewViewport.appendChild(this.cachedLeftIndicator);
            this._showIndicatorWithAnimation(this.cachedLeftIndicator);
        }
        
        // 创建右指示器
        if (!this.cachedRightIndicator) {
            this.cachedRightIndicator = this._createIndicatorFromTemplate('right', rightBorderPosition);
            previewViewport.appendChild(this.cachedRightIndicator);
            this._showIndicatorWithAnimation(this.cachedRightIndicator);
        }
    }

    /**
     * 更新右指示器位置
     * 🚀 性能优化：只在图片尺寸变化或窗口resize时调用，避免滑块移动时冗余计算
     * @param {number} previewScaleRatio - 预览缩放比例
     * @returns {void}
     * @throws {Error} 当右指示器未创建时抛出错误（Fail Fast）
     * @private
     */
    _updateRightIndicatorPosition(previewScaleRatio) {
        // Fail Fast: 右指示器应该已经通过 setupModalImage 创建，如果不存在说明调用顺序错误
        if (!this.cachedRightIndicator) {
            throw new Error('PositionPreviewService._updateRightIndicatorPosition: Right indicator must be created before updating position');
        }

        // 计算并更新右指示器位置
        const rightBorderPosition = this._calculateRightBorderPosition(previewScaleRatio);
        this.cachedRightIndicator.style.setProperty('--indicator-left', `${rightBorderPosition}px`);
    }

    /**
     * 计算右指示器的边界位置
     * @param {number} previewScaleRatio - 预览缩放比例
     * @returns {number} 右边界位置（像素）
     * @private
     */
    _calculateRightBorderPosition(previewScaleRatio) {
        const viewportWidthInPreview = window.innerWidth * previewScaleRatio;
        return viewportWidthInPreview - 2;
    }

    /**
     * 延迟显示指示器，避免闪烁
     * @param {HTMLElement} indicator - 指示器元素
     * @returns {void}
     * @private
     */
    _showIndicatorWithAnimation(indicator) {
        // 延迟显示，避免闪烁
        requestAnimationFrame(() => {
            indicator.classList.add('viewport-indicator--visible');
        });
    }

    /**
     * 验证图片状态数据的完整性
     * @param {Object} imageState - 图片状态对象
     * @param {string} methodName - 调用方法名（用于错误消息）
     * @returns {void}
     * @throws {Error} 当图片数据或缩放信息缺失时抛出错误（Fail Fast）
     * @private
     */
    _validateImageState(imageState, methodName) {
        // Fail Fast: 图片数据是必需的业务数据
        if (!imageState.data) {
            throw new Error(`PositionPreviewService.${methodName}: image data is required in state`);
        }
        
        // Fail Fast: 缩放信息是必需的业务数据结构
        if (!imageState.scaling) {
            throw new Error(`PositionPreviewService.${methodName}: image scaling data is required in state`);
        }
    }

    /**
     * 获取图片的缩放尺寸
     * @param {Object} imageState - 图片状态对象
     * @returns {{scaledHeight: number, scaledWidth: number}} 缩放后的高度和宽度
     * @private
     */
    _getScalingDimensions(imageState) {
        return {
            scaledHeight: imageState.scaling.scaledHeight,
            scaledWidth: imageState.scaling.scaledWidth
        };
    }

    /**
     * 从模板创建指示器元素
     * 使用 HTML Template 元素克隆创建视口边界指示器
     * @param {string} type - 指示器类型 ('left' 或 'right')
     * @param {number} position - 位置值
     * @returns {HTMLElement} 创建的指示器元素
     * @throws {Error} 当模板元素不存在时抛出错误（Fail Fast）
     * @private
     */
    _createIndicatorFromTemplate(type, position) {
        const template = this._getElement('viewportIndicatorTemplate');
        
        // Fail Fast: 模板元素是必需的 DOM 结构，不存在应立即报错
        if (!template) {
            throw new Error('PositionPreviewService: Required template element #viewportIndicatorTemplate not found');
        }

        // 使用 template.content.cloneNode(true) 克隆模板内容
        const indicator = template.content.cloneNode(true).firstElementChild;
        
        indicator.classList.add(`viewport-indicator--${type}`);
        
        indicator.style.setProperty('--indicator-left', `${position}px`);
        
        return indicator;
    }

    /**
     * 获取预览视口的最大高度
     * @returns {number} 预览视口的最大高度（像素）
     * @private
     */
    _getMaxPreviewHeight() {
        const defaultMaxHeight = this.MODAL_PREVIEW_MAX_HEIGHT;
        const previewViewport = this._querySelector('.preview-viewport');
        
        if (previewViewport && previewViewport.clientHeight > 0) {
            return previewViewport.clientHeight;
        }
        
        return defaultMaxHeight;
    }

    /**
     * 计算预览缩放比例
     * 根据主显示区域的缩放高度和预览视口的最大高度计算缩放比例
     * @returns {number} 预览缩放比例
     * @throws {Error} 当关键业务数据结构缺失时抛出错误（Fail Fast）
     * @private
     */
    _calculatePreviewScaleRatio() {
        const imageState = this.stateManager.state.content.image;
        
        // Fail Fast: 缩放信息是必需的业务数据结构
        if (!imageState.scaling) {
            throw new Error('PositionPreviewService._calculatePreviewScaleRatio: image scaling data is required in state');
        }
        
        const mainScaledHeight = imageState.scaling.scaledHeight;
        const maxPreviewHeight = this._getMaxPreviewHeight();
        const previewHeight = Math.min(maxPreviewHeight, mainScaledHeight);
        const previewScaleRatio = previewHeight / mainScaledHeight;
        
        return previewScaleRatio;
    }

}

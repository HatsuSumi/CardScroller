/**
 * PreviewManager - 入场动画预览功能管理组件
 * 负责管理预览Canvas和播放入场动画预览，职责单一，不包含配置数据管理和边界编辑逻辑
 * 
 * 职责说明：
 * - 管理预览Canvas的初始化和尺寸设置
 * - 加载图片并播放入场动画预览
 * - 调整配置坐标到视口坐标系
 * - 管理预览容器的背景色
 * 
 * 当前被使用的模块：
 * - EntryAnimationConfigPage (ui/EntryAnimationConfigPage.js) - 初始化和调用预览功能
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 读取图片数据和滚动位置 (通过DI注入)
 * - entryAnimationService (business/EntryAnimationService.js) - 播放入场动画 (通过DI注入)
 * - viewportCalculatorService (utils/ViewportCalculatorService.js) - 视口计算和坐标转换 (通过DI注入)
 * - loadImageFromDataURL (helpers/imageLoader.js) - 图片加载工具函数 (动态import)
 * 
 * 架构说明：
 * - 遵循"父传容器，子自查找"模式，与 PerformanceReportPage 的子组件架构一致
 * - 通过方法参数接收配置和编辑器Canvas，不直接依赖其他manager
 * - 所有DOM元素在 init() 中查找并验证（Fail Fast）
 */

export class PreviewManager {
    /**
     * 构造函数 - 创建预览管理组件
     * @param {StateManager} stateManager - 状态管理器
     * @param {EntryAnimationService} entryAnimationService - 入场动画服务
     * @param {ViewportCalculatorService} viewportCalculatorService - 视口计算服务
     * @throws {Error} 当依赖缺失时立即抛出错误
     */
    constructor(stateManager, entryAnimationService, viewportCalculatorService) {
        // Fail Fast: 验证依赖
        if (!stateManager) {
            throw new Error('PreviewManager requires stateManager dependency');
        }
        if (!entryAnimationService) {
            throw new Error('PreviewManager requires entryAnimationService dependency');
        }
        if (!viewportCalculatorService) {
            throw new Error('PreviewManager requires viewportCalculatorService dependency');
        }
        
        this.stateManager = stateManager;
        this.entryAnimationService = entryAnimationService;
        this.viewportCalculatorService = viewportCalculatorService;
        
        // DOM元素引用
        this.elements = {};
    }
    
    /**
     * 初始化组件，查找需要的DOM元素
     * @param {HTMLElement} container - 父容器元素
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时立即抛出错误
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('PreviewManager.init: container must be a valid HTMLElement');
        }
        
        // 查找所有需要的DOM元素
        this.elements = {
            previewCanvas: container.querySelector('#entryAnimationPreviewCanvas'),
            previewContainer: container.querySelector('.preview-canvas-container'),
            previewBtn: container.querySelector('#entryAnimationPreviewBtn')
        };
        
        // Fail Fast: 验证所有必需元素
        if (!this.elements.previewCanvas) {
            throw new Error('PreviewManager.init: #entryAnimationPreviewCanvas not found in container');
        }
        if (!this.elements.previewContainer) {
            throw new Error('PreviewManager.init: .preview-canvas-container not found in container');
        }
        if (!this.elements.previewBtn) {
            throw new Error('PreviewManager.init: #entryAnimationPreviewBtn not found in container');
        }
    }
    
    /**
     * 初始化预览容器背景色
     * @returns {void}
     * @throws {Error} 当背景色配置缺失或无效时立即抛出错误
     */
    initBackgroundColor() {
        const backgroundColor = this.stateManager.state.ui.display.backgroundColor;
        
        // Fail Fast: 验证背景色配置
        if (!backgroundColor) {
            throw new Error('PreviewManager.initBackgroundColor: ui.display.backgroundColor is missing from state');
        }
        if (typeof backgroundColor !== 'string') {
            throw new Error('PreviewManager.initBackgroundColor: backgroundColor must be a string');
        }
        if (!/^#[0-9A-Fa-f]{6}$/.test(backgroundColor)) {
            throw new Error('PreviewManager.initBackgroundColor: backgroundColor must be a valid hex color (e.g., #000000)');
        }
        
        this.updateBackgroundColor(backgroundColor);
    }
    
    /**
     * 更新预览Canvas背景色
     * @param {string} color - 背景色（十六进制格式，如 #000000）
     * @returns {void}
     */
    updateBackgroundColor(color) {
        // 注意：这里使用内联样式是因为背景色是动态的用户配置
        // 设置Canvas元素的背景色，而不是外层容器
        this.elements.previewCanvas.style.backgroundColor = color;
    }
    
    /**
     * 播放入场动画预览
     * @param {Object} config - 入场动画配置对象
     * @returns {void}
     * @throws {Error} 当图片数据缺失时立即抛出错误
     */
    playPreview(config) {
        // Fail Fast: 验证参数
        if (!config || typeof config !== 'object') {
            throw new Error('PreviewManager.playPreview: config must be a valid object');
        }
        
        // 从状态管理器获取图片数据
        const imageData = this.stateManager.state.content.image.data;
        
        // Fail Fast: 验证图片数据存在
        if (!imageData) {
            throw new Error('PreviewManager.playPreview: image data is missing from state');
        }
        
        // 点击播放时立即隐藏遮罩层，提供更好的用户体验
        this.elements.previewContainer.classList.add('playing');
        
        // 使用统一的图片加载工具
        import('../../helpers/imageLoader.js').then(({ loadImageFromDataURL }) => {
            return loadImageFromDataURL(imageData);
        }).then((image) => {
            // 使用ViewportCalculatorService统一方法计算可视区域
            // 考虑反向滚动：反向滚动时使用 endPosition 作为视口起始位置
            const scrollState = this.stateManager.state.playback.scroll;
            const startPosition = scrollState.reverseScroll ? scrollState.endPosition : scrollState.startPosition;
            const viewportWidth = this.viewportCalculatorService.calculateViewportWidth(
                startPosition, 
                image.naturalWidth, 
                image.naturalHeight
            );
            
            // 调整边界线坐标，使其相对于可视区域
            const adjustedConfig = this.adjustConfigForViewport(config, viewportWidth, startPosition);
            
            // 创建裁剪后的图片（使用ViewportCalculatorService统一方法）
            const croppedImagePromise = this.viewportCalculatorService.createCroppedImageForViewport(
                image,
                startPosition,
                viewportWidth
            );
            
            croppedImagePromise.then((viewportImage) => {
                // 图片裁剪完成后播放预览（isPreview = true，不触发性能监控）
                this.entryAnimationService.startAnimation(adjustedConfig, () => {
                    // 动画结束后移除playing状态，恢复悬停交互
                    this.elements.previewContainer.classList.remove('playing');
                }, this.elements.previewCanvas, viewportImage, true);
            }).catch((error) => {
                // 图片裁剪失败时也要恢复遮罩层交互
                this.elements.previewContainer.classList.remove('playing');
                throw new Error(`PreviewManager.playPreview: ${error.message}`);
            });
        }).catch((error) => {
            // 图片加载失败时也要恢复遮罩层交互
            this.elements.previewContainer.classList.remove('playing');
            throw new Error(`PreviewManager.playPreview: ${error.message}`);
        });
    }
    
    /**
     * 调整配置中的边界线坐标，使其相对于可视区域
     * 过滤掉不在视口内的卡片，确保传递给动画服务的配置都是有效的
     * @param {Object} config - 原始配置对象
     * @param {number} viewportWidth - 视口宽度（原图坐标）
     * @param {number} startPosition - 视口起始位置（原图坐标，已考虑反向滚动）
     * @returns {Object} 调整后的配置对象
     * @throws {Error} 当输入无效或无可见卡片时立即抛出错误
     * @private
     */
    adjustConfigForViewport(config, viewportWidth, startPosition) {
        const endPosition = startPosition + viewportWidth;
        
        // Fail Fast: 验证输入
        if (typeof startPosition !== 'number' || !isFinite(startPosition) || startPosition < 0) {
            throw new Error('PreviewManager.adjustConfigForViewport: Invalid startPosition');
        }
        if (typeof viewportWidth !== 'number' || !isFinite(viewportWidth) || viewportWidth <= 0) {
            throw new Error('PreviewManager.adjustConfigForViewport: Invalid viewportWidth');
        }
        
        // 过滤并调整卡片配置
        const filteredAnimations = [];
        const filteredBoundaries = [];
        
        const cardCount = config.cardAnimations.length;
        for (let i = 0; i < cardCount; i++) {
            const leftBoundary = config.cardBoundaries[i * 2];
            const rightBoundary = config.cardBoundaries[i * 2 + 1];
            
            // Fail Fast: 验证边界坐标
            if (typeof leftBoundary !== 'number' || !isFinite(leftBoundary)) {
                throw new Error(`PreviewManager.adjustConfigForViewport: Invalid left boundary at card ${i}`);
            }
            if (typeof rightBoundary !== 'number' || !isFinite(rightBoundary)) {
                throw new Error(`PreviewManager.adjustConfigForViewport: Invalid right boundary at card ${i}`);
            }
            if (leftBoundary >= rightBoundary) {
                throw new Error(`PreviewManager.adjustConfigForViewport: Left boundary must be less than right boundary at card ${i}`);
            }
            
            // 检查卡片是否与视口有交集
            // 卡片完全在视口右侧：leftBoundary >= endPosition
            // 卡片完全在视口左侧：rightBoundary <= startPosition
            const isVisible = rightBoundary > startPosition && leftBoundary < endPosition;
            
            if (isVisible) {
                // 钳制边界到视口范围内
                const clampedLeftBoundary = Math.max(leftBoundary, startPosition);
                const clampedRightBoundary = Math.min(rightBoundary, endPosition);
                
                // 转换为相对于视口起始位置的坐标
                const viewportLeftBoundary = this.viewportCalculatorService.convertToViewportCoordinate(
                    clampedLeftBoundary, 
                    startPosition
                );
                const viewportRightBoundary = this.viewportCalculatorService.convertToViewportCoordinate(
                    clampedRightBoundary, 
                    startPosition
                );
                
                // Fail Fast: 验证转换后的坐标非负且有效
                if (viewportLeftBoundary < 0 || viewportRightBoundary < 0) {
                    throw new Error(`PreviewManager.adjustConfigForViewport: Negative viewport coordinate at card ${i}`);
                }
                if (viewportLeftBoundary >= viewportRightBoundary) {
                    throw new Error(`PreviewManager.adjustConfigForViewport: Invalid viewport coordinates at card ${i}`);
                }
                
                filteredAnimations.push(config.cardAnimations[i]);
                filteredBoundaries.push(viewportLeftBoundary);
                filteredBoundaries.push(viewportRightBoundary);
            }
        }
        
        // Fail Fast: 至少要有一张卡片可见
        if (filteredAnimations.length === 0) {
            throw new Error('PreviewManager.adjustConfigForViewport: No cards visible in viewport');
        }
        
        return {
            ...config,
            cardAnimations: filteredAnimations,
            cardBoundaries: filteredBoundaries
        };
    }
    
    /**
     * 销毁组件，清理资源
     * @returns {void}
     */
    destroy() {
        // 清空DOM元素引用
        this.elements = {};
    }
}


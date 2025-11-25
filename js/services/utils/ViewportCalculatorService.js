/**
 * ViewportCalculatorService - 视口计算服务
 * 专门负责Canvas视口相关的计算，包括可视区域计算、Canvas尺寸设置、图片裁剪、坐标转换等
 * 
 * 职责说明：
 * - 与ImageDimensionService的区别：
 *   - ImageDimensionService：纯数学计算，不依赖浏览器环境，无副作用
 *   - ViewportCalculatorService：依赖window对象，包含布局业务规则，面向Canvas视图
 * - 计算Canvas显示所需的视口尺寸
 * - 基于窗口/容器动态计算缩放和布局
 * - 处理图片裁剪以适配视口
 * - 统一管理原图坐标与视口坐标之间的转换逻辑
 * 
 * 当前被使用的模块：
 * - CardBoundaryEditorService (ui/CardBoundaryEditorService.js) - 计算编辑器视口、Canvas尺寸、坐标转换
 * - PlaybackCoordinatorService (business/PlaybackCoordinatorService.js) - 计算播放时的视口宽度、裁剪图片、调整配置
 * - PreviewManager (components/entry-animation/PreviewManager.js) - 计算预览区域视口、裁剪图片、坐标转换
 * - EntryAnimationHelpDialogs (components/entry-animation/EntryAnimationHelpDialogs.js) - 计算帮助对话框中的可视区域宽度
 * 
 * 当前依赖的模块：
 * - loadImageFromDataURL (helpers/imageLoader.js) - 图片加载工具函数 (动态import)
 */

export class ViewportCalculatorService {
    /**
     * 计算可视区域宽度（视图相关计算）
     * 
     * 设计说明：
     * - 基于当前窗口尺寸动态计算缩放比例
     * - 计算用户在主页面能看到的图片区域宽度
     * - 用于卡片边界编辑器和预览区域的视图一致性
     * 
     * @param {number} startPosition - 起始位置（原图坐标）
     * @param {number} imageWidth - 图片宽度
     * @param {number} imageHeight - 图片高度
     * @param {number} windowWidth - 窗口宽度（可选，默认使用当前窗口）
     * @param {number} windowHeight - 窗口高度（可选，默认使用当前窗口）
     * @returns {number} 可视区域宽度（原图坐标）
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    calculateViewportWidth(startPosition, imageWidth, imageHeight, windowWidth = window.innerWidth, windowHeight = window.innerHeight) {
        // Fail Fast: 验证参数
        if (typeof startPosition !== 'number' || !isFinite(startPosition) || startPosition < 0) {
            throw new Error('ViewportCalculatorService.calculateViewportWidth: startPosition must be a non-negative finite number');
        }
        if (typeof imageWidth !== 'number' || !isFinite(imageWidth) || imageWidth <= 0) {
            throw new Error('ViewportCalculatorService.calculateViewportWidth: imageWidth must be a positive finite number');
        }
        if (typeof imageHeight !== 'number' || !isFinite(imageHeight) || imageHeight <= 0) {
            throw new Error('ViewportCalculatorService.calculateViewportWidth: imageHeight must be a positive finite number');
        }
        if (typeof windowWidth !== 'number' || !isFinite(windowWidth) || windowWidth <= 0) {
            throw new Error('ViewportCalculatorService.calculateViewportWidth: windowWidth must be a positive finite number');
        }
        if (typeof windowHeight !== 'number' || !isFinite(windowHeight) || windowHeight <= 0) {
            throw new Error('ViewportCalculatorService.calculateViewportWidth: windowHeight must be a positive finite number');
        }

        // 动态计算当前的缩放比例（基于窗口高度）
        const scalingRatio = windowHeight / imageHeight;
        
        // 计算原图坐标的可视区域范围（用户在主页能看到的区域）
        const viewportWidth = Math.min(windowWidth / scalingRatio, imageWidth - startPosition);
        
        return viewportWidth;
    }

    /**
     * 设置Canvas尺寸以适应可视区域（视图相关计算）
     * 
     * 设计说明：
     * - 根据容器尺寸和可视区域计算最佳Canvas尺寸
     * - 保持宽高比例，确保不超出容器限制
     * - 用于卡片边界编辑器和预览区域的尺寸一致性
     * 
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @param {HTMLElement} container - 容器元素（用于获取可用空间）
     * @param {number} viewportWidth - 可视区域宽度（原图坐标）
     * @param {number} imageHeight - 图片高度
     * @param {number} [padding=64] - 容器内边距
     * @param {number} [maxHeight=400] - 最大高度限制
     * @returns {Object} 返回设置后的Canvas尺寸 {width, height, scale}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    setupCanvasForViewport(canvas, container, viewportWidth, imageHeight, padding = 64, maxHeight = 400) {
        // Fail Fast: 验证参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('ViewportCalculatorService.setupCanvasForViewport: canvas must be a valid HTMLCanvasElement');
        }
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('ViewportCalculatorService.setupCanvasForViewport: container must be a valid HTMLElement');
        }
        if (typeof viewportWidth !== 'number' || !isFinite(viewportWidth) || viewportWidth <= 0) {
            throw new Error('ViewportCalculatorService.setupCanvasForViewport: viewportWidth must be a positive finite number');
        }
        if (typeof imageHeight !== 'number' || !isFinite(imageHeight) || imageHeight <= 0) {
            throw new Error('ViewportCalculatorService.setupCanvasForViewport: imageHeight must be a positive finite number');
        }
        if (typeof padding !== 'number' || !isFinite(padding) || padding < 0) {
            throw new Error('ViewportCalculatorService.setupCanvasForViewport: padding must be a non-negative finite number');
        }
        if (typeof maxHeight !== 'number' || !isFinite(maxHeight) || maxHeight <= 0) {
            throw new Error('ViewportCalculatorService.setupCanvasForViewport: maxHeight must be a positive finite number');
        }

        // 计算可用空间
        const maxWidth = container.clientWidth - padding;
        
        // Fail Fast: 确保可用空间足够（容器必须大于padding才能渲染）
        if (maxWidth <= 0) {
            throw new Error(`ViewportCalculatorService.setupCanvasForViewport: container width (${container.clientWidth}px) is too small, must be > ${padding}px (padding)`);
        }
        
        // 计算缩放比例（保持宽高比，不超出容器）
        const scaleX = maxWidth / viewportWidth;
        const scaleY = maxHeight / imageHeight;
        const scale = Math.min(scaleX, scaleY, 1);
        
        // Fail Fast: 确保scale有效（理论上不应该出现，但作为安全检查）
        if (scale <= 0 || !isFinite(scale)) {
            throw new Error(`ViewportCalculatorService.setupCanvasForViewport: calculated scale (${scale}) is invalid`);
        }
        
        // 计算Canvas逻辑尺寸（CSS像素）
        const canvasWidth = viewportWidth * scale;
        const canvasHeight = imageHeight * scale;
        
        // 🔑 关键修复：同时设置CSS样式尺寸和物理像素尺寸，但不缩放上下文
        // 问题1：之前只设置物理尺寸，没有CSS样式，导致 canvasStyleSize 为空
        // 问题2：不能缩放上下文，因为调用方可能有自己的坐标系统管理（如CardBoundaryEditorService）
        // 问题3：必须确保 CSS尺寸 × DPR = 物理像素尺寸（整数），避免反推时不一致
        
        // Fail Fast: 验证devicePixelRatio
        if (typeof window.devicePixelRatio !== 'number' || !isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
            throw new Error('ViewportCalculatorService.setupCanvasForViewport: Invalid window.devicePixelRatio');
        }
        const dpr = window.devicePixelRatio;
        
        // 先设置物理像素尺寸（四舍五入确保是整数）
        canvas.width = Math.round(canvasWidth * dpr);
        canvas.height = Math.round(canvasHeight * dpr);
        
        // 从物理像素反推CSS样式尺寸，确保 canvasLogicalHeight = canvas.height / dpr 完全一致
        canvas.style.width = `${canvas.width / dpr}px`;
        canvas.style.height = `${canvas.height / dpr}px`;
        
        // 注意：不缩放Canvas上下文！调用方需要自己处理：
        // - EntryAnimationConfigPage: 会传给 EntryAnimationService，由其计算 scalingRatio
        // - CardBoundaryEditorService: 有自己的坐标系统管理，在 init() 中自己缩放上下文
        
        // 返回实际的逻辑尺寸（从物理像素反推，与CSS完全一致）
        return {
            width: canvas.width / dpr,
            height: canvas.height / dpr,
            scale: scale
        };
    }

    /**
     * 创建裁剪后的图片Canvas（仅包含可视区域）
     * 
     * 设计说明：
     * - 从原图中裁剪出指定的可视区域
     * - 返回新的图片元素，可直接用于渲染
     * - 用于预览区域与编辑区域的图片内容一致性
     * 
     * @param {HTMLImageElement} image - 原始图片
     * @param {number} startPosition - 起始位置（原图坐标）
     * @param {number} viewportWidth - 可视区域宽度（原图坐标）
     * @returns {Promise<HTMLImageElement>} 裁剪后的图片
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    createCroppedImageForViewport(image, startPosition, viewportWidth) {
        // Fail Fast: 验证参数
        if (!image || !(image instanceof HTMLImageElement)) {
            throw new Error('ViewportCalculatorService.createCroppedImageForViewport: image must be a valid HTMLImageElement');
        }
        if (!image.complete || !image.naturalWidth) {
            throw new Error('ViewportCalculatorService.createCroppedImageForViewport: image must be loaded before cropping');
        }
        if (typeof startPosition !== 'number' || !isFinite(startPosition) || startPosition < 0) {
            throw new Error('ViewportCalculatorService.createCroppedImageForViewport: startPosition must be a non-negative finite number');
        }
        if (typeof viewportWidth !== 'number' || !isFinite(viewportWidth) || viewportWidth <= 0) {
            throw new Error('ViewportCalculatorService.createCroppedImageForViewport: viewportWidth must be a positive finite number');
        }

        return new Promise((resolve, reject) => {
            // 使用模板克隆创建临时Canvas
            const tempCanvasTemplate = document.getElementById('tempCanvasTemplate');
            if (!tempCanvasTemplate) {
                throw new Error('ViewportCalculatorService.createCroppedImageForViewport: tempCanvasTemplate not found in DOM');
            }
            const tempCanvas = tempCanvasTemplate.content.cloneNode(true).querySelector('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // 设置Canvas尺寸为可视区域大小
            tempCanvas.width = viewportWidth;
            tempCanvas.height = image.naturalHeight;
            
            // 绘制可视区域部分
            tempCtx.drawImage(
                image,
                startPosition, 0, viewportWidth, image.naturalHeight,  // 源区域（可视区域）
                0, 0, viewportWidth, image.naturalHeight               // 目标区域（整个临时Canvas）
            );
            
            // 使用统一的图片加载工具
            import('../../helpers/imageLoader.js').then(({ loadImageFromDataURL }) => {
                return loadImageFromDataURL(tempCanvas.toDataURL());
            }).then(resolve).catch(reject);
        });
    }

    /**
     * 将原图坐标转换为视口相对坐标
     * 
     * 设计说明：
     * - 用于将原图中的绝对坐标转换为相对于视口起点的坐标
     * - 统一坐标转换逻辑，确保跨文件一致性
     * - 用于卡片边界编辑器和入场动画配置
     * 
     * @param {number} originalX - 原图X坐标
     * @param {number} viewportStartX - 视口起始X坐标
     * @returns {number} 视口相对坐标（保证非负）
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    convertToViewportCoordinate(originalX, viewportStartX) {
        // Fail Fast: 验证参数
        if (typeof originalX !== 'number' || !isFinite(originalX)) {
            throw new Error('ViewportCalculatorService.convertToViewportCoordinate: originalX must be a finite number');
        }
        if (typeof viewportStartX !== 'number' || !isFinite(viewportStartX) || viewportStartX < 0) {
            throw new Error('ViewportCalculatorService.convertToViewportCoordinate: viewportStartX must be a non-negative finite number');
        }
        
        return Math.max(0, originalX - viewportStartX);
    }

    /**
     * 将视口相对坐标转换为原图坐标
     * 
     * 设计说明：
     * - 用于将视口相对坐标转换回原图中的绝对坐标
     * - 统一坐标转换逻辑，确保跨文件一致性
     * - 用于卡片边界编辑器和入场动画配置
     * 
     * @param {number} viewportX - 视口相对X坐标
     * @param {number} viewportStartX - 视口起始X坐标
     * @returns {number} 原图坐标
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    convertToOriginalCoordinate(viewportX, viewportStartX) {
        // Fail Fast: 验证参数
        if (typeof viewportX !== 'number' || !isFinite(viewportX) || viewportX < 0) {
            throw new Error('ViewportCalculatorService.convertToOriginalCoordinate: viewportX must be a non-negative finite number');
        }
        if (typeof viewportStartX !== 'number' || !isFinite(viewportStartX) || viewportStartX < 0) {
            throw new Error('ViewportCalculatorService.convertToOriginalCoordinate: viewportStartX must be a non-negative finite number');
        }
        
        return viewportX + viewportStartX;
    }
    
    /**
     * 调整入场动画配置的卡片边界坐标，使其相对于viewport
     * @param {Object} config - 原始配置对象
     * @param {number} startPosition - viewport起始位置（原图坐标）
     * @param {number} viewportWidth - viewport宽度（原图坐标）
     * @returns {Object} 调整后的配置对象
     * @throws {Error} 当参数无效或没有可见卡片时抛出错误（Fail Fast）
     */
    adjustConfigForViewport(config, startPosition, viewportWidth) {
        // Fail Fast: 验证输入
        if (typeof startPosition !== 'number' || !isFinite(startPosition) || startPosition < 0) {
            throw new Error('ViewportCalculatorService.adjustConfigForViewport: Invalid startPosition');
        }
        if (typeof viewportWidth !== 'number' || !isFinite(viewportWidth) || viewportWidth <= 0) {
            throw new Error('ViewportCalculatorService.adjustConfigForViewport: Invalid viewportWidth');
        }
        
        const endPosition = startPosition + viewportWidth;
        
        // 过滤并调整卡片配置
        const filteredAnimations = [];
        const filteredBoundaries = [];
        
        const cardCount = config.cardAnimations.length;
        for (let i = 0; i < cardCount; i++) {
            const leftBoundary = config.cardBoundaries[i * 2];
            const rightBoundary = config.cardBoundaries[i * 2 + 1];
            
            // Fail Fast: 验证边界坐标
            if (typeof leftBoundary !== 'number' || !isFinite(leftBoundary)) {
                throw new Error(`ViewportCalculatorService.adjustConfigForViewport: Invalid left boundary at card ${i}`);
            }
            if (typeof rightBoundary !== 'number' || !isFinite(rightBoundary)) {
                throw new Error(`ViewportCalculatorService.adjustConfigForViewport: Invalid right boundary at card ${i}`);
            }
            if (leftBoundary >= rightBoundary) {
                throw new Error(`ViewportCalculatorService.adjustConfigForViewport: Left boundary must be less than right boundary at card ${i}`);
            }
            
            // 检查卡片是否与视口有交集
            const isVisible = rightBoundary > startPosition && leftBoundary < endPosition;
            
            if (isVisible) {
                // 钳制边界到视口范围内
                const clampedLeftBoundary = Math.max(leftBoundary, startPosition);
                const clampedRightBoundary = Math.min(rightBoundary, endPosition);
                
                // 转换为相对于视口起始位置的坐标
                const viewportLeftBoundary = clampedLeftBoundary - startPosition;
                const viewportRightBoundary = clampedRightBoundary - startPosition;
                
                // Fail Fast: 验证转换后的坐标非负且有效
                if (viewportLeftBoundary < 0 || viewportRightBoundary < 0) {
                    throw new Error(`ViewportCalculatorService.adjustConfigForViewport: Negative viewport coordinate at card ${i}`);
                }
                if (viewportLeftBoundary >= viewportRightBoundary) {
                    throw new Error(`ViewportCalculatorService.adjustConfigForViewport: Invalid viewport coordinates at card ${i}`);
                }
                
                filteredAnimations.push(config.cardAnimations[i]);
                filteredBoundaries.push(viewportLeftBoundary);
                filteredBoundaries.push(viewportRightBoundary);
            }
        }
        
        // Fail Fast: 至少要有一张卡片可见
        if (filteredAnimations.length === 0) {
            throw new Error('ViewportCalculatorService.adjustConfigForViewport: No cards visible in viewport');
        }
        
        return {
            ...config,
            cardAnimations: filteredAnimations,
            cardBoundaries: filteredBoundaries
        };
    }
}


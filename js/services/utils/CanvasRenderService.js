/**
 * CanvasRenderService - Canvas渲染工具服务
 * 提供Canvas渲染的底层技术能力，纯工具服务，零业务逻辑
 * 
 * 职责说明：
 * - 提供Canvas渲染基础能力（设置尺寸、获取上下文、绘制图片、清空画布）
 * - 无状态设计，所有方法接近纯函数
 * - 不管理Canvas元素，由调用方传入
 * - 不涉及业务逻辑，只提供渲染技术能力
 * - 支持高DPI屏幕适配
 * 
 * 当前被使用的模块：
 * - EntryAnimationService (business/EntryAnimationService.js) - 入场动画Canvas渲染
 * - PlaybackCoordinatorService (business/PlaybackCoordinatorService.js) - 播放协调中的Canvas操作
 * - DisplayCoordinatorService (ui/DisplayCoordinatorService.js) - 主显示区Canvas渲染
 * 
 * 当前依赖的模块：
 * - 无（纯工具服务，零依赖注入）
 */

export class CanvasRenderService {
    constructor() {
        // 🚀 性能优化2：使用WeakMap缓存Canvas上下文，避免重复getContext调用
        // WeakMap的优势：
        // 1. Canvas被销毁时自动清理缓存，无内存泄漏
        // 2. 不影响服务的无状态设计
        // 3. O(1)查找性能
        this._contextCache = new WeakMap();
    }
    
    /**
     * 设置Canvas尺寸（支持高DPI屏幕适配）
     * 
     * 设计说明：
     * - 设置Canvas的显示尺寸（CSS像素）
     * - 设置Canvas的实际像素尺寸（物理像素 = CSS像素 × DPR）
     * - 缩放Canvas上下文以匹配DPR
     * - 调用方后续可以使用逻辑像素绘制，自动适配高DPI屏幕
     * 
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @param {number} width - Canvas显示宽度（CSS像素）
     * @param {number} height - Canvas显示高度（CSS像素）
     * @returns {void}
     * @throws {Error} 当canvas不是有效的Canvas元素或尺寸参数无效时抛出错误
     */
    setupCanvas(canvas, width, height) {
        // Fail Fast: 验证canvas参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService.setupCanvas: canvas must be a valid HTMLCanvasElement');
        }
        
        // Fail Fast: 验证width参数
        if (typeof width !== 'number' || !isFinite(width) || width <= 0) {
            throw new Error('CanvasRenderService.setupCanvas: width must be a positive finite number');
        }
        
        // Fail Fast: 验证height参数
        if (typeof height !== 'number' || !isFinite(height) || height <= 0) {
            throw new Error('CanvasRenderService.setupCanvas: height must be a positive finite number');
        }
        
        // Fail Fast: 验证devicePixelRatio
        if (typeof window.devicePixelRatio !== 'number' || !isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
            throw new Error('CanvasRenderService.setupCanvas: Invalid window.devicePixelRatio');
        }
        
        // 获取设备像素比（高DPI适配）
        const dpr = window.devicePixelRatio;
        
        // 设置Canvas显示尺寸（CSS像素）
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        
        // 设置Canvas实际像素尺寸（物理像素）
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        
        // 获取2D上下文并缩放以匹配DPR
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('CanvasRenderService.setupCanvas: Failed to get 2D context from canvas');
        }
        
        // 缩放Canvas上下文，使后续绘制可以使用逻辑像素
        ctx.scale(dpr, dpr);
    }
    
    /**
     * 获取Canvas的2D渲染上下文（内部方法）
     * 🚀 性能优化2：使用WeakMap缓存，避免重复getContext调用
     * 
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @returns {CanvasRenderingContext2D} Canvas 2D渲染上下文
     * @throws {Error} 当canvas不是有效的Canvas元素或无法获取2D上下文时抛出错误
     * @private
     */
    _getContext(canvas) {
        // Fail Fast: 验证canvas参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService._getContext: canvas must be a valid HTMLCanvasElement');
        }
        
        // 🚀 优化2：先检查缓存
        let ctx = this._contextCache.get(canvas);
        if (ctx) {
            return ctx;
        }
        
        // 缓存未命中，获取新上下文
        ctx = canvas.getContext('2d');
        
        // Fail Fast: 验证上下文获取成功
        if (!ctx) {
            throw new Error('CanvasRenderService._getContext: Failed to get 2D context from canvas');
        }
        
        // 🚀 优化2：存入缓存
        this._contextCache.set(canvas, ctx);
        
        return ctx;
    }
    
    /**
     * 清空Canvas画布
     * 
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @returns {void}
     * @throws {Error} 当canvas不是有效的Canvas元素时抛出错误
     */
    clear(canvas) {
        // Fail Fast: 验证canvas参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService.clear: canvas must be a valid HTMLCanvasElement');
        }
        
        const ctx = this._getContext(canvas);
        
        // 清空整个画布（使用Canvas的实际像素尺寸）
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    /**
     * 填充矩形区域
     * 
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @param {number} x - 矩形X坐标（逻辑像素）
     * @param {number} y - 矩形Y坐标（逻辑像素）
     * @param {number} width - 矩形宽度（逻辑像素）
     * @param {number} height - 矩形高度（逻辑像素）
     * @param {string} color - 填充颜色（CSS颜色值）
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误
     */
    fillRect(canvas, x, y, width, height, color) {
        // Fail Fast: 验证canvas参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService.fillRect: canvas must be a valid HTMLCanvasElement');
        }
        
        // Fail Fast: 验证坐标和尺寸参数
        if (typeof x !== 'number' || !isFinite(x)) {
            throw new Error('CanvasRenderService.fillRect: x must be a finite number');
        }
        if (typeof y !== 'number' || !isFinite(y)) {
            throw new Error('CanvasRenderService.fillRect: y must be a finite number');
        }
        if (typeof width !== 'number' || !isFinite(width) || width <= 0) {
            throw new Error('CanvasRenderService.fillRect: width must be a positive finite number');
        }
        if (typeof height !== 'number' || !isFinite(height) || height <= 0) {
            throw new Error('CanvasRenderService.fillRect: height must be a positive finite number');
        }
        
        // Fail Fast: 验证颜色参数
        if (typeof color !== 'string' || !color) {
            throw new Error('CanvasRenderService.fillRect: color must be a non-empty string');
        }
        
        const ctx = this._getContext(canvas);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width, height);
    }
    
    /**
     * 绘制图片的指定区域到Canvas
     * 
     * 设计说明：
     * - 从源图片的指定区域裁剪
     * - 绘制到Canvas的(0, 0)位置
     * - 填充整个Canvas
     * - 用于滚动显示：显示图片的一部分
     * 
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @param {HTMLImageElement} image - 图片元素
     * @param {number} sourceX - 源图片裁剪区域的X坐标（像素）
     * @param {number} sourceY - 源图片裁剪区域的Y坐标（像素）
     * @param {number} sourceWidth - 源图片裁剪区域的宽度（像素）
     * @param {number} sourceHeight - 源图片裁剪区域的高度（像素）
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误
     */
    drawImageClipped(canvas, image, sourceX, sourceY, sourceWidth, sourceHeight) {
        // Fail Fast: 验证canvas参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService.drawImageClipped: canvas must be a valid HTMLCanvasElement');
        }
        
        // Fail Fast: 验证image参数
        if (!image || !(image instanceof HTMLImageElement)) {
            throw new Error('CanvasRenderService.drawImageClipped: image must be a valid HTMLImageElement');
        }
        
        // Fail Fast: 验证图片已加载
        if (!image.complete || image.naturalWidth === 0) {
            throw new Error('CanvasRenderService.drawImageClipped: image must be loaded before drawing');
        }
        
        // Fail Fast: 验证sourceX参数
        if (typeof sourceX !== 'number' || !isFinite(sourceX)) {
            throw new Error('CanvasRenderService.drawImageClipped: sourceX must be a finite number');
        }
        
        // Fail Fast: 验证sourceY参数
        if (typeof sourceY !== 'number' || !isFinite(sourceY)) {
            throw new Error('CanvasRenderService.drawImageClipped: sourceY must be a finite number');
        }
        
        // Fail Fast: 验证sourceWidth参数
        if (typeof sourceWidth !== 'number' || !isFinite(sourceWidth) || sourceWidth <= 0) {
            throw new Error('CanvasRenderService.drawImageClipped: sourceWidth must be a positive finite number');
        }
        
        // Fail Fast: 验证sourceHeight参数
        if (typeof sourceHeight !== 'number' || !isFinite(sourceHeight) || sourceHeight <= 0) {
            throw new Error('CanvasRenderService.drawImageClipped: sourceHeight must be a positive finite number');
        }
        
        const ctx = this._getContext(canvas);
        
        // 获取Canvas的逻辑尺寸（CSS像素）
        const canvasWidth = parseFloat(canvas.style.width) || canvas.width;
        const canvasHeight = parseFloat(canvas.style.height) || canvas.height;
        
        // 绘制图片的指定区域到Canvas
        // drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
        ctx.drawImage(
            image,
            sourceX, sourceY, sourceWidth, sourceHeight,  // 源图片裁剪区域
            0, 0, canvasWidth, canvasHeight               // 目标Canvas区域
        );
    }
    
    /**
     * 绘制图片到Canvas的指定位置和尺寸（支持变换效果）
     * 
     * 设计说明：
     * - 支持位置偏移（x, y）
     * - 支持尺寸缩放（width, height）
     * - 支持透明度（alpha）
     * - 支持旋转（rotation）
     * - 支持模糊（blur）
     * - 用于入场动画：淡入、滑入、缩放、旋转、模糊等效果
     * - 🚀 性能优化：支持HTMLCanvasElement作为图片源，用于预缩放优化
     * 
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @param {HTMLImageElement|HTMLCanvasElement} image - 图片元素或Canvas元素（性能优化：预缩放后的Canvas）
     * @param {number} destX - 目标位置X坐标（像素）
     * @param {number} destY - 目标位置Y坐标（像素）
     * @param {number} destWidth - 目标宽度（像素）
     * @param {number} destHeight - 目标高度（像素）
     * @param {Object} [options={}] - 可选的绘制选项
     * @param {number} [options.alpha=1] - 透明度（0-1）
     * @param {number} [options.rotation=0] - 旋转角度（度数，0-360）
     * @param {number} [options.blur=0] - 模糊半径（像素，0表示无模糊）
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误
     */
    drawImageTransformed(canvas, image, destX, destY, destWidth, destHeight, options = {}) {
        // Fail Fast: 验证canvas参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService.drawImageTransformed: canvas must be a valid HTMLCanvasElement');
        }
        
        // Fail Fast: 验证image参数（支持HTMLImageElement和HTMLCanvasElement）
        const isValidImageSource = image && (
            image instanceof HTMLImageElement || 
            image instanceof HTMLCanvasElement
        );
        if (!isValidImageSource) {
            throw new Error('CanvasRenderService.drawImageTransformed: image must be a valid HTMLImageElement or HTMLCanvasElement');
        }
        
        // Fail Fast: 验证HTMLImageElement已加载（Canvas不需要此检查）
        if (image instanceof HTMLImageElement) {
            if (!image.complete || image.naturalWidth === 0) {
                throw new Error('CanvasRenderService.drawImageTransformed: HTMLImageElement must be loaded before drawing');
            }
        }
        
        // Fail Fast: 验证HTMLCanvasElement有效
        if (image instanceof HTMLCanvasElement) {
            if (image.width === 0 || image.height === 0) {
                throw new Error('CanvasRenderService.drawImageTransformed: HTMLCanvasElement must have valid dimensions');
            }
        }
        
        // Fail Fast: 验证destX参数
        if (typeof destX !== 'number' || !isFinite(destX)) {
            throw new Error('CanvasRenderService.drawImageTransformed: destX must be a finite number');
        }
        
        // Fail Fast: 验证destY参数
        if (typeof destY !== 'number' || !isFinite(destY)) {
            throw new Error('CanvasRenderService.drawImageTransformed: destY must be a finite number');
        }
        
        // Fail Fast: 验证destWidth参数
        if (typeof destWidth !== 'number' || !isFinite(destWidth) || destWidth <= 0) {
            throw new Error('CanvasRenderService.drawImageTransformed: destWidth must be a positive finite number');
        }
        
        // Fail Fast: 验证destHeight参数
        if (typeof destHeight !== 'number' || !isFinite(destHeight) || destHeight <= 0) {
            throw new Error('CanvasRenderService.drawImageTransformed: destHeight must be a positive finite number');
        }
        
        const ctx = this._getContext(canvas);
        
        // 检查是否需要高级变换（旋转或模糊），需要时使用save/restore
        const hasRotation = options.rotation !== undefined && options.rotation !== 0;
        const hasBlur = options.blur !== undefined && options.blur > 0;
        const needSaveRestore = hasRotation || hasBlur;
        
        // 如果需要高级变换，保存Canvas状态
        if (needSaveRestore) {
            ctx.save();
        }
        
        // 设置透明度（如果提供）
        let needResetAlpha = false;
        if (options.alpha !== undefined) {
            // Fail Fast: 验证alpha参数
            if (typeof options.alpha !== 'number' || !isFinite(options.alpha) || options.alpha < 0 || options.alpha > 1) {
                throw new Error('CanvasRenderService.drawImageTransformed: options.alpha must be a number between 0 and 1');
            }
            ctx.globalAlpha = options.alpha;
            needResetAlpha = !needSaveRestore;  // 如果用save/restore就不需要手动重置
        }
        
        // 设置模糊（如果提供）
        if (hasBlur) {
            // Fail Fast: 验证blur参数
            if (typeof options.blur !== 'number' || !isFinite(options.blur) || options.blur < 0) {
                throw new Error('CanvasRenderService.drawImageTransformed: options.blur must be a non-negative finite number');
            }
            ctx.filter = `blur(${options.blur}px)`;
        }
        
        // 设置旋转（如果提供）
        if (hasRotation) {
            // Fail Fast: 验证rotation参数
            if (typeof options.rotation !== 'number' || !isFinite(options.rotation)) {
                throw new Error('CanvasRenderService.drawImageTransformed: options.rotation must be a finite number');
            }
            // 移动到旋转中心点
            const centerX = destX + destWidth / 2;
            const centerY = destY + destHeight / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate(options.rotation * Math.PI / 180);  // 将角度转换为弧度
            // 调整绘制坐标（相对于旋转中心）
            destX = -destWidth / 2;
            destY = -destHeight / 2;
        }
        
        // 如果提供了源区域参数，使用9参数版本裁剪绘制；否则使用5参数版本绘制整张图
        if (options.sourceX !== undefined && options.sourceY !== undefined && 
            options.sourceWidth !== undefined && options.sourceHeight !== undefined) {
            // Fail Fast: 验证源区域参数
            if (typeof options.sourceX !== 'number' || !isFinite(options.sourceX)) {
                throw new Error('CanvasRenderService.drawImageTransformed: options.sourceX must be a finite number');
            }
            if (typeof options.sourceY !== 'number' || !isFinite(options.sourceY)) {
                throw new Error('CanvasRenderService.drawImageTransformed: options.sourceY must be a finite number');
            }
            if (typeof options.sourceWidth !== 'number' || !isFinite(options.sourceWidth) || options.sourceWidth <= 0) {
                throw new Error('CanvasRenderService.drawImageTransformed: options.sourceWidth must be a positive finite number');
            }
            if (typeof options.sourceHeight !== 'number' || !isFinite(options.sourceHeight) || options.sourceHeight <= 0) {
                throw new Error('CanvasRenderService.drawImageTransformed: options.sourceHeight must be a positive finite number');
            }
            
            // 使用9参数版本裁剪绘制
            ctx.drawImage(
                image, 
                options.sourceX, options.sourceY, options.sourceWidth, options.sourceHeight,
                destX, destY, destWidth, destHeight
            );
        } else {
            // 使用5参数版本绘制整张图
            ctx.drawImage(image, destX, destY, destWidth, destHeight);
        }
        
        // 恢复Canvas状态（如果使用了save）
        if (needSaveRestore) {
            ctx.restore();
        }
        
        // 🚀 性能优化7：如果没用save/restore，手动重置alpha
        // 这比restore快得多（restore需要58ms，直接设置只需0.01ms）
        if (needResetAlpha) {
            ctx.globalAlpha = 1;
        }
    }
    
    /**
     * 设置Canvas为viewport尺寸
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @param {HTMLImageElement} viewportImage - 裁剪后的viewport图片
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    setupCanvasForViewport(canvas, viewportImage) {
        // Fail Fast: 验证参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService.setupCanvasForViewport: canvas must be a valid HTMLCanvasElement');
        }
        if (!viewportImage || !(viewportImage instanceof HTMLImageElement)) {
            throw new Error('CanvasRenderService.setupCanvasForViewport: viewportImage must be a valid HTMLImageElement');
        }
        if (!viewportImage.complete || !viewportImage.naturalWidth) {
            throw new Error('CanvasRenderService.setupCanvasForViewport: viewportImage is not loaded');
        }
        
        // Fail Fast: 验证devicePixelRatio
        if (typeof window.devicePixelRatio !== 'number' || !isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
            throw new Error('CanvasRenderService.setupCanvasForViewport: Invalid window.devicePixelRatio');
        }
        const dpr = window.devicePixelRatio;
        
        // 计算Canvas逻辑高度（基于窗口高度缩放）
        const imageHeight = viewportImage.naturalHeight;
        const windowHeight = window.innerHeight;
        const scaleY = windowHeight / imageHeight;
        const scale = Math.min(scaleY, 1); // 不放大，只缩小
        
        const canvasLogicalHeight = imageHeight * scale;
        const canvasLogicalWidth = viewportImage.naturalWidth * scale;
        
        // 设置Canvas尺寸
        canvas.style.width = `${canvasLogicalWidth}px`;
        canvas.style.height = `${canvasLogicalHeight}px`;
        canvas.width = Math.round(canvasLogicalWidth * dpr);
        canvas.height = Math.round(canvasLogicalHeight * dpr);
        
        // 缩放上下文
        const ctx = this._getContext(canvas);
        ctx.scale(dpr, dpr);
    }
    
    /**
     * 绘制故障效果图像（RGB通道分离 + 随机切片错位）
     * @param {HTMLCanvasElement} canvas - 目标Canvas元素
     * @param {HTMLImageElement|HTMLCanvasElement} image - 源图像或Canvas
     * @param {number} destX - 目标X坐标
     * @param {number} destY - 目标Y坐标
     * @param {number} destWidth - 目标宽度
     * @param {number} destHeight - 目标高度
     * @param {Object} glitchParams - 故障效果参数
     * @param {number} glitchParams.intensity - 故障强度（0-1），影响偏移距离和切片数量
     * @param {Object} [options={}] - 可选参数（支持 alpha, sourceX, sourceY, sourceWidth, sourceHeight）
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     * @private
     */
    _drawImageGlitch(canvas, image, destX, destY, destWidth, destHeight, glitchParams, options = {}) {
        // Fail Fast: 验证基础参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService._drawImageGlitch: canvas must be a valid HTMLCanvasElement');
        }
        if (!image || (!(image instanceof HTMLImageElement) && !(image instanceof HTMLCanvasElement))) {
            throw new Error('CanvasRenderService._drawImageGlitch: image must be HTMLImageElement or HTMLCanvasElement');
        }
        if (typeof destX !== 'number' || typeof destY !== 'number' || 
            typeof destWidth !== 'number' || typeof destHeight !== 'number') {
            throw new Error('CanvasRenderService._drawImageGlitch: destination parameters must be numbers');
        }
        
        // Fail Fast: 验证 glitchParams
        if (!glitchParams || typeof glitchParams.intensity !== 'number') {
            throw new Error('CanvasRenderService._drawImageGlitch: glitchParams.intensity is required and must be a number');
        }
        if (glitchParams.intensity < 0 || glitchParams.intensity > 1) {
            throw new Error('CanvasRenderService._drawImageGlitch: glitchParams.intensity must be between 0 and 1');
        }
        
        const ctx = this._getContext(canvas);
        
        // 设置透明度（如果提供）
        let needResetAlpha = false;
        if (options.alpha !== undefined) {
            if (typeof options.alpha !== 'number' || options.alpha < 0 || options.alpha > 1) {
                throw new Error('CanvasRenderService._drawImageGlitch: options.alpha must be a number between 0 and 1');
            }
            ctx.globalAlpha = options.alpha;
            needResetAlpha = true;
        }
        
        // 计算源区域参数（如果提供）
        const hasSourceRegion = options.sourceX !== undefined && options.sourceY !== undefined && 
                                options.sourceWidth !== undefined && options.sourceHeight !== undefined;
        
        if (hasSourceRegion) {
            if (typeof options.sourceX !== 'number' || typeof options.sourceY !== 'number' || 
                typeof options.sourceWidth !== 'number' || typeof options.sourceHeight !== 'number') {
                throw new Error('CanvasRenderService._drawImageGlitch: source region parameters must be numbers');
            }
        }
        
        const { intensity } = glitchParams;
        
        // 1. 绘制主图像（正常位置）
        if (hasSourceRegion) {
            ctx.drawImage(image, options.sourceX, options.sourceY, options.sourceWidth, options.sourceHeight, 
                         destX, destY, destWidth, destHeight);
        } else {
            ctx.drawImage(image, destX, destY, destWidth, destHeight);
        }
        
        // 2. 如果强度为0，直接返回（无故障效果）
        if (intensity === 0) {
            if (needResetAlpha) {
                ctx.globalAlpha = 1;
            }
            return;
        }
        
        // 3. 绘制故障切片（RGB通道分离模拟 + 随机错位）
        const sliceCount = Math.ceil(intensity * 8); // 强度越高，切片越多（最多8个）
        const maxOffset = intensity * 15; // 最大偏移15px
        
        ctx.save();
        
        for (let i = 0; i < sliceCount; i++) {
            // 随机切片位置和高度
            const sliceY = destY + Math.random() * destHeight;
            const sliceHeight = Math.random() * (destHeight / 5) + 10; // 10px到20%高度
            
            // 随机X偏移（正负随机）
            const offsetX = (Math.random() - 0.5) * 2 * maxOffset;
            
            // 随机选择RGB通道效果（使用 globalCompositeOperation）
            const effects = ['lighter', 'screen', 'difference'];
            ctx.globalCompositeOperation = effects[Math.floor(Math.random() * effects.length)];
            
            // 降低切片透明度，避免过于刺眼
            ctx.globalAlpha = (options.alpha || 1) * 0.3;
            
            // 计算切片的源区域和目标区域
            if (hasSourceRegion) {
                const sourceSliceY = options.sourceY + (sliceY - destY) / destHeight * options.sourceHeight;
                const sourceSliceHeight = sliceHeight / destHeight * options.sourceHeight;
                
                ctx.drawImage(image, 
                    options.sourceX, sourceSliceY, options.sourceWidth, sourceSliceHeight,
                    destX + offsetX, sliceY, destWidth, sliceHeight);
            } else {
                const sourceSliceY = (sliceY - destY) / destHeight * image.height;
                const sourceSliceHeight = sliceHeight / destHeight * image.height;
                
                ctx.drawImage(image, 
                    0, sourceSliceY, image.width, sourceSliceHeight,
                    destX + offsetX, sliceY, destWidth, sliceHeight);
            }
        }
        
        ctx.restore();
        
        if (needResetAlpha) {
            ctx.globalAlpha = 1;
        }
    }
    
    /**
     * 绘制带波浪裁剪的图像（波浪揭示效果）
     * @param {HTMLCanvasElement} canvas - 目标Canvas元素
     * @param {HTMLImageElement|HTMLCanvasElement} image - 源图像或Canvas
     * @param {number} destX - 目标X坐标
     * @param {number} destY - 目标Y坐标
     * @param {number} destWidth - 目标宽度
     * @param {number} destHeight - 目标高度
     * @param {Object} waveParams - 波浪参数
     * @param {number} waveParams.progress - 揭示进度（0-1）
     * @param {number} waveParams.amplitude - 波浪振幅（默认20px）
     * @param {number} waveParams.frequency - 波浪频率（默认3个周期）
     * @param {Object} [options={}] - 可选参数（支持 alpha, sourceX, sourceY, sourceWidth, sourceHeight）
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     * @private
     */
    _drawImageWithWaveClip(canvas, image, destX, destY, destWidth, destHeight, waveParams, options = {}) {
        // Fail Fast: 验证基础参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService._drawImageWithWaveClip: canvas must be a valid HTMLCanvasElement');
        }
        if (!image || (!(image instanceof HTMLImageElement) && !(image instanceof HTMLCanvasElement))) {
            throw new Error('CanvasRenderService._drawImageWithWaveClip: image must be HTMLImageElement or HTMLCanvasElement');
        }
        if (typeof destX !== 'number' || typeof destY !== 'number' || 
            typeof destWidth !== 'number' || typeof destHeight !== 'number') {
            throw new Error('CanvasRenderService._drawImageWithWaveClip: destination parameters must be numbers');
        }
        
        // Fail Fast: 验证 waveParams
        if (!waveParams || typeof waveParams.progress !== 'number') {
            throw new Error('CanvasRenderService._drawImageWithWaveClip: waveParams.progress is required and must be a number');
        }
        if (waveParams.progress < 0 || waveParams.progress > 1) {
            throw new Error('CanvasRenderService._drawImageWithWaveClip: waveParams.progress must be between 0 and 1');
        }
        
        const ctx = this._getContext(canvas);
        
        // 设置透明度（如果提供）
        let needResetAlpha = false;
        if (options.alpha !== undefined) {
            if (typeof options.alpha !== 'number' || options.alpha < 0 || options.alpha > 1) {
                throw new Error('CanvasRenderService._drawImageWithWaveClip: options.alpha must be a number between 0 and 1');
            }
            ctx.globalAlpha = options.alpha;
            needResetAlpha = true;
        }
        
        // 计算源区域参数（如果提供）
        const hasSourceRegion = options.sourceX !== undefined && options.sourceY !== undefined && 
                                options.sourceWidth !== undefined && options.sourceHeight !== undefined;
        
        if (hasSourceRegion) {
            if (typeof options.sourceX !== 'number' || typeof options.sourceY !== 'number' || 
                typeof options.sourceWidth !== 'number' || typeof options.sourceHeight !== 'number') {
                throw new Error('CanvasRenderService._drawImageWithWaveClip: source region parameters must be numbers');
            }
        }
        
        const { progress, amplitude = 20, frequency = 3 } = waveParams;
        
        // 优化：当进度接近完成时（≥98%），直接绘制完整图片，避免波浪裁剪导致边缘缺失
        if (progress >= 0.98) {
            // 直接绘制，无需裁剪
            if (hasSourceRegion) {
                ctx.drawImage(image, options.sourceX, options.sourceY, options.sourceWidth, options.sourceHeight, 
                             destX, destY, destWidth, destHeight);
            } else {
                ctx.drawImage(image, destX, destY, destWidth, destHeight);
            }
            
            if (needResetAlpha) {
                ctx.globalAlpha = 1;
            }
            return;
        }
        
        // 保存Canvas状态
        ctx.save();
        
        // 创建波浪裁剪路径
        ctx.beginPath();
        
        // 当前揭示宽度
        const revealWidth = progress * destWidth;
        
        // Fail Fast: 验证 reverseDirection 参数
        if (typeof waveParams.reverseDirection !== 'boolean') {
            throw new Error('CanvasRenderService._drawImageWithWaveClip: waveParams.reverseDirection must be a boolean');
        }
        
        // 根据方向决定绘制路径
        const reverseDirection = waveParams.reverseDirection;
        const step = 2; // 路径精度，越小越平滑
        
        if (reverseDirection) {
            // 反向：从右侧向左揭示
            const startX = destX + destWidth;
            const endX = destX + destWidth - revealWidth;
            
            // 起始点（右上角）
            ctx.moveTo(startX, destY);
            
            // 右边界直线（到底部）
            ctx.lineTo(startX, destY + destHeight);
            
            // 底部直线（到波浪起点）
            ctx.lineTo(endX, destY + destHeight);
            
            // 波浪边缘（从下往上），向左凸出
            for (let y = destHeight; y >= 0; y -= step) {
                const normalizedY = y / destHeight;
                const waveX = Math.abs(Math.sin(normalizedY * Math.PI * frequency)) * amplitude;
                ctx.lineTo(endX - waveX, destY + y);
            }
            
            // 顶部直线（回到起点）
            ctx.lineTo(startX, destY);
        } else {
            // 正向：从左侧向右揭示
            const startX = destX;
            const endX = destX + revealWidth;
            
            // 起始点（左上角）
            ctx.moveTo(startX, destY);
            
            // 左边界直线（到底部）
            ctx.lineTo(startX, destY + destHeight);
            
            // 底部直线（到波浪起点）
            ctx.lineTo(endX, destY + destHeight);
            
            // 波浪边缘（从下往上），向右凸出
            for (let y = destHeight; y >= 0; y -= step) {
                const normalizedY = y / destHeight;
                const waveX = Math.abs(Math.sin(normalizedY * Math.PI * frequency)) * amplitude;
                ctx.lineTo(endX + waveX, destY + y);
            }
            
            // 顶部直线（回到起点）
            ctx.lineTo(startX, destY);
        }
        
        ctx.closePath();
        ctx.clip();
        
        // 绘制图像（被裁剪）
        if (hasSourceRegion) {
            ctx.drawImage(image, options.sourceX, options.sourceY, options.sourceWidth, options.sourceHeight, 
                         destX, destY, destWidth, destHeight);
        } else {
            ctx.drawImage(image, destX, destY, destWidth, destHeight);
        }
        
        // 恢复Canvas状态
        ctx.restore();
        
        if (needResetAlpha) {
            ctx.globalAlpha = 1;
        }
    }
    
    /**
     * 清空Canvas
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    clearCanvas(canvas) {
        // Fail Fast: 验证参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService.clearCanvas: canvas must be a valid HTMLCanvasElement');
        }
        
        const ctx = this._getContext(canvas);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    /**
     * 绘制碎片重组效果（私有方法）
     * 将卡片分割成网格状碎片，每个碎片独立飞入并重组
     * 
     * @param {HTMLCanvasElement} canvas - 目标Canvas
     * @param {HTMLImageElement|HTMLCanvasElement} image - 源图像或Canvas
     * @param {Object} cardInfo - 卡片信息
     * @param {number} cardInfo.x - 卡片X坐标
     * @param {number} cardInfo.y - 卡片Y坐标
     * @param {number} cardInfo.width - 卡片宽度
     * @param {number} cardInfo.height - 卡片高度
     * @param {Object} params - 动画参数
     * @param {number} params.progress - 动画进度（0 → 1）
     * @param {number} params.gridRows - 网格行数
     * @param {number} params.gridCols - 网格列数
     * @param {boolean} params.reverseScroll - 是否反向滚动
     * @param {number} params.canvasWidth - Canvas宽度
     * @returns {void}
     * @private
     */
    _drawFragmentReassembly(canvas, image, cardInfo, params) {
        const ctx = this._getContext(canvas);
        const { progress, gridRows, gridCols, reverseScroll, canvasWidth } = params;
        
        // 计算每个碎片的尺寸
        const fragmentWidth = cardInfo.width / gridCols;
        const fragmentHeight = cardInfo.height / gridRows;
        
        // 卡片的基准位置（取整一次，避免每个碎片重复取整导致累积误差）
        const baseX = Math.round(cardInfo.x);
        const baseY = Math.round(cardInfo.y);
        
        // 禁用图像平滑（抗锯齿），避免碎片边缘模糊导致的视觉间隙
        const oldSmoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        
        // 遍历每个碎片
        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                // 时序延迟：每个碎片独立延迟，对角线扫描
                // 正向滚动：从左下到右上；反向滚动：从右上到左下
                const rowNormalized = row / (gridRows - 1);  // 0(顶部) -> 1(底部)
                const colNormalized = col / (gridCols - 1);   // 0(左侧) -> 1(右侧)
                
                let delayFactor;
                if (reverseScroll) {
                    // 反向滚动：从右上(1,0)到左下(0,1)
                    const distanceFromTopRight = Math.sqrt(
                        Math.pow(1 - colNormalized, 2) + Math.pow(rowNormalized, 2)
                    );
                    const maxDistance = Math.sqrt(2);
                    delayFactor = (distanceFromTopRight / maxDistance);
                } else {
                    // 正向滚动：从左下(0,1)到右上(1,0)
                    const distanceFromBottomLeft = Math.sqrt(
                        Math.pow(colNormalized, 2) + Math.pow(1 - rowNormalized, 2)
                    );
                    const maxDistance = Math.sqrt(2);
                    delayFactor = (distanceFromBottomLeft / maxDistance);
                }
                
                // 跳过尚未开始的碎片（优化性能，同时避免渲染alpha=0的碎片）
                if (progress < delayFactor) {
                    continue;
                }
                
                const adjustedProgress = Math.min(1, (progress - delayFactor) / (1 - delayFactor));
                
                // 缓动函数（ease-out cubic）
                const easeOut = 1 - Math.pow(1 - adjustedProgress, 3);
                
                // 计算碎片的精确边界（避免浮点数累积误差导致间隙）
                const sourceX = Math.round(col * fragmentWidth);
                const sourceY = Math.round(row * fragmentHeight);
                const sourceXEnd = (col === gridCols - 1) ? cardInfo.width : Math.round((col + 1) * fragmentWidth);
                const sourceYEnd = (row === gridRows - 1) ? cardInfo.height : Math.round((row + 1) * fragmentHeight);
                const actualFragmentWidth = sourceXEnd - sourceX;
                const actualFragmentHeight = sourceYEnd - sourceY;
                
                // 目标位置（最终要放在哪里）
                const destX = baseX + sourceX;
                const destY = baseY + sourceY;
                
                // 基于行列生成确定性的偏移（使用三角函数让分布更自然）
                const rowFactor = row / (gridRows - 1);
                const colFactor = col / (gridCols - 1);
                
                // 起始位置：根据滚动方向从不同侧飞入
                let startOffsetX;
                if (reverseScroll) {
                    // 反向滚动：从左侧视口外飞入
                    startOffsetX = -(100 + (Math.sin(rowFactor * Math.PI) * 100 + colFactor * 100));
                } else {
                    // 正向滚动：从右侧视口外飞入
                    startOffsetX = canvasWidth + 100 + (Math.sin(rowFactor * Math.PI) * 100 + colFactor * 100);
                }
                const startOffsetY = (Math.sin((rowFactor + colFactor) * Math.PI * 2) - 0.5) * 300;
                
                // 当前位置（插值）
                const currentX = destX + (startOffsetX * (1 - easeOut));
                const currentY = destY + (startOffsetY * (1 - easeOut));
                
                // 旋转角度（从确定性旋转到0，基于碎片位置）
                const startRotation = (Math.sin((rowFactor - colFactor) * Math.PI * 3) * 0.5) * Math.PI;
                const rotation = startRotation * (1 - easeOut);
                
                // 透明度（从0到1）
                const alpha = Math.min(1, adjustedProgress * 1.5);
                
                // 跳过完全透明的碎片
                if (alpha <= 0) {
                    continue;
                }
                
                // 缩放（从0.5到1）
                const scale = 0.5 + 0.5 * easeOut;
                
                // 绘制碎片
                ctx.save();
                
                // 设置透明度
                if (alpha < 1) {
                    ctx.globalAlpha = alpha;
                }
                
                // 如果有旋转，需要先平移到碎片中心，旋转后再平移回来
                if (rotation !== 0) {
                    const centerX = currentX + actualFragmentWidth * scale / 2;
                    const centerY = currentY + actualFragmentHeight * scale / 2;
                    
                    ctx.translate(centerX, centerY);
                    ctx.rotate(rotation);
                    ctx.translate(-actualFragmentWidth * scale / 2, -actualFragmentHeight * scale / 2);
                    
                    ctx.drawImage(
                        image,
                        sourceX,
                        sourceY,
                        actualFragmentWidth,
                        actualFragmentHeight,
                        0,
                        0,
                        actualFragmentWidth * scale,
                        actualFragmentHeight * scale
                    );
                } else {
                    ctx.drawImage(
                        image,
                        sourceX,
                        sourceY,
                        actualFragmentWidth,
                        actualFragmentHeight,
                        currentX,
                        currentY,
                        actualFragmentWidth * scale,
                        actualFragmentHeight * scale
                    );
                }
                
                ctx.restore();
            }
        }
        
        // 恢复图像平滑设置
        ctx.imageSmoothingEnabled = oldSmoothing;
    }
    
    /**
     * 绘制带变换的卡片图像（统一入口，根据 renderMode 分发到不同渲染实现）
     * 
     * 设计说明：
     * - 策略模式的统一接口，解耦入场动画策略和具体渲染实现
     * - 通过 renderMode 字段决定使用哪种渲染方式
     * - 支持标准渲染、故障效果、波浪裁剪、碎片重组等多种渲染模式
     * 
     * @param {HTMLCanvasElement} canvas - 目标Canvas
     * @param {HTMLImageElement|HTMLCanvasElement} image - 源图像或Canvas
     * @param {Object} transform - 变换参数（策略返回的完整对象）
     * @param {number} transform.x - 目标X坐标
     * @param {number} transform.y - 目标Y坐标
     * @param {number} transform.width - 目标宽度
     * @param {number} transform.height - 目标高度
     * @param {number} [transform.alpha=1] - 透明度
     * @param {number} [transform.rotation] - 旋转角度（度数）
     * @param {number} [transform.blur] - 模糊半径
     * @param {string} [transform.renderMode='standard'] - 渲染模式（'standard' | 'glitch' | 'wave-clip' | 'fragments'）
     * @param {Object} [transform.renderParams] - 渲染模式特定参数
     * @returns {void}
     * @throws {Error} 当参数无效或 renderMode 未知时抛出错误（Fail Fast）
     */
    drawCardWithTransform(canvas, image, transform) {
        // Fail Fast: 验证基础参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CanvasRenderService.drawCardWithTransform: canvas must be a valid HTMLCanvasElement');
        }
        if (!image || (!(image instanceof HTMLImageElement) && !(image instanceof HTMLCanvasElement))) {
            throw new Error('CanvasRenderService.drawCardWithTransform: image must be HTMLImageElement or HTMLCanvasElement');
        }
        if (!transform || typeof transform !== 'object') {
            throw new Error('CanvasRenderService.drawCardWithTransform: transform must be an object');
        }
        
        // 获取渲染模式（默认为 'standard'）
        const renderMode = transform.renderMode || 'standard';
        
        // 根据渲染模式分发到不同的渲染方法
        switch (renderMode) {
            case 'standard':
                // 标准渲染：支持位置、尺寸、透明度、旋转、模糊
                this.drawImageTransformed(
                    canvas,
                    image,
                    transform.x,
                    transform.y,
                    transform.width,
                    transform.height,
                    {
                        alpha: transform.alpha,
                        rotation: transform.rotation,
                        blur: transform.blur
                    }
                );
                break;
            
            case 'glitch':
                // 故障效果渲染：RGB通道分离 + 随机切片错位
                if (!transform.renderParams || typeof transform.renderParams.intensity !== 'number') {
                    throw new Error('CanvasRenderService.drawCardWithTransform: glitch mode requires renderParams.intensity');
                }
                this._drawImageGlitch(
                    canvas,
                    image,
                    transform.x,
                    transform.y,
                    transform.width,
                    transform.height,
                    transform.renderParams,  // { intensity }
                    { alpha: transform.alpha }
                );
                break;
            
            case 'wave-clip':
                // 波浪裁剪渲染：像窗帘一样从左侧波浪式展开
                if (!transform.renderParams || typeof transform.renderParams.progress !== 'number') {
                    throw new Error('CanvasRenderService.drawCardWithTransform: wave-clip mode requires renderParams.progress');
                }
                this._drawImageWithWaveClip(
                    canvas,
                    image,
                    transform.x,
                    transform.y,
                    transform.width,
                    transform.height,
                    transform.renderParams,  // { progress, amplitude, frequency }
                    { alpha: transform.alpha }
                );
                break;
            
            case 'fragments':
                // 碎片重组渲染：将卡片分割成多个碎片分别绘制
                // Fail Fast: 验证 renderParams
                if (!transform.renderParams) {
                    throw new Error('CanvasRenderService.drawCardWithTransform: fragments mode requires renderParams');
                }
                if (typeof transform.renderParams.progress !== 'number') {
                    throw new Error('CanvasRenderService.drawCardWithTransform: fragments mode requires renderParams.progress (number)');
                }
                if (typeof transform.renderParams.gridRows !== 'number' || transform.renderParams.gridRows <= 0) {
                    throw new Error('CanvasRenderService.drawCardWithTransform: fragments mode requires renderParams.gridRows (positive number)');
                }
                if (typeof transform.renderParams.gridCols !== 'number' || transform.renderParams.gridCols <= 0) {
                    throw new Error('CanvasRenderService.drawCardWithTransform: fragments mode requires renderParams.gridCols (positive number)');
                }
                if (typeof transform.renderParams.reverseScroll !== 'boolean') {
                    throw new Error('CanvasRenderService.drawCardWithTransform: fragments mode requires renderParams.reverseScroll (boolean)');
                }
                if (typeof transform.renderParams.canvasWidth !== 'number') {
                    throw new Error('CanvasRenderService.drawCardWithTransform: fragments mode requires renderParams.canvasWidth (number)');
                }
                
                this._drawFragmentReassembly(
                    canvas,
                    image,
                    {
                        x: transform.x,
                        y: transform.y,
                        width: transform.width,
                        height: transform.height
                    },
                    transform.renderParams
                );
                break;
            
            default:
                // 未知的渲染模式，抛出错误（Fail Fast）
                throw new Error(`CanvasRenderService.drawCardWithTransform: unknown renderMode '${renderMode}'`);
        }
    }

}


/**
 * EntryAnimationService - 入场动画服务
 * 处理纯动画技术逻辑，负责多卡片错峰入场动画的时间管理、进度计算、变换计算、Canvas渲染等技术层面的动画处理
 * 
 * 当前被使用的模块：
 * - PlaybackCoordinatorService (services/business/PlaybackCoordinatorService.js) - 播放协调服务
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，发送进度和完成事件 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器，访问图片和Canvas状态 (通过DI注入)
 * - entryAnimationStrategyManager (patterns/entry/EntryAnimationStrategyManager.js) - 入场动画策略管理器，计算卡片变换 (通过DI注入)
 * - canvasRenderService (utils/CanvasRenderService.js) - Canvas渲染服务，执行Canvas绘制 (通过DI注入)
 * - validationService (system/ValidationService.js) - 验证服务，统一配置验证逻辑 (通过DI注入)
 * - performanceMonitorService (business/PerformanceMonitorService.js) - 性能监控服务，收集性能数据 (通过DI注入)
 * - calculateEntryAnimationTotalDuration (helpers/durationCalculators.js) - 入场动画总时长计算工具函数
 * - calculateActualFPS, calculateTheoreticalFPS (helpers/performanceUtils.js) - 实际FPS计算、理论FPS计算工具函数
 */
import { calculateEntryAnimationTotalDuration } from '../../helpers/durationCalculators.js';
import { calculateActualFPS, calculateTheoreticalFPS } from '../../helpers/performanceUtils.js';

export class EntryAnimationService {
    /**
     * 构造函数
     * @param {EventBus} eventBus - 事件总线，用于发送进度和完成事件
     * @param {StateManager} stateManager - 状态管理器，访问图片和Canvas状态
     * @param {EntryAnimationStrategyManager} entryAnimationStrategyManager - 入场动画策略管理器，计算卡片变换
     * @param {CanvasRenderService} canvasRenderService - Canvas渲染服务，执行Canvas绘制
     * @param {ValidationService} validationService - 验证服务，统一配置验证逻辑
     * @param {PerformanceMonitorService} performanceMonitorService - 性能监控服务，收集性能数据
     * @throws {Error} 当必需依赖未提供时抛出错误
     */
    constructor(eventBus, stateManager, entryAnimationStrategyManager, canvasRenderService, validationService, performanceMonitorService) {
        // Fail Fast: 验证必需的依赖
        if (!eventBus) {
            throw new Error('EntryAnimationService: eventBus is required');
        }
        if (!stateManager) {
            throw new Error('EntryAnimationService: stateManager is required');
        }
        if (!entryAnimationStrategyManager) {
            throw new Error('EntryAnimationService: entryAnimationStrategyManager is required');
        }
        if (!canvasRenderService) {
            throw new Error('EntryAnimationService: canvasRenderService is required');
        }
        if (!validationService) {
            throw new Error('EntryAnimationService: validationService is required');
        }
        if (!performanceMonitorService) {
            throw new Error('EntryAnimationService: performanceMonitorService is required');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.entryAnimationStrategyManager = entryAnimationStrategyManager;
        this.canvasRenderService = canvasRenderService;
        this.validationService = validationService;
        this.performanceMonitorService = performanceMonitorService;
        
        // 动画状态
        this.animationId = null;
        this.startTime = null;
        this.pendingElapsedTime = 0; // 暂存已消耗时间（用于暂停后继续播放）
        this.isAnimating = false;
        this.isPreview = false; // 是否是预览模式（预览模式不触发性能监控和事件）
        
        // 当前动画配置缓存（避免RAF中频繁访问state）
        this.cachedConfig = null;
        this.cachedCards = null; // [{startTime, endTime, strategy, boundary}]
        this.cachedImage = null;
        this.cachedCanvas = null;
        this.cachedScalingRatio = null;
        this.cachedCanvasHeight = null;
        
        // 动画完成回调
        this.onCompleteCallback = null;
        
        // 性能优化：复用事件数据对象，避免每帧创建新对象
        this.progressData = {
            progress: 0,
            elapsed: 0,
            totalDuration: 0,
            isPreview: false
        };
        
        // 实时FPS跟踪：维护最近30帧的FPS历史用于计算平均值
        this.fpsHistory = [];
        this.FPS_HISTORY_SIZE = 30;
        this.lastFrameTimestamp = null; // 上一帧的RAF timestamp（用于计算真实FPS）
        
        // 🚀 性能优化8：cardInfo对象池，避免每帧为每张卡片创建新对象
        this.cardInfoPool = null;  // 初始化为null，在startAnimation时创建
    }
    
    /**
     * 开始入场动画
     * @param {Object} config - 动画配置对象
     * @param {number[]} config.cardBoundaries - 卡片边界数组（像素位置）
     * @param {string[]} config.cardAnimations - 每张卡片的动画类型数组
     * @param {number} config.duration - 单卡片动画时长（毫秒）
     * @param {number} config.staggerDelay - 卡片间错峰延迟（毫秒）
     * @param {Function} onComplete - 动画完成回调函数
     * @param {HTMLCanvasElement} canvas - 渲染目标Canvas元素
     * @param {HTMLImageElement} image - 图片源Image元素
     * @param {boolean} [isPreview=false] - 是否是预览模式（预览模式不触发性能监控和事件）
     * @throws {Error} 当配置无效或Canvas/Image未就绪时抛出错误
     * @returns {void}
     */
    startAnimation(config, onComplete, canvas, image, isPreview = false) {
        // Fail Fast: 使用ValidationService进行统一配置验证
        const validationResult = this.validationService.validateEntryAnimationConfig(config);
        if (!validationResult.isValid) {
            throw new Error(`EntryAnimationService.startAnimation: Invalid configuration - ${validationResult.errors.join(', ')}`);
        }
        
        // Fail Fast: 验证canvas参数
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('EntryAnimationService.startAnimation: canvas is required and must be a HTMLCanvasElement');
        }
        
        // Fail Fast: 验证image参数
        if (!image || !(image instanceof HTMLImageElement)) {
            throw new Error('EntryAnimationService.startAnimation: image is required and must be a HTMLImageElement');
        }
        if (!image.complete || !image.naturalWidth) {
            throw new Error('EntryAnimationService.startAnimation: Image is not loaded or invalid');
        }
        
        // 停止当前动画（如果存在）
        this.stopAnimation();
        
        // 保存预览模式标志
        this.isPreview = isPreview;
        
        // Fail Fast: 验证devicePixelRatio
        if (typeof window.devicePixelRatio !== 'number' || !isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
            throw new Error('EntryAnimationService.startAnimation: Invalid window.devicePixelRatio');
        }
        
        // 计算 Canvas 逻辑高度
        const dpr = window.devicePixelRatio;
        const canvasHeight = canvas.height / dpr;
        
        // 🔑 关键修复：基于传入的图片和Canvas动态计算scalingRatio，而非从state读取
        // 原因：预览场景传入裁剪后的图片，首页场景传入完整图片，两者的scalingRatio不同
        // - 首页：完整图片21224×2355，Canvas逻辑高度1352，scalingRatio = 1352/2355 ≈ 0.574
        // - 预览：裁剪图片4459×2355，Canvas逻辑高度236.67，scalingRatio = 236.67/2355 ≈ 0.1005
        const scalingRatio = canvasHeight / image.naturalHeight;
        
        // Fail Fast: 验证 scalingRatio
        if (typeof scalingRatio !== 'number' || scalingRatio <= 0 || !isFinite(scalingRatio)) {
            throw new Error('EntryAnimationService.startAnimation: Invalid calculated scaling ratio');
        }
        
        // Fail Fast: 验证 canvasHeight
        if (typeof canvasHeight !== 'number' || canvasHeight <= 0 || !isFinite(canvasHeight)) {
            throw new Error('EntryAnimationService.startAnimation: Invalid canvas height');
        }
        
        // 🚀 性能优化0：预先缩放图片到离屏Canvas，避免每帧实时缩放
        // 原理：将"每帧4次缩放"改为"初始化1次缩放"，预计性能提升50-100倍
        const scaledImageStartTime = performance.now();
        
        // 从HTML模板克隆Canvas元素
        const canvasTemplate = document.getElementById('offscreen-canvas-template');
        if (!canvasTemplate) {
            throw new Error('EntryAnimationService.startAnimation: offscreen-canvas-template not found in HTML');
        }
        
        const scaledImageCanvas = canvasTemplate.content.cloneNode(true).querySelector('canvas');
        
        const scaledWidth = Math.ceil(image.naturalWidth * scalingRatio);
        const scaledHeight = Math.ceil(canvasHeight);
        
        // 设置物理尺寸（不需要DPR，因为只是中间缓存）
        scaledImageCanvas.width = scaledWidth;
        scaledImageCanvas.height = scaledHeight;
        
        // 一次性将原图缩放绘制到离屏Canvas
        const scaledCtx = scaledImageCanvas.getContext('2d', { alpha: false });
        if (!scaledCtx) {
            throw new Error('EntryAnimationService.startAnimation: Failed to get 2d context for scaled image canvas');
        }
        
        scaledCtx.drawImage(
            image,
            0, 0, image.naturalWidth, image.naturalHeight,  // 源：整张原图
            0, 0, scaledWidth, scaledHeight                  // 目标：缩放后尺寸
        );
        
        // 🚀 性能优化2：缓存Canvas上下文，避免每帧重复getContext调用
        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) {
            throw new Error('EntryAnimationService.startAnimation: Failed to get 2d context from canvas');
        }
        
        // 缓存配置和状态数据（性能优化）
        this.cachedConfig = config;
        this.cachedImage = scaledImageCanvas;  // 🚀 使用缩放后的Canvas代替原图
        this.cachedOriginalImage = image;       // 保留原图引用（用于调试）
        this.cachedCanvas = canvas;
        this.cachedCanvasCtx = canvasCtx;       // 🚀 优化2：缓存上下文
        this.cachedScalingRatio = scalingRatio;
        this.cachedCanvasHeight = canvasHeight;
        this.onCompleteCallback = onComplete;
        
        // 🚀 性能优化5：缓存canvasInfo对象，避免每帧重复创建
        this.cachedCanvasInfo = {
            width: canvas.width,
            height: canvas.height,
            logicalHeight: canvasHeight
        };
        
        // 🚀 性能优化3：缓存背景色，避免每帧从state读取
        this.cachedBackgroundColor = this.stateManager.state.ui.display.backgroundColor;
        
        // 计算每张卡片的时序信息
        this.cachedCards = this._calculateCardTimings(config);
        
        // 🚀 性能优化8：为每张卡片预创建cardInfo对象池
        this.cardInfoPool = this.cachedCards.map(() => ({
            x: 0,
            y: 0,
            width: 0,
            height: 0
        }));
        
        // 🚀 性能优化0.1：预先裁剪每张卡片到离屏Canvas
        // 原理：将"每帧4次裁剪"改为"初始化1次裁剪"，动画时只需复制完整Canvas
        // 预计收益：drawImage从9参数（裁剪）降为5参数（复制），每张卡片从122ms降至5ms
        this._cacheCardCanvases(scaledImageCanvas, scaledWidth, scaledHeight);
        
        // 计算总动画时长
        const totalDuration = this._calculateTotalDuration(config);
        
        // 标记动画状态
        this.isAnimating = true;
        this.startTime = null; // RAF第一帧会设置实际开始时间
        this.pendingElapsedTime = 0; // 重置已消耗时间（新动画开始）
        
        // 启动RAF动画循环
        this.animationId = requestAnimationFrame((timestamp) => this._animate(timestamp, totalDuration));
        
        // 发送动画开始事件（仅在非预览模式下）
        if (!this.isPreview) {
            this.eventBus.emit('entry-animation:started', {
                cardCount: config.cardAnimations.length,
                totalDuration: totalDuration
            });
        }
    }
    
    /**
     * 暂停入场动画（保留状态，支持恢复播放）
     * @returns {boolean} 是否成功暂停（如果动画还没启动则返回false）
     */
    pauseAnimation() {
        // 🎯 优雅修复：如果动画还没启动（异步裁剪中），返回false表示无法暂停
        // 场景：用户在异步操作期间点了暂停，但动画还没启动，没有状态可保留
        if (this.animationId === null && this.startTime === null && !this.cachedConfig) {
            return false;
        }
        
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // 计算已消耗时间，用于恢复播放时继续
        if (this.startTime !== null) {
            const now = performance.now();
            this.pendingElapsedTime = now - this.startTime;
        }
        
        this.isAnimating = false;
        // 注意：不清除配置缓存，以便恢复播放
        return true;
    }
    
    /**
     * 恢复入场动画（从暂停位置继续播放）
     * @returns {void}
     * @throws {Error} 当没有暂停状态可恢复时抛出错误
     */
    resumeAnimation() {
        // Fail Fast: 验证有暂停状态可恢复
        if (!this.cachedConfig || !this.cachedCards) {
            throw new Error('EntryAnimationService.resumeAnimation: No paused animation to resume');
        }
        
        // 标记动画状态
        this.isAnimating = true;
        this.startTime = null; // RAF第一帧会设置实际开始时间（会减去 pendingElapsedTime）
        
        // 计算总动画时长
        const totalDuration = this._calculateTotalDuration(this.cachedConfig);
        
        // 启动RAF动画循环（会从 pendingElapsedTime 继续）
        this.animationId = requestAnimationFrame((timestamp) => this._animate(timestamp, totalDuration));
    }
    
    /**
     * 停止入场动画（清除所有状态）
     * @returns {void}
     */
    stopAnimation() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        this.isAnimating = false;
        this.startTime = null;
        this.pendingElapsedTime = 0;
        this.cachedConfig = null;
        this.cachedCards = null;
        this.fpsHistory = []; // 清空FPS历史
        this.lastFrameTimestamp = null; // 清空上一帧时间戳
        this.cachedImage = null;
        this.cachedCanvas = null;
        this.cachedScalingRatio = null;
        this.cachedCanvasHeight = null;
        this.cachedCanvasInfo = null;  // 🚀 优化5：清理缓存
        this.cachedBackgroundColor = null;  // 🚀 优化3：清理缓存
        this.cardInfoPool = null;  // 🚀 优化8：清理对象池
        this.onCompleteCallback = null;
    }
    
    /**
     * 计算每张卡片的时序信息
     * @private
     * @param {Object} config - 动画配置对象
     * @returns {Array<Object>} 卡片时序信息数组 [{startTime, endTime, strategy, leftBoundary, rightBoundary}]
     */
    _calculateCardTimings(config) {
        const cards = [];
        const cardCount = config.cardAnimations.length;
        
        // 获取反向滚动状态，决定卡片入场顺序
        const reverseScroll = this.stateManager.state.playback.scroll.reverseScroll;
        
        for (let i = 0; i < cardCount; i++) {
            // 反向滚动时：倒序播放卡片（最后一张最早入场，第一张最晚入场）
            // 正向滚动时：顺序播放卡片（第一张最早入场，最后一张最晚入场）
            const timeIndex = reverseScroll ? (cardCount - 1 - i) : i;
            const startTime = timeIndex * (config.duration + config.staggerDelay);
            const endTime = startTime + config.duration;
            
            // cardBoundaries 是扁平数组 [x1, x2, x3, x4, ...]
            // 每张卡片由连续的两条边界线定义：卡片i = [i*2, i*2+1]
            cards.push({
                startTime: startTime,
                endTime: endTime,
                strategy: config.cardAnimations[i],
                leftBoundary: config.cardBoundaries[i * 2],
                rightBoundary: config.cardBoundaries[i * 2 + 1]
            });
        }
        
        return cards;
    }
    
    /**
     * 🚀 性能优化0.1：预先裁剪每张卡片到离屏Canvas
     * 将每张卡片从预缩放Canvas裁剪出来，缓存到独立Canvas
     * 动画时直接复制整个卡片Canvas，无需每帧裁剪
     * 
     * @private
     * @param {HTMLCanvasElement} scaledImageCanvas - 预缩放后的完整图片Canvas
     * @param {number} scaledWidth - 预缩放后的图片宽度
     * @param {number} scaledHeight - 预缩放后的图片高度
     * @returns {void}
     */
    _cacheCardCanvases(scaledImageCanvas, scaledWidth, scaledHeight) {
        // 从HTML模板获取Canvas模板
        const canvasTemplate = document.getElementById('offscreen-canvas-template');
        if (!canvasTemplate) {
            throw new Error('EntryAnimationService._cacheCardCanvases: offscreen-canvas-template not found');
        }
        
        // 为每张卡片创建离屏Canvas并裁剪
        this.cachedCards.forEach((card, index) => {
            // 计算卡片在预缩放Canvas中的位置和尺寸
            const cardScaledX = card.leftBoundary * this.cachedScalingRatio;
            const cardScaledWidth = (card.rightBoundary - card.leftBoundary) * this.cachedScalingRatio;
            
            // 克隆Canvas元素
            const cardCanvas = canvasTemplate.content.cloneNode(true).querySelector('canvas');
            
            // 🚀 优化0.1补充：向上取整确保Canvas尺寸为整数，避免浮点数导致的精度问题
            // 这样后续绘制时可以完美匹配，无缩放开销
            cardCanvas.width = Math.ceil(cardScaledWidth);
            cardCanvas.height = Math.ceil(scaledHeight);
            
            // 获取上下文并裁剪卡片
            const ctx = cardCanvas.getContext('2d', { alpha: true });
            if (!ctx) {
                throw new Error(`EntryAnimationService._cacheCardCanvases: Failed to get 2d context for card ${index}`);
            }
            
            // 从预缩放Canvas裁剪该卡片区域，填充满整个卡片Canvas
            ctx.drawImage(
                scaledImageCanvas,
                cardScaledX, 0, cardScaledWidth, scaledHeight,  // 源：预缩放Canvas中的卡片区域
                0, 0, cardCanvas.width, cardCanvas.height        // 目标：填充整个卡片Canvas（使用实际尺寸）
            );
            
            // 缓存到card对象
            card.cachedCanvas = cardCanvas;
        });
    }
    
    /**
     * 计算总动画时长
     * 
     * @private
     * @param {Object} config - 动画配置对象
     * @returns {number} 总动画时长（毫秒）
     */
    _calculateTotalDuration(config) {
        const cardCount = config.cardAnimations.length;
        
        return calculateEntryAnimationTotalDuration(
            cardCount,
            config.duration,
            config.staggerDelay
        );
    }
    
    /**
     * RAF动画循环
     * @private
     * @param {DOMHighResTimeStamp} timestamp - RAF时间戳
     * @param {number} totalDuration - 总动画时长（毫秒）
     * @returns {void}
     */
    _animate(timestamp, totalDuration) {
        // 性能监控：记录帧开始时间
        const frameStartTime = performance.now();
        
        // 🐛 Bug修复：检查动画是否已暂停
        // 场景：RAF回调已调度但在执行前pauseAnimation()被调用，导致暂停后继续播放
        if (!this.isAnimating) {
            return;
        }
        
        // 🐛 Bug修复：竞态条件保护 - 如果缓存已被清空（动画已停止），直接返回
        // 场景：RAF回调已调度但在执行前stopAnimation()被调用，导致访问null的cachedCanvas
        if (!this.cachedCanvas || !this.cachedCanvasCtx) {
            return;
        }
        
        // 初始化开始时间（支持暂停后继续：减去已消耗时间）
        if (this.startTime === null) {
            this.startTime = timestamp - this.pendingElapsedTime;
        }
        
        // 计算已消耗时间
        const elapsed = timestamp - this.startTime;
        
        // 计算全局进度
        const progress = Math.min(elapsed / totalDuration, 1.0);
        
        // 性能监控：记录清屏开始时间
        const clearStartTime = performance.now();
        
        // 🚀 性能优化1：用fillRect覆盖代替clear+fillRect（虽然clear只占0.0%，但可以合并操作）
        // 如果有背景色，直接fillRect覆盖；否则调用clear
        if (this.cachedBackgroundColor) {
            // 直接填充背景色，覆盖整个Canvas（合并clear和fillRect）
            this.cachedCanvasCtx.fillStyle = this.cachedBackgroundColor;
            this.cachedCanvasCtx.fillRect(0, 0, this.cachedCanvas.width, this.cachedCanvas.height);
        } else {
            // 没有背景色时才需要clear
            this.canvasRenderService.clear(this.cachedCanvas);
        }
        
        // 性能监控：计算清屏耗时
        const clearEndTime = performance.now();
        const clearTime = clearEndTime - clearStartTime;
        
        // 性能监控：记录卡片绘制开始时间
        const cardStartTime = performance.now();
        
        // 渲染所有卡片
        const renderStats = this._renderCards(elapsed);
        
        // 性能监控：计算卡片绘制耗时
        const cardEndTime = performance.now();
        const cardTime = cardEndTime - cardStartTime;
        
        // 发送进度事件（复用对象，性能优化）
        this.progressData.progress = progress;
        this.progressData.elapsed = elapsed;
        this.progressData.totalDuration = totalDuration;
        this.progressData.isPreview = this.isPreview;
        this.eventBus.emit('entry-animation:progress', this.progressData);
        
        // 性能监控：计算帧时间
        const frameEndTime = performance.now();
        const frameTime = frameEndTime - frameStartTime;
        const canvasTime = clearTime + cardTime; // Canvas操作总耗时（清屏 + 卡片绘制）
        const businessTime = frameTime - canvasTime; // 业务逻辑耗时（进度计算、策略逻辑、事件发射等）
        
        // 发送实时FPS（仅在非预览模式下）
        if (!this.isPreview) {
            const showRealtimeFPS = this.stateManager.state.preferences.performance.showRealtimeFPS;
            if (showRealtimeFPS) {
                // 使用RAF timestamp计算真实FPS（两帧之间的时间间隔）
                if (this.lastFrameTimestamp !== null) {
                    const deltaTime = timestamp - this.lastFrameTimestamp;
                    if (deltaTime > 0) {
                        // 计算理论FPS
                        const theoreticalFPS = calculateTheoreticalFPS(deltaTime);
                        
                        // 获取刷新率并钳制FPS（不能超过屏幕物理刷新率）
                        // 优先使用用户手动设置的刷新率，其次使用自动估算值
                        const performanceState = this.stateManager.state.debug.performance;
                        const userRefreshRate = performanceState.userRefreshRate;
                        const estimatedRefreshRate = performanceState.estimatedRefreshRate;
                        const refreshRate = userRefreshRate || estimatedRefreshRate;
                        
                        // 如果有刷新率则钳制，否则使用理论FPS（允许降级，因为刷新率可能估算失败）
                        const fps = refreshRate ? calculateActualFPS(theoreticalFPS, refreshRate) : theoreticalFPS;
                        
                        // 维护FPS历史（用于计算平均值）
                        this.fpsHistory.push(fps);
                        if (this.fpsHistory.length > this.FPS_HISTORY_SIZE) {
                            this.fpsHistory.shift(); // 移除最旧的帧
                        }
                        
                        // 计算平均FPS
                        const avgFPS = this.fpsHistory.reduce((sum, val) => sum + val, 0) / this.fpsHistory.length;
                        
                        this.eventBus.emit('performance:realtime:fps', { 
                            fps, 
                            avgFPS, 
                            stage: 'entry' 
                        });
                    }
                }
                this.lastFrameTimestamp = timestamp;
            }
        }
        
        // 收集性能监控数据（仅在非预览模式下）
        if (!this.isPreview) {
            this.performanceMonitorService.collectEntryFrame({
                frameTime,
                drawImageCalls: renderStats.drawImageCalls,
                getContextCalls: 0,
                timestamp: frameEndTime,
                rafTimestamp: timestamp, // RAF timestamp，用于计算实际帧间隔
                // 细分耗时
                clearTime,
                cardTime,
                canvasTime,
                businessTime
            });
        }
        
        // 判断是否完成
        if (progress >= 1.0) {
            this._handleAnimationComplete();
        } else {
            // 继续下一帧
            this.animationId = requestAnimationFrame((ts) => this._animate(ts, totalDuration));
        }
    }
    
    /**
     * 渲染所有卡片
     * 跳过完全不可见的卡片，验证可见卡片的边界坐标有效性
     * @private
     * @param {number} elapsed - 已消耗时间（毫秒）
     * @returns {Object} 渲染统计信息 {drawImageCalls: number}
     */
    _renderCards(elapsed) {
        // 性能监控：初始化drawImage调用计数器
        let drawImageCalls = 0;
        
        // 🚀 性能优化5：使用缓存的canvasInfo对象，避免每帧重复创建
        const canvasInfo = this.cachedCanvasInfo;
        
        // 🚀 优化0.1：不再需要imageWidth/imageHeight，边界验证已在_cacheCardCanvases完成
        
        // 🚀 性能优化6：使用传统for循环代替forEach，避免函数调用开销（5-10%提升）
        const cardCount = this.cachedCards.length;
        for (let index = 0; index < cardCount; index++) {
            const card = this.cachedCards[index];
            
            // 判断卡片动画是否开始
            if (elapsed < card.startTime) {
                continue; // 尚未开始，跳过
            }
            
            // 🚀 优化0.1：边界验证已在_cacheCardCanvases时完成，动画时只需验证cachedCanvas存在
            if (!card.cachedCanvas) {
                throw new Error(`EntryAnimationService._renderCards: Card ${index} has no cached canvas`);
            }
            
            // 计算卡片局部进度
            const cardElapsed = elapsed - card.startTime;
            const cardDuration = card.endTime - card.startTime;
            const cardProgress = Math.min(cardElapsed / cardDuration, 1.0);
            
            // 🚀 性能优化8：复用cardInfo对象池，避免每帧创建新对象
            const cardInfo = this.cardInfoPool[index];
            cardInfo.x = card.leftBoundary * this.cachedScalingRatio;
            cardInfo.y = 0;
            cardInfo.width = card.cachedCanvas.width;   // 🚀 直接使用Canvas实际宽度
            cardInfo.height = card.cachedCanvas.height;  // 🚀 直接使用Canvas实际高度
            
            // 🚀 性能优化4：缓存策略实例，避免每帧getStrategy查找
            // 策略实例在_calculateCardTimings时已确定，可以预先缓存
            if (!card.cachedStrategy) {
                card.cachedStrategy = this.entryAnimationStrategyManager.getStrategy(card.strategy);
            }
            // 增加 reverseScroll 状态到 canvasInfo（用于动画方向判断）
            canvasInfo.reverseScroll = this.stateManager.state.playback.scroll.reverseScroll;
            
            const transform = card.cachedStrategy.calculateTransform(
                cardProgress,
                cardInfo,
                canvasInfo
            );
            
            // 🚀 性能优化0.1：直接使用预裁剪的卡片Canvas，无需裁剪参数
            // 从9参数drawImage（有裁剪）降为5参数drawImage（只复制），性能大幅提升
            
            // 直接绘制预裁剪的卡片Canvas（5参数版本，无裁剪开销）
            // 传递所有变换参数（alpha, rotation, blur）
            // 🎨 使用统一接口绘制卡片（策略模式：根据 renderMode 自动分发到不同渲染实现）
            // 重构说明：
            // - 策略返回的 transform 包含 renderMode 和 renderParams
            // - CanvasRenderService.drawCardWithTransform 根据 renderMode 分发到具体渲染方法
            this.canvasRenderService.drawCardWithTransform(
                this.cachedCanvas,
                card.cachedCanvas,
                transform  // 传递完整的 transform 对象（包含 renderMode 和 renderParams）
            );
            
            // 性能监控：记录drawImage调用
            drawImageCalls++;
        }
        
        return { drawImageCalls };
    }
    
    /**
     * 处理动画完成
     * @private
     * @returns {void}
     */
    _handleAnimationComplete() {
        // 清理动画状态
        this.isAnimating = false;
        this.animationId = null;
        
        // 调用完成回调
        if (typeof this.onCompleteCallback === 'function') {
            const callback = this.onCompleteCallback;
            this.onCompleteCallback = null; // 清空引用
            callback();
        }
        
        // 清理缓存
        this.cachedConfig = null;
        this.cachedCards = null;
        this.cachedImage = null;
        this.cachedCanvas = null;
        this.cachedScalingRatio = null;
        this.cachedCanvasHeight = null;
        this.cachedCanvasInfo = null;  // 🚀 优化5：清理缓存
        this.cachedBackgroundColor = null;  // 🚀 优化3：清理缓存
        this.cardInfoPool = null;  // 🚀 优化8：清理对象池
    }
}


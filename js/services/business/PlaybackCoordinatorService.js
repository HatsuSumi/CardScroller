/**
 * PlaybackCoordinatorService - 播放协调服务
 * 协调完整播放流程（入场+滚动动画、循环播放、循环间隔倒计时）
 * 
 * 当前被使用的模块：
 * - ScrollService (services/business/ScrollService.js) - 调用本服务的 play(), pause(), reset() 方法
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，发送播放相关事件 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器，访问配置状态 (通过DI注入)
 * - entryAnimationService (business/EntryAnimationService.js) - 入场动画服务 (通过DI注入)
 * - scrollAnimationService (business/ScrollAnimationService.js) - 滚动动画服务 (通过DI注入)
 * - durationSequenceService (business/DurationSequenceService.js) - 时长序列服务，计算变长循环时长 (通过DI注入)
 * - viewportCalculatorService (utils/ViewportCalculatorService.js) - 视口计算服务，计算viewport尺寸和裁剪图片 (通过DI注入)
 * - canvasRenderService (utils/CanvasRenderService.js) - Canvas渲染服务，负责Canvas技术操作 (通过DI注入)
 * - performanceMonitorService (business/PerformanceMonitorService.js) - 性能监控服务，收集和分析动画性能数据 (通过DI注入)
 * - getEntryCanvas, getMainImage (helpers/canvasAccessors.js) - Canvas和图片元素访问工具函数
 * - calculateEntryAnimationTotalDuration, calculateTotalTime, calculateFixedOverhead, calculateSingleLoopDuration (helpers/durationCalculators.js) - 时长计算工具函数
 */
import { getEntryCanvas, getMainImage } from '../../helpers/canvasAccessors.js';
import { calculateEntryAnimationTotalDuration, calculateTotalTime, calculateFixedOverhead, calculateSingleLoopDuration } from '../../helpers/durationCalculators.js';

export class PlaybackCoordinatorService {
    /**
     * 构造函数
     * @param {EventBus} eventBus - 事件总线
     * @param {StateManager} stateManager - 状态管理器
     * @param {EntryAnimationService} entryAnimationService - 入场动画服务
     * @param {ScrollAnimationService} scrollAnimationService - 滚动动画服务
     * @param {DurationSequenceService} durationSequenceService - 时长序列服务
     * @param {ViewportCalculatorService} viewportCalculatorService - 视口计算服务
     * @param {CanvasRenderService} canvasRenderService - Canvas渲染服务
     * @param {PerformanceMonitorService} performanceMonitorService - 性能监控服务
     * @throws {Error} 当必需依赖未提供时抛出错误
     */
    constructor(eventBus, stateManager, entryAnimationService, scrollAnimationService, durationSequenceService, viewportCalculatorService, canvasRenderService, performanceMonitorService) {
        // Fail Fast: 验证必需的依赖
        if (!eventBus) {
            throw new Error('PlaybackCoordinatorService: eventBus is required');
        }
        if (!stateManager) {
            throw new Error('PlaybackCoordinatorService: stateManager is required');
        }
        if (!entryAnimationService) {
            throw new Error('PlaybackCoordinatorService: entryAnimationService is required');
        }
        if (!scrollAnimationService) {
            throw new Error('PlaybackCoordinatorService: scrollAnimationService is required');
        }
        if (!durationSequenceService) {
            throw new Error('PlaybackCoordinatorService: durationSequenceService is required');
        }
        if (!viewportCalculatorService) {
            throw new Error('PlaybackCoordinatorService: viewportCalculatorService is required');
        }
        if (!canvasRenderService) {
            throw new Error('PlaybackCoordinatorService: canvasRenderService is required');
        }
        if (!performanceMonitorService) {
            throw new Error('PlaybackCoordinatorService: performanceMonitorService is required');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.entryAnimationService = entryAnimationService;
        this.scrollAnimationService = scrollAnimationService;
        this.durationSequenceService = durationSequenceService;
        this.viewportCalculatorService = viewportCalculatorService;
        this.canvasRenderService = canvasRenderService;
        this.performanceMonitorService = performanceMonitorService;
        
        // 播放阶段状态（统一的状态管理）
        // current: 当前播放阶段
        //   - 'entry': 入场动画播放中
        //   - 'interval-before-scroll': 入场动画和滚动动画之间的间隔
        //   - 'scroll': 滚动动画播放中
        //   - 'loop-interval': 循环间隔（滚动完成到下一次循环开始之间）
        //   - null: 无播放活动
        // isPaused: 播放是否处于暂停状态（配合 current 使用）
        this.playbackPhase = {
            current: null,
            isPaused: false
        };
        
        // 首次播放标记（用于触发刷新率估算）
        this.hasPlayedOnce = false;
        
        // 当前循环时长覆盖（用于变长时长功能）
        this.currentLoopDuration = null;
        
        // 缓存的DOM元素（用于循环播放时复用）
        this.cachedDomElements = null;
        
        // 技术实现常量：倒计时更新频率（性能相关）
        this.COUNTDOWN_UPDATE_INTERVAL = 100; // ms
        
        // 循环间隔定时器管理（用于暂停/恢复功能）
        this.loopIntervalState = {
            countdownIntervalId: null,  // 倒计时定时器ID
            loopTimeoutId: null,         // 循环延迟定时器ID
            remainingTime: 0,            // 剩余间隔时间（毫秒）
            isPaused: false,             // 是否处于暂停状态
            callback: null,              // 间隔结束后的回调函数
            intervalStart: null,         // 间隔开始时间戳
            totalIntervalTime: 0         // 总间隔时间（毫秒）
        };
        
        // 入场动画和滚动动画之间的间隔定时器管理（用于暂停/恢复功能）
        this.intervalBeforeScrollState = {
            timeoutId: null,             // 延迟定时器ID
            progressIntervalId: null,    // 进度更新定时器ID（用于在间隔期间发送进度事件）
            remainingTime: 0,            // 剩余间隔时间（毫秒）
            isPaused: false,             // 是否处于暂停状态
            callback: null,              // 间隔结束后的回调函数
            intervalStart: null,         // 间隔开始时间戳
            totalIntervalTime: 0         // 总间隔时间（毫秒）
        };
        
        // 当前播放序列的时长信息（用于进度条总进度计算）
        this.currentSequenceDurations = {
            entryAnimationDuration: 0,   // 入场动画总时长（秒）
            intervalBeforeScroll: 0,     // 入场和滚动之间的间隔时长（秒）
            scrollAnimationDuration: 0,  // 滚动动画总时长（秒）
            singleLoopDuration: 0,       // 单次循环总时长（秒）= entry + interval + scroll
            fixedOverhead: 0             // 固定开销（秒）= entry + interval（用于变长时长模式）
        };
        
        // 监听子服务的进度事件，转发为统一的 playback:progress 事件
        this._setupProgressEventForwarding();
        
        // 🆕 监听图片加载完成，预初始化 entry Canvas
        this._setupEntryCanvasPreinit();
    }
    
    /**
     * 计算包含循环的总播放时间
     * 用于 progressTotalTime 显示（总已过时间/总时长）
     * @param {number} currentLoopElapsed - 当前循环内的已过时间（秒）
     * @param {number} completedIntervalsCount - 已完成的循环间隔数
     * @returns {{totalElapsed: number, totalDuration: number}} 总已过时间和总时长
     * @private
     */
    _calculateTotalPlaybackProgress(currentLoopElapsed, completedIntervalsCount) {
        // Fail Fast: 验证参数
        if (typeof completedIntervalsCount !== 'number') {
            throw new Error('PlaybackCoordinatorService._calculateTotalPlaybackProgress: completedIntervalsCount must be a number');
        }
        
        const { singleLoopDuration, fixedOverhead } = this.currentSequenceDurations;
        
        // Fail Fast: 验证单次循环时长（正式播放时必须已设置）
        if (singleLoopDuration <= 0) {
            throw new Error('PlaybackCoordinatorService: Invalid total duration for progress calculation');
        }
        
        // 获取当前循环次数和循环配置
        const loopState = this.stateManager.state.playback.loop;
        const currentLoop = loopState.currentLoop;
        const intervalTime = this._getIntervalTime(); // 毫秒
        
        // 🎯 委托给 durationCalculators.js 计算总时间（使用缓存的时长信息）
        const { totalElapsed, totalDuration } = calculateTotalTime(
            currentLoopElapsed,
            loopState.enabled ? loopState.count : 0,
            currentLoop,
            loopState.variableDuration,
            loopState.durationSequence,
            singleLoopDuration,
            intervalTime,
            fixedOverhead,  // 传入缓存的固定开销（秒）
            completedIntervalsCount  // 🐛 Bug修复：明确传入已完成的间隔数
        );
        
        return { totalElapsed, totalDuration };
    }

    /**
     * 获取当前循环的实际时长（变长模式下使用动态时长，固定模式下使用缓存时长）
     * @param {number} fallbackDuration - 回退时长（秒）
     * @returns {number} 当前循环时长（秒）
     * @private
     */
    _getCurrentLoopDuration(fallbackDuration) {
        const loopState = this.stateManager.state.playback.loop;
        if (loopState.variableDuration && this.currentLoopDuration > 0) {
            // 🐛 Bug修复：变长时长只改变滚动时长，入场动画时长保持不变
            // currentLoopDuration 只是滚动时长，需要加上 fixedOverhead（入场+间隔）
            const { fixedOverhead } = this.currentSequenceDurations;
            return fixedOverhead + this.currentLoopDuration;
        }
        return fallbackDuration;
    }

    /**
     * 计算并缓存播放序列的时长信息
     * @param {boolean} shouldPlayEntry - 是否播放入场动画
     * @param {number} scrollDurationMs - 滚动动画时长（毫秒）
     * @returns {Object} 时长信息对象
     * @returns {number} returns.entryAnimationDuration - 入场动画总时长（秒）
     * @returns {number} returns.intervalBeforeScroll - 入场和滚动之间的间隔时长（秒）
     * @returns {number} returns.scrollAnimationDuration - 滚动动画总时长（秒）
     * @returns {number} returns.singleLoopDuration - 单次循环总时长（秒）
     * @returns {number} returns.fixedOverhead - 固定开销（秒）
     * @private
     */
    _calculateSequenceDurations(shouldPlayEntry, scrollDurationMs) {
        // Fail Fast: 验证参数
        if (typeof shouldPlayEntry !== 'boolean') {
            throw new Error('PlaybackCoordinatorService._calculateSequenceDurations: shouldPlayEntry must be a boolean');
        }
        if (typeof scrollDurationMs !== 'number' || scrollDurationMs <= 0) {
            throw new Error('PlaybackCoordinatorService._calculateSequenceDurations: scrollDurationMs must be a positive number');
        }
        
        const entryAnimationConfig = this.stateManager.state.playback.entryAnimation;
        
        // 计算入场动画总时长（如果需要播放且启用）
        let entryAnimationDuration = 0;
        let intervalBeforeScroll = 0;
        
        if (shouldPlayEntry && entryAnimationConfig.enabled) {
            const cardCount = entryAnimationConfig.cardBoundaries.length / 2;
            const entryDurationMs = calculateEntryAnimationTotalDuration(
                cardCount,
                entryAnimationConfig.duration,
                entryAnimationConfig.staggerDelay
            );
            entryAnimationDuration = entryDurationMs / 1000; // 转换为秒
            intervalBeforeScroll = entryAnimationConfig.intervalBeforeScroll / 1000; // 转换为秒
        }
        
        // 滚动动画时长（转换为秒）
        const scrollAnimationDuration = scrollDurationMs / 1000;
        
        // 使用统一的工具函数计算时长
        // 注意：调用点已经传入了当前循环的实际时长（变长模式下通过 actualScrollDuration 处理）
        const singleLoopDuration = calculateSingleLoopDuration(
            scrollAnimationDuration,
            entryAnimationConfig
        );
        const fixedOverhead = calculateFixedOverhead(
            singleLoopDuration,
            scrollAnimationDuration
        );
        
        return {
            entryAnimationDuration,
            intervalBeforeScroll,
            scrollAnimationDuration,
            singleLoopDuration,
            fixedOverhead
        };
    }

    /**
     * 设置进度事件转发
     * 监听 entry-animation:progress 和 scroll:progress，计算当前循环进度和总时间后发送统一的 playback:progress 事件
     * @private
     */
    _setupProgressEventForwarding() {
        // 监听入场动画进度
        this.eventBus.on('entry-animation:progress', (data) => {
            // 预览模式不更新主进度条
            if (data.isPreview) {
                return;
            }
            
            // 当前循环内的已过时间 = 入场动画已过时间
            const currentLoopElapsed = data.elapsed / 1000; // 转换为秒
            
            // 计算包含循环的总进度（用于 progressTotalTime 显示）
            // 入场动画期间，currentLoop表示已完成的循环数，已完成的间隔数也是currentLoop
            const currentLoop = this.stateManager.state.playback.loop.currentLoop;
            const { totalElapsed, totalDuration } = this._calculateTotalPlaybackProgress(currentLoopElapsed, currentLoop);
            
            // 入场动画阶段的位置：根据滚动方向确定起始位置
            const scrollState = this.stateManager.state.playback.scroll;
            const isReverse = scrollState.reverseScroll === true;
            const position = isReverse ? scrollState.endPosition : scrollState.startPosition;
            
            // 🐛 Bug修复：变长时长模式下，使用当前循环的实际时长
            const currentLoopDuration = this._getCurrentLoopDuration(this.currentSequenceDurations.singleLoopDuration);
            
            // 计算当前循环进度（用于进度条显示）
            const currentLoopProgress = currentLoopElapsed / currentLoopDuration;
            
            // 发送统一的进度事件
            this.eventBus.emit('playback:progress', {
                progress: currentLoopProgress,  // 改为当前循环进度
                elapsed: totalElapsed,
                position: position,
                totalDuration: totalDuration,
                // 当前循环的进度（用于 progress-time 显示）
                currentLoopElapsed: currentLoopElapsed,
                singleLoopDuration: currentLoopDuration  // 使用动态时长
            });
        });
        
        // 监听滚动动画进度
        this.eventBus.on('scroll:progress', (data) => {
            const { entryAnimationDuration, intervalBeforeScroll, singleLoopDuration } = this.currentSequenceDurations;
            
            // 当前循环内的已过时间 = 入场动画总时长 + 间隔时长 + 滚动动画已过时间
            const currentLoopElapsed = entryAnimationDuration + intervalBeforeScroll + data.elapsed;
            
            // 计算包含循环的总进度（用于 progressTotalTime 显示）
            // 滚动动画期间，currentLoop表示已完成的循环数，已完成的间隔数也是currentLoop
            const currentLoop = this.stateManager.state.playback.loop.currentLoop;
            const { totalElapsed, totalDuration } = this._calculateTotalPlaybackProgress(currentLoopElapsed, currentLoop);
            
            // 🐛 Bug修复：变长时长模式下，使用当前循环的实际时长
            const currentLoopDuration = this._getCurrentLoopDuration(singleLoopDuration);
            
            // 计算当前循环进度（用于进度条显示）
            const currentLoopProgress = currentLoopElapsed / currentLoopDuration;
            
            // 发送统一的进度事件
            this.eventBus.emit('playback:progress', {
                progress: currentLoopProgress,  // 改为当前循环进度
                elapsed: totalElapsed,
                position: data.position,
                totalDuration: totalDuration,
                // 当前循环的进度（用于 progress-time 显示）
                currentLoopElapsed: currentLoopElapsed,
                singleLoopDuration: currentLoopDuration  // 使用动态时长
            });
        });
    }
    
    /**
     * 设置入场Canvas预初始化
     * 监听图片加载完成事件，当入场动画启用时，预初始化 entry Canvas 尺寸
     * @private
     * @returns {void}
     */
    _setupEntryCanvasPreinit() {
        this.eventBus.on('image:loaded-entry-preinit-needed', () => {
            // 获取入场动画配置
            const entryAnimationConfig = this.stateManager.state.playback.entryAnimation;
            
            // 注意：即使入场动画未启用，也要预初始化Canvas尺寸
            // 原因：性能报告需要显示入场Canvas尺寸用于性能对比
            if (!entryAnimationConfig) {
                throw new Error('PlaybackCoordinatorService._setupEntryCanvasPreinit: Entry animation config is required');
            }
            
            // 获取图片和Canvas元素
            const image = getMainImage();
            const entryCanvas = getEntryCanvas();
            
            // Fail Fast: 验证图片是否已加载
            if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
                throw new Error('PlaybackCoordinatorService._setupEntryCanvasPreinit: Image is not loaded yet');
            }
            
            // 获取入场动画起始位置
            const { startPosition: entryStartPosition } = this._getScrollPositions();
            
            // Fail Fast: 验证startPosition
            if (typeof entryStartPosition !== 'number' || !isFinite(entryStartPosition) || entryStartPosition < 0) {
                throw new Error('PlaybackCoordinatorService._setupEntryCanvasPreinit: Invalid startPosition');
            }
            
            // 计算viewport宽度
            const viewportWidth = this.viewportCalculatorService.calculateViewportWidth(
                entryStartPosition,
                image.naturalWidth,
                image.naturalHeight
            );
            
            // 裁剪图片到viewport（异步操作）
            this.viewportCalculatorService.createCroppedImageForViewport(
                image,
                entryStartPosition,
                viewportWidth
            ).then((viewportImage) => {
                // 设置entry-canvas为viewport尺寸（保持隐藏状态）
                this.canvasRenderService.setupCanvasForViewport(entryCanvas, viewportImage);
            }).catch((error) => {
                // Fail Fast: viewport裁剪失败
                throw new Error(`PlaybackCoordinatorService._setupEntryCanvasPreinit: Failed to create viewport image: ${error.message}`);
            });
        });
    }
    
    /**
     * 播放单次动画序列（入场动画 + 滚动动画）
     * @param {Object} scrollConfig - 滚动动画配置
     * @param {Function} onComplete - 完成回调函数
     * @param {boolean} shouldPlayEntry - 是否需要播放入场动画
     * @param {Object} domElements - DOM元素对象
     * @param {HTMLCanvasElement} domElements.canvas - 滚动Canvas元素
     * @param {HTMLImageElement} domElements.image - 主图片元素
     * @returns {void}
     * @throws {Error} 当domElements参数无效时立即抛出错误（Fail Fast）
     */
    playAnimationSequence(scrollConfig, onComplete, shouldPlayEntry, domElements) {
        // Fail Fast: 验证domElements参数（即使不播放入场动画也要验证，确保接口契约正确）
        if (!domElements || typeof domElements !== 'object') {
            throw new Error('PlaybackCoordinatorService.playAnimationSequence: domElements is required');
        }
        if (!domElements.canvas || !(domElements.canvas instanceof HTMLCanvasElement)) {
            throw new Error('PlaybackCoordinatorService.playAnimationSequence: domElements.canvas must be a valid HTMLCanvasElement');
        }
        if (!domElements.image || !(domElements.image instanceof HTMLImageElement)) {
            throw new Error('PlaybackCoordinatorService.playAnimationSequence: domElements.image must be a valid HTMLImageElement');
        }
        
        // 首次播放时发送事件（用于自动估算刷新率）
        if (!this.hasPlayedOnce) {
            this.hasPlayedOnce = true;
            this.eventBus.emit('playback:first-play');
        }
        
        const entryAnimationConfig = this.stateManager.state.playback.entryAnimation;
        const scrollState = this.stateManager.state.playback.scroll;
        
        // Fail Fast: 验证 scrollConfig.duration（在调用计算方法之前验证）
        if (typeof scrollConfig.duration !== 'number' || scrollConfig.duration <= 0) {
            throw new Error('PlaybackCoordinatorService.playAnimationSequence: scrollConfig.duration must be a positive number');
        }
        
        // 获取实际使用的滚动时长（变长模式下使用 currentLoopDuration）
        // 🐛 Bug修复：currentLoopDuration是秒，需要转换为毫秒
        const actualScrollDuration = this.currentLoopDuration !== null && this.currentLoopDuration !== undefined
            ? this.currentLoopDuration * 1000  // 秒转毫秒
            : scrollConfig.duration;
        
        // 计算并缓存时长信息
        // 注意：actualScrollDuration已经是毫秒单位，不需要再乘1000
        this.currentSequenceDurations = this._calculateSequenceDurations(shouldPlayEntry, actualScrollDuration);
        
        if (shouldPlayEntry && entryAnimationConfig.enabled) {
            // 使用传入的DOM元素（遵守架构分层原则）
            const { canvas: scrollCanvas, image } = domElements;
            
            // 使用统一的Canvas访问工具函数获取entry-canvas
            const entryCanvas = getEntryCanvas();
            
            // 获取入场动画起始位置（考虑反向滚动）
            const { startPosition: entryStartPosition } = this._getScrollPositions();
            
            // Fail Fast: 验证startPosition
            if (typeof entryStartPosition !== 'number' || !isFinite(entryStartPosition) || entryStartPosition < 0) {
                throw new Error('PlaybackCoordinatorService: Invalid startPosition');
            }
            
            // 🚀 性能优化：入场动画使用独立的viewport尺寸Canvas（而非完整图片尺寸的scrollCanvas）
            // 收益：Canvas物理像素从37M降至~11M，FPS大幅提升
            // 原理：独立Canvas架构 + viewport裁剪，实现无缝视觉衔接
            
            // 计算viewport宽度
            const viewportWidth = this.viewportCalculatorService.calculateViewportWidth(
                entryStartPosition,
                image.naturalWidth,
                image.naturalHeight
            );
            
            // 🎯 优雅修复：状态先行（Intent-First State）
            // 立即设置播放阶段，表达"即将进入entry阶段"的意图
            // 这样暂停/重置能立即生效，而不需要等待异步操作完成
            this.playbackPhase.current = 'entry';
            
            // 裁剪图片到viewport（异步操作）
            this.viewportCalculatorService.createCroppedImageForViewport(
                image,
                entryStartPosition,
                viewportWidth
            ).then((viewportImage) => {
                // 🛡️ 防御式编程：检查状态是否在异步期间被改变（暂停/重置）
                // 需要同时检查 playbackPhase.current 和 isPlaying，因为暂停时 current 不会清除
                if (this.playbackPhase.current !== 'entry' || !scrollState.isPlaying) {
                    // 状态已改变，不再启动入场动画
                    return;
                }
                // 调整卡片边界坐标，使其相对于viewport（通过ViewportCalculatorService）
                const adjustedConfig = this.viewportCalculatorService.adjustConfigForViewport(
                    entryAnimationConfig,
                    entryStartPosition,
                    viewportWidth
                );
                
                // 设置entry-canvas为viewport尺寸（通过CanvasRenderService）
                this.canvasRenderService.setupCanvasForViewport(entryCanvas, viewportImage);
                
                // 显示entry-canvas，隐藏scroll-canvas
                entryCanvas.classList.remove('hidden');
                scrollCanvas.classList.add('hidden');
                
                // 先播放入场动画，完成后再播放滚动动画
                this.entryAnimationService.startAnimation(adjustedConfig, () => {
                    // 入场动画完成后的回调
                    // 注意：入场动画支持暂停，如果暂停则不会触发此回调，所以只需检查 isPlaying
                    if (scrollState.isPlaying) {
                        // Fail Fast: 验证间隔时长配置存在
                        const intervalBeforeScroll = entryAnimationConfig.intervalBeforeScroll;
                        if (intervalBeforeScroll === undefined || intervalBeforeScroll === null) {
                            throw new Error('PlaybackCoordinatorService: intervalBeforeScroll is required in entryAnimationConfig');
                        }
                        if (typeof intervalBeforeScroll !== 'number' || intervalBeforeScroll < 0) {
                            throw new Error('PlaybackCoordinatorService: intervalBeforeScroll must be a non-negative number');
                        }
                        
                        // 1. 重置位置状态并触发渲染（防止循环播放时位置停留在上一次的endPosition）
                        // updateImagePosition 会发送 scroll:progress 事件，自动触发 renderViewport 绘制 scroll-canvas
                        this.scrollAnimationService.updateImagePosition(scrollConfig.startPosition);
                        
                        // 2. 立即切换Canvas（两个Canvas显示相同画面，视觉无缝，无需延迟）
                        entryCanvas.classList.add('hidden');
                        scrollCanvas.classList.remove('hidden');
                        
                        // 3. 清空entry-canvas，避免覆盖滚动动画（通过CanvasRenderService）
                        this.canvasRenderService.clearCanvas(entryCanvas);
                        
                        // 4. 如果有间隔时长，使用间隔管理机制延迟开始滚动动画（支持暂停/恢复）；否则立即开始
                        const startScrollAnimation = () => {
                            // 更新播放阶段为滚动动画
                            this.playbackPhase.current = 'scroll';
                            this.scrollAnimationService.startAnimation(scrollConfig, onComplete);
                        };
                        
                        if (intervalBeforeScroll > 0) {
                            this._startIntervalBeforeScroll(intervalBeforeScroll, startScrollAnimation);
                        } else {
                            startScrollAnimation();
                        }
                    } else {
                        // 入场动画完成时已经停止（reset或stop），清除阶段状态
                        this.playbackPhase.current = null;
                        
                        // 清空entry-canvas（通过CanvasRenderService）
                        this.canvasRenderService.clearCanvas(entryCanvas);
                        
                        if (onComplete) {
                            onComplete(scrollConfig);
                        }
                    }
                }, entryCanvas, viewportImage);
            }).catch((error) => {
                // 🛡️ 防御式编程：检查状态是否在异步期间被改变（暂停/重置）
                // 需要同时检查 playbackPhase.current 和 isPlaying，因为暂停时 current 不会清除
                if (this.playbackPhase.current !== 'entry' || !scrollState.isPlaying) {
                    // 状态已改变，不再启动滚动动画
                    return;
                }
                
                // 图片裁剪失败，回退到不播放入场动画
                console.error('PlaybackCoordinatorService: Failed to crop image for viewport, skipping entry animation:', error);
                
                // 通知用户入场动画加载失败
                this.eventBus.emit('ui:show-warning-message', {
                    message: '入场动画加载失败，已自动跳过。'
                });
                
                // 确保scroll-canvas显示，entry-canvas隐藏并清空
                entryCanvas.classList.add('hidden');
                scrollCanvas.classList.remove('hidden');
                
                // 清空entry-canvas（通过CanvasRenderService）
                this.canvasRenderService.clearCanvas(entryCanvas);
                
                this.playbackPhase.current = 'scroll';
                this.scrollAnimationService.startAnimation(scrollConfig, onComplete);
            });
        } else {
            // 不需要入场动画，直接开始滚动动画
            this.playbackPhase.current = 'scroll';
            this.scrollAnimationService.startAnimation(scrollConfig, onComplete);
        }
    }
    
    /**
     * 停止当前播放的动画
     * 根据当前动画阶段停止对应的动画
     * @param {boolean} isPause - 是否为暂停操作（暂停保留状态，停止清除状态）
     * @returns {void}
     * @throws {Error} 当 isPause 参数缺失或不是布尔类型时抛出错误（Fail Fast）
     */
    stopCurrentAnimation(isPause) {
        // Fail Fast: 验证 isPause 参数
        if (isPause === undefined || isPause === null) {
            throw new Error('PlaybackCoordinatorService.stopCurrentAnimation: isPause is required');
        }
        if (typeof isPause !== 'boolean') {
            throw new Error('PlaybackCoordinatorService.stopCurrentAnimation: isPause must be a boolean');
        }
        
        switch (this.playbackPhase.current) {
            case 'entry':
                // 当前在入场动画阶段
                if (isPause) {
                    // 暂停：保留状态，支持恢复播放
                    const wasPaused = this.entryAnimationService.pauseAnimation();
                    // 🎯 优雅修复：如果动画还没启动（异步裁剪中），清除阶段状态
                    // 场景：用户在异步操作期间点了暂停，动画还没启动，相当于"取消播放"
                    if (!wasPaused) {
                        this.playbackPhase.current = null;
                        this.playbackPhase.isPaused = false;
                    }
                } else {
                    // 停止：清除所有状态
                    this.entryAnimationService.stopAnimation();
                }
                break;
                
            case 'interval-before-scroll':
                // 🐛 Bug修复：处理入场动画和滚动动画之间的间隔阶段暂停
                // 当前在 intervalBeforeScroll 等待期间
                if (isPause) {
                    this._pauseIntervalBeforeScroll();
                } else {
                    this._clearIntervalBeforeScroll();
                }
                break;
                
            case 'scroll':
                // 当前在滚动动画阶段
                if (isPause) {
                    // 暂停：保留状态，支持恢复播放
                    this.scrollAnimationService.pauseAnimation();
                } else {
                    // 停止：清除所有状态
                    this.scrollAnimationService.stopAnimation();
                }
                break;
                
            case 'loop-interval':
                // 当前在循环间隔期间
                if (isPause) {
                    this._pauseLoopInterval();
                } else {
                    this._clearLoopInterval();
                }
                break;
        }
        
        // 清除阶段状态（仅在完全停止时清除）
        if (!isPause) {
            this.playbackPhase.current = null;
            this.playbackPhase.isPaused = false;
        }
    }
    
    /**
     * 获取当前动画阶段
     * @returns {string|null} 当前动画阶段：'entry' | 'interval-before-scroll' | 'scroll' | 'loop-interval' | null
     */
    getCurrentPhase() {
        return this.playbackPhase.current;
    }
    
    /**
     * 获取滚动位置（根据反向滚动标志调整起始和结束位置）
     * @returns {Object} 位置对象
     * @returns {number} returns.startPosition - 起始位置
     * @returns {number} returns.endPosition - 结束位置
     * @private
     */
    _getScrollPositions() {
        const scrollConfig = this.stateManager.state.playback.scroll;
        
        // Fail Fast: 显式检查布尔值，避免三元运算符隐藏配置错误
        const reverseScroll = scrollConfig.reverseScroll === true;
        const startPosition = reverseScroll ? scrollConfig.endPosition : scrollConfig.startPosition;
        const endPosition = reverseScroll ? scrollConfig.startPosition : scrollConfig.endPosition;
        
        return { startPosition, endPosition };
    }

    /**
     * 创建滚动配置
     * @returns {Object} 滚动配置对象
     * @returns {number} returns.startPosition - 起始位置
     * @returns {number} returns.endPosition - 结束位置
     * @returns {number} returns.duration - 持续时间（毫秒）
     * @returns {string} returns.strategy - 滚动策略
     * @returns {boolean} returns.loop - 是否循环
     * @private
     */
    _createScrollConfig() {
        const scrollConfig = this.stateManager.state.playback.scroll;
        const playbackConfig = this.stateManager.state.playback;
        
        // Fail Fast: 显式检查临时时长覆盖
        // 🐛 Bug修复：currentLoopDuration是秒，scrollConfig.duration也是秒，这里统一为秒
        const duration = this.currentLoopDuration !== null && this.currentLoopDuration !== undefined
            ? this.currentLoopDuration  // 秒
            : scrollConfig.duration;    // 秒
       
        const { startPosition, endPosition } = this._getScrollPositions();
        
        // 直接访问 animationStrategy，而不是通过 config getter
        const defaultStrategy = scrollConfig.animationStrategy;
        
        return {
            startPosition: startPosition,
            endPosition: endPosition,
            duration: duration * 1000, // 转换为毫秒
            strategy: defaultStrategy,
            loop: playbackConfig.loop.enabled 
        };
    }

    /**
     * 获取循环间隔时间
     * @returns {number} 循环间隔时间（毫秒）
     * @private
     */
    _getIntervalTime() {
        const intervalTime = this.stateManager.state.playback.loop.intervalTime;
        
        // Fail Fast: 显式检查是否需要使用默认值
        if (intervalTime !== undefined && intervalTime !== null) {
            return intervalTime;
        }
        
        return this.stateManager.getDefaultValue('playback.loop.intervalTime');
    }
    
    /**
     * 发送倒计时事件
     * @param {number} remaining - 剩余时间（毫秒）
     * @param {number} elapsed - 已过时间（毫秒）
     * @private
     */
    _emitCountdownEvent(remaining, elapsed) {
        const loopState = this.stateManager.state.playback.loop;
        const intervalElapsed = elapsed / 1000;
        
        // 🎯 架构重构：循环间隔期间的总时长计算也由 PlaybackCoordinatorService 负责
        // 计算包含循环的总播放进度（用于 progressTotalTime 显示）
        // 🐛 Bug修复：间隔开始前 currentLoop 已被更新为下一次循环的索引（见第1363行）
        // 所以已完成的间隔数 = currentLoop - 1
        const currentLoop = loopState.currentLoop;
        const completedIntervalsCount = Math.max(0, currentLoop - 1);
        const { totalElapsed, totalDuration } = this._calculateTotalPlaybackProgress(intervalElapsed, completedIntervalsCount);
        
        this.eventBus.emit('scroll:interval-countdown', {
            remaining,
            total: this.loopIntervalState.totalIntervalTime,
            intervalElapsed: intervalElapsed,
            currentLoop: loopState.currentLoop,
            loopCount: loopState.count,
            totalElapsed: totalElapsed,      // 添加：总已过时间（秒）
            totalDuration: totalDuration     // 添加：总时长（秒）
        });
    }

    /**
     * 清除倒计时定时器
     * @private
     */
    _clearCountdownTimer() {
        if (this.loopIntervalState.countdownIntervalId) {
            clearInterval(this.loopIntervalState.countdownIntervalId);
            this.loopIntervalState.countdownIntervalId = null;
        }
    }

    /**
     * 清除延迟定时器
     * @private
     */
    _clearDelayTimer() {
        if (this.loopIntervalState.loopTimeoutId) {
            clearTimeout(this.loopIntervalState.loopTimeoutId);
            this.loopIntervalState.loopTimeoutId = null;
        }
    }

    /**
     * 创建倒计时定时器
     * @returns {number} 定时器ID
     * @private
     */
    _createCountdownTimer() {
        return setInterval(() => {
            const elapsed = Date.now() - this.loopIntervalState.intervalStart;
            const remaining = Math.max(0, this.loopIntervalState.totalIntervalTime - elapsed);
            
            this.loopIntervalState.remainingTime = remaining;
            
            if (remaining <= 0) {
                this._clearCountdownTimer();
                this._emitCountdownEvent(0, elapsed);
                return;
            }
            
            this._emitCountdownEvent(remaining, elapsed);
        }, this.COUNTDOWN_UPDATE_INTERVAL);
    }

    /**
     * 开始循环间隔倒计时
     * @param {number} intervalTime - 间隔时间（毫秒）
     * @param {Function} callback - 间隔结束后的回调函数
     * @private
     */
    _startLoopInterval(intervalTime, callback) {
        this._clearLoopInterval();
        
        this.loopIntervalState.intervalStart = Date.now();
        this.loopIntervalState.totalIntervalTime = intervalTime;
        this.loopIntervalState.remainingTime = intervalTime;
        this.loopIntervalState.isPaused = false;
        this.loopIntervalState.callback = callback;
        
        // 更新播放阶段状态
        this.playbackPhase.current = 'loop-interval';
        
        this.loopIntervalState.countdownIntervalId = this._createCountdownTimer();
        
        this.loopIntervalState.loopTimeoutId = setTimeout(() => {
            this._clearCountdownTimer();
            this.loopIntervalState.loopTimeoutId = null;
            this.loopIntervalState.remainingTime = 0;
            callback();
        }, intervalTime);
    }

    /**
     * 暂停循环间隔倒计时
     * @private
     */
    _pauseLoopInterval() {
        if (this.loopIntervalState.countdownIntervalId || this.loopIntervalState.loopTimeoutId) {
            // 🐛 Bug修复：在清除定时器前，先计算并保存当前剩余时间
            const elapsed = Date.now() - this.loopIntervalState.intervalStart;
            const remaining = Math.max(0, this.loopIntervalState.totalIntervalTime - elapsed);
            this.loopIntervalState.remainingTime = remaining;
            
            // 🐛 Bug修复：暂停前发送最后一次倒计时事件，确保界面显示准确的剩余时间
            // 场景：setInterval每100ms触发一次，暂停时界面显示的可能是上次触发时的旧值
            // 发送准确的remaining值，让界面更新到精确的剩余时间
            this._emitCountdownEvent(remaining, elapsed);
            
            this._clearCountdownTimer();
            this._clearDelayTimer();
            this.loopIntervalState.isPaused = true;
        }
    }

    /**
     * 恢复循环间隔倒计时
     * @returns {boolean} 是否成功恢复了间隔倒计时
     * @private
     */
    _resumeLoopInterval() {
        if (!this.loopIntervalState.isPaused || 
            this.loopIntervalState.remainingTime <= 0 || 
            !this.loopIntervalState.callback) {
            return false;
        }
        
        const { callback, remainingTime, totalIntervalTime } = this.loopIntervalState;
        
        this._clearCountdownTimer();
        this._clearDelayTimer();
        
        // 🐛 Bug修复：恢复时需要调整intervalStart，让elapsed计算正确
        // 关键：保持totalIntervalTime不变（这是发送给UI的total参数）
        // 调整intervalStart = now - (totalIntervalTime - remainingTime)
        // 这样elapsed = now - intervalStart = totalIntervalTime - remainingTime（已消耗的时间）
        const now = Date.now();
        const alreadyElapsed = totalIntervalTime - remainingTime;
        this.loopIntervalState.intervalStart = now - alreadyElapsed;
        this.loopIntervalState.remainingTime = remainingTime;
        this.loopIntervalState.isPaused = false;
        this.loopIntervalState.callback = callback;
        
        // 🐛 Bug修复：立即发送一次倒计时事件，避免界面卡在暂停时的旧值
        // 场景：用户暂停时显示"0.9秒"，恢复后 setInterval 要等第一个间隔才执行，导致界面仍显示"0.9秒"
        this._emitCountdownEvent(remainingTime, alreadyElapsed);
        
        this.loopIntervalState.countdownIntervalId = this._createCountdownTimer();
        this.loopIntervalState.loopTimeoutId = setTimeout(() => {
            this._clearCountdownTimer();
            this.loopIntervalState.loopTimeoutId = null;
            this.loopIntervalState.remainingTime = 0;
            callback();
        }, remainingTime);
        
        // 清除全局暂停标志
        this.playbackPhase.isPaused = false;
        
        return true;
    }

    /**
     * 清除循环间隔定时器
     * @private
     */
    _clearLoopInterval() {
        this._clearCountdownTimer();
        this._clearDelayTimer();
        this.loopIntervalState.remainingTime = 0;
        this.loopIntervalState.isPaused = false;
        this.loopIntervalState.callback = null;
    }
    
    /**
     * 开始入场动画和滚动动画之间的间隔
     * @param {number} intervalTime - 间隔时间（毫秒）
     * @param {Function} callback - 间隔结束后的回调函数
     * @private
     */
    _startIntervalBeforeScroll(intervalTime, callback) {
        // Fail Fast: 验证参数
        if (typeof intervalTime !== 'number' || intervalTime < 0) {
            throw new Error('PlaybackCoordinatorService._startIntervalBeforeScroll: intervalTime must be a non-negative number');
        }
        if (typeof callback !== 'function') {
            throw new Error('PlaybackCoordinatorService._startIntervalBeforeScroll: callback must be a function');
        }
        
        this._clearIntervalBeforeScroll();
        
        this.intervalBeforeScrollState.intervalStart = Date.now();
        this.intervalBeforeScrollState.totalIntervalTime = intervalTime;
        this.intervalBeforeScrollState.remainingTime = intervalTime;
        this.intervalBeforeScrollState.isPaused = false;
        this.intervalBeforeScrollState.callback = callback;
        
        // 更新播放阶段状态
        this.playbackPhase.current = 'interval-before-scroll';
        
        // 启动进度更新定时器（在间隔期间也持续发送进度事件）
        this._startIntervalBeforeScrollProgressUpdates();
        
        this.intervalBeforeScrollState.timeoutId = setTimeout(() => {
            this._clearIntervalBeforeScrollProgressTimer();
            this.intervalBeforeScrollState.timeoutId = null;
            this.intervalBeforeScrollState.remainingTime = 0;
            callback();
        }, intervalTime);
    }
    
    /**
     * 暂停入场动画和滚动动画之间的间隔
     * @private
     */
    _pauseIntervalBeforeScroll() {
        if (this.intervalBeforeScrollState.timeoutId) {
            clearTimeout(this.intervalBeforeScrollState.timeoutId);
            this.intervalBeforeScrollState.timeoutId = null;
            
            // 暂停进度更新定时器
            this._clearIntervalBeforeScrollProgressTimer();
            
            // 计算剩余时间
            const elapsed = Date.now() - this.intervalBeforeScrollState.intervalStart;
            this.intervalBeforeScrollState.remainingTime = Math.max(0, this.intervalBeforeScrollState.totalIntervalTime - elapsed);
            this.intervalBeforeScrollState.isPaused = true;
        }
    }
    
    /**
     * 恢复入场动画和滚动动画之间的间隔
     * @returns {boolean} 是否成功恢复了间隔
     * @private
     */
    _resumeIntervalBeforeScroll() {
        if (!this.intervalBeforeScrollState.isPaused || 
            this.intervalBeforeScrollState.remainingTime <= 0 || 
            !this.intervalBeforeScrollState.callback) {
            return false;
        }
        
        const { callback, remainingTime, totalIntervalTime } = this.intervalBeforeScrollState;
        
        const now = Date.now();
        const alreadyElapsed = totalIntervalTime - remainingTime;
        this.intervalBeforeScrollState.intervalStart = now - alreadyElapsed;
        this.intervalBeforeScrollState.remainingTime = remainingTime;
        this.intervalBeforeScrollState.isPaused = false;
        this.intervalBeforeScrollState.callback = callback;
        
        // 重新启动进度更新定时器
        this._startIntervalBeforeScrollProgressUpdates();
        
        this.intervalBeforeScrollState.timeoutId = setTimeout(() => {
            this._clearIntervalBeforeScrollProgressTimer();
            this.intervalBeforeScrollState.timeoutId = null;
            this.intervalBeforeScrollState.remainingTime = 0;
            callback();
        }, remainingTime);
        
        // 清除全局暂停标志
        this.playbackPhase.isPaused = false;
        
        return true;
    }
    
    /**
     * 启动 intervalBeforeScroll 期间的进度更新
     * @private
     */
    _startIntervalBeforeScrollProgressUpdates() {
        // 清除之前的进度定时器（如果存在）
        this._clearIntervalBeforeScrollProgressTimer();
        
        // 定期发送进度事件
        this.intervalBeforeScrollState.progressIntervalId = setInterval(() => {
            const elapsed = Date.now() - this.intervalBeforeScrollState.intervalStart;
            
            // 计算当前循环内的已过时间 = 入场动画时长 + 已过的间隔时间
            const { entryAnimationDuration, intervalBeforeScroll, singleLoopDuration } = this.currentSequenceDurations;
            const intervalElapsed = Math.min(elapsed / 1000, intervalBeforeScroll); // 转换为秒，且不超过间隔总时长
            const currentLoopElapsed = entryAnimationDuration + intervalElapsed;
            
            // 计算总进度
            // intervalBeforeScroll期间是第一次循环开始前，currentLoop = 0，已完成间隔数也是0
            const currentLoop = this.stateManager.state.playback.loop.currentLoop;
            const { totalElapsed, totalDuration } = this._calculateTotalPlaybackProgress(currentLoopElapsed, currentLoop);
            
            // 获取当前位置（在 intervalBeforeScroll 期间保持在起始位置）
            const scrollState = this.stateManager.state.playback.scroll;
            const isReverse = scrollState.reverseScroll === true;
            const position = isReverse ? scrollState.endPosition : scrollState.startPosition;
            
            // 🐛 Bug修复：变长时长模式下，使用当前循环的实际时长
            const currentLoopDuration = this._getCurrentLoopDuration(singleLoopDuration);
            
            // 计算当前循环进度（用于进度条显示）
            const currentLoopProgress = currentLoopElapsed / currentLoopDuration;
            
            // 发送统一的进度事件
            this.eventBus.emit('playback:progress', {
                progress: currentLoopProgress,
                elapsed: totalElapsed,
                position: position,
                totalDuration: totalDuration,
                currentLoopElapsed: currentLoopElapsed,
                singleLoopDuration: currentLoopDuration  // 使用动态时长
            });
        }, this.COUNTDOWN_UPDATE_INTERVAL);
    }
    
    /**
     * 清除 intervalBeforeScroll 的进度更新定时器
     * @private
     */
    _clearIntervalBeforeScrollProgressTimer() {
        if (this.intervalBeforeScrollState.progressIntervalId) {
            clearInterval(this.intervalBeforeScrollState.progressIntervalId);
            this.intervalBeforeScrollState.progressIntervalId = null;
        }
    }
    
    /**
     * 清除入场动画和滚动动画之间的间隔定时器
     * @private
     */
    _clearIntervalBeforeScroll() {
        if (this.intervalBeforeScrollState.timeoutId) {
            clearTimeout(this.intervalBeforeScrollState.timeoutId);
            this.intervalBeforeScrollState.timeoutId = null;
        }
        this._clearIntervalBeforeScrollProgressTimer();
        this.intervalBeforeScrollState.remainingTime = 0;
        this.intervalBeforeScrollState.isPaused = false;
        this.intervalBeforeScrollState.callback = null;
    }
    
    /**
     * 开始播放（完整播放流程，包括循环）
     * @param {Object} [options={}] - 播放选项
     * @param {string} [options.strategy] - 滚动策略（可选，默认使用配置中的策略）
     * @param {Object} [options.domElements] - DOM元素对象（由ScrollService传入）
     * @param {HTMLCanvasElement} [options.domElements.canvas] - 滚动Canvas元素
     * @param {HTMLImageElement} [options.domElements.image] - 主图片元素
     * @returns {void}
     * @throws {Error} 当没有加载图片时抛出错误
     */
    play(options = {}) {
        const imageData = this.stateManager.state.content.image.data;
        if (!imageData) {
            throw new Error('No image loaded');
        }
        
        // 播放前验证：由BusinessOrchestrationService处理业务规则验证
        const validation = this.eventBus.request('playback:validate-before-play');
        if (validation && !validation.isValid) {
            return;
        }
        
        // 提取domElements（由ScrollService传入）
        const { domElements, ...playOptions } = options;
        
        // Fail Fast: 验证DOM元素（首次播放时必须传入，后续循环播放使用缓存）
        if (domElements) {
            // 首次播放：ScrollService传入了DOM元素，缓存起来供后续循环使用
            this.cachedDomElements = domElements;
        } else if (!this.cachedDomElements) {
            // 既没有传入也没有缓存：这是错误的调用方式
            throw new Error('PlaybackCoordinatorService.play: domElements must be provided on first call');
        }
        // else: 循环播放，使用已缓存的DOM元素

        // 🎯 性能优化：缓存 state 引用，减少重复访问
        const scrollConfig = this.stateManager.state.playback.scroll;
        const playbackConfig = this.stateManager.state.playback;
        const loopConfig = playbackConfig.loop;
        
        const { startPosition } = this._getScrollPositions();
        
        // 如果当前处于已完成状态，先自动重置
        if (scrollConfig.isCompleted) {
            this.reset();
        }
        
        // 🐛 Bug修复：只有在真正的新播放（非恢复暂停）时才重置位置和循环计数器
        // 恢复暂停的动画时，不应该重置 currentLoop，否则循环次数会错误地回退
        const isResumingPausedAnimation = this.playbackPhase.isPaused;
        
        // 🎯 性能优化：使用 batch() 批量更新播放状态，只触发一次 watcher 通知
        this.stateManager.batch(() => {
            // 直接更新状态，避免递归调用
            this.stateManager.state.playback.scroll.isPlaying = true;
            this.stateManager.state.playback.scroll.isPaused = false;
            
            // 只有在首次播放或重置后才重置到起始位置
            // 如果是暂停后继续播放，则从当前位置继续
            const currentPosition = scrollConfig.currentPosition;
            
            // 使用考虑了反向滚动的 startPosition，而非原始的 scrollConfig.startPosition
            // 使用容差比较浮点数，避免精度问题导致不重置
            const POSITION_TOLERANCE = 0.01; // 0.01像素的容差
            const isAtStartPosition = currentPosition !== undefined && 
                Math.abs(currentPosition - startPosition) < POSITION_TOLERANCE;
            
            if (!isResumingPausedAnimation && (currentPosition === undefined || currentPosition === null || isAtStartPosition)) {
                // 只更新状态，UI更新由StateWatcherService监听currentPosition变化自动触发
                this.stateManager.state.playback.scroll.currentPosition = startPosition;
                // 重置循环计数器（仅在新的播放周期开始时）
                this.stateManager.state.playback.loop.currentLoop = 0;
            }
        }, {});
            
        // 如果启用了变长时长，记录需要临时覆盖时长
        // 🐛 Bug修复：恢复时不应该重新设置 currentLoopDuration，应该保持暂停前的值
        // 注意：即使没有启用循环，第一次播放时也需要设置变长时长
        if (loopConfig.variableDuration && !isResumingPausedAnimation) {
            const firstLoopDuration = this.durationSequenceService.calculateNextLoopDuration(1);

            if (firstLoopDuration > 0) {
                // 不修改状态管理器中的基础时长，而是临时覆盖
                this.currentLoopDuration = firstLoopDuration;
            }
        }
        
        // 重新创建配置以确保使用最新的时长
        const finalConfig = this._createScrollConfig({
            ...playOptions
        });
        
        // 尝试恢复 intervalBeforeScroll（入场和滚动之间的间隔）
        const resumedIntervalBeforeScroll = this._resumeIntervalBeforeScroll();
        
        // 恢复循环间隔倒计时（如果之前在循环间隔期间暂停）
        const resumedLoopInterval = this._resumeLoopInterval();
        
        // 只有在没有恢复任何间隔倒计时的情况下才开始新的动画
        // 如果恢复了间隔倒计时，动画会在间隔结束后自动开始
        if (!resumedLoopInterval && !resumedIntervalBeforeScroll) {
            // 根据播放阶段状态决定恢复或开始播放
            switch (this.playbackPhase.current) {
                case 'entry':
                    // 场景1：暂停的入场动画，直接恢复播放
                    if (this.playbackPhase.isPaused) {
                        this.entryAnimationService.resumeAnimation();
                        this.playbackPhase.isPaused = false;
                        this.eventBus.emit('scroll:play-started', finalConfig);
                    }
                    break;
                    
                case 'scroll':
                    // 场景2：暂停的滚动动画，直接恢复播放
                    if (this.playbackPhase.isPaused) {
                        // 🐛 Bug修复：不调用 playAnimationSequence()，避免重新执行入场动画
                        // ScrollAnimationService.startAnimation() 会根据 currentPosition 自动反推时间进度
                        
                        // 🐛 Bug修复：恢复滚动动画时，入场动画已经播放过了，不应该重新计算固定开销
                        // 应该保持 currentSequenceDurations 不变，否则会导致总时长错误
                        
                        // 恢复滚动动画（ScrollAnimationService 会根据 currentPosition 自动反推已过时间）
                        this.scrollAnimationService.startAnimation(
                            finalConfig,
                            (config) => this._onAnimationComplete(config)
                        );
                        
                        // 发送播放开始事件
                        this.playbackPhase.isPaused = false;
                        this.eventBus.emit('scroll:play-started', finalConfig);
                    }
                    break;
                    
                default:
                    // 场景3：新的播放（首次播放、重置后播放）
                    // 检查是否需要播放入场动画
                    const entryAnimationConfig = this.stateManager.state.playback.entryAnimation;
                    const shouldPlayEntryAnimation = entryAnimationConfig.enabled &&
                                                    (scrollConfig.currentPosition === undefined || 
                                                     scrollConfig.currentPosition === null || 
                                                     Math.abs(scrollConfig.currentPosition - startPosition) < 0.01);
                    
                    // 性能监控：如果启用了性能监控，开始监控
                    const performanceEnabled = this.stateManager.state.preferences.performance.enabled;
                    if (performanceEnabled) {
                        this.performanceMonitorService.startMonitoring();
                    }
                    
                    // 使用自己的 playAnimationSequence 方法协调入场和滚动动画
                    this.playAnimationSequence(
                        finalConfig,
                        (config) => this._onAnimationComplete(config),
                        shouldPlayEntryAnimation,
                        this.cachedDomElements  // 传递缓存的DOM元素
                    );
                    
                    // 发送播放开始事件
                    this.eventBus.emit('scroll:play-started', finalConfig);
                    break;
            }
        }
    }

    /**
     * 暂停播放
     * @returns {void}
     * @throws {Error} 当暂停操作失败时抛出错误
     */
    pause() {
        if (!this.stateManager.state.playback.scroll.isPlaying) {
            return;
        }

        // 直接更新状态，避免递归调用
        this.stateManager.state.playback.scroll.isPlaying = false;
        this.stateManager.state.playback.scroll.isPaused = true;
        
        // 更新播放阶段状态（标记为暂停，但保留当前阶段信息以便恢复）
        this.playbackPhase.isPaused = true;
        
        // 暂停当前播放的动画（入场或滚动），保留状态以便恢复播放
        this.stopCurrentAnimation(true);
        
        // 性能监控：标记为中断状态（暂停）
        this.performanceMonitorService.markInterrupted('pause');
        
        this.eventBus.emit('scroll:paused');
    }

    /**
     * 重置播放
     * @returns {void}
     * @throws {Error} 当重置操作失败时抛出错误
     */
    reset() {
        // 检查是否正在播放或暂停，如果是，则性能监控需要标记为中断并生成报告
        const isPlayingOrPaused = this.stateManager.state.playback.scroll.isPlaying || 
                                  this.stateManager.state.playback.scroll.isPaused;
        
        if (isPlayingOrPaused) {
            // 性能监控：标记为中断状态（重置）
            const performanceEnabled = this.stateManager.state.preferences.performance.enabled;
            if (performanceEnabled) {
                this.performanceMonitorService.markInterrupted('reset');
                this.performanceMonitorService.finishMonitoring();
            }
        }
        
        // 停止当前播放的动画（入场或滚动），不保留状态
        this.stopCurrentAnimation(false);
        
        // 清除循环间隔定时器
        this._clearLoopInterval();
        
        // 清除 intervalBeforeScroll 定时器
        this._clearIntervalBeforeScroll();
        
        // 清除临时时长覆盖
        this.currentLoopDuration = null;
        
        // 清除缓存的DOM元素
        this.cachedDomElements = null;
        
        // 根据滚动方向决定重置位置
        // 正向滚动：重置到 startPosition
        // 反向滚动：重置到 endPosition（因为反向是从end滚到start）
        
        // Fail Fast: 位置值必须存在，否则配置异常
        const startPosition = this.stateManager.state.playback.scroll.startPosition;
        const endPosition = this.stateManager.state.playback.scroll.endPosition;
        
        if (startPosition === undefined || startPosition === null) {
            throw new Error('PlaybackCoordinatorService.reset: startPosition is required');
        }
        if (endPosition === undefined || endPosition === null) {
            throw new Error('PlaybackCoordinatorService.reset: endPosition is required');
        }
        
        const isReverse = this.stateManager.state.playback.scroll.reverseScroll;
        const resetPosition = isReverse ? endPosition : startPosition;
        
        // 🎯 性能优化：使用 batch() 批量更新重置状态，只触发一次 watcher 通知
        // 如果已经在batch中（如导入配置时），直接修改状态避免嵌套batch
        if (this.stateManager.isBatching()) {
            this.stateManager.state.playback.scroll.isPlaying = false;
            this.stateManager.state.playback.scroll.isPaused = false;
            this.stateManager.state.playback.scroll.isCompleted = false;
            this.stateManager.state.playback.scroll.currentPosition = resetPosition;
        } else {
            this.stateManager.batch(() => {
                // 只更新播放状态和当前位置，不改变用户设置的起始/结束位置
                this.stateManager.state.playback.scroll.isPlaying = false;
                this.stateManager.state.playback.scroll.isPaused = false;
                this.stateManager.state.playback.scroll.isCompleted = false;  // 清除完成状态，允许重新播放
                this.stateManager.state.playback.scroll.currentPosition = resetPosition;
            }, {});
        }
        
        // 如果启用了入场动画，需要清空Canvas恢复背景色显示
        // （入场动画会在Canvas上绘制图片，重置时应该清空）
        const entryAnimationEnabled = this.stateManager.state.playback.entryAnimation.enabled;
        
        // Fail Fast: 验证入场动画启用状态是否为布尔值
        if (typeof entryAnimationEnabled !== 'boolean') {
            throw new Error('PlaybackCoordinatorService.reset: entryAnimation.enabled must be a boolean');
        }
        
        if (entryAnimationEnabled) {
            // 🐛 Bug修复：不要手动清空Canvas，这会导致"瞬间变白"的问题
            // 如果图片未加载完成，display:refresh-canvas会被跳过，导致Canvas保持透明（白色）
            // _renderImageToCanvas 内部会在绘制前自动清空，所以这里只需触发刷新即可
            this.eventBus.emit('display:refresh-canvas');
        }
        
        // UI更新由StateWatcherService监听currentPosition变化自动触发
        this.eventBus.emit('scroll:reset');
    }
    
    /**
     * 处理播放完成 - 提取重复的播放结束逻辑
     * @param {boolean} [clearDuration=false] - 是否清除临时时长覆盖
     * @returns {void}
     * @private
     */
    _handlePlaybackComplete(clearDuration = false) {
        // 清除临时时长覆盖（仅在非循环播放结束时需要）
        if (clearDuration) {
            this.currentLoopDuration = null;
        }
        
        // 🎯 性能优化：使用 batch() 批量更新播放完成状态，只触发一次 watcher 通知
        this.stateManager.batch(() => {
            // 停止播放状态
            this.stateManager.state.playback.scroll.isPlaying = false;
            this.stateManager.state.playback.loop.currentLoop = 0;
        }, {});
        
        // 检查是否需要自动重置
        const autoResetAfterComplete = this.stateManager.state.playback.loop.autoResetAfterComplete;
        if (autoResetAfterComplete) {
            // 播放完毕后自动重置到起始位置
            this.reset();
        } else {
            // 没有自动重置，标记为已完成状态（需要手动重置才能再次播放）
            this.stateManager.state.playback.scroll.isCompleted = true;
        }
        
        // 性能监控：完成监控并生成报告
        const performanceEnabled = this.stateManager.state.preferences.performance.enabled;
        if (performanceEnabled) {
            this.performanceMonitorService.finishMonitoring();
        }
        
        // 通知播放停止
        this.eventBus.emit('scroll:stopped');
    }
    
    /**
     * 动画完成回调（处理循环播放逻辑）
     * @param {Object} config - 动画配置对象
     * @private
     */
    _onAnimationComplete(config) {
        // 🎯 性能优化：缓存 state 引用，减少重复访问
        const scrollState = this.stateManager.state.playback.scroll;
        const loopState = this.stateManager.state.playback.loop;
        const progressBarPrefs = this.stateManager.state.preferences.progressBar;
        
        const isLooping = config.loop && scrollState.isPlaying;
        
        const intervalTime = this._getIntervalTime();
        
        // 发送完成事件，但传递循环信息，让进度条服务决定是否隐藏
        this.eventBus.emit('scroll:completed', {
            ...config,
            isLooping,
            intervalTime
        });
        
        if (isLooping) {
            const currentLoop = loopState.currentLoop;
            const loopCount = loopState.count;
            const variableDuration = loopState.variableDuration;
            
            // 检查是否达到循环次数限制 - 修复循环次数+1的bug
            // currentLoop是已完成循环数，需要+1比较当前即将开始的循环
            if (loopCount > 0 && currentLoop + 1 > loopCount) {
                // 达到循环次数限制，停止播放
                this._handlePlaybackComplete();
                return;
            }
            
            // 准备开始下一次循环，先增加计数
            const newCurrentLoop = currentLoop + 1;
            
            // 在更新状态前再次检查循环次数限制，防止UI显示错误
            if (loopCount > 0 && newCurrentLoop >= loopCount) {
                // 已达到循环次数限制，停止播放
                this._handlePlaybackComplete();
                return;
            }
            
            // 立即更新循环计数（在间隔倒计时之前），这样间隔期间的总用时计算才正确
            this.stateManager.state.playback.loop.currentLoop = newCurrentLoop;
            
            // 继续下一次循环（复用已获取的 intervalTime）
            const loopTimeoutCallback = () => {
                if (scrollState.isPlaying) {
                    
                    // 如果启用了时长变化，计算新的时长
                    if (variableDuration) {
                        // newCurrentLoop是已完成循环数，需要+1得到下一次循环编号
                        const nextLoopNumber = newCurrentLoop + 1;
                        const newDuration = this.durationSequenceService.calculateNextLoopDuration(nextLoopNumber);
                        if (newDuration > 0) {
                            // 不修改状态管理器中的基础时长，而是临时覆盖
                            this.currentLoopDuration = newDuration;
                        }
                    }
                    
                    // 检查是否需要播放入场动画（循环播放时每次都播放入场动画）
                    const entryAnimationConfig = this.stateManager.state.playback.entryAnimation;
                    const shouldPlayEntryAnimation = entryAnimationConfig.enabled;
                    
                    // 重置位置到起始位置（考虑反向滚动）
                    // 只更新状态，UI更新由StateWatcherService监听currentPosition变化自动触发
                    const { startPosition: resetStartPosition } = this._getScrollPositions();
                    this.stateManager.state.playback.scroll.currentPosition = resetStartPosition;
                    
                    // 使用更新后的配置重新开始动画
                    const updatedConfig = this._createScrollConfig();
                    
                    // 🎯 无条件发送播放开始事件，让所有监听者（进度条、侧边栏等）都能响应
                    // 附带额外信息，让监听者自己决定如何处理
                    this.eventBus.emit('scroll:play-started', {
                        ...updatedConfig,
                        isLoopContinuation: true,  // 标记这是循环播放的继续
                        hideProgress: progressBarPrefs.hide,
                        intervalTime: intervalTime
                    });
                    
                    // 使用自己的 playAnimationSequence 方法协调入场和滚动动画
                    this.playAnimationSequence(
                        updatedConfig,
                        (config) => this._onAnimationComplete(config),
                        shouldPlayEntryAnimation,
                        this.cachedDomElements  // 使用缓存的DOM元素
                    );
                }
            };
            
            // 间隔期间每100ms发送倒计时事件
            if (intervalTime > 0) {
                this._startLoopInterval(intervalTime, loopTimeoutCallback);
            } else {
                // 如果间隔时间为0，直接执行回调
                loopTimeoutCallback();
            }
        } else {
            // 停止播放 - 非循环播放结束
            this._handlePlaybackComplete(true); // 传递参数表示需要清除临时时长
        }
    }

    /**
     * 处理反向滚动状态变化
     * 更新图片位置到新的起始位置
     * @returns {void}
     */
    handleReverseScrollChange() {
        // 使用 _getScrollPositions() 方法获取考虑了反向滚动的位置
        const { startPosition } = this._getScrollPositions();
        
        // 只更新状态，UI更新由StateWatcherService监听currentPosition变化自动触发
        this.stateManager.state.playback.scroll.currentPosition = startPosition;
    }
    
}


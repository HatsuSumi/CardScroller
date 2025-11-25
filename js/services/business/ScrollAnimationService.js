/**
 * ScrollAnimationService - 滚动动画服务
 * 处理纯动画技术逻辑，负责动画时间管理、位置计算、图片渲染等技术层面的动画处理
 * 
 * 当前被使用的模块：
 * - PlaybackCoordinatorService (services/business/PlaybackCoordinatorService.js) - 播放协调服务
 * 
 * 当前依赖的模块：
 * - BaseUIService (base/BaseUIService.js) - UI服务基类，提供DOM缓存功能 (通过继承)
 * - scrollStrategyManager (patterns/scroll/ScrollStrategyManager.js) - 滚动策略管理器 (通过DI注入)
 * - getScrollCanvas (helpers/canvasAccessors.js) - Canvas元素访问工具函数
 * - convertPixelPositionToScrollDistance (helpers/positionCalculators.js) - 位置转换工具函数
 * - calculateActualFPS, calculateTheoreticalFPS (helpers/performanceUtils.js) - 实际FPS计算、理论FPS计算工具函数
 * - stateManager (core/StateManager.js) - 状态管理器，访问滚动状态和图片状态 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线，发送进度事件 (通过DI注入)
 * - performanceMonitorService (business/PerformanceMonitorService.js) - 性能监控服务，收集性能数据 (通过DI注入)
 */
import { BaseUIService } from '../base/BaseUIService.js';
import { getScrollCanvas } from '../../helpers/canvasAccessors.js';
import { convertPixelPositionToScrollDistance } from '../../helpers/positionCalculators.js';
import { calculateActualFPS, calculateTheoreticalFPS } from '../../helpers/performanceUtils.js';

export class ScrollAnimationService extends BaseUIService {
    /**
     * 构造函数
     * @param {EventBus} eventBus - 事件总线，用于监听位置变化事件和发送进度事件
     * @param {StateManager} stateManager - 状态管理器，访问滚动状态和图片状态
     * @param {ScrollStrategyManager} scrollStrategyManager - 滚动策略管理器，计算动画位置
     * @param {PerformanceMonitorService} performanceMonitorService - 性能监控服务，收集性能数据
     * @throws {Error} 当必需依赖（eventBus、stateManager、scrollStrategyManager、performanceMonitorService）未提供时抛出错误
     */
    constructor(eventBus, stateManager, scrollStrategyManager, performanceMonitorService) {
        super(); // 调用父类BaseUIService构造函数
        
        // Fail Fast: 验证必需的依赖
        if (!eventBus) {
            throw new Error('ScrollAnimationService: eventBus is required');
        }
        if (!stateManager) {
            throw new Error('ScrollAnimationService: stateManager is required');
        }
        if (!scrollStrategyManager) {
            throw new Error('ScrollAnimationService: scrollStrategyManager is required');
        }
        if (!performanceMonitorService) {
            throw new Error('ScrollAnimationService: performanceMonitorService is required');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.scrollStrategyManager = scrollStrategyManager;
        this.performanceMonitorService = performanceMonitorService;
        
        // 动画状态
        this.animationId = null;
        this.startTime = null;
        this.pendingElapsedTime = 0; // 在第一帧RAF回调前暂存需要回溯的已消耗时间（用于暂停后继续播放）
        this.isAnimating = false; // 标记是否正在动画中
        
        // 性能优化：缓存图片相关数据，避免每帧访问state
        this.cachedImageWidth = null;
        this.cachedScalingRatio = null;
        this.cachedMainImageWidth = null;
        
        // 性能优化：复用事件数据对象，避免每帧创建新对象
        this.progressData = {
            progress: 0,
            position: 0,
            elapsed: 0,
            totalDuration: 0
        };
        
        // 实时FPS跟踪：维护最近30帧的FPS历史用于计算平均值
        this.fpsHistory = [];
        this.FPS_HISTORY_SIZE = 30;
        this.lastFrameTimestamp = null; // 上一帧的RAF timestamp（用于计算真实FPS）
        
        // 绑定事件监听
        this._bindEvents();
    }
    
    /**
     * 绑定事件监听
     * @private
     * @returns {void}
     */
    _bindEvents() {
        // 监听状态通知：位置变化（通知式，不是命令式）
        this.eventBus.on('state:scroll-current-position-changed', (data) => {
            // 性能优化：动画期间跳过事件触发的更新（RAF已直接更新DOM）
            if (this.isAnimating) return;
            
            // Fail Fast: 验证事件数据
            if (!data || typeof data !== 'object') {
                throw new Error('ScrollAnimationService: Invalid state:scroll-current-position-changed event data');
            }
            if (data.position === undefined) {
                throw new Error('ScrollAnimationService: position is required in state:scroll-current-position-changed event');
            }
            // 自己决定如何响应：更新UI（用于非动画场景，如reset、配置改变等）
            this.updateImagePosition(data.position);
        });
    }

    /**
     * 开始动画
     * @param {Object} config - 动画配置对象
     * @param {number} config.startPosition - 起始位置（像素）
     * @param {number} config.endPosition - 结束位置（像素）
     * @param {number} config.duration - 持续时间（毫秒）
     * @param {Function} onComplete - 动画完成回调函数，接收 config 参数
     * @returns {void}
     * @throws {Error} 当配置参数无效或状态数据缺失时抛出错误
     */
    startAnimation(config, onComplete) {
        this.stopAnimation();
        
        // Fail Fast: 验证配置对象
        if (!config || typeof config !== 'object') {
            throw new Error('ScrollAnimationService.startAnimation: config is required');
        }
        if (typeof config.startPosition !== 'number') {
            throw new Error('ScrollAnimationService.startAnimation: config.startPosition must be a number');
        }
        if (typeof config.endPosition !== 'number') {
            throw new Error('ScrollAnimationService.startAnimation: config.endPosition must be a number');
        }
        if (typeof config.duration !== 'number' || config.duration <= 0) {
            throw new Error('ScrollAnimationService.startAnimation: config.duration must be a positive number');
        }
        
        // Fail Fast: 验证状态中的当前位置
        const statePosition = this.stateManager.state.playback.scroll.currentPosition;
        if (statePosition === undefined || statePosition === null) {
            throw new Error('ScrollAnimationService.startAnimation: currentPosition in state is undefined or null');
        }
        const currentPosition = statePosition;
        const totalDistance = Math.abs(config.endPosition - config.startPosition);
        const currentDistance = Math.abs(currentPosition - config.startPosition);
        const distanceProgress = currentDistance / totalDistance;
        
        // Fail Fast: 验证动画策略
        const currentStrategy = this.stateManager.state.preferences.scrolling.animationStrategy;
        if (!currentStrategy) {
            throw new Error('ScrollAnimationService.startAnimation: animationStrategy in state is required');
        }
        
        // 从距离进度反推时间进度（考虑缓动函数）
        // 不同的缓动函数需要不同的反函数来计算时间进度
        let timeProgress = distanceProgress; // 默认（线性）
        
        // 根据缓动函数反推时间进度
        if (currentStrategy === 'ease-in') {
            // ease-in: distance = time²  →  time = √distance
            timeProgress = Math.sqrt(distanceProgress);
        } else if (currentStrategy === 'ease-out') {
            // ease-out: distance = 1 - (1-time)²  →  time = 1 - √(1-distance)
            timeProgress = 1 - Math.sqrt(1 - distanceProgress);
        } else if (currentStrategy === 'ease-in-out') {
            // ease-in-out: 分段反函数
            if (distanceProgress < 0.5) {
                // 前半段: distance = 2time² / 2 = time²  →  time = √distance
                timeProgress = Math.sqrt(distanceProgress * 2) / 2;
            } else {
                // 后半段: distance = 1 - 2(1-time)² / 2  →  time = 1 - √(2(1-distance)) / 2
                timeProgress = 1 - Math.sqrt(2 * (1 - distanceProgress)) / 2;
            }
        } else if (currentStrategy === 'elastic') {
            // elastic: 前80%使用三次缓出 distance = 1 - (1-time)³
            // 后20%有正弦波振荡，但振幅很小(0.02)，可忽略
            // 反函数: time = 1 - ³√(1-distance)
            // Math.cbrt() 是立方根函数（cube root）
            timeProgress = 1 - Math.cbrt(1 - distanceProgress);
        }
        // 其他未知策略退化到线性计算
        
        // 根据时间进度计算已经消耗的时间
        const elapsedTime = timeProgress * config.duration;
        
        // 暂存需要回溯的时间，在第一帧RAF回调时使用
        this.pendingElapsedTime = elapsedTime;
        
        // 性能优化：缓存state引用，避免每帧访问深层对象
        const scrollState = this.stateManager.state.playback.scroll;
        
        // 性能优化：预计算固定值，避免每帧重复计算
        const totalDurationInSeconds = config.duration / 1000;
        
        // 性能优化：标记动画开始，RAF期间跳过事件系统更新
        this.isAnimating = true;
        
        // 标记是否是第一帧
        let isFirstFrame = true;
        
        // 用于追踪RAF是否被调用
        let rafCallCount = 0;
        
        const animate = (currentTime) => {
            rafCallCount++;
            // 性能监控：记录帧开始时间
            const frameStartTime = performance.now();
            
            if (!scrollState.isPlaying) {
                return;
            }
            
            // 在第一帧时使用RAF的currentTime作为基准初始化startTime，减去已消耗时间以支持暂停后继续播放
            if (isFirstFrame) {
                this.startTime = currentTime - this.pendingElapsedTime;
                isFirstFrame = false;
            }
            
            const elapsed = currentTime - this.startTime;
            const progress = Math.min(elapsed / config.duration, 1);
            
            // 计算当前位置
            const position = this.scrollStrategyManager.calculatePosition(
                currentStrategy,
                progress,
                config.startPosition,
                config.endPosition
            );
            
            // 性能优化：动画期间直接更新DOM，跳过事件系统开销
            this.updateImagePosition(position);
            
            // 更新状态（供外部读取，不触发自己的事件监听器）
            scrollState.currentPosition = position;
            
            // 性能优化：复用事件数据对象，避免每帧创建新对象
            this.progressData.progress = progress;
            this.progressData.position = position;
            this.progressData.elapsed = elapsed / 1000;
            this.progressData.totalDuration = totalDurationInSeconds;
            this.eventBus.emit('scroll:progress', this.progressData);
            
            // 性能监控：计算帧时间
            const frameEndTime = performance.now();
            const frameTime = frameEndTime - frameStartTime;
            
            // 发送实时FPS（独立于性能监控）
            const showRealtimeFPS = this.stateManager.state.preferences.performance.showRealtimeFPS;
            if (showRealtimeFPS) {
                // 使用RAF currentTime计算真实FPS（两帧之间的时间间隔）
                if (this.lastFrameTimestamp !== null) {
                    const deltaTime = currentTime - this.lastFrameTimestamp;
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
                            stage: 'scroll' 
                        });
                    }
                }
                this.lastFrameTimestamp = currentTime;
            }
            
            // 收集性能监控数据（可选）
            this.performanceMonitorService.collectScrollFrame({
                frameTime,
                drawImageCalls: 1,
                getContextCalls: 0,
                timestamp: frameEndTime,
                rafTimestamp: currentTime // RAF timestamp，用于计算实际帧间隔
            });
            
            // 检查是否完成
            if (progress >= 1) {
                // Fail Fast: 验证完成回调
                if (!onComplete || typeof onComplete !== 'function') {
                    throw new Error('ScrollAnimationService.startAnimation: onComplete callback is required');
                }
                onComplete(config);
            } else {
                this.animationId = requestAnimationFrame(animate);
            }
        };
        
        this.animationId = requestAnimationFrame(animate);
    }

    /**
     * 暂停动画（保留状态，支持恢复播放）
     * @returns {void}
     */
    pauseAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        this.isAnimating = false;
        // 注意：不清除 pendingElapsedTime，以便恢复播放时继续
    }
    
    /**
     * 停止动画（清除所有状态）
     * @returns {void}
     */
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        this.isAnimating = false;
        this.startTime = null;
        this.pendingElapsedTime = 0; // 清除已消耗时间
        this.fpsHistory = []; // 清空FPS历史
        this.lastFrameTimestamp = null; // 清空上一帧时间戳
    }

    /**
     * 更新图片位置
     * @param {number} position - 滚动位置（像素）
     * @returns {void}
     * @throws {Error} 当参数无效、DOM元素缺失或状态中的缩放比例或图片宽度缺失时抛出错误
     */
    updateImagePosition(position) {
        // Fail Fast: 验证position参数
        if (typeof position !== 'number' || isNaN(position)) {
            throw new Error('ScrollAnimationService.updateImagePosition: position must be a valid number');
        }
        
        // 使用统一的Canvas访问工具函数获取DOM元素
        const scrollCanvas = getScrollCanvas();
        
        // 性能优化：检查缓存是否需要更新（图片加载或缩放改变时）
        const currentImageWidth = this.stateManager.state.content.image.metadata.width;
        const currentScalingRatio = this.stateManager.state.content.image.scaling.ratio;
        
        // Fail Fast: 验证图片宽度
        if (!currentImageWidth) {
            throw new Error('ScrollAnimationService.updateImagePosition: image width is required in state');
        }
        
        // Fail Fast: 验证图片缩放比例
        if (currentScalingRatio === undefined || currentScalingRatio === null) {
            throw new Error('ScrollAnimationService.updateImagePosition: scaling.ratio is required in state');
        }
        
        // 检测值是否变化，需要更新缓存
        if (this.cachedImageWidth !== currentImageWidth || this.cachedScalingRatio !== currentScalingRatio) {
            this.cachedImageWidth = currentImageWidth;
            this.cachedScalingRatio = currentScalingRatio;
            this.cachedMainImageWidth = currentImageWidth * currentScalingRatio;
        }
        
        // 委托给 PositionCalculatorService 进行位置转换
        const actualScrollDistance = convertPixelPositionToScrollDistance(
            position,
            this.cachedImageWidth,
            this.cachedMainImageWidth
        );
        
        scrollCanvas.style.setProperty('--scroll-offset', `${actualScrollDistance}px`);
    }

}

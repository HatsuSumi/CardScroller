/**
 * PerformanceMonitorService - 性能监控服务
 * 负责收集、聚合和报告动画性能数据（入场动画和滚动动画）
 * 
 * 职责说明：
 * - 收集每帧的性能数据（帧时间、drawImage调用次数、getContext调用次数等）
 * - 聚合数据并计算统计指标（平均FPS、最小/最大FPS、理论/实际FPS等）
 * - 生成完整的性能报告并保存到状态管理器
 * - 实时发送FPS数据到事件总线供RealtimeFPSMonitor使用
 * 
 * 当前被使用的模块：
 * - EntryAnimationService (business/EntryAnimationService.js) - 调用collectEntryFrame()收集入场动画每帧数据
 * - ScrollAnimationService (business/ScrollAnimationService.js) - 调用collectScrollFrame()收集滚动动画每帧数据
 * - PlaybackCoordinatorService (business/PlaybackCoordinatorService.js) - 调用startMonitoring()和finishMonitoring()控制监控生命周期
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理器，读取监控配置、保存报告数据 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线，发送实时FPS和报告更新事件 (通过DI注入)
 * - calculateTheoreticalFPS, calculateActualFPS (helpers/performanceUtils.js) - FPS计算工具函数
 * - generateTimestamp (helpers/timeFormatters.js) - 时间戳生成工具函数
 * - calculateEntryAnimationTotalDuration (helpers/durationCalculators.js) - 入场动画总时长计算工具函数
 */

import { calculateTheoreticalFPS, calculateActualFPS } from '../../helpers/performanceUtils.js';
import { generateTimestamp } from '../../helpers/timeFormatters.js';
import { calculateEntryAnimationTotalDuration } from '../../helpers/durationCalculators.js';

export class PerformanceMonitorService {
    /**
     * 构造函数 - 创建性能监控服务
     * @param {StateManager} stateManager - 状态管理器
     * @param {EventBus} eventBus - 事件总线
     * @throws {Error} 当依赖缺失时立即抛出错误
     */
    constructor(stateManager, eventBus) {
        if (!stateManager) {
            throw new Error('PerformanceMonitorService requires stateManager dependency');
        }
        if (!eventBus) {
            throw new Error('PerformanceMonitorService requires eventBus dependency');
        }
        
        this.stateManager = stateManager;
        this.eventBus = eventBus;
        
        // 当前监控会话状态
        this.isMonitoring = false;
        this.wasInterrupted = false; // 是否检测到中断操作
        this.interruptReason = null; // 中断原因：'pause'（暂停）或 'reset'（重置）
        this.lastPlaybackProgress = 0; // 最后记录的播放进度（百分比，0-100）
        this.entryData = null;
        this.scrollData = null;
        
        // 监听播放进度事件（用于记录中断时的播放进度）
        this._bindEvents();
    }
    
    /**
     * 绑定EventBus事件
     * @returns {void}
     * @private
     */
    _bindEvents() {
        // 监听统一的播放进度事件（入场+滚动的完整进度）
        this.eventBus.on('playback:progress', this._handlePlaybackProgress.bind(this));
    }
    
    /**
     * 处理播放进度事件
     * @param {Object} data - 进度数据
     * @param {number} data.progress - 播放进度（0-1）
     * @returns {void}
     * @throws {Error} 当进度数据无效时抛出错误（Fail Fast）
     * @private
     */
    _handlePlaybackProgress(data) {
        if (!this.isMonitoring) {
            return;
        }
        
        // Fail Fast: 验证进度数据
        if (!data || typeof data.progress !== 'number') {
            throw new Error(`PerformanceMonitorService._handlePlaybackProgress: invalid progress data, got ${JSON.stringify(data)}`);
        }
        
        // 记录最后一次的播放进度（转换为百分比，钳制到0-100范围）
        this.lastPlaybackProgress = Math.min(100, Math.max(0, Math.round(data.progress * 100)));
    }
    
    /**
     * 开始监控（重置数据）
     * @returns {void}
     */
    startMonitoring() {
        // 检查是否启用监控
        const enabled = this._isEnabled();
        if (!enabled) {
            return;
        }
        
        this.isMonitoring = true;
        this.wasInterrupted = false; // 重置中断标志
        this.interruptReason = null; // 重置中断原因
        this.lastPlaybackProgress = 0; // 重置播放进度
        
        // 重置入场动画数据
        this.entryData = {
            frames: [],
            totalDuration: 0,
            startTime: null,
            endTime: null
        };
        
        // 重置滚动动画数据
        this.scrollData = {
            frames: [],
            totalDuration: 0,
            startTime: null,
            endTime: null
        };
    }
    
    /**
     * 标记监控为中断状态
     * @param {string} reason - 中断原因：'pause'（暂停）或 'reset'（重置）
     * @returns {void}
     * @throws {Error} 当reason参数无效时立即抛出错误（Fail Fast）
     * 
     * 注意：只记录第一次中断的原因，后续调用不会覆盖
     * 例如：用户先暂停再重置，会记录为 'pause'（第一次中断）
     */
    markInterrupted(reason) {
        // Fail Fast: 验证reason参数
        if (!reason) {
            throw new Error('PerformanceMonitorService.markInterrupted: reason is required');
        }
        if (reason !== 'pause' && reason !== 'reset') {
            throw new Error(`PerformanceMonitorService.markInterrupted: invalid reason "${reason}", must be "pause" or "reset"`);
        }
        
        if (this.isMonitoring) {
            // 只记录第一次中断的原因（防止后续操作覆盖真实的中断原因）
            if (!this.wasInterrupted) {
                this.wasInterrupted = true;
                this.interruptReason = reason;
            }
        }
    }
    
    /**
     * 收集入场动画帧数据
     * @param {Object} frameData - 帧数据
     * @param {number} frameData.frameTime - 帧执行时间（毫秒，代码执行耗时）
     * @param {number} frameData.rafTimestamp - RAF timestamp（必需，用于计算实际帧间隔）
     * @param {number} frameData.drawImageCalls - drawImage调用次数
     * @param {number} frameData.getContextCalls - getContext调用次数
     * @param {number} [frameData.timestamp] - performance.now() 时间戳（可选）
     * @param {number} [frameData.clearTime] - 清屏耗时（毫秒，可选）
     * @param {number} [frameData.cardTime] - 卡片绘制耗时（毫秒，可选）
     * @param {number} [frameData.canvasTime] - Canvas操作总耗时（毫秒，可选）
     * @param {number} [frameData.businessTime] - 业务逻辑耗时（毫秒，可选）
     * @returns {void}
     * @throws {Error} 当必需字段缺失或无效时抛出错误（Fail Fast）
     */
    collectEntryFrame(frameData) {
        if (!this.isMonitoring || !this.entryData) {
            return;
        }
        
        // Fail Fast: 验证必需字段
        if (typeof frameData.frameTime !== 'number') {
            throw new Error('PerformanceMonitorService.collectEntryFrame: frameTime must be a number');
        }
        if (!Number.isFinite(frameData.rafTimestamp)) {
            throw new Error(`PerformanceMonitorService.collectEntryFrame: rafTimestamp must be a finite number, got ${frameData.rafTimestamp}`);
        }
        if (typeof frameData.drawImageCalls !== 'number') {
            throw new Error('PerformanceMonitorService.collectEntryFrame: drawImageCalls must be a number');
        }
        if (typeof frameData.getContextCalls !== 'number') {
            throw new Error('PerformanceMonitorService.collectEntryFrame: getContextCalls must be a number');
        }
        
        // 记录第一帧时间
        if (this.entryData.startTime === null && frameData.timestamp) {
            this.entryData.startTime = frameData.timestamp;
        }
        
        // 收集帧数据（包括细分耗时和RAF timestamp）
        this.entryData.frames.push({
            frameTime: frameData.frameTime,
            drawImageCalls: frameData.drawImageCalls,
            getContextCalls: frameData.getContextCalls,
            timestamp: frameData.timestamp || Date.now(),
            rafTimestamp: frameData.rafTimestamp, // RAF timestamp，用于计算实际帧间隔
            // 细分耗时（可选）
            clearTime: frameData.clearTime,
            cardTime: frameData.cardTime,
            canvasTime: frameData.canvasTime,
            businessTime: frameData.businessTime
        });
    }
    
    /**
     * 收集滚动动画帧数据
     * @param {Object} frameData - 帧数据
     * @param {number} frameData.frameTime - 帧执行时间（毫秒，代码执行耗时）
     * @param {number} frameData.rafTimestamp - RAF timestamp（必需，用于计算实际帧间隔）
     * @param {number} frameData.drawImageCalls - drawImage调用次数
     * @param {number} frameData.getContextCalls - getContext调用次数
     * @param {number} [frameData.timestamp] - performance.now() 时间戳（可选）
     * @returns {void}
     * @throws {Error} 当必需字段缺失或无效时抛出错误（Fail Fast）
     */
    collectScrollFrame(frameData) {
        if (!this.isMonitoring || !this.scrollData) {
            return;
        }
        
        // Fail Fast: 验证必需字段
        if (typeof frameData.frameTime !== 'number') {
            throw new Error('PerformanceMonitorService.collectScrollFrame: frameTime must be a number');
        }
        if (!Number.isFinite(frameData.rafTimestamp)) {
            throw new Error(`PerformanceMonitorService.collectScrollFrame: rafTimestamp must be a finite number, got ${frameData.rafTimestamp}`);
        }
        if (typeof frameData.drawImageCalls !== 'number') {
            throw new Error('PerformanceMonitorService.collectScrollFrame: drawImageCalls must be a number');
        }
        if (typeof frameData.getContextCalls !== 'number') {
            throw new Error('PerformanceMonitorService.collectScrollFrame: getContextCalls must be a number');
        }
        
        // 记录第一帧时间
        if (this.scrollData.startTime === null && frameData.timestamp) {
            this.scrollData.startTime = frameData.timestamp;
        }
        
        // 收集帧数据（包括RAF timestamp）
        this.scrollData.frames.push({
            frameTime: frameData.frameTime,
            drawImageCalls: frameData.drawImageCalls,
            getContextCalls: frameData.getContextCalls,
            timestamp: frameData.timestamp || Date.now(),
            rafTimestamp: frameData.rafTimestamp // RAF timestamp，用于计算实际帧间隔
        });
    }
    
    /**
     * 完成监控并生成报告
     * @returns {void}
     */
    finishMonitoring() {
        if (!this.isMonitoring) {
            return;
        }
        
        this.isMonitoring = false;
        
        // 记录结束时间
        if (this.entryData && this.entryData.frames.length > 0) {
            const lastFrame = this.entryData.frames[this.entryData.frames.length - 1];
            this.entryData.endTime = lastFrame.timestamp;
            this.entryData.totalDuration = this.entryData.endTime - this.entryData.startTime;
        }
        
        if (this.scrollData && this.scrollData.frames.length > 0) {
            const lastFrame = this.scrollData.frames[this.scrollData.frames.length - 1];
            this.scrollData.endTime = lastFrame.timestamp;
            this.scrollData.totalDuration = this.scrollData.endTime - this.scrollData.startTime;
        }
        
        // 生成报告
        const report = this._generateReport();
        
        // 保存报告到状态管理器
        this.stateManager.state.debug.performance.lastReport = report;
        
        // 发送报告更新事件
        this.eventBus.emit('performance:report:updated', { report });
    }
    
    /**
     * 生成性能报告
     * @returns {Object} 性能报告对象
     * @private
     */
    _generateReport() {
        // 优先使用用户设置的刷新率，其次使用估算的刷新率
        // Fail Fast：如果两者都没有，使用 null（报告中会体现为未知刷新率）
        const userRefreshRate = this.stateManager.state.preferences.performance.userRefreshRate;
        const estimatedRefreshRate = this.stateManager.state.debug.performance.estimatedRefreshRate;
        const refreshRate = userRefreshRate || estimatedRefreshRate || null;
        
        // 获取用户设置的滚动时长（毫秒）
        const userScrollDuration = this.stateManager.state.playback.scroll.duration * 1000;
        
        // 计算入场动画的预期时长（毫秒）
        const entryAnimationConfig = this.stateManager.state.playback.entryAnimation;
        let userEntryDuration = null;
        if (entryAnimationConfig.enabled && entryAnimationConfig.cardBoundaries.length > 0) {
            const cardCount = entryAnimationConfig.cardBoundaries.length / 2;
            userEntryDuration = calculateEntryAnimationTotalDuration(
                cardCount,
                entryAnimationConfig.duration,
                entryAnimationConfig.staggerDelay
            );
        }
        
        // 判断是否完整播放：基于播放进度（播放到100%视为完整）
        const isComplete = this.lastPlaybackProgress >= 100;
        
        const report = {
            timestamp: generateTimestamp(),
            refreshRate: refreshRate,
            isComplete: isComplete,
            wasInterrupted: this.wasInterrupted, // 记录是否有中断操作
            interruptReason: this.interruptReason, // 记录中断原因：'pause' 或 'reset'
            playbackProgress: this.lastPlaybackProgress, // 播放进度（百分比，0-100）
            entryAnimation: this._analyzeAnimationData(this.entryData, refreshRate, userEntryDuration),
            scrollAnimation: this._analyzeAnimationData(this.scrollData, refreshRate, userScrollDuration)
        };
        
        return report;
    }
    
    /**
     * 分析动画数据并生成统计指标
     * @param {Object} data - 动画数据
     * @param {number} refreshRate - 屏幕刷新率
     * @param {number|null} expectedDuration - 用户设置的预期时长（毫秒）
     *                                          - 滚动动画：应传入用户设置的时长，用于检测时长差异
     *                                          - 入场动画：可传 null（预期时长难以预先计算）
     * @returns {Object|null} 分析结果，如果没有数据则返回null
     * @private
     */
    _analyzeAnimationData(data, refreshRate, expectedDuration = null) {
        if (!data || data.frames.length === 0) {
            return null;
        }
        
        const frames = data.frames;
        const frameCount = frames.length;
        
        // 至少需要2帧才能计算帧间隔
        if (frameCount < 2) {
            return null;
        }
        
        // 计算两种帧耗时：
        // 1. frameTime（业务执行耗时）：用于计算理论FPS
        // 2. rafDeltaTime（RAF帧间隔）：用于计算实际FPS（与实时FPS保持一致）
        
        // 理论FPS：基于业务代码执行耗时
        const businessFrameTimes = frames.map(f => f.frameTime);
        const minBusinessFrameTime = Math.min(...businessFrameTimes);
        const maxBusinessFrameTime = Math.max(...businessFrameTimes);
        
        // 实际FPS：基于RAF帧间隔（与实时FPS保持一致）
        const rafDeltaTimes = [];
        for (let i = 1; i < frameCount; i++) {
            const deltaTime = frames[i].rafTimestamp - frames[i - 1].rafTimestamp;
            rafDeltaTimes.push(deltaTime);
        }
        const maxRafDeltaTime = Math.max(...rafDeltaTimes);
        
        // 测量精度阈值：低于此值的帧耗时视为测量误差（10微秒）
        const MEASUREMENT_THRESHOLD = 0.01;
        
        // 过滤异常帧（测量精度或调度异常导致的 < 0.01ms 的帧间隔）
        const validBusinessFrameTimes = businessFrameTimes.filter(t => t >= MEASUREMENT_THRESHOLD);
        const validRafDeltaTimes = rafDeltaTimes.filter(t => t >= MEASUREMENT_THRESHOLD);
        const hasAnomalousFrames = validBusinessFrameTimes.length < businessFrameTimes.length 
                                 || validRafDeltaTimes.length < rafDeltaTimes.length;
        
        // Fail Fast: 验证过滤后有足够的有效帧数据
        if (validBusinessFrameTimes.length === 0) {
            throw new Error('PerformanceMonitorService._analyzeAnimationData: All business frame times are anomalous (< 0.01ms), data invalid');
        }
        if (validRafDeltaTimes.length === 0) {
            throw new Error('PerformanceMonitorService._analyzeAnimationData: All RAF delta times are anomalous (< 0.01ms), data invalid');
        }
        
        // 计算平均值（使用过滤后的值）
        const avgBusinessFrameTime = validBusinessFrameTimes.reduce((sum, t) => sum + t, 0) / validBusinessFrameTimes.length;
        const avgRafDeltaTime = validRafDeltaTimes.reduce((sum, t) => sum + t, 0) / validRafDeltaTimes.length;
        
        // 计算用于FPS计算的最小值（使用过滤后的值，避免Infinity）
        const minBusinessFrameTimeFiltered = Math.min(...validBusinessFrameTimes);
        const minRafDeltaTimeFiltered = Math.min(...validRafDeltaTimes);
        
        // 计算理论FPS（基于业务执行耗时）
        // 说明：理论FPS表示"如果没有刷新率限制，代码理论上能达到的帧率"
        const theoreticalAvgFPS = calculateTheoreticalFPS(avgBusinessFrameTime);
        const theoreticalMinFPS = calculateTheoreticalFPS(maxBusinessFrameTime); // 最大帧时间对应最小FPS
        const theoreticalMaxFPS = calculateTheoreticalFPS(minBusinessFrameTimeFiltered); // 使用过滤后的最小帧时间
        
        // 计算实际FPS（基于RAF帧间隔，与实时FPS保持一致）
        // 说明：实际FPS基于RAF调用间隔，本身就受刷新率物理限制
        let actualAvgFPS = calculateTheoreticalFPS(avgRafDeltaTime);
        let actualMinFPS = calculateTheoreticalFPS(maxRafDeltaTime); // 最大帧间隔对应最小FPS
        let actualMaxFPS = calculateTheoreticalFPS(minRafDeltaTimeFiltered); // 使用过滤后的最小帧间隔（避免Infinity）
        
        // 如果有刷新率，再次钳制确保不超过刷新率（虽然RAF本身已经受限，但仍做一次保护性钳制）
        let refreshRateUtilization;
        if (refreshRate) {
            actualAvgFPS = calculateActualFPS(actualAvgFPS, refreshRate);
            actualMinFPS = calculateActualFPS(actualMinFPS, refreshRate);
            actualMaxFPS = calculateActualFPS(actualMaxFPS, refreshRate);
            // 计算刷新率利用率（数据不足时为NaN/Infinity是正常情况）
            refreshRateUtilization = (actualAvgFPS / refreshRate) * 100;
        } else {
            // 没有刷新率时，设为0（表示无法计算）
            refreshRateUtilization = 0;
        }
        
        // 计算调用次数统计
        const totalDrawImageCalls = frames.reduce((sum, f) => sum + f.drawImageCalls, 0);
        const avgDrawImageCalls = totalDrawImageCalls / frameCount;
        const totalGetContextCalls = frames.reduce((sum, f) => sum + f.getContextCalls, 0);
        const avgGetContextCalls = totalGetContextCalls / frameCount;
        
        // 计算细分耗时统计（如果有的话）
        let timingBreakdown = null;
        const hasTimingData = frames.some(f => 
            f.clearTime !== undefined || 
            f.cardTime !== undefined || 
            f.canvasTime !== undefined ||
            f.businessTime !== undefined
        );
        
        if (hasTimingData) {
            // 过滤掉没有细分耗时数据的帧
            const framesWithTiming = frames.filter(f => 
                f.clearTime !== undefined && 
                f.cardTime !== undefined && 
                f.canvasTime !== undefined &&
                f.businessTime !== undefined
            );
            
            if (framesWithTiming.length > 0) {
                const avgClearTime = framesWithTiming.reduce((sum, f) => sum + f.clearTime, 0) / framesWithTiming.length;
                const avgCardTime = framesWithTiming.reduce((sum, f) => sum + f.cardTime, 0) / framesWithTiming.length;
                const avgCanvasTime = framesWithTiming.reduce((sum, f) => sum + f.canvasTime, 0) / framesWithTiming.length;
                const avgBusinessTime = framesWithTiming.reduce((sum, f) => sum + f.businessTime, 0) / framesWithTiming.length;
                
                timingBreakdown = {
                    clearTime: avgClearTime,
                    cardTime: avgCardTime,
                    canvasTime: avgCanvasTime,
                    businessTime: avgBusinessTime
                };
            }
        }
        
        // 计算实际时长与预期时长的差异
        let durationMismatch = null;
        if (expectedDuration !== null && expectedDuration > 0) {
            const actualDuration = data.totalDuration;
            const difference = actualDuration - expectedDuration;
            const percentageDiff = (difference / expectedDuration) * 100;
            
            // 只要有差异就记录（不设置阈值）
            durationMismatch = {
                expected: expectedDuration,
                actual: actualDuration,
                difference: difference,
                percentage: percentageDiff
            };
        }
        
        // 计算帧耗时标准差（基于RAF帧间隔，单位：ms）
        const avgFrameTime = validRafDeltaTimes.reduce((sum, dt) => sum + dt, 0) / validRafDeltaTimes.length;
        const variance = validRafDeltaTimes.reduce((sum, dt) => sum + Math.pow(dt - avgFrameTime, 2), 0) / validRafDeltaTimes.length;
        const frameTimeStdDev = Math.sqrt(variance);
        
        // 计算RAF帧间隔对应的FPS值（用于1%和0.1%低点FPS计算）
        const rafFPSValues = validRafDeltaTimes.map(dt => calculateTheoreticalFPS(dt));
        
        // 计算百分位数帧时间（基于RAF帧间隔）
        const sortedRafDeltaTimes = [...validRafDeltaTimes].sort((a, b) => a - b);
        const p50Index = Math.floor(sortedRafDeltaTimes.length * 0.50);
        const p95Index = Math.floor(sortedRafDeltaTimes.length * 0.95);
        const p99Index = Math.floor(sortedRafDeltaTimes.length * 0.99);
        const p50FrameTime = sortedRafDeltaTimes[p50Index];
        const p95FrameTime = sortedRafDeltaTimes[p95Index];
        const p99FrameTime = sortedRafDeltaTimes[p99Index];
        
        // 计算1%和0.1%低点FPS（基于RAF帧间隔）
        const sortedRafFPS = [...rafFPSValues].sort((a, b) => a - b);
        const onePercentIndex = Math.floor(sortedRafFPS.length * 0.01);
        const pointOnePercentIndex = Math.floor(sortedRafFPS.length * 0.001);
        const onePercentLowFPS = sortedRafFPS[onePercentIndex] || sortedRafFPS[0];
        const pointOnePercentLowFPS = sortedRafFPS[pointOnePercentIndex] || sortedRafFPS[0];
        
        // 计算帧掉落分析（基于刷新率）
        let smoothFrames = null;
        let minorDrops = null;
        let severeDrops = null;
        let stutterCount = null;
        
        if (refreshRate) {
            // 定义阈值（基于刷新率）
            const smoothThreshold = refreshRate * 0.95;      // 95%刷新率以上为流畅
            const minorDropThreshold = refreshRate * 0.80;   // 80%-95%为轻微卡顿
            // 低于80%为严重卡顿
            
            smoothFrames = 0;
            minorDrops = 0;
            severeDrops = 0;
            
            rafFPSValues.forEach(fps => {
                if (fps >= smoothThreshold) {
                    smoothFrames++;
                } else if (fps >= minorDropThreshold) {
                    minorDrops++;
                } else {
                    severeDrops++;
                }
            });
            
            // 计算卡顿次数（连续2帧以上严重掉帧）
            const idealFrameTime = 1000 / refreshRate;
            stutterCount = 0;
            for (let i = 0; i < validRafDeltaTimes.length - 1; i++) {
                if (validRafDeltaTimes[i] >= idealFrameTime * 2 && validRafDeltaTimes[i + 1] >= idealFrameTime * 2) {
                    stutterCount++;
                }
            }
        }
        
        const result = {
            frameCount,
            totalDuration: data.totalDuration,
            expectedDuration: expectedDuration, // 用户设置的预期时长
            durationMismatch: durationMismatch, // 时长差异信息（如果有）
            // 业务帧耗时（用于理论FPS计算和Tooltip显示）
            avgFrameTime: avgBusinessFrameTime,
            minFrameTime: minBusinessFrameTime,
            maxFrameTime: maxBusinessFrameTime,
            minFrameTimeFiltered: minBusinessFrameTimeFiltered, // 过滤后的最小帧耗时（用于Tooltip说明）
            hasAnomalousFrames,   // 是否存在异常帧（< 0.01ms）
            theoreticalFPS: {
                avg: theoreticalAvgFPS,
                min: theoreticalMinFPS,
                max: theoreticalMaxFPS
            },
            actualFPS: {
                avg: actualAvgFPS,
                min: actualMinFPS,
                max: actualMaxFPS
            },
            refreshRateUtilization,
            drawImageCalls: {
                total: totalDrawImageCalls,
                avg: avgDrawImageCalls
            },
            getContextCalls: {
                total: totalGetContextCalls,
                avg: avgGetContextCalls
            },
            // 新增字段：数据可视化用
            frames: frames,  // 原始帧数组（用于图表渲染）
            frameTimeStdDev: frameTimeStdDev,  // 帧耗时标准差（单位：ms）
            p50FrameTime: p50FrameTime,  // P50百分位数帧时间
            p95FrameTime: p95FrameTime,  // P95百分位数帧时间
            p99FrameTime: p99FrameTime,  // P99百分位数帧时间
            onePercentLowFPS: onePercentLowFPS,  // 1%低点FPS
            pointOnePercentLowFPS: pointOnePercentLowFPS,  // 0.1%低点FPS
            smoothFrames: smoothFrames,  // 流畅帧数（>=95%刷新率）
            minorDrops: minorDrops,  // 轻微卡顿帧数（80%-95%刷新率）
            severeDrops: severeDrops,  // 严重卡顿帧数（<80%刷新率）
            stutterCount: stutterCount  // 卡顿次数（连续2帧严重掉帧）
        };
        
        // 只有当有细分耗时数据时才添加
        if (timingBreakdown) {
            result.timingBreakdown = timingBreakdown;
        }
        
        return result;
    }

    /**
     * 检查性能监控是否启用
     * @returns {boolean} 如果启用则返回 true，否则返回 false
     * @private
     */
    _isEnabled() {
        // 统一从 StateManager 获取状态
        const enabled = this.stateManager.state.preferences.performance.enabled;
        
        // Fail Fast: 确保状态值是布尔类型
        if (typeof enabled !== 'boolean') {
            throw new Error('PerformanceMonitorService._isEnabled: enabled state is not a boolean');
        }
        return enabled;
    }
}


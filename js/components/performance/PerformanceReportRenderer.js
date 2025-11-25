/**
 * PerformanceReportRenderer - 性能报告渲染组件
 * 负责渲染入场动画和滚动动画的性能报告，包括FPS分析、耗时分解、性能等级评估等
 * 
 * 职责说明：
 * - 这是一个纯UI渲染组件，专门为 PerformanceReportPage 提供性能报告展示功能
 * - 渲染入场动画性能报告（FPS、帧耗时、Canvas操作统计）
 * - 渲染滚动动画性能报告（FPS、渲染统计）
 * - 显示性能等级评估和优化建议
 * - 处理空状态（无报告数据时的提示）
 * 
 * 当前被使用的模块：
 * - PerformanceReportPage (services/ui/PerformanceReportPage.js) - 性能监控主页面
 * 
 * 当前依赖的模块：
 * - formatFPS, getPerformanceLevel, applyPerformanceColor (helpers/performanceUtils.js) - FPS格式化、性能等级评估、性能颜色应用
 * - formatPercentage (helpers/numberFormatters.js) - 百分比格式化
 * - formatMilliseconds (helpers/timeFormatters.js) - 毫秒格式化
 * 
 * 架构说明：
 * - DOM 元素通过 init() 方法传入，不在构造函数中初始化（支持动态 DOM）
 * - 使用 Fail Fast 原则验证所有关键参数
 * - 所有格式化和计算逻辑委托给 helpers，本组件只负责 UI 更新
 */

import { formatFPS, getPerformanceLevel, applyPerformanceColor } from '../../helpers/performanceUtils.js';
import { formatPercentage } from '../../helpers/numberFormatters.js';
import { formatMilliseconds } from '../../helpers/timeFormatters.js';

export class PerformanceReportRenderer {
    /**
     * Tooltip 模板（集中管理）
     * 使用 {placeholder} 语法标记需要动态替换的值
     */
    static TOOLTIP_TEMPLATES = {
        theoreticalAvgFPS: `理论平均FPS：基于业务代码执行耗时计算（1000ms ÷ 平均帧耗时）。
代表"如果没有刷新率限制，代码理论上能达到的帧率"。
反映业务代码执行效率，不受屏幕刷新率物理限制。

例如：1000ms ÷ {avgFrameTime}ms = {theoreticalAvgFPS}。`,
        
        theoreticalMinFPS: `理论最小FPS：基于最长帧耗时计算（1000ms ÷ 最大帧耗时）。
代表性能瓶颈时的理论帧率，反映动画过程中最慢的那一帧的执行效率。

例如：1000ms ÷ {maxFrameTime}ms = {theoreticalMinFPS}。`,
        
        theoreticalMaxFPS: `理论最大FPS：基于最短帧耗时计算（1000ms ÷ 最小帧耗时）。
代表最优情况下代码能达到的理论帧率。

{anomalousNote}例如：1000ms ÷ {minFrameTime}ms = {theoreticalMaxFPS}。`,
        
        theoreticalMaxFPSAnomalous: `⚠️ 检测到异常帧：部分帧耗时 < 0.01ms，超出浏览器计时器测量精度。
实际测量结果为 ∞（无限大），这是好事，说明代码执行效率极高。

已自动过滤异常帧，显示过滤后的理论最大FPS。
`,
        
        frameTimeAnalysis: `帧耗时：渲染一帧画面所需的时间（单位：毫秒）。
理想值：16.7ms（对应60 FPS）。
耗时越短，帧率越高，动画越流畅。`,
        
        canvasCallsEntry: `Canvas调用统计：监控动画循环中最核心的Canvas API调用次数。
（注：不包括初始化阶段的调用，也不包括fillRect、clearRect等其他操作）

drawImage总调用：动画循环期间绘制图片的总次数。
drawImage平均调用：每帧平均绘制图片的次数（入场动画通常等于卡片数量）。

getContext总调用/平均调用：动画循环期间获取Canvas上下文的次数。
  ✓ 正常情况：应该为0（上下文在初始化阶段已获取并缓存，循环中不再重复获取）。
  ⚠ 异常情况：如果不为0，说明代码每帧都在重复获取上下文，严重影响性能。

说明：初始化阶段的getContext调用（约2-3次）不计入统计，因为它们是必需的且无法优化。`,
        
        canvasCallsScroll: `Canvas调用统计：监控动画循环中最核心的Canvas API调用次数。
（注：不包括初始化阶段的调用，也不包括fillRect、clearRect等其他操作）

drawImage总调用：动画循环期间绘制图片的总次数。
drawImage平均调用：每帧平均绘制图片的次数（滚动动画通常为1，每帧只绘制一次完整图片）。

getContext总调用/平均调用：动画循环期间获取Canvas上下文的次数。
  ✓ 正常情况：应该为0（上下文在初始化阶段已获取并缓存，循环中不再重复获取）。
  ⚠ 异常情况：如果不为0，说明代码每帧都在重复获取上下文，严重影响性能。

说明：初始化阶段的getContext调用（约2-3次）不计入统计，因为它们是必需的且无法优化。`,
        
        durationMismatch: `⚠️ 实际时长与设置不一致。

设置时长：{expectedDuration}。
实际时长：{actualDuration}。
差异：{difference} ({percentage}%)。

原因：requestAnimationFrame 调度延迟和浏览器调度精度限制。
这是正常的，误差在可接受范围内。{pauseNote}`,

        refreshRateUtilization: `刷新率利用率 = 实际平均FPS ÷ 屏幕刷新率 × 100%。
代表动画对屏幕刷新率的利用程度。

当前：{actualAvgFPS} ÷ {refreshRate}Hz × 100% = {utilization}%。`,

        totalFrames: `总帧数 = 动画播放期间渲染的画面总数。

说明：帧数越多，动画越流畅；但过高的帧数会增加资源消耗。`,

        perfLevel: `性能等级评估标准（基于刷新率利用率）：

✓ 优秀：≥95% 刷新率利用率。
✓ 良好：≥80% 刷新率利用率。
✓ 一般：≥60% 刷新率利用率。
⚠ 较差：≥40% 刷新率利用率。
❌ 极差：<40% 刷新率利用率。`
    };
    
    /**
     * 构造函数
     * 创建性能报告渲染器实例
     */
    constructor() {
        // DOM 元素引用（通过 init 传入）
        this.elements = null;
    }
    
    /**
     * 初始化渲染器（接收容器，自己查找元素）
     * @param {HTMLElement} container - 渲染器容器元素
     * @returns {void}
     * @throws {Error} 当容器无效或关键元素缺失时立即抛出错误（Fail Fast）
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('PerformanceReportRenderer.init: container must be a valid HTMLElement');
        }
        
        // 子组件自己查找需要的元素（封装）
        this.elements = {
            reportEmptyState: container.querySelector('#reportEmptyState'),
            reportContent: container.querySelector('#reportContent'),
            reportTimestamp: container.querySelector('#reportTimestamp'),
            reportCompleteStatus: container.querySelector('#reportCompleteStatus'),
            entryReportSection: container.querySelector('#entryReportSection'),
            // 入场动画 - 核心指标卡片
            entryPerfLevel: container.querySelector('#entryPerfLevel'),
            entryAvgFPS: container.querySelector('#entryAvgFPS'),
            entryRefreshRateUtilization: container.querySelector('#entryRefreshRateUtilization'),
            // 入场动画 - 基本信息
            entryTotalDuration: container.querySelector('#entryTotalDuration'),
            entryTotalFrames: container.querySelector('#entryTotalFrames'),
            // 入场动画 - FPS详细分析
            entryActualAvgFPS: container.querySelector('#entryActualAvgFPS'),
            entryMinFPS: container.querySelector('#entryMinFPS'),
            entryMaxFPS: container.querySelector('#entryMaxFPS'),
            entryTheoreticalAvgFPS: container.querySelector('#entryTheoreticalAvgFPS'),
            entryTheoreticalMinFPS: container.querySelector('#entryTheoreticalMinFPS'),
            entryTheoreticalMaxFPS: container.querySelector('#entryTheoreticalMaxFPS'),
            // 入场动画 - 帧耗时
            entryAvgFrameTime: container.querySelector('#entryAvgFrameTime'),
            entryMinFrameTime: container.querySelector('#entryMinFrameTime'),
            entryMaxFrameTime: container.querySelector('#entryMaxFrameTime'),
            // 入场动画 - Canvas统计
            entryDrawImageTotal: container.querySelector('#entryDrawImageTotal'),
            entryDrawImageAvg: container.querySelector('#entryDrawImageAvg'),
            entryGetContextTotal: container.querySelector('#entryGetContextTotal'),
            entryGetContextAvg: container.querySelector('#entryGetContextAvg'),
            // 入场动画 - 耗时分解
            entryClearTime: container.querySelector('#entryClearTime'),
            entryCardTime: container.querySelector('#entryCardTime'),
            entryCanvasTime: container.querySelector('#entryCanvasTime'),
            entryBusinessTime: container.querySelector('#entryBusinessTime'),
            // 滚动动画
            scrollReportSection: container.querySelector('#scrollReportSection'),
            // 滚动动画 - 核心指标卡片
            scrollPerfLevel: container.querySelector('#scrollPerfLevel'),
            scrollAvgFPS: container.querySelector('#scrollAvgFPS'),
            scrollRefreshRateUtilization: container.querySelector('#scrollRefreshRateUtilization'),
            // 滚动动画 - 基本信息
            scrollTotalDuration: container.querySelector('#scrollTotalDuration'),
            scrollTotalFrames: container.querySelector('#scrollTotalFrames'),
            // 滚动动画 - FPS详细分析
            scrollActualAvgFPS: container.querySelector('#scrollActualAvgFPS'),
            scrollMinFPS: container.querySelector('#scrollMinFPS'),
            scrollMaxFPS: container.querySelector('#scrollMaxFPS'),
            scrollTheoreticalAvgFPS: container.querySelector('#scrollTheoreticalAvgFPS'),
            scrollTheoreticalMinFPS: container.querySelector('#scrollTheoreticalMinFPS'),
            scrollTheoreticalMaxFPS: container.querySelector('#scrollTheoreticalMaxFPS'),
            // 滚动动画 - 帧耗时
            scrollAvgFrameTime: container.querySelector('#scrollAvgFrameTime'),
            scrollMinFrameTime: container.querySelector('#scrollMinFrameTime'),
            scrollMaxFrameTime: container.querySelector('#scrollMaxFrameTime'),
            // 滚动动画 - Canvas统计
            scrollDrawImageTotal: container.querySelector('#scrollDrawImageTotal'),
            scrollDrawImageAvg: container.querySelector('#scrollDrawImageAvg'),
            scrollGetContextTotal: container.querySelector('#scrollGetContextTotal'),
            scrollGetContextAvg: container.querySelector('#scrollGetContextAvg')
        };
        
        // Fail Fast: 验证基础必需元素
        if (!this.elements.reportEmptyState) {
            throw new Error('PerformanceReportRenderer.init: #reportEmptyState not found in container');
        }
        if (!this.elements.reportContent) {
            throw new Error('PerformanceReportRenderer.init: #reportContent not found in container');
        }
        if (!this.elements.reportTimestamp) {
            throw new Error('PerformanceReportRenderer.init: #reportTimestamp not found in container');
        }
        if (!this.elements.scrollReportSection) {
            throw new Error('PerformanceReportRenderer.init: #scrollReportSection not found in container');
        }
        
        // Fail Fast: 只验证关键元素，其他元素在渲染时如果缺失会自然报错
        // 这样可以保持代码简洁，避免过多的样板代码
    }
    
    /**
     * 渲染性能报告
     * @param {Object|null} reportData - 性能报告数据（来自 state.debug.performance.lastReport）
     * @param {number} refreshRate - 当前使用的刷新率（Hz）
     * @returns {void}
     * @throws {Error} 当refreshRate无效时立即抛出错误（Fail Fast）
     */
    render(reportData, refreshRate) {
        // Fail Fast: 验证刷新率
        if (typeof refreshRate !== 'number' || refreshRate <= 0) {
            throw new Error(`PerformanceReportRenderer.render: refreshRate must be a positive number, got ${refreshRate}`);
        }
        
        // 如果没有报告数据，显示空状态
        if (!reportData) {
            this._showEmptyState();
            return;
        }
        
        // 显示报告内容
        this._showReportContent();
        
        // 更新时间戳和完整度状态
        this._updateTimestamp(reportData.timestamp);
        this._updateCompleteStatus(reportData.isComplete, reportData.wasInterrupted, reportData.interruptReason, reportData.playbackProgress);
        
        // 渲染入场动画报告（如果有）
        const hasEntryAnimation = reportData.entryAnimation && this.elements.entryReportSection;
        if (hasEntryAnimation) {
            this._renderEntryReport(reportData.entryAnimation, refreshRate, reportData.isComplete, reportData.wasInterrupted, reportData.interruptReason);
            this.elements.entryReportSection.classList.remove('hidden');
        } else if (this.elements.entryReportSection) {
            this.elements.entryReportSection.classList.add('hidden');
        }
        
        // 渲染滚动动画报告（传递hasEntryAnimation，用于控制占位符显示）
        this._renderScrollReport(reportData.scrollAnimation, refreshRate, reportData.isComplete, reportData.wasInterrupted, reportData.interruptReason, hasEntryAnimation);
    }
    
    /**
     * 显示空状态（无报告数据）
     * @returns {void}
     * @private
     */
    _showEmptyState() {
        this.elements.reportEmptyState.classList.remove('hidden');
        this.elements.reportContent.classList.add('hidden');
    }
    
    /**
     * 显示报告内容
     * @returns {void}
     * @private
     */
    _showReportContent() {
        this.elements.reportEmptyState.classList.add('hidden');
        this.elements.reportContent.classList.remove('hidden');
    }
    
    /**
     * 更新报告时间戳
     * @param {string} timestamp - 时间戳字符串
     * @returns {void}
     * @throws {Error} 当timestamp无效时立即抛出错误（Fail Fast）
     * @private
     */
    _updateTimestamp(timestamp) {
        // Fail Fast: 验证时间戳
        if (!timestamp || typeof timestamp !== 'string') {
            throw new Error(`PerformanceReportRenderer._updateTimestamp: timestamp must be a non-empty string, got ${typeof timestamp}`);
        }
        this.elements.reportTimestamp.textContent = timestamp;
    }
    
    /**
     * 更新完整度状态
     * @param {boolean} isComplete - 是否完整播放
     * @param {boolean} wasInterrupted - 是否检测到中断操作
     * @param {string|null} interruptReason - 中断原因：'pause'（暂停）、'reset'（重置）或 null
     * @param {number} playbackProgress - 播放进度百分比（0-100）
     * @returns {void}
     * @throws {Error} 当参数缺失或无效时立即抛出错误（Fail Fast）
     * @private
     */
    _updateCompleteStatus(isComplete, wasInterrupted, interruptReason, playbackProgress) {
        // Fail Fast: 验证所有参数
        if (typeof isComplete !== 'boolean') {
            throw new Error(`PerformanceReportRenderer._updateCompleteStatus: isComplete must be a boolean, got ${typeof isComplete}`);
        }
        if (typeof wasInterrupted !== 'boolean') {
            throw new Error(`PerformanceReportRenderer._updateCompleteStatus: wasInterrupted must be a boolean, got ${typeof wasInterrupted}`);
        }
        if (interruptReason !== null && typeof interruptReason !== 'string') {
            throw new Error(`PerformanceReportRenderer._updateCompleteStatus: interruptReason must be null or string, got ${typeof interruptReason}`);
        }
        if (interruptReason !== null && interruptReason !== 'pause' && interruptReason !== 'reset') {
            throw new Error(`PerformanceReportRenderer._updateCompleteStatus: interruptReason must be 'pause', 'reset' or null, got "${interruptReason}"`);
        }
        if (typeof playbackProgress !== 'number' || playbackProgress < 0 || playbackProgress > 100) {
            throw new Error(`PerformanceReportRenderer._updateCompleteStatus: playbackProgress must be a number between 0 and 100, got ${playbackProgress}`);
        }
        
        // Fail Fast: 验证逻辑一致性（如果检测到中断，必须有原因）
        if (wasInterrupted && interruptReason === null) {
            throw new Error('PerformanceReportRenderer._updateCompleteStatus: wasInterrupted is true but interruptReason is null');
        }
        
        // Fail Fast: 播放不完整时，必须有中断原因（业务规则：用户主动中断才会导致不完整）
        if (!isComplete && !wasInterrupted) {
            throw new Error('PerformanceReportRenderer._updateCompleteStatus: isComplete is false but wasInterrupted is also false. Incomplete playback must have an interrupt reason.');
        }
        
        if (isComplete) {
            // 播放完整（播放到100%）
            if (wasInterrupted) {
                if (interruptReason === 'pause') {
                    this.elements.reportCompleteStatus.textContent = '✓ 播放完整（但检测到暂停操作）。';
                } else if (interruptReason === 'reset') {
                    this.elements.reportCompleteStatus.textContent = '✓ 播放完整（但检测到重置操作）。';
                }
            } else {
                // 播放完整，无中断
                this.elements.reportCompleteStatus.textContent = '✓ 播放完整。';
            }
            this.elements.reportCompleteStatus.className = 'complete-status complete';
        } else {
            // 播放不完整（未达到100%）
            // 此时 wasInterrupted 必然为 true（已在上方验证）
            if (interruptReason === 'pause') {
                this.elements.reportCompleteStatus.textContent = `⚠ 播放不完整，播放进度：${playbackProgress}%，检测到有暂停操作。`;
            } else if (interruptReason === 'reset') {
                this.elements.reportCompleteStatus.textContent = `⚠ 播放不完整，播放进度：${playbackProgress}%，检测到有重置操作。`;
            }
            this.elements.reportCompleteStatus.className = 'complete-status incomplete';
        }
    }
    
    /**
     * 渲染入场动画性能报告
     * @param {Object} entryData - 入场动画性能数据
     * @param {number} refreshRate - 刷新率（Hz）
     * @param {boolean} isComplete - 是否完整播放完成
     * @param {boolean} wasInterrupted - 是否中断过
     * @param {string|null} interruptReason - 中断原因（'pause' 或 'reset'）
     * @returns {void}
     * @throws {Error} 当数据结构不完整时立即抛出错误（Fail Fast）
     * @private
     */
    _renderEntryReport(entryData, refreshRate, isComplete, wasInterrupted, interruptReason) {
        // Fail Fast: 验证数据结构完整性
        if (!entryData) {
            throw new Error('PerformanceReportRenderer._renderEntryReport: entryData is required');
        }
        if (!entryData.actualFPS || typeof entryData.actualFPS !== 'object') {
            throw new Error('PerformanceReportRenderer._renderEntryReport: entryData.actualFPS is required');
        }
        if (!entryData.theoreticalFPS || typeof entryData.theoreticalFPS !== 'object') {
            throw new Error('PerformanceReportRenderer._renderEntryReport: entryData.theoreticalFPS is required');
        }
        if (!entryData.drawImageCalls || typeof entryData.drawImageCalls !== 'object') {
            throw new Error('PerformanceReportRenderer._renderEntryReport: entryData.drawImageCalls is required');
        }
        if (!entryData.getContextCalls || typeof entryData.getContextCalls !== 'object') {
            throw new Error('PerformanceReportRenderer._renderEntryReport: entryData.getContextCalls is required');
        }
        // refreshRateUtilization可能为NaN/Infinity（数据不足时），这是正常情况，不报错
        if (typeof entryData.frameCount !== 'number') {
            throw new Error('PerformanceReportRenderer._renderEntryReport: entryData.frameCount must be a number');
        }
        if (typeof entryData.totalDuration !== 'number') {
            throw new Error('PerformanceReportRenderer._renderEntryReport: entryData.totalDuration must be a number');
        }
        if (typeof entryData.avgFrameTime !== 'number') {
            throw new Error('PerformanceReportRenderer._renderEntryReport: entryData.avgFrameTime must be a number');
        }
        if (typeof entryData.minFrameTime !== 'number') {
            throw new Error('PerformanceReportRenderer._renderEntryReport: entryData.minFrameTime must be a number');
        }
        if (typeof entryData.maxFrameTime !== 'number') {
            throw new Error('PerformanceReportRenderer._renderEntryReport: entryData.maxFrameTime must be a number');
        }
        
        // 渲染实际FPS
        const actualFPS = entryData.actualFPS;
        const perfLevel = getPerformanceLevel(actualFPS.avg, refreshRate);
        
        // 核心指标卡片
        this.elements.entryPerfLevel.textContent = perfLevel.level;
        this.elements.entryAvgFPS.textContent = formatFPS(actualFPS.avg);
        // 处理刷新率利用率（数据不足时显示"数据不足"）
        this.elements.entryRefreshRateUtilization.textContent = Number.isFinite(entryData.refreshRateUtilization) 
            ? formatPercentage(entryData.refreshRateUtilization, false) 
            : '数据不足';
        
        // 基本信息
        const entryDurationText = formatMilliseconds(entryData.totalDuration);
        this._renderDurationWithMismatch(this.elements.entryTotalDuration, entryDurationText, entryData.durationMismatch, isComplete, wasInterrupted, interruptReason);
        
        this.elements.entryTotalFrames.textContent = entryData.frameCount;
        
        // FPS详细分析
        this.elements.entryActualAvgFPS.textContent = formatFPS(actualFPS.avg);
        applyPerformanceColor(this.elements.entryActualAvgFPS, perfLevel.level);
        this.elements.entryMinFPS.textContent = formatFPS(actualFPS.min);
        this.elements.entryMaxFPS.textContent = formatFPS(actualFPS.max);
        
        const theoreticalFPS = entryData.theoreticalFPS;
        this.elements.entryTheoreticalAvgFPS.textContent = formatFPS(theoreticalFPS.avg);
        this.elements.entryTheoreticalMinFPS.textContent = formatFPS(theoreticalFPS.min);
        this.elements.entryTheoreticalMaxFPS.textContent = formatFPS(theoreticalFPS.max);
        
        // 渲染帧耗时
        this.elements.entryAvgFrameTime.textContent = formatMilliseconds(entryData.avgFrameTime);
        this.elements.entryMinFrameTime.textContent = formatMilliseconds(entryData.minFrameTime);
        this.elements.entryMaxFrameTime.textContent = formatMilliseconds(entryData.maxFrameTime);
        
        // 渲染Canvas调用统计
        const drawImageCalls = entryData.drawImageCalls;
        this.elements.entryDrawImageTotal.textContent = drawImageCalls.total;
        this.elements.entryDrawImageAvg.textContent = drawImageCalls.avg.toFixed(2);
        
        const getContextCalls = entryData.getContextCalls;
        this.elements.entryGetContextTotal.textContent = getContextCalls.total;
        this.elements.entryGetContextAvg.textContent = getContextCalls.avg.toFixed(2);
        
        // 如果getContext > 0，添加警告样式（说明代码有问题，每帧重复获取上下文）
        if (getContextCalls.total > 0) {
            this.elements.entryGetContextTotal.classList.add('metric-value-warning');
            this.elements.entryGetContextAvg.classList.add('metric-value-warning');
        } else {
            this.elements.entryGetContextTotal.classList.remove('metric-value-warning');
            this.elements.entryGetContextAvg.classList.remove('metric-value-warning');
        }
        
        // 渲染耗时分解
        this._renderEntryTimeBreakdown(entryData);
        
        // 更新 Tooltip（动态填充实际数据）
        this._updateEntryTooltips(entryData, refreshRate);
    }
    
    /**
     * 渲染入场动画耗时分解
     * @param {Object} entryData - 入场动画性能数据
     * @returns {void}
     * @throws {Error} 当数据结构不完整时立即抛出错误（Fail Fast）
     * @private
     */
    _renderEntryTimeBreakdown(entryData) {
        const { entryClearTime, entryCardTime, entryCanvasTime, entryBusinessTime } = this.elements;
        const avgFrameTime = entryData.avgFrameTime; // avgFrameTime已在调用前验证
        
        // 检查是否有细分耗时数据（timingBreakdown是可选字段）
        if (entryData.timingBreakdown) {
            const breakdown = entryData.timingBreakdown;
            
            // Fail Fast: 验证 timingBreakdown 结构完整性
            if (typeof breakdown.clearTime !== 'number') {
                throw new Error('PerformanceReportRenderer._renderEntryTimeBreakdown: breakdown.clearTime must be a number');
            }
            if (typeof breakdown.cardTime !== 'number') {
                throw new Error('PerformanceReportRenderer._renderEntryTimeBreakdown: breakdown.cardTime must be a number');
            }
            if (typeof breakdown.canvasTime !== 'number') {
                throw new Error('PerformanceReportRenderer._renderEntryTimeBreakdown: breakdown.canvasTime must be a number');
            }
            if (typeof breakdown.businessTime !== 'number') {
                throw new Error('PerformanceReportRenderer._renderEntryTimeBreakdown: breakdown.businessTime must be a number');
            }
            
            // 清屏耗时
            const clearTime = breakdown.clearTime;
            const clearPercent = clearTime / avgFrameTime;
            entryClearTime.textContent = `${formatMilliseconds(clearTime)} (${formatPercentage(clearPercent, true)})`;
            
            // 卡片绘制耗时
            const cardTime = breakdown.cardTime;
            const cardPercent = cardTime / avgFrameTime;
            entryCardTime.textContent = `${formatMilliseconds(cardTime)} (${formatPercentage(cardPercent, true)})`;
            
            // Canvas操作总耗时
            const canvasTime = breakdown.canvasTime;
            const canvasPercent = canvasTime / avgFrameTime;
            entryCanvasTime.textContent = `${formatMilliseconds(canvasTime)} (${formatPercentage(canvasPercent, true)})`;
            
            // 业务逻辑耗时
            const businessTime = breakdown.businessTime;
            const businessPercent = businessTime / avgFrameTime;
            entryBusinessTime.textContent = `${formatMilliseconds(businessTime)} (${formatPercentage(businessPercent, true)})`;
        } else {
            // 没有细分耗时数据时显示为 N/A（合理的可选字段处理）
            entryClearTime.textContent = 'N/A';
            entryCardTime.textContent = 'N/A';
            entryCanvasTime.textContent = 'N/A';
            entryBusinessTime.textContent = 'N/A';
        }
    }
    
    /**
     * 渲染滚动动画性能报告
     * @param {Object|null} scrollData - 滚动动画性能数据（如果在入场动画期间中断则为null）
     * @param {number} refreshRate - 刷新率（Hz）
     * @param {boolean} isComplete - 是否完整播放完成
     * @param {boolean} wasInterrupted - 是否中断过
     * @param {string|null} interruptReason - 中断原因（'pause' | 'reset' | null）
     * @param {boolean} hasEntryAnimation - 是否有入场动画报告（用于控制占位符显示）
     * @returns {void}
     * @throws {Error} 当数据结构不完整或参数无效时立即抛出错误（Fail Fast）
     * @private
     */
    _renderScrollReport(scrollData, refreshRate, isComplete, wasInterrupted, interruptReason, hasEntryAnimation) {
        // 🆕 控制FPS说明显示位置：
        // - 有入场动画：FPS说明在入场列，占位符在滚动列用于对齐
        // - 无入场动画：FPS说明移到滚动列的占位符位置
        const fpsPlaceholder = document.querySelector('.fps-shared-placeholder');
        if (!fpsPlaceholder) {
            throw new Error('PerformanceReportRenderer._renderScrollReport: .fps-shared-placeholder not found');
        }
        const fpsExplanationElement = document.querySelector('.fps-shared-explanation');
        if (!fpsExplanationElement) {
            throw new Error('PerformanceReportRenderer._renderScrollReport: .fps-shared-explanation not found');
        }
        
        if (hasEntryAnimation) {
            // 有入场动画：占位符仅用于对齐，保持不可见
            fpsPlaceholder.classList.remove('hidden');
            fpsPlaceholder.classList.add('placeholder-only'); // 添加占位符专用class（不可见但占空间）
            fpsPlaceholder.innerHTML = ''; // 清空占位符内容
        } else {
            // 无入场动画：将FPS说明内容复制到占位符位置，并使其可见
            fpsPlaceholder.classList.remove('hidden');
            fpsPlaceholder.classList.remove('placeholder-only'); // 移除占位符class，使内容可见
            fpsPlaceholder.innerHTML = fpsExplanationElement.innerHTML; // 复制说明内容到占位符
        }
        
        // 处理在入场动画期间中断的情况
        if (scrollData === null) {
            // Fail Fast: 验证interruptReason有效性
            if (interruptReason !== 'pause' && interruptReason !== 'reset') {
                throw new Error(`PerformanceReportRenderer._renderScrollReport: When scrollData is null, interruptReason must be 'pause' or 'reset', got ${interruptReason}`);
            }
            
            // 获取模板并clone
            const template = document.querySelector('#performance-report-no-data-template');
            if (!template) {
                throw new Error('PerformanceReportRenderer._renderScrollReport: performance-report-no-data-template not found');
            }
            const noDataElement = template.content.cloneNode(true);
            
            // 根据interruptReason替换{reason}占位符
            const reasonText = interruptReason === 'pause' ? '暂停' : '重置';
            const messageElement = noDataElement.querySelector('.no-data-message');
            if (!messageElement) {
                throw new Error('PerformanceReportRenderer._renderScrollReport: .no-data-message element not found in template');
            }
            messageElement.textContent = messageElement.textContent.replace('{reason}', reasonText);
            
            // 清空并插入无数据提示
            this.elements.scrollReportSection.innerHTML = '';
            this.elements.scrollReportSection.appendChild(noDataElement);
            
            // 🆕 移除FPS说明的横跨样式（因为右侧无数据，横跨会造成布局混乱）
            const fpsExplanation = document.querySelector('.fps-shared-explanation');
            if (!fpsExplanation) {
                throw new Error('PerformanceReportRenderer._renderScrollReport: .fps-shared-explanation not found');
            }
            fpsExplanation.classList.add('single-column');
            return;
        }
        
        // Fail Fast: 验证数据结构完整性
        if (!scrollData) {
            throw new Error('PerformanceReportRenderer._renderScrollReport: scrollData is required');
        }
        if (!scrollData.actualFPS || typeof scrollData.actualFPS !== 'object') {
            throw new Error('PerformanceReportRenderer._renderScrollReport: scrollData.actualFPS is required');
        }
        if (!scrollData.theoreticalFPS || typeof scrollData.theoreticalFPS !== 'object') {
            throw new Error('PerformanceReportRenderer._renderScrollReport: scrollData.theoreticalFPS is required');
        }
        if (!scrollData.drawImageCalls || typeof scrollData.drawImageCalls !== 'object') {
            throw new Error('PerformanceReportRenderer._renderScrollReport: scrollData.drawImageCalls is required');
        }
        if (!scrollData.getContextCalls || typeof scrollData.getContextCalls !== 'object') {
            throw new Error('PerformanceReportRenderer._renderScrollReport: scrollData.getContextCalls is required');
        }
        // refreshRateUtilization可能为NaN/Infinity（数据不足时），这是正常情况，不报错
        if (typeof scrollData.frameCount !== 'number') {
            throw new Error('PerformanceReportRenderer._renderScrollReport: scrollData.frameCount must be a number');
        }
        if (typeof scrollData.totalDuration !== 'number') {
            throw new Error('PerformanceReportRenderer._renderScrollReport: scrollData.totalDuration must be a number');
        }
        if (typeof scrollData.avgFrameTime !== 'number') {
            throw new Error('PerformanceReportRenderer._renderScrollReport: scrollData.avgFrameTime must be a number');
        }
        if (typeof scrollData.minFrameTime !== 'number') {
            throw new Error('PerformanceReportRenderer._renderScrollReport: scrollData.minFrameTime must be a number');
        }
        if (typeof scrollData.maxFrameTime !== 'number') {
            throw new Error('PerformanceReportRenderer._renderScrollReport: scrollData.maxFrameTime must be a number');
        }
        
        // 🆕 恢复FPS说明的横跨样式（右侧有数据，需要横跨两列）
        const fpsExplanation = document.querySelector('.fps-shared-explanation');
        if (!fpsExplanation) {
            throw new Error('PerformanceReportRenderer._renderScrollReport: .fps-shared-explanation not found');
        }
        fpsExplanation.classList.remove('single-column');
        
        // 渲染实际FPS
        const actualFPSData = scrollData.actualFPS;
        const perfLevelData = getPerformanceLevel(actualFPSData.avg, refreshRate);
        
        // 核心指标卡片
        this.elements.scrollPerfLevel.textContent = perfLevelData.level;
        this.elements.scrollAvgFPS.textContent = formatFPS(actualFPSData.avg);
        // 处理刷新率利用率（数据不足时显示"数据不足"）
        this.elements.scrollRefreshRateUtilization.textContent = Number.isFinite(scrollData.refreshRateUtilization) 
            ? formatPercentage(scrollData.refreshRateUtilization, false) 
            : '数据不足';
        
        // 基本信息
        const scrollDurationText = formatMilliseconds(scrollData.totalDuration);
        this._renderDurationWithMismatch(this.elements.scrollTotalDuration, scrollDurationText, scrollData.durationMismatch, isComplete, wasInterrupted, interruptReason);
        
        this.elements.scrollTotalFrames.textContent = scrollData.frameCount;
        
        // FPS详细分析
        this.elements.scrollActualAvgFPS.textContent = formatFPS(actualFPSData.avg);
        applyPerformanceColor(this.elements.scrollActualAvgFPS, perfLevelData.level);
        this.elements.scrollMinFPS.textContent = formatFPS(actualFPSData.min);
        this.elements.scrollMaxFPS.textContent = formatFPS(actualFPSData.max);
        
        const theoreticalFPSData = scrollData.theoreticalFPS;
        this.elements.scrollTheoreticalAvgFPS.textContent = formatFPS(theoreticalFPSData.avg);
        this.elements.scrollTheoreticalMinFPS.textContent = formatFPS(theoreticalFPSData.min);
        this.elements.scrollTheoreticalMaxFPS.textContent = formatFPS(theoreticalFPSData.max);
        
        // 渲染帧耗时
        this.elements.scrollAvgFrameTime.textContent = formatMilliseconds(scrollData.avgFrameTime);
        this.elements.scrollMinFrameTime.textContent = formatMilliseconds(scrollData.minFrameTime);
        this.elements.scrollMaxFrameTime.textContent = formatMilliseconds(scrollData.maxFrameTime);
        
        // 渲染Canvas调用统计
        const drawImageCalls = scrollData.drawImageCalls;
        this.elements.scrollDrawImageTotal.textContent = drawImageCalls.total;
        this.elements.scrollDrawImageAvg.textContent = drawImageCalls.avg.toFixed(2);
        
        const getContextCalls = scrollData.getContextCalls;
        this.elements.scrollGetContextTotal.textContent = getContextCalls.total;
        this.elements.scrollGetContextAvg.textContent = getContextCalls.avg.toFixed(2);
        
        // 如果getContext > 0，添加警告样式（说明代码有问题，每帧重复获取上下文）
        if (getContextCalls.total > 0) {
            this.elements.scrollGetContextTotal.classList.add('metric-value-warning');
            this.elements.scrollGetContextAvg.classList.add('metric-value-warning');
        } else {
            this.elements.scrollGetContextTotal.classList.remove('metric-value-warning');
            this.elements.scrollGetContextAvg.classList.remove('metric-value-warning');
        }
        
        // 更新 Tooltip（动态填充实际数据）
        this._updateScrollTooltips(scrollData, refreshRate);
    }
    
    /**
     * 填充 Tooltip 模板（将占位符替换为实际值）
     * @param {string} template - 模板字符串（包含 {placeholder} 占位符）
     * @param {Object} values - 替换值对象 { placeholder: value }
     * @returns {string} 填充后的字符串
     * @private
     */
    _fillTooltipTemplate(template, values) {
        return template.replace(/\{(\w+)\}/g, (match, key) => {
            return values[key] !== undefined ? values[key] : match;
        });
    }
    
    /**
     * 转义HTML特殊字符（用于安全地插入HTML属性）
     * 
     * 设计说明：
     * - 将可能破坏HTML结构的特殊字符转换为HTML实体
     * - 用于 innerHTML 或 data-tooltip 属性中的文本内容
     * - 必须先转义 & 字符，因为其他转义会产生 & 字符
     * 
     * @param {string} text - 要转义的文本（如 Tooltip 内容）
     * @returns {string} 转义后的安全文本
     * @private
     * 
     * @example
     * _escapeHtml('A & B < C')  // 返回 'A &amp; B &lt; C'
     * _escapeHtml('"Hello"')    // 返回 '&quot;Hello&quot;'
     */
    _escapeHtml(text) {
        // 链式替换特殊字符为HTML实体（/g = 全局替换）
        // 1. & → &amp;   (必须第一个，避免二次转义)
        // 2. < → &lt;    (小于号，防止解析为HTML标签)
        // 3. > → &gt;    (大于号，防止解析为HTML标签)
        // 4. " → &quot;  (双引号，防止破坏HTML属性)
        // 5. ' → &#39;   (单引号，防止破坏HTML属性)
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 渲染带有时长差异提示的时长显示
     * 
     * @param {HTMLElement} element - 要更新的DOM元素
     * @param {string} durationText - 格式化后的时长文本
     * @param {Object|null} durationMismatch - 时长差异数据（如果有）
     * @param {boolean} isComplete - 是否完整播放完成
     * @param {boolean} wasInterrupted - 是否中断过
     * @param {string|null} interruptReason - 中断原因（'pause' 或 'reset'）
     * @private
     */
    _renderDurationWithMismatch(element, durationText, durationMismatch, isComplete, wasInterrupted, interruptReason) {
        // 只有完整播放完成时才显示时长差异提示
        if (isComplete && durationMismatch) {
            const tooltipText = this._generateDurationMismatchTooltip(durationMismatch, isComplete, wasInterrupted, interruptReason);
            element.innerHTML = `${durationText} <span class="tooltip-trigger" data-tooltip="${this._escapeHtml(tooltipText)}">ⓘ</span>`;
        } else {
            element.textContent = durationText;
        }
    }
    
    /**
     * 生成理论平均FPS的 Tooltip
     * @param {Object} data - 性能数据 { avgFrameTime, theoreticalFPS }
     * @returns {string} Tooltip内容
     * @private
     */
    _generateTheoreticalAvgFPSTooltip(data) {
        const { avgFrameTime, theoreticalFPS } = data;
        return this._fillTooltipTemplate(
            PerformanceReportRenderer.TOOLTIP_TEMPLATES.theoreticalAvgFPS,
            {
                avgFrameTime: avgFrameTime.toFixed(2),
                theoreticalAvgFPS: formatFPS(theoreticalFPS.avg)
            }
        );
    }
    
    /**
     * 生成理论最小FPS的 Tooltip
     * @param {Object} data - 性能数据 { maxFrameTime, theoreticalFPS }
     * @returns {string} Tooltip内容
     * @private
     */
    _generateTheoreticalMinFPSTooltip(data) {
        const { maxFrameTime, theoreticalFPS } = data;
        return this._fillTooltipTemplate(
            PerformanceReportRenderer.TOOLTIP_TEMPLATES.theoreticalMinFPS,
            {
                maxFrameTime: maxFrameTime.toFixed(2),
                theoreticalMinFPS: formatFPS(theoreticalFPS.min)
            }
        );
    }
    
    /**
     * 生成理论最大FPS的 Tooltip（处理异常帧情况）
     * @param {Object} data - 性能数据 { theoreticalFPS, minFrameTime, minFrameTimeFiltered, hasAnomalousFrames }
     * @returns {string} Tooltip内容
     * @private
     */
    _generateTheoreticalMaxFPSTooltip(data) {
        const { theoreticalFPS, minFrameTime, minFrameTimeFiltered, hasAnomalousFrames } = data;
        
        if (hasAnomalousFrames) {
            // 有异常帧：添加特殊说明
            const anomalousNote = this._fillTooltipTemplate(
                PerformanceReportRenderer.TOOLTIP_TEMPLATES.theoreticalMaxFPSAnomalous,
                {}
            );
            return this._fillTooltipTemplate(
                PerformanceReportRenderer.TOOLTIP_TEMPLATES.theoreticalMaxFPS,
                {
                    anomalousNote: anomalousNote,
                    minFrameTime: minFrameTimeFiltered.toFixed(2),
                    theoreticalMaxFPS: formatFPS(theoreticalFPS.max)
                }
            );
        } else {
            // 无异常帧：正常说明
            return this._fillTooltipTemplate(
                PerformanceReportRenderer.TOOLTIP_TEMPLATES.theoreticalMaxFPS,
                {
                    anomalousNote: '',
                    minFrameTime: minFrameTime.toFixed(2),
                    theoreticalMaxFPS: formatFPS(theoreticalFPS.max)
                }
            );
        }
    }
    
    /**
     * 生成帧耗时分析的 Tooltip
     * @returns {string} Tooltip内容
     * @private
     */
    _generateFrameTimeTooltip() {
        return PerformanceReportRenderer.TOOLTIP_TEMPLATES.frameTimeAnalysis;
    }
    
    /**
     * 生成时长差异的 Tooltip 内容
     * @param {Object} mismatch - 时长差异数据
     * @param {number} mismatch.expected - 预期时长（毫秒）
     * @param {number} mismatch.actual - 实际时长（毫秒）
     * @param {number} mismatch.difference - 差异（毫秒）
     * @param {number} mismatch.percentage - 差异百分比
     * @param {boolean} isComplete - 是否完整播放完成
     * @param {boolean} wasInterrupted - 是否中断过
     * @param {string|null} interruptReason - 中断原因（'pause' 或 'reset'）
     * @returns {string} Tooltip内容
     * @private
     */
    _generateDurationMismatchTooltip(mismatch, isComplete, wasInterrupted, interruptReason) {
        // 如果用户暂停后继续播放并完成，添加额外说明
        let pauseNote = '';
        if (isComplete && wasInterrupted && interruptReason === 'pause') {
            pauseNote = `

⚠️ 为什么暂停后继续播放，误差会比不暂停直接播放大？

暂停后恢复播放时，需要根据当前位置反推已消耗时间。反推过程涉及浮点运算，会引入精度误差。缓动动画（ease-in、ease-out等）需要平方根、立方根等复杂运算，误差更明显。暂停次数越多，累积误差越大。`;
        }
        
        return this._fillTooltipTemplate(
            PerformanceReportRenderer.TOOLTIP_TEMPLATES.durationMismatch,
            {
                expectedDuration: formatMilliseconds(mismatch.expected),
                actualDuration: formatMilliseconds(mismatch.actual),
                difference: `${mismatch.difference > 0 ? '+' : ''}${formatMilliseconds(Math.abs(mismatch.difference))}`,
                percentage: `${mismatch.percentage > 0 ? '+' : ''}${mismatch.percentage.toFixed(2)}`,
                pauseNote: pauseNote
            }
        );
    }

    /**
     * 生成刷新率利用率的 Tooltip 内容
     * @param {Object} data - 性能数据
     * @param {number} data.actualAvgFPS - 实际平均FPS
     * @param {number} data.refreshRate - 屏幕刷新率（Hz）
     * @param {number} data.utilization - 利用率百分比
     * @returns {string} Tooltip内容
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     * @private
     */
    _generateRefreshRateUtilizationTooltip(data) {
        // Fail Fast: 验证参数
        if (typeof data.refreshRate !== 'number' || !Number.isFinite(data.refreshRate)) {
            throw new Error(`PerformanceReportRenderer._generateRefreshRateUtilizationTooltip: refreshRate must be a finite number, got ${data.refreshRate}`);
        }
        
        // 数据不足时返回特殊提示
        if (typeof data.utilization !== 'number' || !Number.isFinite(data.utilization)) {
            return `刷新率利用率：数据不足。

播放时间过短，无法准确计算刷新率利用率。
建议播放更长时间（至少5秒）以获得准确的性能数据。`;
        }
        
        return this._fillTooltipTemplate(
            PerformanceReportRenderer.TOOLTIP_TEMPLATES.refreshRateUtilization,
            {
                actualAvgFPS: formatFPS(data.actualAvgFPS),
                refreshRate: data.refreshRate,
                utilization: data.utilization.toFixed(1)
            }
        );
    }

    /**
     * 生成总帧数的 Tooltip 内容
     * @returns {string} Tooltip内容
     * @private
     */
    _generateTotalFramesTooltip() {
        return PerformanceReportRenderer.TOOLTIP_TEMPLATES.totalFrames;
    }
    
    /**
     * 更新指定元素的 Tooltip
     * @param {HTMLElement} container - 包含 .tooltip-trigger 的容器元素
     * @param {string} tooltipContent - Tooltip 内容
     * @returns {void}
     * @throws {Error} 当 container 无效或 .tooltip-trigger 不存在时抛出错误（Fail Fast）
     * @private
     */
    _updateTooltip(container, tooltipContent) {
        // Fail Fast: 验证 container 存在
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('PerformanceReportRenderer._updateTooltip: container must be a valid HTMLElement');
        }
        
        const trigger = container.querySelector('.tooltip-trigger');
        
        // Fail Fast: 验证 trigger 存在
        if (!trigger) {
            throw new Error('PerformanceReportRenderer._updateTooltip: .tooltip-trigger not found in container');
        }
        
        trigger.dataset.tooltip = tooltipContent;
    }
    
    /**
     * 更新入场动画的所有 Tooltip
     * @param {Object} entryData - 入场动画性能数据
     * @param {number} refreshRate - 刷新率（Hz）
     * @returns {void}
     * @private
     */
    _updateEntryTooltips(entryData, refreshRate) {
        const { theoreticalFPS, avgFrameTime, minFrameTime, maxFrameTime, minFrameTimeFiltered, hasAnomalousFrames, actualFPS, refreshRateUtilization } = entryData;
        
        // 性能等级
        const perfLevelLabel = this.elements.entryPerfLevel.previousElementSibling;
        this._updateTooltip(perfLevelLabel, PerformanceReportRenderer.TOOLTIP_TEMPLATES.perfLevel);
        
        // 理论平均FPS
        const avgFPSTooltip = this._generateTheoreticalAvgFPSTooltip({ avgFrameTime, theoreticalFPS });
        this._updateTooltip(this.elements.entryTheoreticalAvgFPS.parentElement, avgFPSTooltip);
        
        // 理论最小FPS
        const minFPSTooltip = this._generateTheoreticalMinFPSTooltip({ maxFrameTime, theoreticalFPS });
        this._updateTooltip(this.elements.entryTheoreticalMinFPS.parentElement, minFPSTooltip);
        
        // 理论最大FPS
        const maxFPSTooltip = this._generateTheoreticalMaxFPSTooltip({
            theoreticalFPS,
            minFrameTime,
            minFrameTimeFiltered,
            hasAnomalousFrames
        });
        this._updateTooltip(this.elements.entryTheoreticalMaxFPS.parentElement, maxFPSTooltip);
        
        // 帧耗时分析
        const frameTimeTooltip = this._generateFrameTimeTooltip();
        const frameTimeTitle = this.elements.entryAvgFrameTime.closest('.metric-group').querySelector('.group-title');
        this._updateTooltip(frameTimeTitle, frameTimeTooltip);
        
        // Canvas调用统计（入场动画）
        const canvasCallsTitle = this.elements.entryDrawImageTotal.closest('.metric-group').querySelector('.group-title');
        this._updateTooltip(canvasCallsTitle, PerformanceReportRenderer.TOOLTIP_TEMPLATES.canvasCallsEntry);
        
        // 刷新率利用率
        const utilizationTooltip = this._generateRefreshRateUtilizationTooltip({
            actualAvgFPS: actualFPS.avg,
            refreshRate: refreshRate,
            utilization: refreshRateUtilization
        });
        const utilizationLabel = this.elements.entryRefreshRateUtilization.previousElementSibling;
        this._updateTooltip(utilizationLabel, utilizationTooltip);
        
        // 总帧数
        const framesTooltip = this._generateTotalFramesTooltip();
        this._updateTooltip(this.elements.entryTotalFrames.parentElement, framesTooltip);
    }
    
    /**
     * 更新滚动动画的所有 Tooltip
     * @param {Object} scrollData - 滚动动画性能数据
     * @param {number} refreshRate - 刷新率（Hz）
     * @returns {void}
     * @private
     */
    _updateScrollTooltips(scrollData, refreshRate) {
        const { theoreticalFPS, avgFrameTime, minFrameTime, maxFrameTime, minFrameTimeFiltered, hasAnomalousFrames, actualFPS, refreshRateUtilization } = scrollData;
        
        // 性能等级
        const perfLevelLabel = this.elements.scrollPerfLevel.previousElementSibling;
        this._updateTooltip(perfLevelLabel, PerformanceReportRenderer.TOOLTIP_TEMPLATES.perfLevel);
        
        // 理论平均FPS
        const avgFPSTooltip = this._generateTheoreticalAvgFPSTooltip({ avgFrameTime, theoreticalFPS });
        this._updateTooltip(this.elements.scrollTheoreticalAvgFPS.parentElement, avgFPSTooltip);
        
        // 理论最小FPS
        const minFPSTooltip = this._generateTheoreticalMinFPSTooltip({ maxFrameTime, theoreticalFPS });
        this._updateTooltip(this.elements.scrollTheoreticalMinFPS.parentElement, minFPSTooltip);
        
        // 理论最大FPS
        const maxFPSTooltip = this._generateTheoreticalMaxFPSTooltip({
            theoreticalFPS,
            minFrameTime,
            minFrameTimeFiltered,
            hasAnomalousFrames
        });
        this._updateTooltip(this.elements.scrollTheoreticalMaxFPS.parentElement, maxFPSTooltip);
        
        // 帧耗时分析
        const frameTimeTooltip = this._generateFrameTimeTooltip();
        const frameTimeTitle = this.elements.scrollAvgFrameTime.closest('.metric-group').querySelector('.group-title');
        this._updateTooltip(frameTimeTitle, frameTimeTooltip);
        
        // Canvas调用统计（滚动动画）
        const canvasCallsTitle = this.elements.scrollDrawImageTotal.closest('.metric-group').querySelector('.group-title');
        this._updateTooltip(canvasCallsTitle, PerformanceReportRenderer.TOOLTIP_TEMPLATES.canvasCallsScroll);
        
        // 刷新率利用率
        const utilizationTooltip = this._generateRefreshRateUtilizationTooltip({
            actualAvgFPS: actualFPS.avg,
            refreshRate: refreshRate,
            utilization: refreshRateUtilization
        });
        const utilizationLabel = this.elements.scrollRefreshRateUtilization.previousElementSibling;
        this._updateTooltip(utilizationLabel, utilizationTooltip);
        
        // 总帧数
        const framesTooltip = this._generateTotalFramesTooltip();
        this._updateTooltip(this.elements.scrollTotalFrames.parentElement, framesTooltip);
    }
    
    /**
     * 销毁组件（清理引用）
     * @returns {void}
     */
    destroy() {
        this.elements = null;
    }
}


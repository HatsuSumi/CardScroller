/**
 * PerformanceVisualizationPanel - 性能数据可视化面板
 * 
 * 使用ECharts渲染性能数据图表，包括帧率分布、帧时间趋势、稳定性分析等。
 * 
 * 当前依赖的模块：
 * - ECharts (外部CDN库)
 * - getStabilityRating (helpers/performanceUtils.js) - 稳定性评级函数
 * 
 * 当前被使用的模块：
 * - PerformanceReportPage (ui/PerformanceReportPage.js) - 创建和管理可视化面板实例
 */
import { getStabilityRating } from '../../helpers/performanceUtils.js';

export class PerformanceVisualizationPanel {
    /**
     * @param {HTMLElement} container - 可视化面板容器元素
     */
    constructor(container) {
        // Fail Fast: 容器必须存在
        if (!container) {
            throw new Error('PerformanceVisualizationPanel: Container element is required');
        }

        // Fail Fast: ECharts必须已加载
        if (typeof echarts === 'undefined') {
            throw new Error('PerformanceVisualizationPanel: ECharts library is not loaded');
        }

        /**
         * 容器元素
         * @type {HTMLElement}
         */
        this.container = container;

        /**
         * ECharts图表实例存储
         * @type {Object.<string, echarts.ECharts>}
         */
        this.charts = {};
    }

    /**
     * 渲染所有图表
     * 
     * @param {Object} reportData - 性能报告数据
     * @param {Object} [reportData.entryAnimation] - 入场动画数据
     * @param {Object} [reportData.scrollAnimation] - 滚动动画数据
     * @param {number} refreshRate - 目标刷新率
     * @returns {void}
     */
    renderCharts(reportData, refreshRate) {
        // Fail Fast: 报告数据必须存在
        if (!reportData) {
            throw new Error('PerformanceVisualizationPanel: Report data is required');
        }
        
        // Fail Fast: 刷新率必须是正数
        if (typeof refreshRate !== 'number' || refreshRate <= 0) {
            throw new Error(`PerformanceVisualizationPanel: refreshRate must be a positive number, got ${refreshRate}`);
        }

        // 清空现有图表
        this.destroy();

        const hasEntry = !!reportData.entryAnimation;
        const hasScroll = !!reportData.scrollAnimation;

        // 获取容器元素
        const entrySection = document.querySelector('.entry-charts-section');
        const scrollSection = document.querySelector('.scroll-charts-section');

        // Fail Fast: 容器元素必须存在
        if (!entrySection) {
            throw new Error('PerformanceVisualizationPanel: Entry charts section not found');
        }
        if (!scrollSection) {
            throw new Error('PerformanceVisualizationPanel: Scroll charts section not found');
        }

        // 根据数据控制容器显示/隐藏
        if (hasEntry) {
            entrySection.classList.remove('hidden');
            this._renderEntryCharts(reportData.entryAnimation, refreshRate);
        } else {
            entrySection.classList.add('hidden');
        }

        if (hasScroll) {
            scrollSection.classList.remove('hidden');
            this._renderScrollCharts(reportData.scrollAnimation, refreshRate);
        } else {
            scrollSection.classList.add('hidden');
        }
    }

    /**
     * 渲染入场动画图表
     * 
     * @param {Object} data - 入场动画数据
     * @param {number} refreshRate - 目标刷新率
     * @returns {void}
     * @throws {Error} 当数据缺失时立即抛出错误（Fail Fast）
     * @private
     */
    _renderEntryCharts(data, refreshRate) {
        // Fail Fast: 验证必需数据
        if (!data) {
            throw new Error('PerformanceVisualizationPanel._renderEntryCharts: data is required');
        }
        if (!Array.isArray(data.frames) || data.frames.length === 0) {
            throw new Error('PerformanceVisualizationPanel._renderEntryCharts: data.frames must be a non-empty array');
        }
        
        const entrySection = this.container.querySelector('.entry-charts-section');
        if (!entrySection) return;

        entrySection.classList.remove('hidden');

        // 帧率分布直方图
        this._renderFPSDistribution('entry-fps-distribution', data, refreshRate);

        // 帧时间趋势折线图
        this._renderFrameTimeTrend('entry-frametime-trend', data);

        // 帧率稳定性雷达图
        this._renderStabilityRadar('entry-stability-radar', data, refreshRate);

        // 帧掉落分析饼图
        this._renderFrameDropPie('entry-framedrop-pie', data);

        // 百分位数柱状图
        this._renderPercentileChart('entry-percentile-chart', data);

        // FPS对比图
        this._renderFPSComparisonChart('entry-fps-comparison-chart', data, refreshRate);
    }

    /**
     * 渲染滚动动画图表
     * 
     * @param {Object} data - 滚动动画数据
     * @param {number} refreshRate - 目标刷新率
     * @returns {void}
     * @throws {Error} 当数据缺失时立即抛出错误（Fail Fast）
     * @private
     */
    _renderScrollCharts(data, refreshRate) {
        // Fail Fast: 验证必需数据
        if (!data) {
            throw new Error('PerformanceVisualizationPanel._renderScrollCharts: data is required');
        }
        if (!Array.isArray(data.frames) || data.frames.length === 0) {
            throw new Error('PerformanceVisualizationPanel._renderScrollCharts: data.frames must be a non-empty array');
        }
        
        const scrollSection = this.container.querySelector('.scroll-charts-section');
        if (!scrollSection) return;

        scrollSection.classList.remove('hidden');

        // 帧率分布直方图
        this._renderFPSDistribution('scroll-fps-distribution', data, refreshRate);

        // 帧时间趋势折线图
        this._renderFrameTimeTrend('scroll-frametime-trend', data);

        // 帧率稳定性雷达图
        this._renderStabilityRadar('scroll-stability-radar', data, refreshRate);

        // 帧掉落分析饼图
        this._renderFrameDropPie('scroll-framedrop-pie', data);

        // 百分位数柱状图
        this._renderPercentileChart('scroll-percentile-chart', data);

        // FPS对比图
        this._renderFPSComparisonChart('scroll-fps-comparison-chart', data, refreshRate);
    }

    /**
     * 渲染帧率分布直方图
     * 
     * @param {string} elementId - 图表容器元素ID
     * @param {Object} data - 动画数据
     * @param {number} refreshRate - 目标刷新率
     * @returns {void}
     * @private
     */
    _renderFPSDistribution(elementId, data, refreshRate) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const chart = echarts.init(element);
        
        // 根据刷新率动态生成FPS范围
        const fpsRanges = this._generateFPSRanges(refreshRate);
        const distribution = this._calculateFPSDistribution(data.frames, refreshRate);

        chart.setOption({
            title: { text: '帧率分布', left: 'center' },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: fpsRanges },
            yAxis: { type: 'value', name: '帧数' },
            series: [{
                type: 'bar',
                data: distribution,
                itemStyle: {
                    color: (params) => {
                        const colors = ['#e74c3c', '#e67e22', '#f39c12', '#2ecc71', '#27ae60'];
                        return colors[params.dataIndex];
                    }
                }
            }]
        });

        this.charts[elementId] = chart;
    }

    /**
     * 渲染帧时间趋势折线图
     * 
     * @param {string} elementId - 图表容器元素ID
     * @param {Object} data - 动画数据
     * @returns {void}
     * @throws {Error} 当帧数据缺失frameTime时立即抛出错误（Fail Fast）
     * @private
     */
    _renderFrameTimeTrend(elementId, data) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const chart = echarts.init(element);
        
        // Fail Fast: 验证每帧的frameTime字段
        data.frames.forEach((frame, index) => {
            if (typeof frame.frameTime !== 'number') {
                throw new Error(`PerformanceVisualizationPanel._renderFrameTimeTrend: frame[${index}].frameTime must be a number, got ${frame.frameTime}`);
            }
        });
        
        // 使用frameTime（业务执行耗时）
        const frameTimes = data.frames.map(f => f.frameTime);
        const frameIndices = frameTimes.map((_, i) => i + 1);

        chart.setOption({
            title: { text: '帧时间趋势', left: 'center' },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: frameIndices, name: '帧序号' },
            yAxis: { type: 'value', name: '帧时间 (ms)' },
            series: [{
                type: 'line',
                data: frameTimes,
                smooth: true,
                itemStyle: { color: '#3498db' }
            }]
        });

        this.charts[elementId] = chart;
    }

    /**
     * 渲染帧率稳定性雷达图
     * 
     * @param {string} elementId - 图表容器元素ID
     * @param {Object} data - 动画数据
     * @param {number} refreshRate - 目标刷新率
     * @returns {void}
     * @throws {Error} 当数据缺失时立即抛出错误（Fail Fast）
     * @private
     */
    _renderStabilityRadar(elementId, data, refreshRate) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const chart = echarts.init(element);

        // Fail Fast: 验证必需字段
        if (!data.actualFPS || typeof data.actualFPS.avg !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderStabilityRadar: data.actualFPS.avg must be a number');
        }
        if (typeof data.actualFPS.min !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderStabilityRadar: data.actualFPS.min must be a number');
        }
        if (typeof data.p99FrameTime !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderStabilityRadar: data.p99FrameTime must be a number');
        }
        if (typeof data.frameTimeStdDev !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderStabilityRadar: data.frameTimeStdDev must be a number');
        }

        // 获取稳定性评级
        const stabilityRating = getStabilityRating(data.frameTimeStdDev);

        // P99帧时间上限（根据刷新率计算）
        const maxFrameTime = (1000 / refreshRate) * 3;

        chart.setOption({
            title: { 
                text: `性能稳定性 - ${stabilityRating.level} ${stabilityRating.stars}`, 
                left: 'center',
                textStyle: {
                    color: stabilityRating.color
                }
            },
            tooltip: {},
            radar: {
                center: ['50%', '60%'],
                axisName: {
                    color: '#333'
                },
                indicator: [
                    { name: '平均FPS', max: refreshRate },
                    { name: '最低FPS', max: refreshRate },
                    { name: '稳定性', max: 100 },
                    { name: 'P99帧时', max: maxFrameTime },
                    { name: '流畅度', max: 100 }
                ]
            },
            series: [{
                type: 'radar',
                data: [{
                    value: [
                        data.actualFPS.avg,
                        data.actualFPS.min,
                        this._calculateStabilityScore(data),
                        data.p99FrameTime,
                        this._calculateSmoothnessScore(data)
                    ],
                    name: '性能指标'
                }]
            }]
        });

        this.charts[elementId] = chart;
    }

    /**
     * 渲染帧掉落分析饼图
     * 
     * @param {string} elementId - 图表容器元素ID
     * @param {Object} data - 动画数据
     * @returns {void}
     * @private
     */
    _renderFrameDropPie(elementId, data) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const chart = echarts.init(element);

        // 如果没有刷新率，无法进行帧掉落分析
        if (data.smoothFrames === null) {
            chart.setOption({
                title: { 
                    text: '帧掉落分析\n（需要刷新率数据）', 
                    left: 'center',
                    textStyle: { fontSize: 14 }
                },
                graphic: [{
                    type: 'text',
                    left: 'center',
                    top: 'middle',
                    style: {
                        text: '未设置刷新率\n无法分析帧掉落',
                        textAlign: 'center',
                        fill: '#999',
                        fontSize: 14
                    }
                }]
            });
            this.charts[elementId] = chart;
            return;
        }

        // Fail Fast: 验证帧掉落数据（到这里smoothFrames已经不是null了）
        if (typeof data.smoothFrames !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderFrameDropPie: data.smoothFrames must be a number');
        }
        if (typeof data.minorDrops !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderFrameDropPie: data.minorDrops must be a number');
        }
        if (typeof data.severeDrops !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderFrameDropPie: data.severeDrops must be a number');
        }

        const frameDropData = [
            { value: data.smoothFrames, name: '流畅帧' },
            { value: data.minorDrops, name: '轻微卡顿' },
            { value: data.severeDrops, name: '严重卡顿' }
        ];

        chart.setOption({
            title: { text: '帧掉落分析', left: 'center' },
            tooltip: { trigger: 'item' },
            legend: { orient: 'vertical', left: 'left' },
            series: [{
                type: 'pie',
                radius: '50%',
                data: frameDropData,
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }]
        });

        this.charts[elementId] = chart;
    }

    /**
     * 生成动态FPS范围（根据刷新率）
     * 
     * @param {number} refreshRate - 目标刷新率
     * @returns {string[]} FPS范围标签数组
     * @private
     */
    _generateFPSRanges(refreshRate) {
        const half = Math.floor(refreshRate / 2);
        const threeQuarters = Math.floor(refreshRate * 0.75);
        const ninetyPercent = Math.floor(refreshRate * 0.9);
        const ninetyFivePercent = Math.floor(refreshRate * 0.95);
        
        return [
            `0-${half}`,
            `${half}-${threeQuarters}`,
            `${threeQuarters}-${ninetyPercent}`,
            `${ninetyPercent}-${ninetyFivePercent}`,
            `${ninetyFivePercent}+`
        ];
    }

    /**
     * 计算FPS分布（基于RAF帧间隔）
     * 
     * @param {Array} frames - 帧数据数组
     * @param {number} refreshRate - 目标刷新率
     * @returns {number[]} 各FPS范围的帧数
     * @throws {Error} 当帧数据缺失rafTimestamp时立即抛出错误（Fail Fast）
     * @private
     */
    _calculateFPSDistribution(frames, refreshRate) {
        const distribution = [0, 0, 0, 0, 0];
        
        const half = Math.floor(refreshRate / 2);
        const threeQuarters = Math.floor(refreshRate * 0.75);
        const ninetyPercent = Math.floor(refreshRate * 0.9);
        const ninetyFivePercent = Math.floor(refreshRate * 0.95);
        
        // 计算每一帧的FPS（基于RAF帧间隔）
        for (let i = 1; i < frames.length; i++) {
            // Fail Fast: 验证rafTimestamp字段
            if (!Number.isFinite(frames[i].rafTimestamp)) {
                throw new Error(`PerformanceVisualizationPanel._calculateFPSDistribution: frame[${i}].rafTimestamp must be a finite number, got ${frames[i].rafTimestamp}`);
            }
            if (!Number.isFinite(frames[i - 1].rafTimestamp)) {
                throw new Error(`PerformanceVisualizationPanel._calculateFPSDistribution: frame[${i - 1}].rafTimestamp must be a finite number, got ${frames[i - 1].rafTimestamp}`);
            }
            
            const deltaTime = frames[i].rafTimestamp - frames[i - 1].rafTimestamp;
            if (deltaTime > 0) {
                const fps = 1000 / deltaTime;
                if (fps < half) distribution[0]++;
                else if (fps < threeQuarters) distribution[1]++;
                else if (fps < ninetyPercent) distribution[2]++;
                else if (fps < ninetyFivePercent) distribution[3]++;
                else distribution[4]++;
            }
        }

        return distribution;
    }

    /**
     * 计算稳定性得分（基于帧耗时标准差）
     * 
     * @param {Object} data - 动画数据
     * @returns {number} 稳定性得分 (0-100)
     * @throws {Error} 当数据缺失时立即抛出错误（Fail Fast）
     * @private
     */
    _calculateStabilityScore(data) {
        // Fail Fast: 验证frameTimeStdDev字段
        if (typeof data.frameTimeStdDev !== 'number') {
            throw new Error('PerformanceVisualizationPanel._calculateStabilityScore: data.frameTimeStdDev must be a number');
        }
        
        // 标准差越小越稳定，满分100
        // 对于帧耗时，5ms作为最大标准差（标准差>5ms得分为0）
        const maxStdDev = 5;
        const score = Math.max(0, 100 - (data.frameTimeStdDev / maxStdDev) * 100);
        return Math.round(score);
    }

    /**
     * 计算流畅度得分（基于流畅帧占比）
     * 
     * @param {Object} data - 动画数据
     * @returns {number} 流畅度得分 (0-100)
     * @private
     */
    _calculateSmoothnessScore(data) {
        // 如果没有刷新率数据，无法计算流畅度
        if (data.smoothFrames === null) return 0;
        
        const totalFrames = data.smoothFrames + data.minorDrops + data.severeDrops;
        if (totalFrames === 0) return 0;
        
        return Math.round((data.smoothFrames / totalFrames) * 100);
    }

    /**
     * 渲染百分位数柱状图
     * 
     * @param {string} elementId - 图表容器元素ID
     * @param {Object} data - 动画数据
     * @returns {void}
     * @throws {Error} 当数据缺失时立即抛出错误（Fail Fast）
     * @private
     */
    _renderPercentileChart(elementId, data) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const chart = echarts.init(element);

        // Fail Fast: 验证必需字段
        if (typeof data.p50FrameTime !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderPercentileChart: data.p50FrameTime must be a number');
        }
        if (typeof data.p95FrameTime !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderPercentileChart: data.p95FrameTime must be a number');
        }
        if (typeof data.p99FrameTime !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderPercentileChart: data.p99FrameTime must be a number');
        }

        chart.setOption({
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' }
            },
            xAxis: {
                type: 'category',
                data: ['P50 (中位数)', 'P95', 'P99']
            },
            yAxis: {
                type: 'value',
                name: '帧耗时 (ms)'
            },
            series: [{
                type: 'bar',
                data: [
                    { value: data.p50FrameTime, itemStyle: { color: '#2ecc71' } },
                    { value: data.p95FrameTime, itemStyle: { color: '#f39c12' } },
                    { value: data.p99FrameTime, itemStyle: { color: '#e74c3c' } }
                ],
                label: {
                    show: true,
                    position: 'top',
                    formatter: '{c} ms'
                }
            }]
        });

        this.charts[elementId] = chart;
    }

    /**
     * 渲染FPS对比图
     * 
     * @param {string} elementId - 图表容器元素ID
     * @param {Object} data - 动画数据
     * @param {number} refreshRate - 目标刷新率
     * @returns {void}
     * @throws {Error} 当数据缺失时立即抛出错误（Fail Fast）
     * @private
     */
    _renderFPSComparisonChart(elementId, data, refreshRate) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const chart = echarts.init(element);

        // Fail Fast: 验证必需字段
        if (!data.actualFPS || typeof data.actualFPS.avg !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderFPSComparisonChart: data.actualFPS.avg must be a number');
        }
        if (typeof data.onePercentLowFPS !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderFPSComparisonChart: data.onePercentLowFPS must be a number');
        }
        if (typeof data.pointOnePercentLowFPS !== 'number') {
            throw new Error('PerformanceVisualizationPanel._renderFPSComparisonChart: data.pointOnePercentLowFPS must be a number');
        }

        // 显示卡顿次数到标题下方（即使为0也显示）
        const stutterCountId = elementId.replace('-fps-comparison-chart', '-stutter-count');
        const stutterCountElement = document.getElementById(stutterCountId);
        
        // Fail Fast: 卡顿次数元素必须存在
        if (!stutterCountElement) {
            throw new Error(`PerformanceVisualizationPanel._renderFPSComparisonChart: stutter count element '${stutterCountId}' not found`);
        }
        
        if (typeof data.stutterCount === 'number') {
            stutterCountElement.textContent = `卡顿次数: ${data.stutterCount}`;
            // 根据卡顿次数动态设置状态类：0次=正常（绿色），>0次=有卡顿（红色）
            if (data.stutterCount === 0) {
                stutterCountElement.classList.remove('has-stutter');
                stutterCountElement.classList.add('is-normal');
            } else {
                stutterCountElement.classList.remove('is-normal');
                stutterCountElement.classList.add('has-stutter');
            }
        } else {
            stutterCountElement.textContent = ''; // 无刷新率时清空
            stutterCountElement.classList.remove('is-normal', 'has-stutter');
        }

        chart.setOption({
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' }
            },
            xAxis: {
                type: 'category',
                data: ['平均FPS', '1%低点FPS', '0.1%低点FPS']
            },
            yAxis: {
                type: 'value',
                name: 'FPS',
                max: refreshRate
            },
            series: [{
                type: 'bar',
                data: [
                    { value: data.actualFPS.avg, itemStyle: { color: '#3498db' } },
                    { value: data.onePercentLowFPS, itemStyle: { color: '#e67e22' } },
                    { value: data.pointOnePercentLowFPS, itemStyle: { color: '#e74c3c' } }
                ],
                label: {
                    show: true,
                    position: 'top',
                    formatter: '{c}'
                }
            }]
        });

        this.charts[elementId] = chart;
    }

    /**
     * 销毁所有图表实例
     * 
     * @returns {void}
     */
    destroy() {
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.dispose === 'function') {
                chart.dispose();
            }
        });
        this.charts = {};
    }
}


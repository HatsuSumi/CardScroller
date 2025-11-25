/**
 * RealtimeFPSMonitor - 实时FPS监控组件
 * 负责在播放动画时右上角显示实时FPS浮动窗口
 * 
 * 职责说明：
 * - 这是一个纯UI显示组件，专门为 PerformanceReportPage 提供实时FPS显示功能
 * - 创建并管理浮动FPS显示窗口
 * - 实时更新FPS数值和颜色（基于性能等级）
 * - 支持显示/隐藏动画效果
 * - 自动管理DOM元素的创建和销毁
 * 
 * 当前被使用的模块：
 * - PerformanceReportPage (services/ui/PerformanceReportPage.js) - 性能监控主页面
 * - PerformanceMonitorService (services/business/PerformanceMonitorService.js) - 提供实时FPS数据
 * 
 * 当前依赖的模块：
 * - formatFPS, getPerformanceLevel, applyPerformanceColor (helpers/performanceUtils.js) - FPS格式化、性能等级评估、性能颜色应用
 * 
 * 架构说明：
 * - 动态创建DOM元素（不依赖HTML模板）
 * - 使用 Fail Fast 原则验证所有关键参数
 * - 提供完整的生命周期管理（show/hide/destroy）
 */

import { formatFPS, getPerformanceLevel, applyPerformanceColor } from '../../helpers/performanceUtils.js';

export class RealtimeFPSMonitor {
    /**
     * 构造函数
     * 创建实时FPS监控器实例
     */
    constructor() {
        // 浮动窗口DOM元素
        this.container = null;
        this.fpsValueElement = null;
        
        // 当前刷新率（用于性能等级评估）
        // 必须通过 updateRefreshRate() 设置，否则为 null（Fail Fast）
        // 只有刷新率就绪后，_handlePlaybackStarted 才会显示实时FPS
        this.refreshRate = null;
        
        // 显示状态
        this.isVisible = false;
        
        // 估算状态（用于显示"正在估算刷新率..."期间的特殊处理）
        this.isEstimating = false;
    }
    
    /**
     * 初始化监控器（创建DOM元素并添加到页面）
     * @param {number} [refreshRate] - 屏幕刷新率（Hz），可选
     * @returns {void}
     * @throws {Error} 当refreshRate无效时立即抛出错误（Fail Fast）
     */
    init(refreshRate) {
        // 如果提供了refreshRate参数，验证并更新
        if (refreshRate !== undefined) {
            // Fail Fast: 验证参数
            if (typeof refreshRate !== 'number' || refreshRate <= 0) {
                throw new Error(`RealtimeFPSMonitor.init: refreshRate must be a positive number, got ${refreshRate}`);
            }
            this.refreshRate = refreshRate;
        }
        // 否则保持为 null，必须稍后通过 updateRefreshRate() 设置（Fail Fast）
        
        // 创建浮动窗口DOM
        this._createDOM();
    }
    
    /**
     * 更新刷新率（用户手动修改后调用）
     * @param {number} refreshRate - 新的刷新率（Hz）
     * @returns {void}
     * @throws {Error} 当refreshRate无效时立即抛出错误（Fail Fast）
     */
    updateRefreshRate(refreshRate) {
        // Fail Fast: 验证参数
        if (typeof refreshRate !== 'number' || refreshRate <= 0) {
            throw new Error(`RealtimeFPSMonitor.updateRefreshRate: refreshRate must be a positive number, got ${refreshRate}`);
        }
        
        this.refreshRate = refreshRate;
        this.isEstimating = false; // 刷新率已就绪，估算完成
    }
    
    /**
     * 显示FPS监控器
     * @returns {void}
     */
    show() {
        if (!this.container) {
            throw new Error('RealtimeFPSMonitor.show: monitor not initialized, call init() first');
        }
        
        this.container.classList.remove('hidden');
        this.isVisible = true;
    }
    
    /**
     * 显示"正在估算刷新率..."状态
     * 用于刷新率估算期间（约2秒），给用户立即反馈
     * @returns {void}
     */
    showEstimating() {
        if (!this.container) {
            throw new Error('RealtimeFPSMonitor.showEstimating: monitor not initialized, call init() first');
        }
        
        // 设置估算状态（update() 会检查此标志位，估算期间跳过更新）
        this.isEstimating = true;
        
        // 显示浮动窗口
        this.container.classList.remove('hidden');
        this.isVisible = true;
        
        // 显示估算状态文本（灰色，表示等待中）
        this.fpsValueElement.textContent = '正在估算刷新率...';
        this.fpsValueElement.classList.add('fps-waiting');
    }
    
    /**
     * 隐藏FPS监控器
     * @returns {void}
     */
    hide() {
        if (!this.container) {
            return; // 未初始化，无需隐藏
        }
        
        this.container.classList.add('hidden');
        this.isVisible = false;
    }
    
    /**
     * 更新FPS显示
     * @param {number} currentFPS - 当前FPS值
     * @param {number} avgFPS - 平均FPS值
     * @returns {void}
     * @throws {Error} 当参数无效或刷新率未设置时立即抛出错误（Fail Fast）
     */
    update(currentFPS, avgFPS) {
        // Fail Fast: 验证参数
        if (typeof currentFPS !== 'number' || currentFPS < 0) {
            throw new Error(`RealtimeFPSMonitor.update: currentFPS must be a non-negative number, got ${currentFPS}`);
        }
        if (typeof avgFPS !== 'number' || avgFPS < 0) {
            throw new Error(`RealtimeFPSMonitor.update: avgFPS must be a non-negative number, got ${avgFPS}`);
        }
        
        if (!this.container || !this.isVisible) {
            return; // 未初始化或未显示，无需更新
        }
        
        // 如果正在估算刷新率，跳过更新（此时显示"正在估算刷新率..."）
        if (this.isEstimating) {
            return; // 估算完成后会自动调用 updateRefreshRate()，下次 update() 会正常显示
        }
        
        // Fail Fast: 刷新率必须已设置（不使用默认值）
        if (this.refreshRate === null) {
            throw new Error('RealtimeFPSMonitor.update: refreshRate not set, call updateRefreshRate() first');
        }
        
        // 格式化FPS（显示：当前 (平均)）
        const fpsText = `${formatFPS(currentFPS)} (平均: ${formatFPS(avgFPS)})`;
        
        // 获取性能等级（用于颜色，基于当前FPS）
        const perfLevel = getPerformanceLevel(currentFPS, this.refreshRate);
        
        // 更新显示
        this.fpsValueElement.textContent = fpsText;
        
        // 移除等待状态样式，应用性能等级颜色
        this.fpsValueElement.classList.remove('fps-waiting');
        applyPerformanceColor(this.fpsValueElement, perfLevel.level);
    }
    
    /**
     * 销毁监控器（移除DOM元素）
     * @returns {void}
     */
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        this.container = null;
        this.fpsValueElement = null;
        this.isVisible = false;
    }
    
    /**
     * 创建浮动窗口DOM元素
     * @returns {void}
     * @throws {Error} 当模板不存在时立即抛出错误
     * @private
     */
    _createDOM() {
        // Fail Fast: 检查模板是否存在
        const template = document.getElementById('realtime-fps-monitor-template');
        if (!template) {
            throw new Error('RealtimeFPSMonitor._createDOM: template #realtime-fps-monitor-template not found');
        }
        
        // 克隆模板内容
        const clone = template.content.cloneNode(true);
        
        // 获取容器和FPS值元素的引用
        this.container = clone.querySelector('.realtime-fps-monitor');
        this.fpsValueElement = clone.querySelector('.realtime-fps-monitor-value');
        
        // Fail Fast: 验证必需元素
        if (!this.container) {
            throw new Error('RealtimeFPSMonitor._createDOM: .realtime-fps-monitor not found in template');
        }
        if (!this.fpsValueElement) {
            throw new Error('RealtimeFPSMonitor._createDOM: .realtime-fps-monitor-value not found in template');
        }
        
        // 添加到页面
        document.body.appendChild(clone);
    }
}

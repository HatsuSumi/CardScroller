/**
 * MonitorControlPanel - 性能监控控制面板组件
 * 负责性能监控的开关控制、实时FPS显示开关、以及刷新率估算触发
 * 
 * 职责说明：
 * - 这是一个纯UI交互组件，专门为 PerformanceReportPage 提供监控控制功能
 * - 管理"开启性能监控"复选框的状态和事件
 * - 管理"播放时显示实时FPS"复选框的状态和事件
 * - 触发刷新率重新估算（通过事件通知父组件）
 * - 从 state 读取当前配置并同步到 UI
 * 
 * 当前被使用的模块：
 * - PerformanceReportPage (services/ui/PerformanceReportPage.js) - 性能监控主页面
 * 
 * 当前依赖的模块：
 * - 无（纯UI组件，只负责用户交互和事件触发）
 * 
 * 架构说明：
 * - DOM 元素通过 init() 方法传入，不在构造函数中初始化（支持动态 DOM）
 * - 使用自定义事件（CustomEvent）向父组件通知状态变化
 * - 使用 Fail Fast 原则验证所有关键参数
 */

export class MonitorControlPanel {
    /**
     * 构造函数
     * 创建监控控制面板实例
     */
    constructor() {
        // DOM 元素引用（通过 init 传入）
        this.elements = null;
    }
    
    /**
     * 初始化面板（接收容器，自己查找元素并绑定事件）
     * @param {HTMLElement} container - 面板容器元素
     * @returns {void}
     * @throws {Error} 当容器无效或关键元素缺失时立即抛出错误（Fail Fast）
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('MonitorControlPanel.init: container must be a valid HTMLElement');
        }
        
        // 子组件自己查找需要的元素（封装）
        this.elements = {
            enableMonitorCheckbox: container.querySelector('#enableMonitorCheckbox'),
            showRealtimeFPSCheckbox: container.querySelector('#showRealtimeFPSCheckbox')
        };
        
        // Fail Fast: 验证必需元素
        if (!this.elements.enableMonitorCheckbox) {
            throw new Error('MonitorControlPanel.init: #enableMonitorCheckbox not found in container');
        }
        if (!this.elements.showRealtimeFPSCheckbox) {
            throw new Error('MonitorControlPanel.init: #showRealtimeFPSCheckbox not found in container');
        }
        
        // 绑定事件
        this._bindEvents();
    }
    
    /**
     * 更新面板状态（从 state 同步）
     * @param {boolean} enabled - 性能监控是否启用
     * @param {boolean} showRealtimeFPS - 是否显示实时FPS
     * @returns {void}
     * @throws {Error} 当参数不是布尔值时立即抛出错误（Fail Fast）
     */
    updateState(enabled, showRealtimeFPS) {
        // Fail Fast: 验证参数类型
        if (typeof enabled !== 'boolean') {
            throw new Error(`MonitorControlPanel.updateState: enabled must be a boolean, got ${typeof enabled}`);
        }
        if (typeof showRealtimeFPS !== 'boolean') {
            throw new Error(`MonitorControlPanel.updateState: showRealtimeFPS must be a boolean, got ${typeof showRealtimeFPS}`);
        }
        
        // 同步复选框状态（实时FPS独立于性能监控）
        this.elements.enableMonitorCheckbox.checked = enabled;
        this.elements.showRealtimeFPSCheckbox.checked = showRealtimeFPS;
    }
    
    /**
     * 绑定事件监听
     * @returns {void}
     * @private
     */
    _bindEvents() {
        const { enableMonitorCheckbox, showRealtimeFPSCheckbox } = this.elements;
        
        // 监控开关变化事件
        enableMonitorCheckbox.addEventListener('change', () => {
            this._handleMonitorToggle();
        });
        
        // 实时FPS开关变化事件
        showRealtimeFPSCheckbox.addEventListener('change', () => {
            this._handleRealtimeFPSToggle();
        });
    }
    
    /**
     * 处理监控开关切换
     * @returns {void}
     * @private
     */
    _handleMonitorToggle() {
        const enabled = this.elements.enableMonitorCheckbox.checked;
        
        // 触发自定义事件，通知父组件
        const event = new CustomEvent('monitor-toggle', {
            detail: { enabled },
            bubbles: true
        });
        this.elements.enableMonitorCheckbox.dispatchEvent(event);
    }
    
    /**
     * 处理实时FPS开关切换
     * @returns {void}
     * @private
     */
    _handleRealtimeFPSToggle() {
        const showRealtimeFPS = this.elements.showRealtimeFPSCheckbox.checked;
        
        // 触发自定义事件，通知父组件
        const event = new CustomEvent('realtime-fps-toggle', {
            detail: { showRealtimeFPS },
            bubbles: true
        });
        this.elements.showRealtimeFPSCheckbox.dispatchEvent(event);
    }
    
    /**
     * 销毁组件（清理引用）
     * @returns {void}
     */
    destroy() {
        this.elements = null;
    }
}

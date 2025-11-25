/**
 * ConfigDataManager - 入场动画配置数据管理组件
 * 负责配置数据的加载、收集和保存
 * 
 * 职责说明：
 * - 从UI表单收集配置数据
 * - 加载配置到UI表单
 * - 保存配置到StateManager
 * 
 * 当前被使用的模块：
 * - EntryAnimationConfigPage (ui/EntryAnimationConfigPage.js) - 初始化和调用配置数据管理功能
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 读取和保存配置数据 (通过DI注入)
 * - eventBus (core/EventBus.js) - 发送成功消息 (通过DI注入)
 * 
 * 架构说明：
 * - 遵循"父传容器，子自查找"模式，与 PerformanceReportPage 的子组件架构一致
 * - 通过回调函数获取边界和动画数据，不直接依赖其他manager
 * - 所有DOM元素在 init() 中查找并验证（Fail Fast）
 * - 不包含验证逻辑，验证由父组件 EntryAnimationConfigPage 通过 ValidationService 统一处理
 */

export class ConfigDataManager {
    /**
     * 构造函数 - 创建配置数据管理组件
     * @param {StateManager} stateManager - 状态管理器
     * @param {EventBus} eventBus - 事件总线
     * @throws {Error} 当依赖缺失时立即抛出错误
     */
    constructor(stateManager, eventBus) {
        // Fail Fast: 验证依赖
        if (!stateManager) {
            throw new Error('ConfigDataManager requires stateManager dependency');
        }
        if (!eventBus) {
            throw new Error('ConfigDataManager requires eventBus dependency');
        }
        
        this.stateManager = stateManager;
        this.eventBus = eventBus;
        
        // DOM元素引用
        this.elements = {};
        
        // 数据获取回调（由父组件设置）
        this.getBoundaries = null;
        this.getCardAnimations = null;
        this.onConfigSaved = null;
    }
    
    /**
     * 初始化组件，查找需要的DOM元素
     * @param {HTMLElement} container - 父容器元素
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时立即抛出错误
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('ConfigDataManager.init: container must be a valid HTMLElement');
        }
        
        // 查找所有需要的DOM元素
        this.elements = {
            enabledCheckbox: container.querySelector('#entryAnimationEnabled'),
            durationInput: container.querySelector('#entryAnimationDuration'),
            staggerDelayInput: container.querySelector('#entryAnimationStaggerDelay'),
            intervalBeforeScrollInput: container.querySelector('#entryAnimationIntervalBeforeScroll')
        };
        
        // Fail Fast: 验证所有必需元素
        if (!this.elements.enabledCheckbox) {
            throw new Error('ConfigDataManager.init: #entryAnimationEnabled not found in container');
        }
        if (!this.elements.durationInput) {
            throw new Error('ConfigDataManager.init: #entryAnimationDuration not found in container');
        }
        if (!this.elements.staggerDelayInput) {
            throw new Error('ConfigDataManager.init: #entryAnimationStaggerDelay not found in container');
        }
        if (!this.elements.intervalBeforeScrollInput) {
            throw new Error('ConfigDataManager.init: #entryAnimationIntervalBeforeScroll not found in container');
        }
    }
    
    /**
     * 设置数据获取回调函数
     * @param {Function} getBoundaries - 获取边界数据的回调函数
     * @param {Function} getCardAnimations - 获取卡片动画数据的回调函数
     * @returns {void}
     */
    setDataGetters(getBoundaries, getCardAnimations) {
        this.getBoundaries = getBoundaries;
        this.getCardAnimations = getCardAnimations;
    }
    
    /**
     * 设置配置保存回调函数
     * @param {Function} callback - 配置保存成功后的回调函数（用于更新卡片位置信息）
     * @returns {void}
     */
    setOnConfigSaved(callback) {
        this.onConfigSaved = callback;
    }
    
    /**
     * 加载配置数据到UI表单
     * @returns {void}
     * @throws {Error} 当配置数据缺失时立即抛出错误
     */
    loadConfig() {
        const config = this.stateManager.state.playback.entryAnimation;
        
        // Fail Fast: 验证配置完整性
        if (!config) {
            throw new Error('ConfigDataManager.loadConfig: playback.entryAnimation is missing from state');
        }
        if (config.enabled === undefined) {
            throw new Error('ConfigDataManager.loadConfig: config.enabled is missing');
        }
        if (config.duration === undefined) {
            throw new Error('ConfigDataManager.loadConfig: config.duration is missing');
        }
        if (config.staggerDelay === undefined) {
            throw new Error('ConfigDataManager.loadConfig: config.staggerDelay is missing');
        }
        if (config.intervalBeforeScroll === undefined) {
            throw new Error('ConfigDataManager.loadConfig: config.intervalBeforeScroll is missing');
        }
        
        // 填充表单
        this.elements.enabledCheckbox.checked = config.enabled;
        this.elements.durationInput.value = config.duration;
        this.elements.staggerDelayInput.value = config.staggerDelay;
        this.elements.intervalBeforeScrollInput.value = config.intervalBeforeScroll;
    }
    
    /**
     * 从UI表单收集配置数据
     * @returns {Object} 配置对象
     * @throws {Error} 当数据获取回调未设置时立即抛出错误
     */
    getConfig() {
        // Fail Fast: 验证回调函数已设置
        if (!this.getBoundaries) {
            throw new Error('ConfigDataManager.getConfig: getBoundaries callback not set');
        }
        if (!this.getCardAnimations) {
            throw new Error('ConfigDataManager.getConfig: getCardAnimations callback not set');
        }
        
        const config = {
            enabled: this.elements.enabledCheckbox.checked,
            cardBoundaries: this.getBoundaries(),
            cardAnimations: this.getCardAnimations(),
            duration: parseInt(this.elements.durationInput.value, 10),
            staggerDelay: parseInt(this.elements.staggerDelayInput.value, 10),
            intervalBeforeScroll: parseInt(this.elements.intervalBeforeScrollInput.value, 10)
        };
        
        return config;
    }
    
    /**
     * 保存配置到StateManager
     * 
     * 
     * @returns {void}
     * @throws {Error} 当配置获取失败时可能抛出错误
     */
    save() {
        // 获取配置数据
        const config = this.getConfig();
        
        // 触发配置保存回调（更新卡片位置信息）
        if (this.onConfigSaved) {
            this.onConfigSaved();
        }
        
        // 记录标记卡片时的位置（用于后续判断是否需要警告用户）
        const currentStartPosition = this.stateManager.state.playback.scroll.startPosition;
        const currentEndPosition = this.stateManager.state.playback.scroll.endPosition;
        
        // 保存到StateManager（批量更新）
        this.stateManager.batch(() => {
            Object.entries(config).forEach(([key, value]) => {
                this.stateManager.setValue(`playback.entryAnimation.${key}`, value, {});
            });
            
            // 保存标记卡片时的位置
            this.stateManager.state.playback.entryAnimation.markedAtStartPosition = currentStartPosition;
            this.stateManager.state.playback.entryAnimation.markedAtEndPosition = currentEndPosition;
        }, {});
        
        // 刷新Canvas显示（根据新的入场动画状态决定显示背景色或完整图片）
        this.eventBus.emit('display:refresh-canvas');
        
        // 发射成功消息
        this.eventBus.emit('ui:show-success-message', { 
            message: '配置已保存。' 
        });
    }
    
    /**
     * 获取启用状态
     * @returns {boolean} 是否启用入场动画
     */
    isEnabled() {
        return this.elements.enabledCheckbox.checked;
    }
    
    /**
     * 销毁组件，清理资源
     * @returns {void}
     */
    destroy() {
        // 清空DOM元素引用
        this.elements = {};
        
        // 清空回调
        this.getBoundaries = null;
        this.getCardAnimations = null;
        this.onConfigSaved = null;
    }
}

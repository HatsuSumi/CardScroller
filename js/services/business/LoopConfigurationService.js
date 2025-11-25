/**
 * LoopConfigurationService - 循环配置管理服务
 * 处理循环次数选择、自定义输入和变长时长复选框的业务逻辑。
 * 功能包括：循环次数选项动态生成、预设值管理、自定义输入验证、变长时长开关控制。
 * 
 * 当前被使用的模块：
 * - AdvancedLoopService (modal/AdvancedLoopService.js) - 管理高级循环模态框中的配置交互
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线，通过request()同步调用System层ValidationService (通过DI注入)
 * 
 * 架构说明：
 * 为什么不继承 BaseUIService？
 * - BaseUIService的设计意图是"频繁访问同一个DOM元素"，即多个方法反复调用 _getElement() 获取同一元素，通过缓存避免重复查询
 * - LoopConfigurationService只在initLoopCountSelect方法中调用一次 _getElement('loopCountOptionTemplate')，之后不再访问
 * - 大部分DOM元素都是通过外部传入的参数（elements）来访问，而不是通过_getElement方法
 * - 继承BaseUIService会造成无意义的缓存：只有一个template元素需要访问一次，不值得引入整个缓存机制
 * - 直接使用原生 document.getElementById() 更清晰、更轻量
 */

export class LoopConfigurationService {
    /**
     * 循环次数预设常量
     * UI 快捷选项，方便用户快速选择常用循环次数
     */
    static LOOP_COUNT_PRESETS = [
        { value: 0, label: '无限循环' },
        { value: 2, label: '2次' },
        { value: 3, label: '3次' },
        { value: 5, label: '5次' },
        { value: 10, label: '10次' },
        { value: 'custom', label: '自定义' }
    ];

    /**
     * 构造函数
     * @param {StateManager} stateManager - 状态管理器
     * @param {EventBus} eventBus - 事件总线（用于通过request()同步调用System层ValidationService）
     * @throws {Error} 当核心依赖（stateManager/eventBus）缺失时抛出错误（Fail Fast）
     */
    constructor(stateManager, eventBus) {
        // Fail Fast: 验证核心依赖
        if (!stateManager) {
            throw new Error('StateManager is required for LoopConfigurationService');
        }
        if (!eventBus) {
            throw new Error('EventBus is required for LoopConfigurationService');
        }
        
        this.stateManager = stateManager;
        this.eventBus = eventBus;
        
        // 性能优化：缓存过滤后的预设值，避免重复过滤
        this._cachedPresetValues = null;
        
        // 回调函数将由主服务注入
        this.onDurationSequenceUpdate = null;
        this.onHintDisplayUpdate = null;
        this.onDebouncedLoopCountUpdate = null; // 防抖循环次数更新回调
        this.onDurationSequenceSave = null; // 时长序列保存回调
        this.onUserSelectCustomMode = null; // 用户选择自定义模式回调
        this.onUserSelectPresetMode = null; // 用户选择预设模式回调
    }

    /**
     * 设置回调函数
     * @param {Object} callbacks - 回调函数对象
     * @returns {void}
     * @throws {Error} 当callbacks参数缺失时抛出错误（Fail Fast）
     */
    setCallbacks(callbacks) {
        // Fail Fast: 验证回调对象
        if (!callbacks) {
            throw new Error('Callbacks object is required for setCallbacks');
        }
        
        this.onDurationSequenceUpdate = callbacks.onDurationSequenceUpdate;
        this.onHintDisplayUpdate = callbacks.onHintDisplayUpdate;
        this.onDebouncedLoopCountUpdate = callbacks.onDebouncedLoopCountUpdate;
        this.onDurationSequenceSave = callbacks.onDurationSequenceSave;
        this.onUserSelectCustomMode = callbacks.onUserSelectCustomMode;
        this.onUserSelectPresetMode = callbacks.onUserSelectPresetMode;
    }

    /**
     * 初始化循环次数选择器（动态生成选项）
     * 从 defaultState.json 读取预设值，使用 HTML Template + Clone 方式生成 DOM 元素
     * @param {HTMLElement} loopCountSelectElement - 循环次数选择器容器元素
     * @returns {void}
     * @throws {Error} 当选项容器、模板或预设配置缺失时抛出错误（Fail Fast）
     */
    initLoopCountSelect(loopCountSelectElement) {
        // 获取选项容器
        const optionsContainer = loopCountSelectElement.querySelector('.select-options');
        if (!optionsContainer) {
            throw new Error('Loop count select options container not found');
        }

        // 获取模板
        const template = document.getElementById('loopCountOptionTemplate');
        if (!template) {
            throw new Error('Loop count option template not found');
        }

        // 从缓存方法获取预设配置
        const presets = this._getPresets();

        // 清空现有内容（如果有）
        optionsContainer.innerHTML = '';

        // 性能优化：使用 DocumentFragment 批量添加，避免多次重排
        const fragment = document.createDocumentFragment();
        
        presets.forEach(preset => {
            const optionElement = template.content.cloneNode(true).querySelector('.select-option');
            // Fail Fast: 验证模板克隆结果
            if (!optionElement) {
                throw new Error('Failed to clone loop count option template: .select-option not found');
            }
            
            optionElement.setAttribute('data-value', preset.value);
            const textSpan = optionElement.querySelector('.option-text');
            // Fail Fast: 验证选项文本元素
            if (!textSpan) {
                throw new Error('Required element not found in option template: .option-text');
            }
            
            textSpan.textContent = preset.label;
            fragment.appendChild(optionElement);
        });
        
        // 一次性添加所有选项，只触发一次重排
        optionsContainer.appendChild(fragment);
    }

    /**
     * 设置循环配置相关事件监听器
     * @param {Object} elements - DOM元素引用
     * @param {Object} loopCountSelect - 自定义选择器实例
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时抛出错误（Fail Fast）
     */
    setupEventListeners(elements, loopCountSelect) {
        // Fail Fast: 检查关键参数
        if (!elements) {
            throw new Error('Elements object is required for setupEventListeners');
        }
        if (!loopCountSelect) {
            throw new Error('loopCountSelect instance is required for setupEventListeners');
        }
        
        const {
            customLoopCountInput,
            variableDurationCheckbox,
            durationSequenceList
        } = elements;

        // Fail Fast: 必需的DOM元素检查
        if (!customLoopCountInput) {
            throw new Error('Required element not found: customLoopCountInput. Please check HTML structure.');
        }
        if (!variableDurationCheckbox) {
            throw new Error('Required element not found: variableDurationCheckbox. Please check HTML structure.');
        }
        if (!durationSequenceList) {
            throw new Error('Required element not found: durationSequenceList. Please check HTML structure.');
        }

        // 动态设置自定义循环次数输入框的 min/max（从 JSON 读取）
        const minCount = this.stateManager.getDefaultValue('validation.loop.minCount');
        const maxCount = this.stateManager.getDefaultValue('validation.loop.maxCount');
        
        // Fail Fast: 验证配置值
        if (minCount == null) {
            throw new Error('Loop min count configuration is missing or invalid');
        }
        if (maxCount == null) {
            throw new Error('Loop max count configuration is missing or invalid');
        }
        
        customLoopCountInput.setAttribute('min', minCount);
        customLoopCountInput.setAttribute('max', maxCount);
        customLoopCountInput.value = minCount; // 默认值为最小值

        // 循环次数选择
        loopCountSelect.element.addEventListener('change', (e) => {
            const value = e.detail.value;
            if (value === 'custom') {
                // 通知主服务：用户选择了自定义模式
                this.onUserSelectCustomMode?.();
                
                // 显示自定义输入框
                customLoopCountInput.classList.remove('hidden');
                customLoopCountInput.focus();
                
                // 通过EventBus.request()同步调用System层ValidationService
                const validation = this.eventBus.request('validation:loop-count', { loopCount: customLoopCountInput.value });
                if (!validation.isValid) {
                    throw new Error(validation.error);
                }
                
                // 验证通过，更新循环次数
                const customValue = parseInt(customLoopCountInput.value, 10);
                this.onDebouncedLoopCountUpdate?.(customValue);
            } else {
                // 通知主服务：用户选择了预设模式
                this.onUserSelectPresetMode?.();
                
                // 隐藏自定义输入框
                customLoopCountInput.classList.add('hidden');
                
                const numericValue = parseInt(value, 10);
                this.onDebouncedLoopCountUpdate?.(numericValue);
            }
        });

        // 自定义循环次数 - 使用防抖
        customLoopCountInput.addEventListener('input', (e) => {
            // 通过EventBus.request()同步调用System层ValidationService
            const validation = this.eventBus.request('validation:loop-count', { loopCount: e.target.value });
            
            // 只有验证通过才更新状态
            if (validation.isValid) {
                const value = parseInt(e.target.value, 10);
                
                // 立即更新复选框状态（包括 disabled）
                this.updateVariableDurationCheckbox(elements, value);
                
                // 使用防抖更新循环次数
                this.onDebouncedLoopCountUpdate?.(value);
            }
            // 验证失败时不做任何操作，由UI显示错误（如果需要）
        });

        // 时长变化开关
        variableDurationCheckbox.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            
            // 🎯 性能优化：使用 batch() 合并多个状态更新，只触发一次通知
            // 避免 durationSequence 和 variableDuration 的变化触发两次状态监听器
            this.stateManager.batch(() => {
                // 只在禁用时且有输入框时才保存，避免空数组覆盖已有数据
                if (!enabled) {
                    const inputs = durationSequenceList.querySelectorAll('input[data-loop-index]');
                    if (inputs.length > 0) {
                        this.onDurationSequenceSave?.(elements);
                    }
                }
                
                this.stateManager.state.playback.loop.variableDuration = enabled;
            }, {});
            
            // 更新时长序列显示（控制整个区域的显示/隐藏以及输入框状态）
            this.onDurationSequenceUpdate?.();
            
            // 更新主页面的时长覆盖提示
            this.onHintDisplayUpdate?.();
        });
    }

    /**
     * 更新循环次数选择器
     * @param {Object} elements - DOM元素引用
     * @param {Object} loopCountSelect - 自定义选择器实例
     * @param {boolean} [userSelectedCustomMode=false] - 用户是否选择了自定义模式
     * @returns {void}
     * @throws {Error} 当必需的参数或DOM元素缺失时抛出错误（Fail Fast）
     */
    updateLoopCountSelect(elements, loopCountSelect, userSelectedCustomMode = false) {
        // Fail Fast: 检查关键参数
        if (!elements) {
            throw new Error('Elements object is required for updateLoopCountSelect');
        }
        
        const { customLoopCountInput } = elements;

        // Fail Fast: 必需的参数检查
        if (!loopCountSelect) {
            throw new Error('loopCountSelect instance is required for updateLoopCountSelect');
        }
        
        // Fail Fast: 必需的DOM元素检查
        if (!customLoopCountInput) {
            throw new Error('Required element not found: customLoopCountInput. Please check HTML structure.');
        }

        const loopCount = this.stateManager.state.playback.loop.count;

        // 🎯 如果输入框正在获得焦点（用户正在输入），不要修改下拉菜单和输入框，避免打断用户操作
        if (document.activeElement === customLoopCountInput) {
            // 只更新复选框状态，不修改下拉菜单和输入框
            this.updateVariableDurationCheckbox(elements, loopCount);
            return;
        }

        // 🎯 简化逻辑：如果用户选择了自定义模式，强制显示自定义
        if (userSelectedCustomMode) {
            loopCountSelect?.setValue('custom');
            customLoopCountInput.classList.remove('hidden');
            // 🚫 不设置输入框的值，避免覆盖用户正在输入的内容
        } else {
            // 智能判断显示模式（用于模态框打开/配置导入场景）
            // 获取预设值（使用缓存方法避免重复读取）
            const presetValues = this._getPresetValues();
            
            if (presetValues.includes(loopCount)) {
                // 是预设值，直接选中
                loopCountSelect?.setValue(loopCount.toString());
                customLoopCountInput.classList.add('hidden');
            } else {
                // 不是预设值，显示自定义（配置导入场景，需要设置输入框值）
                loopCountSelect?.setValue('custom');
                customLoopCountInput.classList.remove('hidden');
                customLoopCountInput.value = loopCount;
            }
        }
        
        // 性能优化：统一在方法末尾更新复选框状态，避免重复调用
        this.updateVariableDurationCheckbox(elements, loopCount);
    }

    /**
     * 获取预设循环次数配置（完整对象，包含 value 和 label）
     * @returns {Array<Object>} 预设循环次数配置数组
     * @private
     */
    _getPresets() {
        return LoopConfigurationService.LOOP_COUNT_PRESETS;
    }

    /**
     * 获取预设循环次数值（去除"custom"选项）
     * 性能优化：使用缓存避免重复过滤
     * @returns {Array<string|number>} 预设循环次数值数组
     * @private
     */
    _getPresetValues() {
        // 如果已缓存，直接返回
        if (this._cachedPresetValues) {
            return this._cachedPresetValues;
        }
        
        const presets = LoopConfigurationService.LOOP_COUNT_PRESETS;
        
        this._cachedPresetValues = presets.filter(p => p.value !== 'custom').map(p => p.value);
        
        return this._cachedPresetValues;
    }

    /**
     * 更新可变时长复选框的完整状态（checked + disabled）
     * 
     * 职责：
     * - 根据 state 更新 checked 状态
     * - 根据 loopCount 更新 disabled 状态（循环次数≤1时禁用）
     * 
     * @param {Object} elements - DOM元素引用
     * @param {number} [loopCount] - 循环次数，如果未提供则从 state 读取
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    updateVariableDurationCheckbox(elements, loopCount = null) {
        const { variableDurationCheckbox } = elements;
        
        // Fail Fast: 检查关键DOM元素
        if (!variableDurationCheckbox) {
            throw new Error('Required element not found: variableDurationCheckbox. Please check HTML structure.');
        }
        
        // 获取循环次数（优先使用传入参数，否则从 state 读取）
        const count = loopCount ?? this.stateManager.state.playback.loop.count;
        
        // 同时更新 checked 和 disabled 状态，确保完整性
        variableDurationCheckbox.checked = this.stateManager.state.playback.loop.variableDuration;
        variableDurationCheckbox.disabled = (count === 0 || count === 1);
    }
}


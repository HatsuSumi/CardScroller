/**
 * ParameterControlUIService - 参数控制UI服务
 * 处理参数设置相关的UI交互，负责输入框参数控制、动画策略选择、颜色选择器等参数UI，以及滚动参数UI更新
 * 
 * 当前被使用的模块：
 * - 无（纯UI服务，通过EventBus被动响应事件）
 * 
 * 当前依赖的模块：
 * - BaseUIService (base/BaseUIService.js) - UI服务基类，提供通用事件管理功能
 * - customSelectFactory (components/CustomSelectFactory.js) - 自定义下拉菜单组件工厂 (通过DI注入)
 * - colorPickerModalService (services/modal/ColorPickerModalService.js) - 颜色选择器模态框服务 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线，触发显示更新事件
 * - stateManager (core/StateManager.js) - 状态管理器，监听和更新各种参数状态
 * - stateWatcherService (system/StateWatcherService.js) - 状态监听服务，监听参数状态变化
 * - scrollStrategyManager (patterns/scroll/ScrollStrategyManager.js) - 滚动策略管理器，提供策略名称常量 (通过DI注入)
 * - debounce (helpers/debounce.js) - 防抖工具函数，用于参数输入防抖
 */
import { BaseUIService } from '../base/BaseUIService.js';
import { ScrollStrategyManager } from '../../patterns/scroll/ScrollStrategyManager.js';
import { debounce } from '../../helpers/debounce.js';

export class ParameterControlUIService extends BaseUIService {
    /**
     * 构造函数 - 初始化参数控制UI服务
     * @param {EventBus} eventBus - 事件总线，用于触发显示更新事件
     * @param {StateManager} stateManager - 状态管理器，监听和更新各种参数状态
     * @param {StateWatcherService} stateWatcherService - 状态监听服务，监听参数状态变化
     * @param {ScrollStrategyManager} scrollStrategyManager - 滚动策略管理器，提供策略名称常量
     * @param {CustomSelectFactory} customSelectFactory - 自定义下拉菜单组件工厂
     * @param {ColorPickerModalService} colorPickerModalService - 颜色选择器模态框服务
     * @throws {Error} 当任何依赖缺失时抛出错误（Fail Fast）
     */
    constructor(eventBus, stateManager, stateWatcherService, scrollStrategyManager, customSelectFactory, colorPickerModalService) {
        super(); // 调用基类构造函数
        
        // 立即验证关键依赖
        if (!eventBus) {
            throw new Error('ParameterControlUIService requires eventBus dependency');
        }
        if (!stateManager) {
            throw new Error('ParameterControlUIService requires stateManager dependency');
        }
        if (!stateWatcherService) {
            throw new Error('ParameterControlUIService requires stateWatcherService dependency');
        }
        if (!scrollStrategyManager) {
            throw new Error('ParameterControlUIService requires scrollStrategyManager dependency');
        }
        if (!customSelectFactory) {
            throw new Error('ParameterControlUIService requires customSelectFactory dependency');
        }
        if (!colorPickerModalService) {
            throw new Error('ParameterControlUIService requires colorPickerModalService dependency');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.stateWatcherService = stateWatcherService;
        this.scrollStrategyManager = scrollStrategyManager;
        this.customSelectFactory = customSelectFactory;
        this.colorPickerModalService = colorPickerModalService;
        this.animationStrategySelect = null;
    }


    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        this._initInputAttributes(); // 动态设置输入框属性（从 JSON 读取）
        this._setupParameterControls();
        this._setupAnimationStrategySelect();
    }

    /**
     * 动态设置数字输入框的 min/max/value 属性（从 defaultState.json 读取）
     * @private
     * @returns {void}
     * @throws {Error} 当关键UI元素不存在时抛出错误（Fail Fast）
     */
    _initInputAttributes() {
        // 输入框配置 - 数据与逻辑分离
        const inputConfigs = [
            { 
                id: 'duration', 
                min: this.stateManager.getDefaultValue('validation.sequence.minDuration'), 
                valuePath: 'playback.scroll.duration' 
            },
            { 
                id: 'loopInterval', 
                min: '0', 
                valuePath: 'playback.loop.intervalTime' 
            },
            { 
                id: 'autoHideDelay', 
                min: '0', 
                valuePath: 'preferences.sidebar.autoHideDelay' 
            }
        ];
        
        // 统一初始化所有输入框 
        inputConfigs.forEach(({ id, min, valuePath }) => {
            const input = this._getElement(id);
            if (!input) {
                throw new Error(`ParameterControlUIService: Critical UI element not found: #${id}`);
            }
            input.setAttribute('min', min);
            input.value = this.stateManager.getDefaultValue(valuePath);
        });
        
        // 初始化页面背景色控件
        this._initBackgroundColorControl();
        
        // 所有输入框初始化完成后，移除初始化类，让它们平滑显示（避免闪烁）
        const controlPanel = this._requireElement('controlPanel');
        controlPanel.classList.remove('initializing');
    }

    /**
     * 初始化页面背景色控件（颜色选择器触发按钮）
     * @private
     * @returns {void}
     * @throws {Error} 当关键UI元素不存在时抛出错误（Fail Fast）
     */
    _initBackgroundColorControl() {
        const triggerBtn = this._getElement('colorPickerTriggerBtn');
        const previewBox = this._getElement('backgroundColorPreview');
        const colorText = this._getElement('backgroundColorText');
        
        if (!triggerBtn) {
            throw new Error('ParameterControlUIService: Critical UI element not found: #colorPickerTriggerBtn');
        }
        if (!previewBox) {
            throw new Error('ParameterControlUIService: Critical UI element not found: #backgroundColorPreview');
        }
        if (!colorText) {
            throw new Error('ParameterControlUIService: Critical UI element not found: #backgroundColorText');
        }
        
        // 从状态中读取默认背景色并初始化预览框和文本
        const defaultColor = this.stateManager.getDefaultValue('ui.display.backgroundColor');
        previewBox.style.backgroundColor = defaultColor;
        colorText.textContent = defaultColor;
        
        // 点击按钮时打开颜色选择器模态框
        triggerBtn.addEventListener('click', () => {
            this.colorPickerModalService.openModal();
        });
        
        // 监听背景色状态变化，同步更新预览框和文本
        this.stateWatcherService.watchState('ui.display.backgroundColor', (newColor) => {
            previewBox.style.backgroundColor = newColor;
            colorText.textContent = newColor;
        });
    }

    /**
     * 设置参数控制相关事件
     * 方法职责拆分，提高可读性
     * @private
     * @returns {void}
     */
    _setupParameterControls() {
        const controls = this._getControlConfigurations();
        
        this._setupInputEventListeners(controls);
        this._setupStateWatchers(controls);
        this._setupResetButton();
        this._setupVariableDurationStateWatcher();
    }

    /**
     * 获取参数控制配置 - 数据与逻辑分离
     * @returns {Array} 控件配置数组
     * @private
     */
    _getControlConfigurations() {
        return [
            { id: 'duration', path: 'playback.scroll.duration', type: 'number' },
            { id: 'loopPlay', path: 'playback.loop.enabled', type: 'boolean' },
            { id: 'loopInterval', path: 'playback.loop.intervalTime', type: 'number' },
            { id: 'hideProgress', path: 'preferences.progressBar.hide', type: 'boolean' },
            { id: 'hideProgressOnPause', path: 'preferences.progressBar.hideOnPause', type: 'boolean' },
            { id: 'keepProgressOnComplete', path: 'preferences.progressBar.keepOnComplete', type: 'boolean' },
            { id: 'autoHideSidebar', path: 'preferences.sidebar.autoHide', type: 'boolean' },
            { id: 'autoHideDelay', path: 'preferences.sidebar.autoHideDelay', type: 'number' },
            { id: 'autoResetAfterComplete', path: 'playback.loop.autoResetAfterComplete', type: 'boolean' },
            { id: 'reverseScroll', path: 'playback.scroll.reverseScroll', type: 'boolean' }
        ];
    }

    /**
     * 设置输入事件监听器 - 单独处理输入事件
     * 使用防抖：减少频繁的状态更新和重绘
     * @param {Array} controls - 控件配置数组
     * @private
     * @returns {void}
     * @throws {Error} 当关键UI元素不存在时抛出错误（Fail Fast）
     */
    _setupInputEventListeners(controls) {
        // 创建防抖函数用于参数输入（性能优化：减少频繁的状态更新）
        const debouncedUpdateState = debounce((path, value) => {
            this._updateStateValue(path, value);
        }, 300);  // 技术实现：输入防抖延迟（毫秒）
        
        controls.forEach(({ id, path, type }) => {
            const element = this._getElement(id);
            if (!element) {
                throw new Error(`ParameterControlUIService: Critical UI element not found: #${id}`);
            }
            element.addEventListener('input', (e) => {
                // 修复：对于数字输入框，如果内容为空或小于最小值，暂时不更新状态
                // 避免输入中间状态（如空、0）时触发底层的强制验证和回滚
                if (type === 'number') {
                    const strVal = e.target.value;
                    const val = parseFloat(strVal);
                    const min = parseFloat(element.getAttribute('min')) || 0;
                    
                    // 无论值是否合法，都触发速度显示更新请求，让UI层显示当前输入的反馈（如显示 "-"）
                    // 传递当前输入值，让DisplayCoordinatorService决定如何显示
                    if (id === 'duration') {
                        this.eventBus.emit('ui:scroll-speed-update-needed', { duration: strVal === '' ? null : val });
                    }
                    
                    if (strVal === '' || (!isNaN(val) && val < min)) {
                        return;
                    }
                }

                const value = this._parseControlValue(e.target, type, id);
                // 使用防抖函数更新状态（性能优化：避免输入时的频繁状态更新）
                debouncedUpdateState(path, value);
            });
        });
    }

    /**
     * 设置状态监听器 - 单独处理状态更新
     * @param {Array} controls - 控件配置数组
     * @private
     * @returns {void}
     */
    _setupStateWatchers(controls) {
        controls.forEach(({ id, path, type }) => {
            this.stateWatcherService.watchState(path, (newValue, oldValue, path, context) => {
                this._updateUIElement(id, newValue, type);
                
                // 以下副作用仅在非 immediate 调用时触发（避免初始化时的不必要警告）
                const isImmediate = context && context.immediate;
                
                // 特殊处理：时长变化时触发显示更新
                if (id === 'duration' && !isImmediate) {
                    this.eventBus.emit('ui:scroll-speed-update-needed');
                }
                
                // 特殊处理：循环播放状态变化时触发循环提示更新
                if (id === 'loopPlay' && !isImmediate) {
                    this.eventBus.emit('ui:loop-hint-update-needed');
                }
                
                // 特殊处理：反向滚动状态变化时清空入场动画配置（仅在用户主动改变时处理）
                if (id === 'reverseScroll' && !isImmediate) {
                    const entryAnimation = this.stateManager.state.playback.entryAnimation;
                    const hasEntryAnimation = entryAnimation.enabled;
                    const hasMarkedCards = entryAnimation.cardBoundaries && entryAnimation.cardBoundaries.length > 0;
                    
                    if (hasEntryAnimation && hasMarkedCards) {
                        // 立即修复无效状态：清空配置并禁用
                        this.stateManager.state.playback.entryAnimation.enabled = false;
                        this.stateManager.state.playback.entryAnimation.cardBoundaries = [];
                        this.stateManager.state.playback.entryAnimation.cardAnimations = [];
                        this.stateManager.state.playback.entryAnimation.markedAtStartPosition = null;
                        this.stateManager.state.playback.entryAnimation.markedAtEndPosition = null;
                        
                        // 通知用户
                        this.eventBus.emit('ui:show-warning-message', {
                            message: '反向滚动设置已改变，入场动画配置已重置。'
                        });
                    }
                }
            }, { immediate: true });
        });
    }

    /**
     * 解析控件值 - 单独处理值转换
     * @param {Element} target - 目标元素
     * @param {string} type - 值类型：'number' 或 'boolean'
     * @param {string} id - 元素ID
     * @returns {*} 解析后的值
     * @private
     * @throws {Error} 当值类型无效时抛出错误（Fail Fast）
     */
    _parseControlValue(target, type, id) {
        if (type === 'number') {
            // autoHideDelay支持小数，其他为整数
            return id === 'autoHideDelay' 
                ? (parseFloat(target.value) || 0) 
                : (parseInt(target.value) || 0);
        } else if (type === 'boolean') {
            return target.checked;
        }
        throw new Error(`ParameterControlUIService: Invalid control type "${type}". Expected: 'number' or 'boolean'`);
    }

    /**
     * 更新状态值 - 单独处理状态更新
     * @param {string} path - 状态路径
     * @param {*} value - 新值
     * @private
     * @returns {void}
     */
    _updateStateValue(path, value) {
        // 使用 StateManager 的 setValue 方法，支持任意深度的路径
        this.stateManager.setValue(path, value, {});
    }

    /**
     * 更新UI元素 - 单独处理UI更新
     * @param {string} id - 元素ID
     * @param {*} newValue - 新值
     * @param {string} type - 值类型
     * @private
     * @returns {void}
     * @throws {Error} 当UI元素不存在时抛出错误（Fail Fast）
     */
    _updateUIElement(id, newValue, type) {
        const element = this._getElement(id);
        if (!element) {
            throw new Error(`ParameterControlUIService: UI element not found for state update: #${id}`);
        }
        
        // 修复：如果元素当前拥有焦点（用户正在编辑），则不从后台强制更新值
        // 避免防抖延迟导致的状态回弹（例如：用户输入1后立即删除，300ms后后台更新为1并强制回填到输入框）
        if (document.activeElement === element) {
            return;
        }

        if (type === 'boolean') {
            element.checked = newValue;
        } else {
            element.value = newValue;
        }
    }

    /**
     * 设置重置按钮 - 单独处理重置功能
     * @private
     * @returns {void}
     * @throws {Error} 当关键UI元素不存在时抛出错误（Fail Fast）
     */
    _setupResetButton() {
        const resetLoopIntervalBtn = this._getElement('resetLoopInterval');
        if (!resetLoopIntervalBtn) {
            throw new Error('ParameterControlUIService: Critical UI element not found: #resetLoopInterval');
        }
        resetLoopIntervalBtn.addEventListener('click', () => {
            // 通过StateManager统一管理状态重置
            this.stateManager.resetProperty('playback.loop.intervalTime');
        });
    }

    /**
     * 设置动画策略选择器
     * @private
     * @returns {void}
     * @throws {Error} 当关键UI元素不存在时抛出错误（Fail Fast）
     */
    _setupAnimationStrategySelect() {
        const animationStrategySelectElement = this._getElement('animationStrategySelect');
        
        // Fail Fast: 如果关键元素不存在，立即抛出错误
        if (!animationStrategySelectElement) {
            throw new Error('ParameterControlUIService: Critical UI element not found: #animationStrategySelect');
        }

        // 动态生成动画策略选项（从 JSON 读取）
        this._initAnimationStrategyOptions(animationStrategySelectElement);

        // 创建自定义选择器（通过工厂）
        this.animationStrategySelect = this.customSelectFactory.create(animationStrategySelectElement);

        // 监听选择变化
        animationStrategySelectElement.addEventListener('change', (e) => {
            const value = e.detail.value;
            this.stateManager.state.preferences.scrolling.animationStrategy = value;
        });

        // 监听状态变化并更新UI
        this.stateWatcherService.watchState('preferences.scrolling.animationStrategy', (newValue) => {
            if (this.animationStrategySelect) {
                this.animationStrategySelect.setValue(newValue);
            }
        });

        // 设置初始值
        const currentStrategy = this.stateManager.state.preferences.scrolling.animationStrategy;
        
        // Fail Fast: 验证配置存在（应该从defaultState.json加载）
        if (!currentStrategy) {
            throw new Error('ParameterControlUIService: preferences.scrolling.animationStrategy is required in state');
        }
        
        this.animationStrategySelect.setValue(currentStrategy);
    }

    /**
     * 动态生成动画策略选项
     * 从 ScrollStrategyManager 获取策略列表，使用 HTML Template + Clone 方式渲染
     * @param {HTMLElement} selectElement - 下拉选择器元素
     * @private
     * @returns {void}
     * @throws {Error} 当关键模板元素不存在时抛出错误（Fail Fast）
     */
    _initAnimationStrategyOptions(selectElement) {
        const optionsContainer = selectElement.querySelector('.select-options');
        const template = this._getElement('animationStrategyOptionTemplate');
        
        // Fail Fast: 如果关键模板不存在，立即抛出错误
        if (!template) {
            throw new Error('ParameterControlUIService: Critical template not found: #animationStrategyOptionTemplate');
        }
        
        // 从 ScrollStrategyManager 动态获取可用策略列表
        const strategies = this.scrollStrategyManager.getAvailableStrategies();
        
        // 策略名称映射（用户友好显示）
        const { LINEAR, EASE_IN, EASE_OUT, EASE_IN_OUT, ELASTIC } = ScrollStrategyManager.STRATEGY_NAMES;
        const strategyLabels = {
            [LINEAR]: { label: '线性', description: '匀速滚动' },
            [EASE_IN]: { label: '缓入', description: '慢开始，逐渐加速' },
            [EASE_OUT]: { label: '缓出', description: '快开始，逐渐减速' },
            [EASE_IN_OUT]: { label: '缓入缓出', description: '慢开始，中间加速，最后减速' },
            [ELASTIC]: { label: '弹性', description: '弹性效果' }
        };
        
        // 清空现有选项 - 使用BaseUIService统一DOM操作
        optionsContainer.innerHTML = '';
        
        // 使用DocumentFragment批量添加DOM，避免多次重排（性能优化）
        const fragment = document.createDocumentFragment();
        
        // 动态生成选项
        strategies.forEach(strategy => {
            const optionElement = template.content.cloneNode(true).querySelector('.select-option');
            optionElement.setAttribute('data-value', strategy);
            
            const labelSpan = optionElement.querySelector('.option-label');
            const descSpan = optionElement.querySelector('.option-description');
            
            // Fail Fast：如果策略标签未定义，立即抛出错误
            const labelInfo = strategyLabels[strategy];
            if (!labelInfo) {
                throw new Error(`Animation strategy label not found: "${strategy}". Please update strategyLabels mapping in ParameterControlUIService._initAnimationStrategyOptions()`);
            }
            
            labelSpan.textContent = labelInfo.label;
            descSpan.textContent = labelInfo.description;
            
            fragment.appendChild(optionElement);
        });
        
        // 一次性添加所有选项，只触发一次重排
        optionsContainer.appendChild(fragment);
    }

    /**
     * 设置变长时长状态监听器 - 控制滚动时长输入框的启用/禁用状态
     * @private
     * @returns {void}
     */
    _setupVariableDurationStateWatcher() {
        // 监听影响时长输入框状态的三个关键状态：
        // 1. variableDuration: 是否启用变长时长
        // 2. count: 循环次数
        // 3. enabled: 是否启用循环播放（修复Bug：关闭循环播放时应立即启用输入框）
        const watchPaths = [
            'playback.loop.variableDuration', 
            'playback.loop.count',
            'playback.loop.enabled'
        ];
        
        // 提取共同的handler，避免创建多个相同的函数
        const handler = () => this._updateDurationInputState();
        
        watchPaths.forEach(path => {
            this.stateWatcherService.watchState(path, handler);
        });
    }

    /**
     * 更新滚动时长输入框的启用/禁用状态
     * 当启用循环播放 且 启用变长时长 且 循环次数大于1时，禁用输入框
     * @private
     * @returns {void}
     * @throws {Error} 当关键UI元素不存在时抛出错误（Fail Fast）
     */
    _updateDurationInputState() {
        const loopState = this.stateManager.state.playback.loop;
        const variableDuration = loopState.variableDuration;
        const loopCount = loopState.count;
        const isLoopEnabled = loopState.enabled;
        
        // 只有在(启用循环 且 启用变长时长 且 循环次数大于1)时才禁用输入框
        // 修复Bug：必须检查isLoopEnabled，否则在关闭循环播放后，
        // 残留的variableDuration状态会导致输入框被错误禁用
        const shouldDisable = isLoopEnabled && variableDuration && loopCount > 1;
        
        // 🔍 调试埋点：追踪输入框间歇性被禁用的原因
        // 如果在未开启循环/变长时长时看到此日志，说明状态判断逻辑或状态同步有问题
        if (shouldDisable) {
            console.log('[Debug] ParameterControlUIService is disabling duration:', {
                isLoopEnabled, variableDuration, loopCount, shouldDisable
            });
        }
        
        const durationInput = this._getElement('duration');
        if (!durationInput) {
            throw new Error('ParameterControlUIService: Critical UI element not found: #duration');
        }
        
        // 统一设置禁用状态和CSS类
        durationInput.disabled = shouldDisable;
        if (shouldDisable) {
            durationInput.classList.add('playing-disabled');
        } else {
            durationInput.classList.remove('playing-disabled');
        }
    }

}

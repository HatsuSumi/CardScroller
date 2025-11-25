import { BaseModalService } from '../base/BaseModalService.js';
import { debounce } from '../../helpers/debounce.js';

/**
 * AdvancedLoopService - 高级循环模态框服务
 * 管理高级循环设置和变长时长配置，纯UI协调者，负责模态框的显示和用户交互，所有业务逻辑委托给专门的服务。功能包括：循环次数配置（预设和自定义）、变长时长序列管理、循环提示更新。继承自BaseModalService。
 * 
 * 当前被使用的模块：
 * - 无（通过 KeyboardService 快捷键机制和按钮点击事件自动触发打开）
 * 
 * 当前依赖的模块：
 * - BaseModalService (base/BaseModalService.js) - 模态框基类
 *   ↳ BaseUIService (base/BaseUIService.js) - UI服务基类，提供DOM缓存和事件管理功能
 * - customSelectFactory (components/CustomSelectFactory.js) - 自定义下拉菜单组件工厂 (通过DI注入)
 * - loopConfigurationService (business/LoopConfigurationService.js) - 循环配置管理服务 (通过DI注入)
 * - durationSequenceService (business/DurationSequenceService.js) - 时长序列管理服务 (通过DI注入)
 * - displayCoordinatorService (ui/DisplayCoordinatorService.js) - 显示协调服务，管理循环提示显示 (通过DI注入)
 * - keyboardService (utils/KeyboardService.js) - 键盘快捷键管理服务 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - stateWatcherService (system/StateWatcherService.js) - 状态监听服务 (通过DI注入)
 * - debounce (helpers/debounce.js) - 防抖工具函数 (直接导入)
 */
export class AdvancedLoopService extends BaseModalService {
    /**
     * 构造函数
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务
     * @param {StateManager} stateManager - 状态管理器
     * @param {LoopConfigurationService} loopConfigurationService - 循环配置管理服务
     * @param {DurationSequenceService} durationSequenceService - 时长序列管理服务
     * @param {DisplayCoordinatorService} displayCoordinatorService - 显示协调服务
     * @param {StateWatcherService} stateWatcherService - 状态监听服务
     * @param {CustomSelectFactory} customSelectFactory - 自定义下拉菜单组件工厂
     * @throws {Error} 当核心依赖（loopConfigurationService/durationSequenceService/displayCoordinatorService/stateWatcherService/customSelectFactory）缺失时抛出错误（Fail Fast）
     */
    constructor(keyboardService, stateManager, loopConfigurationService, durationSequenceService, displayCoordinatorService, stateWatcherService, customSelectFactory) {
        super(keyboardService);
        
        // Fail Fast: 验证核心依赖
        if (!stateManager) {
            throw new Error('StateManager is required for AdvancedLoopService');
        }
        if (!loopConfigurationService) {
            throw new Error('LoopConfigurationService is required for AdvancedLoopService');
        }
        if (!durationSequenceService) {
            throw new Error('DurationSequenceService is required for AdvancedLoopService');
        }
        if (!displayCoordinatorService) {
            throw new Error('DisplayCoordinatorService is required for AdvancedLoopService');
        }
        if (!stateWatcherService) {
            throw new Error('StateWatcherService is required for AdvancedLoopService');
        }
        if (!customSelectFactory) {
            throw new Error('CustomSelectFactory is required for AdvancedLoopService');
        }
        
        // 业务服务依赖
        this.stateManager = stateManager;
        this.loopConfigurationService = loopConfigurationService;
        this.customSelectFactory = customSelectFactory;
        this.durationSequenceService = durationSequenceService;
        this.displayCoordinatorService = displayCoordinatorService;
        this.stateWatcherService = stateWatcherService;
        
        // 自定义下拉菜单实例
        this.loopCountSelect = null;
        
        // 存储模态框打开时的原始设置，用于取消时恢复
        this.originalSettings = {};
        
        // 用户选择意图标志：记录用户是否主动选择了自定义模式
        this.userSelectedCustomMode = false;
        
        // 绑定事件处理方法，防止内存泄漏
        this._boundHandleCancel = this._cancelModal.bind(this);
        this._boundHandleConfirm = this._confirmModal.bind(this);
        this._boundHandleOverlayClick = this._handleOverlayClick.bind(this);
        
        // 设置服务间的回调函数
        this._setupServiceCallbacks();
    }

    /**
     * 设置服务间的回调函数
     * 
     * 为 LoopConfigurationService 设置回调，实现服务间的松耦合通信。
     * DurationSequenceService 已实现完整的输入框生命周期管理（创建+验证），无需回调。
     * 
     * @returns {void}
     * @private
     */
    _setupServiceCallbacks() {
        // 创建防抖的循环次数更新回调
        const debouncedLoopCountUpdate = debounce((value) => {
            // 静默批量更新状态（不触发监听器），手动控制UI更新时机
            this.stateManager.batch(() => {
                // 1. 先保存当前时长序列数据（旧的输入框）
                this.durationSequenceService.updateDurationSequenceData(this.elements);
                
                // 2. 更新循环次数
                this.stateManager.state.playback.loop.count = value;
                
                // 🎯 不清除复选框状态，让 disabled 属性控制可用性
                // 当循环次数≤1时，复选框会被禁用但保持勾选状态（灰色勾选）
                // 这样用户切换回来时无需重新勾选，state.variableDuration 记住用户意图
                // 业务逻辑（ScrollService/LoopHintService）已正确处理：
                // - 只在 loopCount > 1 时才使用 variableDuration
                // - 禁用状态下不会误触发变长时长逻辑
            }, { silent: true });
            
            // 3. 静默更新后手动更新UI（创建新的输入框）
            this._updateModalUI();
            
            // 4. 再次保存时长序列数据（新的输入框），确保序列长度与循环次数一致
            // 注意：只有在启用变长时长且循环次数>1时，才会有输入框
            const isVariableDurationEnabled = this.stateManager.state.playback.loop.variableDuration;
            const loopCount = this.stateManager.state.playback.loop.count;
            if (isVariableDurationEnabled && loopCount > 1) {
                this.durationSequenceService.updateDurationSequenceData(this.elements);
            }
        }, 300);  // 技术实现：输入防抖延迟（毫秒）

        // 设置循环配置服务的回调
        this.loopConfigurationService.setCallbacks({
            onDurationSequenceUpdate: () => this.durationSequenceService.updateDurationSequence(this.elements),
            onHintDisplayUpdate: () => this._updateHintDisplay(),
            onDebouncedLoopCountUpdate: debouncedLoopCountUpdate,
            onDurationSequenceSave: (elements) => this.durationSequenceService.updateDurationSequenceData(elements),
            // 用户选择模式的回调
            onUserSelectCustomMode: () => { this.userSelectedCustomMode = true; },
            onUserSelectPresetMode: () => { this.userSelectedCustomMode = false; }
        });
    }

    /**
     * 初始化服务
     * 
     * 调用基类初始化，然后设置自定义下拉菜单、业务事件监听器和循环状态显示。
     * 
     * @returns {void}
     * @public
     */
    init() {
        super.init(); // 调用基类初始化
        this._setupCustomSelects();
        this._setupBusinessEventListeners();
        this._setupLoopStatusDisplay();
        
        // 初始化时长序列服务的防抖验证（必须在 stateManager 完全初始化后）
        this.durationSequenceService.initDebouncedValidation();
    }

    /**
     * 获取模态框配置
     * @returns {Object} 模态框配置对象
     * @protected
     */
    _getModalConfig() {
        return {
            name: '高级循环模态框',
            elements: {
                openBtn: '#advancedLoopBtn',
                modal: '#advancedLoopModal',
                // 不使用基类的 closeBtn 自动绑定，因为关闭按钮需要触发取消逻辑
                additionalCloseBtns: []
            },
            openTrigger: true,
            closeOnOverlayClick: false, // 不使用基类的遮罩点击，自己绑定取消逻辑
            escToClose: true // ESC键触发取消逻辑（在 _registerShortcuts 中自定义）
        };
    }

    /**
     * 设置DOM引用 - 重写以添加额外的元素引用
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @protected
     */
    _setupDOMReferences(config) {
        super._setupDOMReferences(config);
        
        // 添加业务相关的DOM元素引用 - 使用继承的缓存方法
        Object.assign(this.elements, {
            closeBtn: this._getElement('advancedLoopModalClose'), // 手动获取关闭按钮
            advancedLoopModalCancel: this._getElement('advancedLoopModalCancel'),
            advancedLoopModalConfirm: this._getElement('advancedLoopModalConfirm'),
            
            loopCountSelectElement: this._getElement('loopCountSelect'),
            customLoopCountInput: this._getElement('customLoopCount'),
            variableDurationCheckbox: this._getElement('variableDuration'),
            durationPatternControl: this._getElement('durationPatternControl'),
            durationSequenceList: this._getElement('durationSequenceList'),
            durationSequenceItemTemplate: this._getElement('durationSequenceItemTemplate')
        });
    }

    /**
     * 设置事件监听器 - 重写以添加确认/取消按钮
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @throws {Error} 当关键按钮或模态框元素不存在时抛出错误（Fail Fast）
     * @protected
     */
    _setupEventListeners(config) {
        super._setupEventListeners(config); // 调用基类的事件监听器设置，其中已包含 DOM 元素的 Fail Fast 检查
        
        const { 
            closeBtn,
            advancedLoopModalCancel, 
            advancedLoopModalConfirm,
            modal
        } = this.elements;

        // 关闭按钮（×）- 触发取消逻辑
        closeBtn.addEventListener('click', this._boundHandleCancel);

        // 取消按钮
        advancedLoopModalCancel.addEventListener('click', this._boundHandleCancel);

        // 确认按钮
        advancedLoopModalConfirm.addEventListener('click', this._boundHandleConfirm);

        // 点击遮罩层触发取消操作
        modal.addEventListener('click', this._boundHandleOverlayClick);
    }

    /**
     * 设置自定义下拉菜单
     * 
     * 初始化循环次数选择器的自定义下拉菜单，
     * 并将实例存储到元素上供其他方法访问。
     * 
     * @returns {void}
     * @throws {Error} 当循环次数选择器元素不存在时抛出错误（Fail Fast）
     * @private
     */
    _setupCustomSelects() {
        const { loopCountSelectElement } = this.elements; // 已在基类 _setupDOMReferences() 中进行 Fail Fast 检查
        
        // 动态生成循环次数选项（从 defaultState.json 读取预设值）
        // 使用 HTML Template + Clone 方式
        this.loopConfigurationService.initLoopCountSelect(loopCountSelectElement);
        
        // 初始化自定义下拉菜单（通过工厂）
        this.loopCountSelect = this.customSelectFactory.create(loopCountSelectElement);
        
        // 将实例存储到元素上，以便在其他方法中访问
        loopCountSelectElement.customSelect = this.loopCountSelect;
    }

    /**
     * 设置业务相关事件监听器
     * 
     * 委托给 LoopConfigurationService 处理循环配置相关的事件监听。
     * 
     * @returns {void}
     * @private
     */
    _setupBusinessEventListeners() {
        // 委托给循环配置服务处理事件监听
        this.loopConfigurationService.setupEventListeners(this.elements, this.loopCountSelect);
    }

    /**
     * 设置循环状态显示
     * 
     * 监听状态变化并同步UI：
     * - playback.loop.count: 循环次数变化时重新渲染序列
     * - playback.loop.variableDuration: 变长时长开关变化时重新渲染序列
     * - playback.loop.durationSequence: 时长序列数据变化时重新渲染
     * 
     * @returns {void}
     * @private
     */
    _setupLoopStatusDisplay() {
        // 🎯 使用统一处理函数，避免代码重复
        // 通用处理：重新渲染序列（如果模态框可见）+ 更新提示（即使模态框不可见）
        // 注：静默更新不会触发这些监听器，无需防重入检查
        const handleUIAndHintUpdate = () => {
            if (this._isModalVisible()) {
                this._syncUIFromState(); // 重新渲染序列 + 更新提示（_syncUIFromState 内部已调用）
            } else {
                this._updateHintDisplay(); // 模态框不可见时，只更新提示（主界面显示）
            }
        };
        
        // 监听循环次数变化 - 影响序列长度和提示显示
        this.stateWatcherService.watchState('playback.loop.count', handleUIAndHintUpdate);
        
        // 监听变长时长开关 - 影响序列显示和提示显示
        this.stateWatcherService.watchState('playback.loop.variableDuration', handleUIAndHintUpdate);
        
        // 监听时长序列数据变化 - 仅重新渲染序列（如配置导入），不影响提示
        this.stateWatcherService.watchState('playback.loop.durationSequence', () => {
            if (this._isModalVisible()) {
                this._syncUIFromState(); // 重新渲染序列 + 更新提示
            }
        });
        
        // 设置完监听器后，更新提示显示状态
        this._updateHintDisplay();
    }

    /**
     * 模态框打开前钩子 - 保存原始设置
     * 
     * 保存当前的循环配置（循环次数、变长时长开关、时长序列），
     * 用于用户取消时恢复原始设置。
     * 
     * @returns {boolean} 始终返回 true，允许打开模态框
     * @protected
     */
    _onBeforeOpen() {
        // 保存当前设置（保持原值，包括 undefined/null）
        this.originalSettings = {
            loopCount: this.stateManager.state.playback.loop.count,
            variableDuration: this.stateManager.state.playback.loop.variableDuration,
            durationSequence: this.stateManager.state.playback.loop.durationSequence
        };
        
        // 重置用户选择标志，让UI智能判断显示模式
        this.userSelectedCustomMode = false;
        
        return true;
    }

    /**
     * 模态框打开后钩子 - 更新UI
     * 
     * 模态框打开后，同步UI显示当前状态。
     * 
     * @returns {void}
     * @protected
     */
    _onAfterOpen() {
        // 更新模态框中的UI
        this._updateModalUI();
    }

    /**
     * 注册快捷键 - 重写以自定义 ESC 键行为
     * @param {Object} config - 模态框配置对象
     * @protected
     */
    _registerShortcuts(config) {
        // 不调用 super._registerShortcuts(config)，完全自定义快捷键行为
        
        // 注意：keyboardService 已在 BaseModalService 构造函数中 Fail Fast 检查，此处无需重复检查
        if (config.escToClose) {
            // ESC 键触发取消操作（恢复原始设置）
            this.keyboardService.registerConditional(
                'escape', 
                () => {
                    this._cancelModal();
                },
                () => this._isModalVisible(),
                this,
                { preventDefault: true }
            );
        }
    }

    /**
     * 取消操作，恢复原始设置
     * 
     * 用户点击取消按钮、关闭按钮或按ESC键时调用，
     * 恢复模态框打开前保存的原始设置。
     * 
     * @returns {void}
     * @private
     */
    _cancelModal() {
        // 静默批量恢复原始设置（不触发验证和UI更新）
        this.stateManager.batch(() => {
            this.stateManager.state.playback.loop.count = this.originalSettings.loopCount;
            this.stateManager.state.playback.loop.variableDuration = this.originalSettings.variableDuration;
            if (this.originalSettings.durationSequence) {
                this.stateManager.state.playback.loop.durationSequence = this.originalSettings.durationSequence;
            }
        }, { silent: true });
        
        this.closeModal(); // 调用基类的关闭方法（不用 super，直接 this 即可）
    }

    /**
     * 确认操作
     * 
     * 用户点击确认按钮时调用，验证输入并保存设置到状态管理器。
     * 如果有验证错误，则不关闭模态框。
     * 
     * @returns {void}
     * @private
     */
    _confirmModal() {
        // 委托给 DurationSequenceService 检查验证错误
        if (this.durationSequenceService.hasValidationErrors(this.elements)) {
            return; // 有错误时不执行确认操作
        }
        
        // 确认时保存时长序列数据到状态管理器
        this.durationSequenceService.updateDurationSequenceData(this.elements);
        
        this.closeModal(); // 调用基类的关闭方法（不用 super，直接 this 即可）
    }

    /**
     * 更新模态框UI
     * 
     * 同步模态框中的所有UI元素：
     * - 循环次数选择器
     * - 变长时长复选框
     * - 时长序列列表
     * - 提示信息
     * 
     * @returns {void}
     * @private
     */
    _updateModalUI() {
        this.loopConfigurationService.updateLoopCountSelect(this.elements, this.loopCountSelect, this.userSelectedCustomMode);
        this.loopConfigurationService.updateVariableDurationCheckbox(this.elements);
        this.durationSequenceService.updateDurationSequence(this.elements);
        this._updateHintDisplay();
    }

    /**
     * 更新提示显示状态（综合考虑所有相关状态）
     * @returns {void}
     * @private
     */
    _updateHintDisplay() {
        // 委托给显示协调服务处理
        this.displayCoordinatorService.updateLoopHintDisplay();
    }


    /**
     * 从状态管理器同步UI（用于配置导入等场景）
     * 
     * 当状态管理器中的状态发生变化时（如配置导入），
     * 同步更新模态框UI和提示显示。
     * 
     * @returns {void}
     * @private
     */
    _syncUIFromState() {
        // 如果模态框是打开的，立即更新模态框UI
        if (this._isModalVisible()) {
            this._updateModalUI();
        }
        
        // 无论模态框是否打开，都更新提示显示
        this._updateHintDisplay();
    }
    
    /**
     * 处理遮罩层点击事件 - 点击遮罩关闭为取消操作
     * @param {Event} e - 点击事件
     * @returns {void}
     * @private
     */
    _handleOverlayClick(e) {
        if (e.target === e.currentTarget) {
            this._cancelModal();
        }
    }
    
    /**
     * 模态框关闭后钩子
     * @returns {void}
     * @protected
     */
    _onAfterClose() {
        // 事件监听器是在 _setupEventListeners 中永久绑定的，无需手动移除
        // 基类会处理快捷键的清理（通过条件检查）
    }

}
import { BaseModalService } from '../base/BaseModalService.js';

/**
 * ColorPickerModalService - 颜色选择器模态框服务
 * 管理自定义颜色选择器模态框的显示、用户交互和数据持久化。继承自BaseModalService。
 * 
 * 职责说明：
 * - 管理颜色选择器模态框的打开/关闭
 * - 创建和销毁 ColorPicker 组件实例
 * - 处理"确定"/"取消"按钮交互
 * - 将用户选择的颜色保存到 StateManager（状态变化自动通知其他组件）
 * - 响应拾色器事件，临时隐藏/恢复模态框（让用户能吸取页面颜色）
 * 
 * 当前被使用的模块：
 * - ParameterControlUIService (services/ui/ParameterControlUIService.js) - 通过触发按钮打开颜色选择器
 * 
 * 当前依赖的模块：
 * - BaseModalService (base/BaseModalService.js) - 模态框基类 (通过继承)
 *   ↳ BaseUIService (base/BaseUIService.js) - UI服务基类，提供DOM缓存和事件管理功能
 * - keyboardService (utils/KeyboardService.js) - 键盘快捷键管理服务 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - validationService (system/ValidationService.js) - 验证服务 (通过DI注入)
 * - colorPickerFactory (components/ColorPickerFactory.js) - 颜色选择器工厂 (通过DI注入)
 */
export class ColorPickerModalService extends BaseModalService {
    /**
     * 构造函数
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务
     * @param {EventBus} eventBus - 事件总线
     * @param {StateManager} stateManager - 状态管理器
     * @param {ValidationService} validationService - 验证服务
     * @param {ColorPickerFactory} colorPickerFactory - 颜色选择器工厂
     * @throws {Error} 当核心依赖（eventBus/stateManager/validationService/colorPickerFactory）缺失时抛出错误（Fail Fast）
     */
    constructor(keyboardService, eventBus, stateManager, validationService, colorPickerFactory) {
        super(keyboardService);
        
        // Fail Fast: 验证核心依赖
        if (!eventBus) {
            throw new Error('ColorPickerModalService requires eventBus dependency');
        }
        if (!stateManager) {
            throw new Error('ColorPickerModalService requires stateManager dependency');
        }
        if (!validationService) {
            throw new Error('ColorPickerModalService requires validationService dependency');
        }
        if (!colorPickerFactory) {
            throw new Error('ColorPickerModalService requires colorPickerFactory dependency');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.validationService = validationService;
        this.colorPickerFactory = colorPickerFactory;
        
        // ColorPicker 组件实例（在 init 时创建一次，整个生命周期保持）
        this.colorPickerInstance = null;
        
        // 临时存储的颜色值（用户选择但未确认的颜色）
        this.tempColor = null;
        
        // 原始颜色值（模态框打开时的背景色，用于取消时恢复）
        this.originalColor = null;
        
        // 拾色器操作时的Canvas状态标记（用于恢复）
        this._needRestoreCanvasHidden = false;
        this._needRestoreEntryCanvas = false;
        
        // 绑定事件处理方法，防止内存泄漏
        this._boundHandleConfirm = this._handleConfirm.bind(this);
        this._boundHandleCancel = this._handleCancel.bind(this);
    }
    
    /**
     * 获取模态框配置
     * @returns {Object} 模态框配置对象
     * @protected
     */
    _getModalConfig() {
        return {
            name: '颜色选择器模态框',
            modalId: 'colorPickerModal',
            elements: {
                openBtn: '#colorPickerTriggerBtn'
            },
            openTrigger: true,
            closeOnOverlayClick: false, // 点击遮罩层不关闭，必须点击按钮
            escToClose: true // ESC键关闭（触发取消逻辑）
        };
    }
    
    /**
     * 设置DOM引用 - 重写以添加额外的元素引用
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时抛出错误（Fail Fast）
     * @protected
     */
    _setupDOMReferences(config) {
        super._setupDOMReferences(config);
        
        // 添加业务相关的DOM元素引用
        Object.assign(this.elements, {
            container: this._querySelector('.color-picker-modal-container'),
            confirmBtn: this._getElement('colorPickerConfirmBtn'),
            cancelBtn: this._getElement('colorPickerCancelBtn'),
            closeBtn: this._querySelector('.color-picker-modal-close')
        });
        
        // Fail Fast: 验证必需元素
        if (!this.elements.container) {
            throw new Error('ColorPickerModalService: .color-picker-modal-container not found. Please check HTML structure.');
        }
        if (!this.elements.confirmBtn) {
            throw new Error('ColorPickerModalService: #colorPickerConfirmBtn not found. Please check HTML structure.');
        }
        if (!this.elements.cancelBtn) {
            throw new Error('ColorPickerModalService: #colorPickerCancelBtn not found. Please check HTML structure.');
        }
        if (!this.elements.closeBtn) {
            throw new Error('ColorPickerModalService: .color-picker-modal-close not found. Please check HTML structure.');
        }
        
        // 创建 ColorPicker 实例（通过工厂，生命周期与服务相同）
        this.colorPickerInstance = this.colorPickerFactory.create(
            this.elements.container,
            this.validationService,
            {
                onChange: (color) => {
                    // 颜色变化时更新临时值（但不保存到 StateManager）
                    this.tempColor = color;
                }
            }
        );
    }
    
    /**
     * 设置事件监听器 - 重写以添加确认/取消按钮和拾色器事件
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @protected
     */
    _setupEventListeners(config) {
        super._setupEventListeners(config);
        
        const { confirmBtn, cancelBtn, closeBtn } = this.elements;
        
        // 确认按钮
        confirmBtn.addEventListener('click', this._boundHandleConfirm);
        
        // 取消按钮
        cancelBtn.addEventListener('click', this._boundHandleCancel);
        
        // 关闭按钮（×）- 触发取消逻辑
        closeBtn.addEventListener('click', this._boundHandleCancel);
        
        // 监听拾色器事件：开始时隐藏模态框（让用户能看到后面的图片）
        this.eventBus.on('ui:color-picker-eyedropper-start', () => {
            this._hideModalTemporarily();
        });
        
        // 监听拾色器事件：结束时恢复模态框显示
        this.eventBus.on('ui:color-picker-eyedropper-end', () => {
            this._showModalAgain();
        });
    }
    
    /**
     * 注册快捷键 - 重写以自定义ESC键行为
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @protected
     */
    _registerShortcuts(config) {
        if (config.escToClose) {
            // ESC 键触发取消逻辑（而非直接关闭）
            this.keyboardService.registerConditional(
                'escape',
                () => {
                    this._handleCancel();
                },
                () => this._isModalVisible(),
                this,
                { preventDefault: true }
            );
        }
    }
    
    /**
     * 模态框打开前钩子 - 设置初始颜色
     * @returns {boolean} 返回true继续打开，返回false取消打开
     * @protected
     */
    _onBeforeOpen() {
        // 保存原始颜色（用于取消时恢复）
        this.originalColor = this.stateManager.getValue('ui.display.backgroundColor') || '#ffffff';
        this.tempColor = this.originalColor;
        
        // 设置 ColorPicker 的初始颜色
        this.colorPickerInstance.setColor(this.originalColor);
        
        return true;
    }
    
    /**
     * 模态框关闭后钩子 - 清理临时状态
     * @returns {void}
     * @protected
     */
    _onAfterClose() {
        // 清空临时值
        this.tempColor = null;
        this.originalColor = null;
    }
    
    /**
     * 处理确认按钮点击 - 保存颜色并关闭模态框
     * @returns {void}
     * @private
     */
    _handleConfirm() {
        // 保存颜色到 StateManager（状态变化会自动通过 StateWatcherService 通知其他UI组件）
        this.stateManager.state.ui.display.backgroundColor = this.tempColor;
        
        // 关闭模态框
        this.closeModal();
    }
    
    /**
     * 处理取消按钮点击 - 恢复原始颜色并关闭模态框
     * @returns {void}
     * @private
     */
    _handleCancel() {
        // 不保存任何更改，直接关闭
        // 如果用户在 ColorPicker 中预览了其他颜色，这里不恢复到 StateManager
        // （因为 onChange 回调只更新 tempColor，不修改 StateManager）
        this.closeModal();
    }
    
    /**
     * 临时隐藏模态框 - 用于拾色器操作时让用户看到后面的内容
     * @returns {void}
     * @private
     */
    _hideModalTemporarily() {
        // 添加CSS类临时隐藏（保留动画效果）
        if (this.elements.modal && this.elements.modal.classList.contains('show')) {
            this.elements.modal.classList.add('eyedropper-active');
            
            // 🔑 关键修复：确保用户能从图片中吸取颜色
            // 策略：隐藏entry-canvas，显示scroll-canvas（完整图片），触发渲染
            const scrollCanvas = this._getElement('scrollCanvas');
            const entryCanvas = this._getElement('entryCanvas');
            
            // Fail Fast: 验证关键DOM元素存在
            if (!scrollCanvas) {
                throw new Error('ColorPickerModalService: scrollCanvas element not found when hiding modal temporarily');
            }
            if (!entryCanvas) {
                throw new Error('ColorPickerModalService: entryCanvas element not found when hiding modal temporarily');
            }
            
            // 隐藏entry-canvas（避免遮挡scroll-canvas）
            if (!entryCanvas.classList.contains('hidden')) {
                entryCanvas.classList.add('hidden');
                this._needRestoreEntryCanvas = true;
            }
            
            // 确保scroll-canvas显示
            if (scrollCanvas.classList.contains('hidden')) {
                scrollCanvas.classList.remove('hidden');
                this._needRestoreCanvasHidden = true;
            }
            
            // 🔑 触发重新渲染：确保Canvas上有图片内容（无论是否hidden）
            this.eventBus.emit('display:render-full-image');
            
            // 🔑 等待浏览器渲染完成（确保Canvas内容显示到屏幕）
            // 使用双重 requestAnimationFrame 确保渲染完成
            // 第一个RAF：等待当前帧结束
            // 第二个RAF：等待下一帧开始（此时Canvas已经渲染到屏幕）
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Canvas渲染完成，通知ColorPicker可以打开拾色器
                    this.eventBus.emit('ui:eyedropper-canvas-ready');
                });
            });
        }
    }
    
    /**
     * 恢复模态框显示 - 拾色器操作完成后恢复
     * @returns {void}
     * @private
     */
    _showModalAgain() {
        // 移除CSS类恢复显示
        if (this.elements.modal && this.elements.modal.classList.contains('show')) {
            this.elements.modal.classList.remove('eyedropper-active');
            
            // 🔑 关键修复：恢复主图片Canvas的隐藏状态（如果之前被临时显示）
            if (this._needRestoreCanvasHidden) {
                const scrollCanvas = this._getElement('scrollCanvas');
                // Fail Fast: 验证元素存在
                if (!scrollCanvas) {
                    throw new Error('ColorPickerModalService: scrollCanvas element not found when restoring visibility');
                }
                scrollCanvas.classList.add('hidden');
                this._needRestoreCanvasHidden = false;
            }
            
            // 恢复entry-canvas的显示状态
            if (this._needRestoreEntryCanvas) {
                const entryCanvas = this._getElement('entryCanvas');
                // Fail Fast: 验证元素存在
                if (!entryCanvas) {
                    throw new Error('ColorPickerModalService: entryCanvas element not found when restoring visibility');
                }
                entryCanvas.classList.remove('hidden');
                this._needRestoreEntryCanvas = false;
            }
            
            // 🔑 触发刷新Canvas：恢复原始显示状态（根据入场动画状态决定显示背景色或图片）
            // 原因：_hideModalTemporarily() 使用了强制模式绘制完整图片，
            //       关闭时需要恢复到正确的状态（启用入场动画时应该只显示背景色）
            this.eventBus.emit('display:refresh-canvas');
        }
    }
}


import { BaseUIService } from './BaseUIService.js';

/**
 * BaseModalService - 基础模态框服务类
 * 提供通用的模态框管理功能，为所有模态框子类提供统一的DOM管理、事件监听、快捷键注册、打开/关闭逻辑，以及生命周期钩子方法
 * 
 * 当前被使用的模块:
 * - ImageInfoModalService (modal/ImageInfoModalService.js)
 * - AboutModalService (modal/AboutModalService.js)
 * - AdvancedLoopService (modal/AdvancedLoopService.js)
 * - PositionSelectorService (modal/PositionSelectorService.js)
 * - ColorPickerModalService (modal/ColorPickerModalService.js)
 * 
 * 当前依赖的模块:
 * - BaseUIService (base/BaseUIService.js) - UI服务基类，提供DOM缓存功能 (通过继承)
 * - keyboardService (utils/KeyboardService.js) - 键盘快捷键管理服务 (通过DI注入)
 */
export class BaseModalService extends BaseUIService {
    /**
     * 构造函数
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务
     * @throws {Error} 当核心依赖（keyboardService）缺失时抛出错误（Fail Fast）
     */
    constructor(keyboardService) {
        super(); // 调用父类BaseUIService构造函数
        
        // Fail Fast检查
        if (!keyboardService) {
            throw new Error('KeyboardService dependency is required for BaseModalService');
        }
        
        this.keyboardService = keyboardService;
        this.elements = {};
        this.isInitialized = false;
    }

    /**
     * 初始化服务
     * 执行DOM引用设置、事件监听器绑定和快捷键注册
     * @returns {void}
     * @throws {Error} 如果服务已初始化则抛出错误（Fail Fast）
     */
    init() {
        if (this.isInitialized) {
            throw new Error('BaseModalService.init: Service already initialized. init() should only be called once.');
        }
        
        // 性能优化：只调用一次 _getModalConfig()，避免重复调用
        const config = this._getModalConfig();
        
        this._setupDOMReferences(config);
        this._setupEventListeners(config);
        this._registerShortcuts(config);
        this.isInitialized = true;
        
    }

    /**
     * 获取模态框配置 - 抽象方法，子类必须实现
     * @returns {Object} 模态框配置对象
     * @throws {Error} 如果子类未实现此方法则抛出错误（抽象方法强制实现）
     * @protected
     */
    _getModalConfig() {
        throw new Error('子类必须实现 _getModalConfig 方法');
    }

    /**
     * 设置DOM元素引用
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @throws {Error} 当配置无效或必需的DOM元素不存在时抛出错误（Fail Fast）
     * @protected
     */
    _setupDOMReferences(config) {
        // Fail Fast: 参数验证
        if (!config) {
            throw new Error('Modal config is required for _setupDOMReferences');
        }
        if (!config.elements || typeof config.elements !== 'object') {
            throw new Error('Modal config.elements must be a valid object');
        }
        
        this.elements = {};
        
        // 获取主模态框元素 - 使用单一引用避免混乱
        if (config.modalId) {
            const modalElement = this._getElement(config.modalId);
            // Fail Fast: 如果配置了 modalId 但元素不存在，说明 HTML 结构错误
            if (!modalElement) {
                throw new Error(`Modal element not found: #${config.modalId}. Please check HTML structure.`);
            }
            this.elements.modal = modalElement;
        }
        
        // 根据配置获取DOM元素
        Object.entries(config.elements).forEach(([key, selector]) => {
            if (Array.isArray(selector)) {
                // 处理数组类型的选择器（如additionalCloseBtns）
                // 注意：数组元素可能为 null（可选元素），由调用者决定是否 Fail Fast
                this.elements[key] = selector.map(sel => {
                    if (sel.startsWith('#')) {
                        return this._getElement(sel.slice(1));
                    } else {
                        return this._querySelector(sel);
                    }
                });
            } else if (typeof selector === 'string') {
                // 处理字符串类型的选择器
                let element;
                if (selector.startsWith('#')) {
                    // ID选择器
                    element = this._getElement(selector.slice(1));
                } else {
                    // 类选择器或其他
                    element = this._querySelector(selector);
                }
                
                // Fail Fast: 如果在配置中明确要求但获取不到，说明 HTML 结构错误
                if (!element) {
                    throw new Error(`Required modal element not found: "${selector}" (key: ${key}). Please check HTML structure.`);
                }
                
                this.elements[key] = element;
            }
        });
    }

    /**
     * 设置事件监听器
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @throws {Error} 当配置无效时抛出错误（Fail Fast）
     * @protected
     */
    _setupEventListeners(config) {
        // Fail Fast: 参数验证
        if (!config) {
            throw new Error('Modal config is required for _setupEventListeners');
        }
        
        const { 
            openBtn, 
            modal, 
            closeBtn, 
            additionalCloseBtns 
        } = this.elements;

        // 打开按钮
        if (openBtn && config.openTrigger) {
            openBtn.addEventListener('click', () => {
                this.openModal();
            });
        }

        // 主关闭按钮
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // 额外的关闭按钮 - 明确检查而不隐藏错误
        if (additionalCloseBtns && Array.isArray(additionalCloseBtns)) {
            additionalCloseBtns.forEach(btn => {
                if (btn) {
                    btn.addEventListener('click', () => {
                        this.closeModal();
                    });
                }
            });
        }

        // 点击遮罩层关闭 - 子类必须明确配置
        if (modal && config.closeOnOverlayClick) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
                }
            });
        }
    }

    /**
     * 注册快捷键
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @throws {Error} 当配置无效时抛出错误（Fail Fast）
     * @protected
     */
    _registerShortcuts(config) {
        // Fail Fast: 参数验证
        if (!config) {
            throw new Error('Modal config is required for _registerShortcuts');
        }
        
        if (config.escToClose) {
            // ESC 键关闭模态框 - 使用条件注册避免冲突，子类必须明确配置
            // 注：keyboardService 在构造函数中已做 Fail Fast 检查，此处无需重复验证
            this.keyboardService.registerConditional(
                'escape', 
                () => {
                    this.closeModal();
                },
                () => this._isModalVisible(),
                this,
                { preventDefault: true }
            );
        }
    }

    /**
     * 打开模态框 - 模板方法
     * 执行打开前钩子 -> 添加show类 -> 禁止body滚动 -> 执行打开后钩子
     * @returns {void}
     * @throws {Error} 当模态框DOM元素不存在时抛出错误（Fail Fast）
     * @public
     */
    openModal() {
        const { modal } = this.elements;
        
        if (!modal) {
            throw new Error('Modal element not found - check DOM configuration');
        }

        // 执行打开前的钩子方法
        if (this._onBeforeOpen() === false) {
            return;
        }

        // 显示模态框
        modal.classList.add('show');
        
        // 防止body滚动
        document.body.classList.add('modal-open');

        // 执行打开后的钩子方法
        this._onAfterOpen();
    }

    /**
     * 关闭模态框 - 模板方法
     * 移除show类 -> 恢复body滚动 -> 执行关闭后钩子
     * @returns {void}
     * @throws {Error} 当模态框DOM元素不存在时抛出错误（Fail Fast）
     * @public
     */
    closeModal() {
        const { modal } = this.elements;
        
        if (!modal) {
            throw new Error('Modal element not found - check DOM configuration');
        }

        // 隐藏模态框
        modal.classList.remove('show');
        
        // 恢复body滚动
        document.body.classList.remove('modal-open');

        // 执行关闭后的钩子方法
        this._onAfterClose();
    }

    /**
     * 检查模态框是否可见（基于DOM状态，简单可靠）
     * @returns {boolean}
     * @throws {Error} 当模态框DOM元素不存在时抛出错误（Fail Fast）
     * @protected
     */
    _isModalVisible() {

        const { modal } = this.elements;
        
        // Fail Fast: 如果 modal 元素不存在，说明初始化有问题
        if (!modal) {
            throw new Error('Modal element not found - service may not be properly initialized');
        }
        
        return modal.classList.contains('show');
    }

    // 钩子方法 - 子类可以重写这些方法来实现自定义逻辑

    /**
     * 模态框打开前钩子 - 子类可重写
     * @returns {boolean} 返回false可取消打开操作
     * @protected
     */
    _onBeforeOpen() {
        return true;
    }

    /**
     * 模态框打开后钩子 - 子类可重写
     * @returns {void}
     * @protected
     */
    _onAfterOpen() {
        // 默认空实现
    }

    /**
     * 模态框关闭后钩子 - 子类可重写
     * @returns {void}
     * @protected
     */
    _onAfterClose() {
        // 不需要注销ESC快捷键，因为条件检查会确保只有在模态框可见时才执行
        // 过度的注销反而会导致快捷键失效的bug
    }
}


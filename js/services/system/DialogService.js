/**
 * DialogService - 自定义对话框服务
 * 提供统一的对话框显示和管理功能，包括警告、错误、信息对话框的显示、快捷键支持、Promise化交互等
 * 
 * 当前被使用的模块：
 * - ErrorDisplayService (system/ErrorDisplayService.js) - 统一错误显示服务，调用showWarning/showError/showInfo方法
 * 
 * 当前依赖的模块：
 * - keyboardService (utils/KeyboardService.js) - 键盘服务，注册ESC快捷键关闭对话框 (通过DI注入)
 * 
 * 架构说明：
 * 为什么不继承 BaseUIService？
 * - BaseUIService的设计意图是"频繁访问同一个DOM元素"，即多个方法反复调用 _getElement() 获取同一元素，通过缓存避免重复查询
 * - DialogService只在init()时调用一次 _requireElement() 获取DOM元素，之后都直接使用实例属性（this.dialog等），不会再次调用 _requireElement()
 * - 继承BaseUIService会造成双重缓存：DOM元素既存在BaseUIService.domCache中，又存在this.dialog等实例属性中
 * - 直接使用原生 document.getElementById() 更清晰、更轻量
 */

export class DialogService {
    /**
     * 构造函数
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务
     * @throws {Error} 当核心依赖缺失时抛出错误（Fail Fast）
     */
    constructor(keyboardService) {
        // Fail Fast: 核心依赖必须存在
        if (!keyboardService) {
            throw new Error('KeyboardService is required for DialogService');
        }
        
        this.keyboardService = keyboardService;
        this.dialog = null;
        this.dialogMessage = null;
        this.dialogConfirmBtn = null;
        this.dialogCancelBtn = null;
        this.dialogOverlay = null;
        this.dialogTitle = null;
        this.dialogIcon = null;
        
        this.isInitialized = false;
        this.currentResolver = null;
        this.isConfirmMode = false;  // 标记是否为确认模式（双按钮）
        
        // 性能优化：绑定方法引用，避免在_showDialogElement()中重复创建函数
        this._focusConfirmBtn = this._focusConfirmBtn.bind(this); 
    }
    
    /**
     * 初始化对话框元素和事件
     * 必须在服务使用前手动调用，获取DOM元素引用并注册事件监听器
     * 
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时抛出错误（Fail Fast）
     */
    init() {
        // 一次性获取所有DOM元素并缓存到实例属性
        this.dialog = document.getElementById('customDialog');
        this.dialogMessage = document.getElementById('dialogMessage');
        this.dialogConfirmBtn = document.getElementById('dialogConfirmBtn');
        this.dialogCancelBtn = document.getElementById('dialogCancelBtn');
        
        // Fail Fast: 关键元素必须存在
        if (!this.dialog) {
            throw new Error('DialogService: customDialog element not found');
        }
        if (!this.dialogMessage) {
            throw new Error('DialogService: dialogMessage element not found');
        }
        if (!this.dialogConfirmBtn) {
            throw new Error('DialogService: dialogConfirmBtn element not found');
        }
        if (!this.dialogCancelBtn) {
            throw new Error('DialogService: dialogCancelBtn element not found');
        }
        
        // 获取子元素并缓存（性能优化：避免重复querySelector）
        this.dialogOverlay = this.dialog.querySelector('.dialog-overlay');
        this.dialogContent = this.dialog.querySelector('.dialog-content');
        this.dialogTitle = this.dialog.querySelector('.dialog-title');
        this.dialogIcon = this.dialog.querySelector('.dialog-icon');
        
        // Fail Fast: 子元素必须存在
        if (!this.dialogOverlay) {
            throw new Error('DialogService: Dialog overlay element (.dialog-overlay) not found. Please check HTML structure.');
        }
        if (!this.dialogContent) {
            throw new Error('DialogService: Dialog content element (.dialog-content) not found. Please check HTML structure.');
        }
        if (!this.dialogTitle) {
            throw new Error('DialogService: Dialog title element (.dialog-title) not found. Please check HTML structure.');
        }
        if (!this.dialogIcon) {
            throw new Error('DialogService: Dialog icon element (.dialog-icon) not found. Please check HTML structure.');
        }
        
        // 动画时长缓存（lazy loading）
        this._closeAnimationDurationMs = null;
        
        // 绑定事件
        this._bindEvents();
        
        // 注册快捷键
        this._registerShortcuts();
        
        this.isInitialized = true;
    }
    
    /**
     * 绑定对话框事件
     * 注册确定按钮、取消按钮点击事件和遮罩层点击关闭事件
     * 
     * @returns {void}
     * @private
     */
    _bindEvents() {
        // 确定按钮点击事件
        this.dialogConfirmBtn.addEventListener('click', () => {
            this._handleConfirm();
        });
        
        // 取消按钮点击事件
        this.dialogCancelBtn.addEventListener('click', () => {
            this._handleCancel();
        });
        
        // 点击遮罩层关闭对话框（等同于取消）
        this.dialogOverlay.addEventListener('click', () => {
            this._handleCancel();
        });
        
    }
    
    /**
     * 注册快捷键
     * 注册ESC键关闭对话框的条件快捷键（仅在对话框显示时生效）
     * 
     * @returns {void}
     * @private
     */
    _registerShortcuts() {
        // 注册 ESC 键关闭对话框（条件快捷键：仅在对话框显示时）
        this.keyboardService.registerConditional(
            'escape',
            () => this._handleCancel(),
            () => this.isVisible(),
            this,
            { preventDefault: true }
        );
    }
    
    /**
     * 显示对话框的统一方法
     * 
     * @param {string} type - 对话框类型，用于生成错误信息
     * @param {string} icon - 图标符号
     * @param {string} message - 消息内容
     * @param {Object} options - 配置选项
     * @param {string} options.title - 对话框标题（必需）
     * @returns {Promise<void>} 用户点击确定后解析的Promise
     * @throws {Error} 当服务未初始化或title缺失时抛出错误（Fail Fast）
     * @private
     */
    _showDialogByType(type, icon, message, options) {
        // Fail Fast: 服务未初始化
        if (!this.isInitialized) {
            throw new Error(`DialogService not initialized. Please call init() before using show${type}().`);
        }
        
        // Fail Fast: title 必需
        if (!options.title) {
            throw new Error(`DialogService.show${type}: options.title is required`);
        }
        
        const { title } = options;
        // 单按钮模式：隐藏取消按钮，重置按钮文本
        this.isConfirmMode = false;
        this.dialogCancelBtn.classList.add('hidden');
        this.dialogConfirmBtn.textContent = '确定';
        return this._showDialog(message, title, icon);
    }
    
    /**
     * 显示警告对话框
     * 
     * @param {string} message - 要显示的消息内容
     * @param {Object} options - 可选配置
     * @param {string} options.title - 对话框标题（必需）
     * @returns {Promise<void>} 用户点击确定后解析的Promise
     * @throws {Error} 当服务未初始化或title缺失时抛出错误（Fail Fast）
     */
    showWarning(message, options) {
        return this._showDialogByType('Warning', '⚠️', message, options);
    }
    
    /**
     * 显示错误对话框
     * 
     * @param {string} message - 要显示的消息内容
     * @param {Object} options - 可选配置
     * @param {string} options.title - 对话框标题（必需）
     * @returns {Promise<void>} 用户点击确定后解析的Promise
     * @throws {Error} 当服务未初始化或title缺失时抛出错误（Fail Fast）
     */
    showError(message, options) {
        return this._showDialogByType('Error', '❌', message, options);
    }
    
    /**
     * 显示信息对话框
     * 
     * @param {string} message - 要显示的消息内容
     * @param {Object} options - 可选配置
     * @param {string} options.title - 对话框标题（必需）
     * @returns {Promise<void>} 用户点击确定后解析的Promise
     * @throws {Error} 当服务未初始化或title缺失时抛出错误（Fail Fast）
     */
    showInfo(message, options) {
        return this._showDialogByType('Info', 'ℹ️', message, options);
    }
    
    /**
     * 显示确认对话框（双按钮模式）
     * 
     * @param {string} message - 要显示的消息内容
     * @param {Object} options - 可选配置
     * @param {string} options.title - 对话框标题（必需）
     * @param {string} options.confirmText - 确定按钮文本（可选，默认 '确定'）
     * @param {string} options.cancelText - 取消按钮文本（可选，默认 '取消'）
     * @returns {Promise<boolean>} 用户点击确定返回true，点击取消返回false
     * @throws {Error} 当服务未初始化或title缺失时抛出错误（Fail Fast）
     */
    showConfirm(message, options) {
        // Fail Fast: 服务未初始化
        if (!this.isInitialized) {
            throw new Error('DialogService not initialized. Please call init() before using showConfirm().');
        }
        
        // Fail Fast: title 必需
        if (!options.title) {
            throw new Error('DialogService.showConfirm: options.title is required');
        }
        
        const { title, confirmText = '确定', cancelText = '取消' } = options;
        
        // 确认模式：显示取消按钮
        this.isConfirmMode = true;
        this.dialogCancelBtn.classList.remove('hidden');
        
        // 更新按钮文本
        this.dialogConfirmBtn.textContent = confirmText;
        this.dialogCancelBtn.textContent = cancelText;
        
        // icon 由 DialogService 内部硬编码，不由调用者传递
        return this._showDialog(message, title, '⚠️');
    }
    
    /**
     * 显示对话框的核心方法
     * @param {string} message - 消息内容
     * @param {string} title - 标题
     * @param {string} icon - 图标
     * @returns {Promise<void>}
     * @private
     */
    _showDialog(message, title, icon) {
        return new Promise((resolve) => {
            // 如果已有对话框在显示，先关闭它
            if (this.currentResolver) {
                this.currentResolver(true);
            }
            
            // 保存当前的resolver
            this.currentResolver = resolve;
            
            // 更新对话框内容
            this._updateDialogContent(message, title, icon);
            
            // 显示对话框
            this._showDialogElement();
        });
    }
    
    /**
     * 更新对话框内容
     * 性能优化：使用缓存的元素引用，避免重复querySelector
     * 
     * @param {string} message - 消息内容（支持HTML标签）
     * @param {string} title - 标题
     * @param {string} icon - 图标
     * @returns {void}
     * @private
     */
    _updateDialogContent(message, title, icon) {
        // 直接使用缓存的元素引用（在init()中已缓存）
        this.dialogTitle.textContent = title;
        this.dialogIcon.textContent = icon;
        this.dialogMessage.innerHTML = message;
    }
    
    /**
     * 聚焦到确定按钮
     * 性能优化：提取为独立方法并在构造函数中绑定，避免重复创建函数
     * 
     * @returns {void}
     * @private
     */
    _focusConfirmBtn() {
        this.dialogConfirmBtn.focus();
    }
    
    /**
     * 显示对话框元素
     * 移除hidden类并清除关闭动画，触发淡入动画，并延迟聚焦到确定按钮（便于键盘操作）
     * 
     * @returns {void}
     * @private
     */
    _showDialogElement() {
        this.dialog.classList.remove('hidden');
        // 清除可能存在的关闭动画类
        this.dialogContent.classList.remove('dialog-closing');
        
        // 使用绑定的方法引用（性能优化：避免每次创建新函数）
        const focusDelay = 100;  // 技术实现：聚焦延迟（毫秒）
        setTimeout(this._focusConfirmBtn, focusDelay);
    }
    
    /**
     * 处理确定按钮点击
     * @returns {void}
     * @private
     */
    _handleConfirm() {
        if (!this.isVisible()) return;
        
        // 触发关闭动画
        this.dialogContent.classList.add('dialog-closing');
        
        // Lazy loading: 第一次调用时读取动画时长
        if (this._closeAnimationDurationMs === null) {
            const computedStyle = getComputedStyle(this.dialogContent);
            const animationDuration = computedStyle.animationDuration;
            this._closeAnimationDurationMs = parseFloat(animationDuration) * 1000;
            
            // Fail Fast: 验证时长有效性
            if (isNaN(this._closeAnimationDurationMs) || this._closeAnimationDurationMs <= 0) {
                throw new Error('DialogService._handleConfirm: Invalid animation-duration on dialog-content');
            }
        }
        
        // 等待动画完成后隐藏
        setTimeout(() => {
            this.dialog.classList.add('hidden');
            this.dialogContent.classList.remove('dialog-closing');
            
            if (this.currentResolver) {
                this.currentResolver(true);
                this.currentResolver = null;
            }
            
            this.isConfirmMode = false;
        }, this._closeAnimationDurationMs);
    }
    
    /**
     * 处理取消按钮点击或遮罩层点击
     * @returns {void}
     * @private
     */
    _handleCancel() {
        if (!this.isVisible()) return;
        
        // 触发关闭动画
        this.dialogContent.classList.add('dialog-closing');
        
        // Lazy loading: 第一次调用时读取动画时长
        if (this._closeAnimationDurationMs === null) {
            const computedStyle = getComputedStyle(this.dialogContent);
            const animationDuration = computedStyle.animationDuration;
            this._closeAnimationDurationMs = parseFloat(animationDuration) * 1000;
            
            // Fail Fast: 验证时长有效性
            if (isNaN(this._closeAnimationDurationMs) || this._closeAnimationDurationMs <= 0) {
                throw new Error('DialogService._handleCancel: Invalid animation-duration on dialog-content');
            }
        }
        
        // 等待动画完成后隐藏
        setTimeout(() => {
            this.dialog.classList.add('hidden');
            this.dialogContent.classList.remove('dialog-closing');
            
            if (this.currentResolver) {
                this.currentResolver(this.isConfirmMode ? false : true);
                this.currentResolver = null;
            }
            
            this.isConfirmMode = false;
        }, this._closeAnimationDurationMs);
    }
    
    /**
     * 检查对话框是否可见
     * 
     * @returns {boolean} 对话框可见返回true，否则返回false
     */
    isVisible() {
        // 明确返回boolean类型：对话框DOM不存在或包含hidden类时视为不可见
        if (!this.dialog) {
            return false;
        }
        return !this.dialog.classList.contains('hidden');
    }
}

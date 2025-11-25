import { BaseModalService } from '../base/BaseModalService.js';

/**
 * AboutModalService - 关于模态框服务
 * 处理关于页面的显示和交互，纯UI管理服务，负责显示应用信息和提供邮箱复制功能。功能包括：填充联系邮箱地址、复制邮箱到剪贴板（含浏览器兼容性检测）。继承自BaseModalService。
 * 
 * 当前被使用的模块:
 * - 无（通过 KeyboardService 快捷键机制自动触发打开）
 * 
 * 当前依赖的模块:
 * - BaseModalService (base/BaseModalService.js) - 模态框基类
 *   ↳ BaseUIService (base/BaseUIService.js) - UI服务基类，提供DOM缓存和事件管理功能
 * - keyboardService (utils/KeyboardService.js) - 键盘快捷键管理服务 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线，用于发送成功/错误提示 (通过DI注入)
 */
export class AboutModalService extends BaseModalService {
    /**
     * 构造函数
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务
     * @param {StateManager} stateManager - 状态管理器
     * @param {EventBus} eventBus - 事件总线
     * @throws {Error} 当核心依赖（keyboardService/stateManager/eventBus）缺失时抛出错误（Fail Fast）
     */
    constructor(keyboardService, stateManager, eventBus) {
        super(keyboardService);
        
        // Fail Fast: 验证核心依赖
        if (!stateManager) {
            throw new Error('StateManager is required for AboutModalService');
        }
        if (!eventBus) {
            throw new Error('EventBus is required for AboutModalService');
        }
        
        this.stateManager = stateManager;
        this.eventBus = eventBus;
        
        // 绑定方法引用，避免重复创建函数
        this._boundHandleCopyEmail = this._handleCopyEmail.bind(this);
    }

    /**
     * 获取模态框配置
     * @returns {Object} 模态框配置对象，包含以下属性：
     *   - modalId: 模态框容器元素ID
     *   - name: 模态框名称
     *   - elements: DOM元素选择器配置（openBtn, closeBtn, copyEmailBtn, contactEmail）
     *   - openTrigger: 是否使用打开按钮触发
     *   - closeOnOverlayClick: 是否点击遮罩层关闭
     *   - escToClose: 是否ESC键关闭
     * @protected
     */
    _getModalConfig() {
        return {
            modalId: 'aboutModalOverlay',
            name: '关于模态框',
            elements: {
                openBtn: '#aboutBtn',
                closeBtn: '#aboutModalClose',
                copyEmailBtn: '#copyEmailBtn',
                contactEmail: '#contactEmail'
            },
            openTrigger: true,
            closeOnOverlayClick: true,
            escToClose: true
        };
    }

    /**
     * 获取联系邮箱地址
     * @returns {string} 邮箱地址
     * @throws {Error} 当邮箱配置缺失时抛出错误（Fail Fast）
     * @private
     */
    _getContactEmail() {
        const email = this.stateManager.getDefaultValue('contact.email');
        if (!email) {
            throw new Error('Contact email configuration is missing in defaultState.json');
        }
        return email;
    }

    /**
     * 初始化服务 - 重写以填充邮箱地址
     * @returns {void}
     * @throws {Error} 当必需的DOM元素或配置缺失时抛出错误（Fail Fast）
     */
    init() {
        super.init(); // 调用基类的初始化方法，其中已包含 DOM 元素的 Fail Fast 检查
        
        const { contactEmail } = this.elements;
        const email = this._getContactEmail();
        
        contactEmail.textContent = email;
    }

    /**
     * 设置事件监听器 - 重写以添加复制邮箱按钮
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     * @protected
     */
    _setupEventListeners(config) {
        super._setupEventListeners(config); // 调用基类的事件监听器设置，其中已包含 DOM 元素的 Fail Fast 检查
        
        const { copyEmailBtn } = this.elements;
        
        // 一次性绑定复制邮箱按钮事件，无需在打开/关闭时重复绑定/解绑
        copyEmailBtn.addEventListener('click', this._boundHandleCopyEmail);
    }

    /**
     * 处理复制邮箱地址
     * 
     * 实现逻辑：
     * 1. 从 StateManager 读取邮箱地址（contact.email）
     * 2. Fail Fast检查浏览器是否支持Clipboard API
     * 3. Fail Fast检查是否在安全上下文（HTTPS）中
     * 4. 使用navigator.clipboard.writeText()复制邮箱地址
     * 5. 成功后通过EventBus显示成功提示
     * 6. 失败时通过EventBus显示错误提示并提供手动复制信息
     * 
     * @returns {Promise<void>}
     * @throws {Error} 当邮箱配置缺失时抛出错误（Fail Fast）
     * @private
     */
    async _handleCopyEmail() {
        const email = this._getContactEmail();
        
        // Fail Fast: 检查浏览器是否支持 Clipboard API
        if (!navigator.clipboard) {
            this.eventBus.emit('ui:show-validation-error', {
                message: `<p style="margin: 0 0 12px 0;"><strong>您的浏览器不支持剪贴板功能。</strong></p><p style="margin: 0;">请手动复制邮箱地址：<br>${email}</p>`,
                options: {
                    title: '浏览器不支持',
                    shortMessage: '浏览器不支持剪贴板功能！'
                }
            });
            return;
        }
        
        // Fail Fast: 检查是否在安全上下文中（HTTPS）
        if (!window.isSecureContext) {
            this.eventBus.emit('ui:show-validation-error', {
                message: `<p style="margin: 0 0 12px 0;"><strong>剪贴板功能需要在安全上下文（HTTPS）中使用。</strong></p><p style="margin: 0;">请手动复制邮箱地址：<br>${email}</p>`,
                options: {
                    title: '非安全上下文',
                    shortMessage: '需要 HTTPS 环境！'
                }
            });
            return;
        }
        
        try {
            await navigator.clipboard.writeText(email);
            
            const { copyEmailBtn } = this.elements;
            
            // 按钮临时变更为"已复制"状态
            const originalHTML = copyEmailBtn.innerHTML;
            copyEmailBtn.innerHTML = '✓';
            copyEmailBtn.disabled = true;
            
            setTimeout(() => {
                copyEmailBtn.innerHTML = originalHTML;
                copyEmailBtn.disabled = false;
            }, 2000);
            
            // 成功后显示提示
            this.eventBus.emit('ui:show-success-message', {
                message: '邮箱地址已复制到剪贴板。'
            });
        } catch (error) {
            this.eventBus.emit('ui:show-validation-error', {
                message: `<p style="margin: 0 0 12px 0;"><strong>复制失败！</strong></p><p style="margin: 0;">请手动复制邮箱地址：<br>${email}</p>`,
                options: {
                    title: '复制失败',
                    shortMessage: '复制失败，请手动复制！'
                }
            });
        }
    }

}
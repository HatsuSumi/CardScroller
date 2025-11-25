/**
 * MessageService - 消息服务
 * 专门处理消息显示逻辑，负责显示各种类型的消息提示：成功、警告、错误、信息
 * 
 * 当前被使用的模块：
 * - ErrorDisplayService (system/ErrorDisplayService.js) - 统一错误显示服务，调用showMessage方法
 * 
 * 当前依赖的模块：
 * - 无外部依赖，纯JavaScript实现
 * 
 * 架构说明：
 * - 本服务不继承BaseUIService，因为主要操作临时克隆的DOM元素，而非频繁访问页面中的固定元素
 * - 仅在init时访问页面DOM获取容器和模板引用（各1次），不需要BaseUIService的缓存机制
 * - 每次创建消息都是克隆模板生成新元素，这些临时元素不适合缓存
 */
export class MessageService {
    /**
     * 消息类型图标映射（静态属性，避免重复创建）
     * @private
     * @static
     */
    static ICONS = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    /**
     * 构造函数
     */
    constructor() {
        this.messageContainer = null;
        this.messageTemplate = null;
        this.activeMessages = new Set();
        
        // 技术实现细节：硬编码的UI参数
        this.DEFAULT_DURATION = 3000;  // 默认显示时长（毫秒）
        this.MAX_MESSAGES = 5;  // 最大同时显示的消息数量
    }

    /**
     * 初始化服务
     * 获取消息容器和模板引用
     * 
     * @returns {void}
     * @throws {Error} 当消息容器或模板不存在时抛出错误（Fail Fast）
     */
    init() {
        this._getMessageContainer();
        this._getMessageTemplate();
    }
    
    /**
     * 获取消息容器引用
     * 
     * @returns {void}
     * @throws {Error} 当容器元素不存在时抛出错误（Fail Fast）
     * @private
     */
    _getMessageContainer() {
        this.messageContainer = document.querySelector('.message-container');
        if (!this.messageContainer) {
            throw new Error('Message container element (.message-container) not found. Please check HTML structure.');
        }
    }
    
    /**
     * 获取消息模板引用
     * 
     * @returns {void}
     * @throws {Error} 当模板元素不存在时抛出错误（Fail Fast）
     * @private
     */
    _getMessageTemplate() {
        const template = document.getElementById('messageTemplate');
        if (!template || !(template instanceof HTMLTemplateElement)) {
            throw new Error('Message template element not found. Please check HTML structure.');
        }
        this.messageTemplate = template;
    }

    /**
     * 显示消息
     * 
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型 (info|success|warning|error)
     * @returns {Promise<void>} 消息显示完成的Promise
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    showMessage(message, type) {
        // Fail Fast: 验证必需参数
        if (!message || typeof message !== 'string') {
            throw new Error('MessageService.showMessage: message (string) is required');
        }
        if (!type || typeof type !== 'string') {
            throw new Error('MessageService.showMessage: type (string) is required');
        }
        
        return new Promise((resolve) => {
            const messageEl = this._createMessageElement(message, type);
            this._addToContainer(messageEl);
            
            // 入场动画
            const showMessageCallback = () => {
                messageEl.classList.add('message-show');
            };
            requestAnimationFrame(showMessageCallback);
            
            // 自动移除（使用配置文件中的默认时长）
            const autoRemoveCallback = () => {
                this._removeMessage(messageEl).then(resolve);
            };
            const timeoutId = setTimeout(autoRemoveCallback, this.DEFAULT_DURATION);
            
            // 鼠标悬停时暂停自动消失
            messageEl.addEventListener('mouseenter', () => {
                if (messageEl._timeoutId) {
                    clearTimeout(messageEl._timeoutId);
                    messageEl._timeoutId = null;
                }
            });
            
            // 鼠标移开时重新开始3秒倒计时
            messageEl.addEventListener('mouseleave', () => {
                if (!messageEl._timeoutId) {
                    messageEl._timeoutId = setTimeout(autoRemoveCallback, this.DEFAULT_DURATION);
                }
            });
            
            // 存储引用以便管理
            messageEl._timeoutId = timeoutId;
            messageEl._resolve = resolve;
            this.activeMessages.add(messageEl);
        });
    }




    /**
     * 创建消息元素
     * 性能优化：使用HTML Template + Clone，完整利用模板结构，避免重复创建DOM元素
     * 
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型
     * @returns {HTMLElement} 消息元素
     * @throws {Error} 当模板结构错误时抛出错误（Fail Fast）
     * @private
     */
    _createMessageElement(message, type) {
        // 使用template.cloneNode克隆DOM结构（性能优化）
        const messageEl = this.messageTemplate.content.cloneNode(true).firstElementChild;
        
        // Fail Fast: 验证克隆结果
        if (!messageEl) {
            throw new Error('Failed to clone message template: firstElementChild is null. Please check template structure.');
        }
        
        messageEl.classList.add(`message-${type}`);
        
        // UI层根据消息类型自动添加对应图标（使用静态属性避免重复创建对象）
        const iconMessage = MessageService.ICONS[type] ? `${MessageService.ICONS[type]} ${message}` : message;
        
        // 直接设置文本元素内容（保留模板中的所有DOM元素，性能最优）
        const textEl = messageEl.querySelector('.message-text');
        
        // Fail Fast: 验证必需的DOM元素
        if (!textEl) {
            throw new Error('Message text element (.message-text) not found in template. Please check template structure.');
        }
        
        textEl.textContent = iconMessage;
        
        // 绑定关闭按钮事件（button已在模板中，无需创建）
        const closeBtn = messageEl.querySelector('.message-close');
        
        // Fail Fast: 验证必需的DOM元素
        if (!closeBtn) {
            throw new Error('Message close button (.message-close) not found in template. Please check template structure.');
        }
        
        closeBtn.addEventListener('click', () => {
            this._removeMessage(messageEl);
        });
        
        return messageEl;
    }

    /**
     * 添加消息到容器
     * 
     * @param {HTMLElement} messageEl - 消息元素
     * @returns {void}
     * @private
     */
    _addToContainer(messageEl) {
        // 如果消息过多，移除最旧的
        if (this.activeMessages.size >= this.MAX_MESSAGES) {
            const oldestMessage = this.activeMessages.values().next().value;
            // 不等待移除完成，允许新消息立即显示（移除是异步的，有退场动画）
            // 短暂超出 MAX_MESSAGES 限制是可接受的UX权衡
            void this._removeMessage(oldestMessage);
        }

        this.messageContainer.appendChild(messageEl);
    }

    /**
     * 移除消息
     * 
     * @param {HTMLElement} messageEl - 消息元素
     * @returns {Promise<void>} 移除完成的Promise
     * @private
     */
    _removeMessage(messageEl) {
        return new Promise((resolve) => {
            if (!this.activeMessages.has(messageEl)) {
                resolve();
                return;
            }

            // 清除定时器
            if (messageEl._timeoutId) {
                clearTimeout(messageEl._timeoutId);
            }

            // 退场动画
            messageEl.classList.add('message-hide');
            
            // 读取messageEl应用CSS后的实际过渡时长（取最长的那个）
            const computedStyle = getComputedStyle(messageEl);
            const transitionDuration = computedStyle.transitionDuration;
            
            // transitionDuration可能是多个值（如"0.3s, 0.3s"），取最大值
            const durations = transitionDuration.split(',').map(d => parseFloat(d.trim()));
            const maxDuration = Math.max(...durations) * 1000;
            
            // Fail Fast: 验证时长有效性
            if (isNaN(maxDuration) || maxDuration <= 0) {
                throw new Error('MessageService._hide: Invalid transition-duration on message element');
            }
            
            const hideAnimationCallback = () => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
                this.activeMessages.delete(messageEl);
                
                // 调用原来的resolve
                if (messageEl._resolve) {
                    messageEl._resolve();
                }
                resolve();
            };
            
            setTimeout(hideAnimationCallback, maxDuration);
        });
    }


}

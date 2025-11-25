/**
 * LoadingService - 加载状态管理服务
 * 提供全局加载状态的显示和隐藏功能，通过EventBus监听加载事件，集中管理加载对话框的UI展示
 * 
 * 当前被使用的模块：
 * - 无（通过EventBus事件通信，见init()方法）
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，用于监听加载事件 (通过DI注入)
 * 
 * 架构说明：
 * 为什么不继承 BaseUIService？
 * - BaseUIService的设计意图是"频繁访问同一个DOM元素"，即多个方法反复调用 _getElement() 获取同一元素，通过缓存避免重复查询
 * - LoadingService只在init()时查询一次DOM元素，之后都直接使用实例属性（this.loadingDialog），不会再次调用 _getElement()
 * - 继承BaseUIService会造成双重缓存：DOM元素既存在BaseUIService.domCache中，又存在this.loadingDialog实例属性中
 * - 直接使用原生 document.getElementById() 更清晰、更轻量
 */

export class LoadingService {
    /**
     * 构造函数 - 创建加载服务实例
     * 保存事件总线引用，DOM元素将在init()中初始化
     * 
     * @param {EventBus} eventBus - 事件总线实例
     * @throws {Error} 如果eventBus未提供
     */
    constructor(eventBus) {
        // Fail Fast: 严格验证依赖注入
        if (!eventBus) {
            throw new Error('LoadingService: eventBus is required');
        }
        
        this.eventBus = eventBus;
        this.loadingDialog = null;
        this.loadingText = null;
    }

    /**
     * 初始化加载服务
     * 获取DOM元素并注册事件监听器
     * 
     * 监听事件：
     * - `ui:show-loading` - 显示加载对话框
     * - `ui:hide-loading` - 隐藏加载对话框
     * 
     * @returns {void}
     * @throws {Error} 如果DOM元素不存在
     */
    init() {
        // Fail Fast: 严格获取DOM元素，不存在直接抛错
        this.loadingDialog = document.getElementById('loadingDialog');
        if (!this.loadingDialog) {
            throw new Error('LoadingService: loadingDialog element not found');
        }
        
        this.loadingText = this.loadingDialog.querySelector('.loading-text');
        if (!this.loadingText) {
            throw new Error('LoadingService: .loading-text element not found');
        }
        
        // 监听加载相关事件
        this.eventBus.on('ui:show-loading', (message) => {
            this.show(message);
        });

        this.eventBus.on('ui:hide-loading', () => {
            this.hide();
        });
    }

    /**
     * 显示加载对话框
     * 
     * @param {string} message - 加载消息，必须由调用者提供
     * @returns {void}
     * @throws {Error} 如果服务未初始化或message不是字符串或为空
     */
    show(message) {
        // Fail Fast: 验证服务已初始化
        if (!this.loadingDialog || !this.loadingText) {
            throw new Error('LoadingService.show: Service not initialized. Please call init() first.');
        }
        
        // Fail Fast: 严格验证参数
        if (typeof message !== 'string') {
            throw new Error('LoadingService.show: message must be a string');
        }
        if (message.trim() === '') {
            throw new Error('LoadingService.show: message cannot be empty');
        }
        
        // 更新加载消息并显示对话框
        this.loadingText.textContent = message;
        this.loadingDialog.classList.remove('hidden');
    }

    /**
     * 隐藏加载对话框
     * 
     * @returns {void}
     * @throws {Error} 如果服务未初始化
     */
    hide() {
        // Fail Fast: 验证服务已初始化
        if (!this.loadingDialog) {
            throw new Error('LoadingService.hide: Service not initialized. Please call init() first.');
        }
        
        this.loadingDialog.classList.add('hidden');
    }

}

/**
 * ErrorDisplayService - 错误显示服务
 * 统一管理各种验证反馈策略，采用事件驱动架构，监听UI显示事件而不是被直接调用，提供三种显示模式：单对话框、单消息框、双重反馈
 * 
 * 当前被使用的模块：
 * - 通过EventBus事件监听，被所有发射UI显示事件的服务间接调用
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，监听UI显示事件 (通过DI注入)
 * - dialogService (system/DialogService.js) - 自定义对话框服务 (通过DI注入)
 * - messageService (system/MessageService.js) - 消息显示服务 (通过DI注入)
 * 
 * 架构说明：
 * - 本服务对外通过EventBus监听事件（被动调用），对内直接调用DialogService和MessageService（主动调用）
 * - 为什么可以直接调用而不通过事件总线？
 *   1. 已通过DI注入依赖：本服务已明确依赖DialogService和MessageService，无需通过事件解耦
 *   2. 架构分层合理：System层协调服务调用Utils层基础服务，符合依赖方向
 *   3. 职责清晰：EventBus用于服务间解耦（外部→本服务），直接调用用于内部协调（本服务→下层服务）
 *   4. 避免循环绕圈：如果再通过事件调用自己监听的事件，会造成不必要的复杂度
 */
export class ErrorDisplayService {
    /**
     * 构造函数
     * @param {EventBus} eventBus - 事件总线，用于监听UI显示事件
     * @param {DialogService} dialogService - 自定义对话框服务
     * @param {MessageService} messageService - 消息显示服务
     * @throws {Error} 当核心依赖缺失时抛出错误（Fail Fast）
     */
    constructor(eventBus, dialogService, messageService) {
        // Fail Fast: 验证必需依赖
        if (!eventBus) {
            throw new Error('ErrorDisplayService: eventBus is required');
        }
        if (!dialogService) {
            throw new Error('ErrorDisplayService: dialogService is required');
        }
        if (!messageService) {
            throw new Error('ErrorDisplayService: messageService is required');
        }
        
        this.eventBus = eventBus;
        this.dialogService = dialogService;
        this.messageService = messageService;
    }

    /**
     * 初始化服务 - 设置事件监听器
     * @returns {void}
     */
    init() {
        // 监听各种UI显示事件
        this.eventBus.on('ui:show-success-message', (data) => this._handleShowSuccessMessage(data));
        this.eventBus.on('ui:show-warning-message', (data) => this._handleShowWarningMessage(data));
        this.eventBus.on('ui:show-info-message', (data) => this._handleShowInfoMessage(data));
        this.eventBus.on('ui:show-error-message', (data) => this._handleShowErrorMessage(data));
        this.eventBus.on('ui:show-warning-dialog', (data) => this._handleShowWarningDialog(data));
        this.eventBus.on('ui:show-info-dialog', (data) => this._handleShowInfoDialog(data));
        this.eventBus.on('ui:show-error-dialog', (data) => this._handleShowErrorDialog(data));
        this.eventBus.on('ui:show-validation-error', (data) => this._handleShowValidationError(data));
        this.eventBus.on('ui:show-validation-warning', (data) => this._handleShowValidationWarning(data));
        this.eventBus.on('ui:show-confirm-dialog', (data) => this._handleShowConfirmDialog(data));
    }

    // ==================== 私有验证方法 ====================

    /**
     * 验证 message 参数（Fail Fast）
     * @param {*} message - 待验证的消息
     * @param {string} methodName - 调用方法名（用于错误消息）
     * @private
     * @throws {Error} 当参数无效时抛出错误
     */
    _validateMessage(message, methodName) {
        if (!message || typeof message !== 'string') {
            throw new Error(`${methodName}: message (string) is required`);
        }
    }

    /**
     * 验证 title 参数（Fail Fast）
     * @param {*} title - 待验证的标题
     * @param {string} methodName - 调用方法名（用于错误消息）
     * @private
     * @throws {Error} 当参数无效时抛出错误
     */
    _validateTitle(title, methodName) {
        if (title === undefined) {
            throw new Error(`${methodName}: options.title is required`);
        }
        if (typeof title !== 'string') {
            throw new Error(`${methodName}: options.title must be a string`);
        }
        if (title === '') {
            throw new Error(`${methodName}: options.title cannot be empty`);
        }
    }

    /**
     * 验证事件 data 对象（Fail Fast）
     * @param {*} data - 待验证的事件数据
     * @param {string} methodName - 调用方法名（用于错误消息）
     * @private
     * @throws {Error} 当参数无效时抛出错误
     */
    _validateEventData(data, methodName) {
        if (!data) {
            throw new Error(`${methodName}: data is required`);
        }
        if (!data.message) {
            throw new Error(`${methodName}: data.message is required`);
        }
    }

    /**
     * 验证 options 对象（Fail Fast）
     * @param {*} options - 待验证的选项对象
     * @param {string} methodName - 调用方法名（用于错误消息）
     * @private
     * @throws {Error} 当参数无效时抛出错误
     */
    _validateOptions(options, methodName) {
        if (!options) {
            throw new Error(`${methodName}: data.options is required`);
        }
        if (typeof options !== 'object' || options === null || Array.isArray(options)) {
            throw new Error(`${methodName}: data.options must be an object`);
        }
    }

    /**
     * 显示严重错误 - 单独对话框
     * 用于需要用户确认的严重错误，阻塞后续操作
     * @param {string} message - 错误信息
     * @param {Object} options - 选项
     * @param {string} options.title - 对话框标题，必需参数
     * @returns {Promise} 用户点击确定后的Promise
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    async showCriticalError(message, options) {
        this._validateMessage(message, 'ErrorDisplayService.showCriticalError');
        this._validateTitle(options.title, 'ErrorDisplayService.showCriticalError');
        
        // icon 由 DialogService 内部硬编码，不传递
        return this.dialogService.showError(message, { title: options.title });
    }

    /**
     * 显示信息提示 - 单独对话框（信息类型）
     * 用于显示重要信息但不是错误的情况
     * @param {string} message - 信息内容
     * @param {Object} options - 选项
     * @param {string} options.title - 对话框标题，必需参数
     * @returns {Promise} 用户点击确定后的Promise
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    async showInfo(message, options) {
        this._validateMessage(message, 'ErrorDisplayService.showInfo');
        this._validateTitle(options.title, 'ErrorDisplayService.showInfo');
        
        // icon 由 DialogService 内部硬编码，不传递
        return this.dialogService.showInfo(message, { title: options.title });
    }

    /**
     * 显示轻量消息 - 单独消息框
     * 用于成功提示、警告提示等不需要阻塞用户的轻量反馈
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型 'success'|'error'|'warning'|'info'，必需参数
     * @returns {Promise} 消息显示完成的Promise
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    showMessage(message, type) {
        this._validateMessage(message, 'ErrorDisplayService.showMessage');
        
        // Fail Fast: 验证type（必需参数）
        if (type === undefined) {
            throw new Error('ErrorDisplayService.showMessage: type is required');
        }
        if (typeof type !== 'string') {
            throw new Error('ErrorDisplayService.showMessage: type must be a string');
        }
        const validTypes = ['success', 'error', 'warning', 'info'];
        if (!validTypes.includes(type)) {
            throw new Error(`ErrorDisplayService.showMessage: type must be one of ${validTypes.join(', ')}, got '${type}'`);
        }
        
        return this.messageService.showMessage(message, type);
    }

    /**
     * 显示验证错误 - 双重反馈（先对话框后消息框）
     * 这是用户的预期行为：先显示详细对话框，用户确认后再显示右上角提示
     * @param {string} message - 详细错误信息（对话框中显示）
     * @param {Object} options - 选项
     * @param {string} options.title - 对话框标题，必需参数
     * @param {string} options.shortMessage - 简短消息（右上角显示），必需参数
     * @returns {Promise} 双重反馈完成后的Promise
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    async showValidationError(message, options) {
        this._validateMessage(message, 'ErrorDisplayService.showValidationError');
        this._validateTitle(options.title, 'ErrorDisplayService.showValidationError');
        
        const { title, shortMessage } = options;
        
        // Fail Fast: 验证shortMessage（必需参数）
        if (shortMessage === undefined) {
            throw new Error('ErrorDisplayService.showValidationError: options.shortMessage is required');
        }
        if (typeof shortMessage !== 'string') {
            throw new Error('ErrorDisplayService.showValidationError: options.shortMessage must be a string');
        }
        if (shortMessage === '') {
            throw new Error('ErrorDisplayService.showValidationError: options.shortMessage cannot be empty');
        }
        
        // 第一步：显示对话框
        await this.showCriticalError(message, { title });
        
        // 第二步：用户点击确定后，显示右上角提示
        return this.showMessage(shortMessage, 'error');
    }

    /**
     * 显示验证警告 - 双重反馈（先对话框后消息框，警告级别）
     * 用于验证警告（非错误），显示警告图标而不是错误图标
     * @param {string} message - 详细警告信息（对话框中显示）
     * @param {Object} options - 选项
     * @param {string} options.title - 对话框标题，必需参数
     * @param {string} options.shortMessage - 简短消息（右上角显示），必需参数
     * @returns {Promise} 双重反馈完成后的Promise
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    async showValidationWarning(message, options) {
        this._validateMessage(message, 'ErrorDisplayService.showValidationWarning');
        this._validateTitle(options.title, 'ErrorDisplayService.showValidationWarning');
        
        const { title, shortMessage } = options;
        
        // Fail Fast: 验证shortMessage（必需参数）
        if (shortMessage === undefined) {
            throw new Error('ErrorDisplayService.showValidationWarning: options.shortMessage is required');
        }
        if (typeof shortMessage !== 'string') {
            throw new Error('ErrorDisplayService.showValidationWarning: options.shortMessage must be a string');
        }
        if (shortMessage === '') {
            throw new Error('ErrorDisplayService.showValidationWarning: options.shortMessage cannot be empty');
        }
        
        // 第一步：显示警告对话框
        await this.showWarning(message, { title });
        
        // 第二步：用户点击确定后，显示右上角提示
        return this.showMessage(shortMessage, 'warning');
    }

    /**
     * 显示警告对话框 - 单独对话框（警告类型）
     * 用于显示需要用户注意但不是错误的警告信息
     * @param {string} message - 警告消息
     * @param {Object} options - 选项
     * @param {string} options.title - 对话框标题，必需参数
     * @returns {Promise} 用户点击确定后的Promise
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    async showWarning(message, options) {
        this._validateMessage(message, 'ErrorDisplayService.showWarning');
        this._validateTitle(options.title, 'ErrorDisplayService.showWarning');
        
        // icon 由 DialogService 内部硬编码，不传递
        return this.dialogService.showWarning(message, { title: options.title });
    }

    /**
     * 显示确认对话框 - 双按钮确认对话框
     * 用于需要用户做出选择的场景
     * @param {string} message - 确认消息
     * @param {Object} options - 选项
     * @param {string} options.title - 对话框标题，必需参数
     * @param {string} [options.confirmText] - 确定按钮文本（可选）
     * @param {string} [options.cancelText] - 取消按钮文本（可选）
     * @returns {Promise<boolean>} 用户点击确定返回true，点击取消返回false
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    async showConfirm(message, options) {
        this._validateMessage(message, 'ErrorDisplayService.showConfirm');
        this._validateTitle(options.title, 'ErrorDisplayService.showConfirm');
        
        // icon 由 DialogService 内部硬编码，不传递
        return this.dialogService.showConfirm(message, options);
    }


    // ==================== 事件处理器 ====================
    
    /**
     * 处理显示成功消息事件 - 右上角消息框
     * @param {Object} data - 事件数据 { message }
     * @private
     * @throws {Error} 当事件数据无效时抛出错误（Fail Fast）
     */
    _handleShowSuccessMessage(data) {
        this._validateEventData(data, 'ErrorDisplayService._handleShowSuccessMessage');
        return this.showMessage(data.message, 'success');
    }

    /**
     * 处理显示警告消息事件 - 右上角消息框
     * @param {Object} data - 事件数据 { message }
     * @private
     * @throws {Error} 当事件数据无效时抛出错误（Fail Fast）
     */
    _handleShowWarningMessage(data) {
        this._validateEventData(data, 'ErrorDisplayService._handleShowWarningMessage');
        return this.showMessage(data.message, 'warning');
    }

    /**
     * 处理显示信息消息事件 - 右上角消息框
     * @param {Object} data - 事件数据 { message }
     * @private
     * @throws {Error} 当事件数据无效时抛出错误（Fail Fast）
     */
    _handleShowInfoMessage(data) {
        this._validateEventData(data, 'ErrorDisplayService._handleShowInfoMessage');
        return this.showMessage(data.message, 'info');
    }

    /**
     * 处理显示错误消息事件 - 右上角消息框
     * @param {Object} data - 事件数据 { message }
     * @private
     * @throws {Error} 当事件数据无效时抛出错误（Fail Fast）
     */
    _handleShowErrorMessage(data) {
        this._validateEventData(data, 'ErrorDisplayService._handleShowErrorMessage');
        return this.showMessage(data.message, 'error');
    }

    /**
     * 处理显示警告对话框事件 - 阻塞式对话框
     * @param {Object} data - 事件数据 { message, options }
     * @private
     * @throws {Error} 当事件数据无效时抛出错误（Fail Fast）
     */
    async _handleShowWarningDialog(data) {
        this._validateEventData(data, 'ErrorDisplayService._handleShowWarningDialog');
        this._validateOptions(data.options, 'ErrorDisplayService._handleShowWarningDialog');
        await this.showWarning(data.message, data.options);
    }

    /**
     * 处理显示信息对话框事件 - 阻塞式对话框
     * @param {Object} data - 事件数据 { message, options }
     * @private
     * @throws {Error} 当事件数据无效时抛出错误（Fail Fast）
     */
    async _handleShowInfoDialog(data) {
        this._validateEventData(data, 'ErrorDisplayService._handleShowInfoDialog');
        this._validateOptions(data.options, 'ErrorDisplayService._handleShowInfoDialog');
        return await this.showInfo(data.message, data.options);
    }

    /**
     * 处理显示错误对话框事件 - 阻塞式对话框
     * @param {Object} data - 事件数据 { message, options }
     * @private
     * @throws {Error} 当事件数据无效时抛出错误（Fail Fast）
     */
    async _handleShowErrorDialog(data) {
        this._validateEventData(data, 'ErrorDisplayService._handleShowErrorDialog');
        this._validateOptions(data.options, 'ErrorDisplayService._handleShowErrorDialog');
        await this.showCriticalError(data.message, data.options);
    }

    /**
     * 处理显示验证错误事件
     * @param {Object} data - 事件数据 { message, options }
     * @private
     * @throws {Error} 当事件数据无效时抛出错误（Fail Fast）
     */
    async _handleShowValidationError(data) {
        this._validateEventData(data, 'ErrorDisplayService._handleShowValidationError');
        this._validateOptions(data.options, 'ErrorDisplayService._handleShowValidationError');
        await this.showValidationError(data.message, data.options);
    }

    /**
     * 处理显示验证警告事件
     * @param {Object} data - 事件数据 { message, options }
     * @private
     * @throws {Error} 当事件数据无效时抛出错误（Fail Fast）
     */
    async _handleShowValidationWarning(data) {
        this._validateEventData(data, 'ErrorDisplayService._handleShowValidationWarning');
        this._validateOptions(data.options, 'ErrorDisplayService._handleShowValidationWarning');
        await this.showValidationWarning(data.message, data.options);
    }

    /**
     * 处理显示确认对话框事件
     * @param {Object} data - 事件数据 { message, options }
     * @private
     * @throws {Error} 当事件数据无效时抛出错误（Fail Fast）
     * @returns {Promise<boolean>} 用户选择（true=确定，false=取消）
     */
    async _handleShowConfirmDialog(data) {
        this._validateEventData(data, 'ErrorDisplayService._handleShowConfirmDialog');
        this._validateOptions(data.options, 'ErrorDisplayService._handleShowConfirmDialog');
        
        // 直接返回用户选择（给 requestAsync 使用）
        return await this.showConfirm(data.message, data.options);
    }

}


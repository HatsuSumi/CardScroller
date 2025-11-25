import { formatFileSize } from '../../helpers/fileFormatters.js';
import { formatMP, formatPercentage } from '../../helpers/numberFormatters.js';
import { calculateDefaultEndPosition } from '../../helpers/positionCalculators.js';

/**
 * BusinessOrchestrationService - 业务编排服务
 * 协调多个服务完成复杂业务流程，专注于跨服务业务编排、工作流协调和数据流转
 * 
 * 当前被使用的模块：
 * - 无（通过EventBus事件间接协调各服务，无模块直接调用其公开方法）
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线
 * - stateManager (core/StateManager.js) - 状态管理器
 * - imageService (business/ImageService.js) - 图片服务，用于图片上传处理
 * - scrollService (business/ScrollService.js) - 滚动服务，用于滚动控制和配置更新
 * - validationService (system/ValidationService.js) - 验证服务，用于配置和图片验证
 * - formatFileSize (helpers/fileFormatters.js) - 文件大小格式化工具函数
 * - formatMP, formatPercentage (helpers/numberFormatters.js) - 百万像素格式化、百分比格式化工具函数
 * - calculateDefaultEndPosition (helpers/positionCalculators.js) - 位置计算工具函数
 */
export class BusinessOrchestrationService {
    /**
     * 创建业务编排服务实例
     * @param {EventBus} eventBus - 事件总线，用于服务间通信
     * @param {StateManager} stateManager - 状态管理器
     * @param {ImageService} imageService - 图片服务
     * @param {ScrollService} scrollService - 滚动服务
     * @param {ValidationService} validationService - 验证服务
     * @throws {Error} 如果任何依赖项缺失
     */
    constructor(eventBus, stateManager, imageService, scrollService, validationService) {
        // Fail Fast: 验证所有必需依赖
        if (!eventBus) {
            throw new Error('EventBus is required for BusinessOrchestrationService');
        }
        if (!stateManager) {
            throw new Error('StateManager is required for BusinessOrchestrationService');
        }
        if (!imageService) {
            throw new Error('ImageService is required for BusinessOrchestrationService');
        }
        if (!scrollService) {
            throw new Error('ScrollService is required for BusinessOrchestrationService');
        }
        if (!validationService) {
            throw new Error('ValidationService is required for BusinessOrchestrationService');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.imageService = imageService;
        this.scrollService = scrollService;
        this.validationService = validationService;
    }

    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        this._setupImageInteractions();
        this._setupScrollInteractions();
        this._setupErrorHandling();
        this._setupConfigManagement();
        this._setupValidationRequests();
    }

    /**
     * 设置图片相关的服务交互
     * @private
     * @returns {void}
     */
    _setupImageInteractions() {
        // 协调图片上传请求
        this.eventBus.on('image:upload', async (file) => {
            if (!file) {
                throw new Error('BusinessOrchestrationService: image:upload event requires file parameter');
            }
            await this._handleImageUploadRequest(file);
        });

        // 图片替换结果UI反馈
        this.eventBus.on('image:replaced', (data) => {
            if (!data || !data.fileName || typeof data.width !== 'number' || typeof data.height !== 'number') {
                throw new Error('BusinessOrchestrationService: image:replaced event requires valid data with fileName, width, and height');
            }
            this._handleImageReplaceSuccess(data);
        });

        this.eventBus.on('image:replace-error', (error) => {
            if (!error || !error.type) {
                throw new Error('BusinessOrchestrationService: image:replace-error event requires error object with type');
            }
            this._handleImageReplaceError(error);
        });

        this.eventBus.on('image:replace-file-warnings', (data) => {
            if (!data || !Array.isArray(data.warnings)) {
                throw new Error('BusinessOrchestrationService: image:replace-file-warnings event requires data with warnings array');
            }
            this._handleImageReplaceFileWarnings(data);
        });

        // 图片上传成功后自动调整滚动范围
        this.eventBus.on('image:upload-success', (data) => {
            // Fail Fast: 验证事件数据格式
            if (!data || !data.imageData) {
                throw new Error('BusinessOrchestrationService: image:upload-success event requires data.imageData');
            }
            if (typeof data.imageData.width !== 'number') {
                throw new Error('BusinessOrchestrationService: image:upload-success event requires imageData with width');
            }
            this._handleImageUploadSuccess(data.imageData);
        });

        // 监听图片需要降采样请求（返回用户决策）
        this.eventBus.on('image:needs-downsampling', async (data) => {
            // Fail Fast: 验证事件数据格式
            if (!data || !data.fileName || typeof data.totalPixels !== 'number') {
                throw new Error('BusinessOrchestrationService: image:needs-downsampling event requires data with fileName and totalPixels');
            }
            return await this._handleDownsamplingConfirmation(data);
        });

        // 监听图片降采样完成事件（显示对比信息）
        this.eventBus.on('image:downsampled', (data) => {
            // Fail Fast: 验证事件数据格式
            if (!data || !data.original || !data.downsampled) {
                throw new Error('BusinessOrchestrationService: image:downsampled event requires data with original and downsampled');
            }
            this._handleDownsamplingComplete(data);
        });
    }

    /**
     * 设置滚动相关的服务交互
     * @private
     * @returns {void}
     */
    _setupScrollInteractions() {
        // 监听滚动参数变化验证请求（架构分层：System层处理验证）
        this.eventBus.on('validation:scroll-parameter-changed', (data) => {
            if (!data || !data.paramType || data.newValue === undefined) {
                throw new Error('BusinessOrchestrationService: validation:scroll-parameter-changed event requires data with paramType and newValue');
            }
            this._handleScrollParameterValidation(data);
        });
    }

    /**
     * 设置错误处理交互
     * @private
     * @returns {void}
     */
    _setupErrorHandling() {
        // 统一的图片错误处理
        this.eventBus.on('image:upload-error', (error) => {
            if (!error) {
                throw new Error('BusinessOrchestrationService: image:upload-error event requires error parameter');
            }
            this._handleImageError({ type: 'upload-error', data: error });
        });
        
        this.eventBus.on('image:dimension-warnings', (data) => {
            if (!data || !data.fileName || !Array.isArray(data.warnings)) {
                throw new Error('BusinessOrchestrationService: image:dimension-warnings event requires data with fileName and warnings array');
            }
            this._handleImageError({ type: 'dimension-warnings', data });
        });
        
        // 滚动错误处理
        this.eventBus.on('scroll:parameter-validation-error', (error) => {
            if (!error || !Array.isArray(error.errors) || error.previousValue === undefined) {
                throw new Error('BusinessOrchestrationService: scroll:parameter-validation-error event requires error with errors array and previousValue');
            }
            this._handleScrollParameterValidationError(error);
        });
    }


    /**
     * 处理图片首次上传成功（设置默认滚动范围）
     * 注意：首次上传不需要reset播放状态，因为还没有播放过
     * @param {Object} imageData - 图片数据 { width, height, ... }
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleImageUploadSuccess(imageData) {
        // Fail Fast: 验证必需参数
        if (!imageData || typeof imageData.width !== 'number') {
            throw new Error('BusinessOrchestrationService._handleImageUploadSuccess: imageData with width is required');
        }
        
        // 性能优化：缓存状态属性和全局属性访问
        const scalingRatio = this.stateManager.state.content.image.scaling.ratio;
        const viewportWidth = window.innerWidth;
        
        // ✅ 使用 calculateDefaultEndPosition 计算默认结束位置
        // 目标：图片右边缘贴合视口右边缘时对应的像素位置
        const endPosition = calculateDefaultEndPosition(
            imageData.width,
            scalingRatio,
            viewportWidth
        );
        
        // 协调者只负责编排流程，直接调用 ScrollService 更新滚动配置
        // 首次上传不需要reset，直接设置默认滚动范围即可
        this.scrollService.updateConfig({
            'playback.scroll.endPosition': endPosition
        });
    }

    /**
     * 统一处理图片相关错误
     * @param {Object} errorInfo - 错误信息 { type: 'upload-error' | 'dimension-warnings', data: {...} }
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleImageError(errorInfo) {
        // Fail Fast: 验证必需参数
        if (!errorInfo || !errorInfo.type || !errorInfo.data) {
            throw new Error('BusinessOrchestrationService._handleImageError: errorInfo with type and data is required');
        }
        
        const { type, data } = errorInfo;
        
        switch (type) {
            case 'upload-error':
                this._processUploadError(data);
                break;
                
            case 'dimension-warnings':
                this._processDimensionWarnings(data);
                break;
                
            default:
                throw new Error(`BusinessOrchestrationService._handleImageError: unknown error type "${type}"`);
        }
    }
    
    /**
     * 处理图片上传错误
     * @param {Object} error - 错误信息
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _processUploadError(error) {
        // Fail Fast: 验证必需参数
        if (!error) {
            throw new Error('BusinessOrchestrationService._processUploadError: error is required');
        }
        if (!error.fileName) {
            throw new Error('BusinessOrchestrationService._processUploadError: error.fileName is required');
        }
        
        // 对于尺寸验证错误，已经通过 dimension-warnings 路径处理了
        // 避免重复显示消息
        if (error.type === 'dimension_validation_error') {
            return;
        }
        
        // Fail Fast: 明确验证错误消息来源
        let errorDetail;
        if (error.error) {
            errorDetail = error.error;
        } else if (error.message) {
            errorDetail = error.message;
        } else {
            throw new Error('BusinessOrchestrationService._processUploadError: error.error or error.message is required');
        }
        
        this._showValidationError(
            '图片上传失败！',
            errorDetail,
            error.fileName
        );
    }
    
    /**
     * 格式化警告消息列表
     * @param {Array} warnings - 警告对象数组
     * @private
     * @returns {string} 格式化后的消息字符串
     * @throws {Error} 如果参数无效
     */
    _formatWarningMessages(warnings) {
        // Fail Fast: 验证必需参数
        if (!Array.isArray(warnings)) {
            throw new Error('BusinessOrchestrationService._formatWarningMessages: warnings must be an array');
        }
        
        let message = '';
        warnings.forEach(warning => {
            message += `<p style="margin: 0 0 8px 0;"><strong>${warning.message}</strong></p><p style="margin: 0 0 4px 0;">${warning.description}</p><p style="margin: 0 0 16px 0;">${warning.suggestion}</p>`;
        });
        return message;
    }

    /**
     * 处理图片尺寸验证警告
     * @param {Object} data - 验证数据 { fileName, warnings }
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _processDimensionWarnings(data) {
        // Fail Fast: 验证必需参数
        if (!data || !data.fileName || !Array.isArray(data.warnings)) {
            throw new Error('BusinessOrchestrationService._processDimensionWarnings: data with fileName and warnings array is required');
        }
        
        const { fileName, warnings } = data;
        
        if (warnings.length === 0) return;
        
        // 性能优化：一次遍历代替三次filter，避免重复迭代
        const errors = [];
        const warns = [];
        const infos = [];
        
        for (const warning of warnings) {
            switch (warning.level) {
                case 'error':
                    errors.push(warning);
                    break;
                case 'warning':
                    warns.push(warning);
                    break;
                case 'info':
                    infos.push(warning);
                    break;
            }
        }
        
        // 显示错误和警告（阻塞性问题）
        if (errors.length > 0 || warns.length > 0) {
            let message = this._formatWarningMessages([...errors, ...warns]);
            message += `<p style="margin: 0 0 8px 0;">建议重新选择符合条件的图片以获得最佳滚动效果。</p><p style="margin: 0;">文件名：${fileName}</p>`;
            
            // 根据是否有error决定发送error还是warning事件（影响图标显示）
            if (errors.length > 0) {
                // 有错误：显示红叉图标
                this.eventBus.emit('ui:show-validation-error', {
                    message,
                    options: { 
                        title: '图片验证失败',
                        shortMessage: '图片不符合滚动视频要求，请重新选择符合条件的图片。'
                    }
                });
            } else {
                // 只有警告：显示警告图标
                this.eventBus.emit('ui:show-validation-warning', {
                    message,
                    options: { 
                        title: '图片验证警告',
                        shortMessage: '图片不符合滚动视频要求，请重新选择符合条件的图片。'
                    }
                });
            }
        }
        
        // 只有在没有错误和警告时才显示信息提示，避免覆盖重要错误消息
        else if (infos.length > 0) {
            const message = this._formatWarningMessages(infos);
            
            // 双重反馈：先显示对话框，再显示成功消息条
            // 利用EventBus的requestAsync异步支持，无需在ErrorDisplayService中添加专门方法
            this.eventBus.requestAsync('ui:show-info-dialog', {
                message: `<p style="margin: 0 0 12px 0;"><strong>图片 "${fileName}" 信息提示：</strong></p>${message}`,
                options: { title: '图片信息提示' }
            }).then(() => {
                this.eventBus.emit('ui:show-success-message', {
                    message: '图片上传成功！'
                });
            });
        }
    }

    
    /**
     * 处理滚动参数验证错误
     * @param {Object} error - 错误信息 { paramType, errors, previousValue, newValue }
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleScrollParameterValidationError(error) {
        // Fail Fast: 验证必需参数
        if (!error || !Array.isArray(error.errors) || error.previousValue === undefined) {
            throw new Error('BusinessOrchestrationService._handleScrollParameterValidationError: error with errors array and previousValue is required');
        }
        
        const errorMessage = error.errors.join('<br>'); 
        this.eventBus.emit('ui:show-validation-error', {
            message: `<p style="margin: 0 0 12px 0;"><strong>滚动参数无效！</strong></p><p style="margin: 0 0 12px 0;">错误详情：<br>${errorMessage}</p><p style="margin: 0;">已恢复为默认值：${error.previousValue}。</p>`,
            options: {
                title: '参数验证失败',
                shortMessage: '滚动参数无效！'
            }
        });
    }

    /**
     * 格式化验证错误消息
     * 统一错误消息的显示格式
     * @param {string} shortMessage - 简短错误消息
     * @param {string} errorDetail - 错误详情
     * @param {string} [fileName] - 可选的文件名
     * @private
     * @returns {string} 格式化后的错误消息
     * @throws {Error} 如果必需参数缺失
     */
    _formatValidationErrorMessage(shortMessage, errorDetail, fileName) {
        // Fail Fast: 验证必需参数
        if (!shortMessage || typeof shortMessage !== 'string') {
            throw new Error('BusinessOrchestrationService._formatValidationErrorMessage: shortMessage is required and must be a string');
        }
        if (!errorDetail || typeof errorDetail !== 'string') {
            throw new Error('BusinessOrchestrationService._formatValidationErrorMessage: errorDetail is required and must be a string');
        }
        
        let message = `<p style="margin: 0 0 12px 0;"><strong>${shortMessage}</strong></p><p style="margin: 0 0 12px 0;">错误详情：<br>${errorDetail}</p>`;
        if (fileName) {
            message += `<p style="margin: 0;">文件名：${fileName}</p>`;
        }
        return message;
    }

    /**
     * 显示验证错误对话框
     * 统一发送验证错误UI事件
     * @param {string} shortMessage - 简短错误消息（用于标题和提示）
     * @param {string} errorDetail - 错误详情
     * @param {string} [fileName] - 可选的文件名
     * @private
     * @returns {void}
     * @throws {Error} 如果必需参数缺失
     */
    _showValidationError(shortMessage, errorDetail, fileName) {
        // Fail Fast: 验证必需参数
        if (!shortMessage || typeof shortMessage !== 'string') {
            throw new Error('BusinessOrchestrationService._showValidationError: shortMessage is required and must be a string');
        }
        if (!errorDetail || typeof errorDetail !== 'string') {
            throw new Error('BusinessOrchestrationService._showValidationError: errorDetail is required and must be a string');
        }
        
        this.eventBus.emit('ui:show-validation-error', {
            message: this._formatValidationErrorMessage(shortMessage, errorDetail, fileName),
            options: {
                title: shortMessage.replace('！', ''),
                shortMessage: shortMessage
            }
        });
    }

    /**
     * 设置配置管理协调
     * @private
     * @returns {void}
     */
    _setupConfigManagement() {
        // 监听来自ConfigService的文件处理结果
        this.eventBus.on('config:file-import-success', (data) => {
            if (!data) {
                throw new Error('BusinessOrchestrationService: config:file-import-success event requires data parameter');
            }
            this._handleConfigFileImportSuccess(data);
        });

        this.eventBus.on('config:file-import-error', (data) => {
            if (!data || !data.error || !data.fileName) {
                throw new Error('BusinessOrchestrationService: config:file-import-error event requires data with error and fileName');
            }
            this._handleConfigFileImportError(data);
        });

        this.eventBus.on('config:file-export-success', (data) => {
            if (!data) {
                throw new Error('BusinessOrchestrationService: config:file-export-success event requires data parameter');
            }
            this._handleConfigFileExportSuccess(data);
        });

        this.eventBus.on('config:file-export-error', (data) => {
            if (!data || !data.error) {
                throw new Error('BusinessOrchestrationService: config:file-export-error event requires data with error');
            }
            this._handleConfigFileExportError(data);
        });
    }


    /**
     * 处理配置文件导入成功
     * @param {Object} data - 导入成功数据 { unknownFields?: string[] }
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleConfigFileImportSuccess(data) {
        // Fail Fast: 验证必需参数
        if (!data) {
            throw new Error('BusinessOrchestrationService._handleConfigFileImportSuccess: data is required');
        }
        
        // 如果有未映射的字段，在成功消息中添加提示
        if (data.unknownFields && data.unknownFields.length > 0) {
            const fieldList = data.unknownFields.join('、');
            this.eventBus.emit('ui:show-success-message', {
                message: `配置导入成功！<br><br>ℹ️ 提示：检测到以下不属于本项目的字段，已自动跳过：<br>${fieldList}`
            });
        } else {
            this.eventBus.emit('ui:show-success-message', {
                message: `配置导入成功！`
            });
        }
    }

    /**
     * 处理配置文件导入失败
     * @param {Object} data - 导入失败数据 { error, fileName }
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleConfigFileImportError(data) {
        // Fail Fast: 验证必需参数
        if (!data || !data.error || !data.fileName) {
            throw new Error('BusinessOrchestrationService._handleConfigFileImportError: data with error and fileName is required');
        }
        
        const { error, fileName } = data;
        
        // System层职责：格式化验证错误消息
        const errorDetail = error.validationErrors && Array.isArray(error.validationErrors)
            ? error.validationErrors.join('<br>')
            : error;
        
        this.eventBus.emit('ui:show-validation-error', {
            message: this._formatValidationErrorMessage('配置导入失败！', errorDetail, fileName),
            options: {
                title: '配置导入失败',
                shortMessage: '配置导入失败！'
            }
        });
    }

    /**
     * 处理配置文件导出成功
     * @param {Object} data - 导出成功数据
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleConfigFileExportSuccess(data) {
        // Fail Fast: 验证必需参数
        if (!data) {
            throw new Error('BusinessOrchestrationService._handleConfigFileExportSuccess: data is required');
        }
        
        const { cancelled } = data;
        
        if (!cancelled) {
        this.eventBus.emit('ui:show-success-message', {
            message: `配置导出成功！`
        });
        }
    }

    /**
     * 处理配置文件导出失败
     * @param {Object} data - 导出失败数据
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleConfigFileExportError(data) {
        // Fail Fast: 验证必需参数
        if (!data || !data.error) {
            throw new Error('BusinessOrchestrationService._handleConfigFileExportError: data with error is required');
        }
        if (!data.fileName) {
            throw new Error('BusinessOrchestrationService._handleConfigFileExportError: data.fileName is required');
        }
        
        const { error, fileName } = data;
        
        if (!error.includes('用户取消')) {
            this._showValidationError(
                '配置导出失败！',
                error,
                fileName
            );
        }
    }

    /**
     * 处理图片上传请求 - 业务编排职责
     * 从ImageService移过来的事件协调逻辑，保持原有业务逻辑不变
     * @param {File} file - 图片文件
     * @private
     * @returns {Promise<void>}
     * @throws {Error} 如果参数无效
     */
    async _handleImageUploadRequest(file) {
        // Fail Fast: 验证必需参数
        if (!file) {
            throw new Error('BusinessOrchestrationService._handleImageUploadRequest: file is required');
        }
        
        try {
            const result = await this.imageService.upload(file);
            
            // Fail Fast: 验证返回结果的结构
            if (!result || typeof result.success !== 'boolean') {
                throw new Error('BusinessOrchestrationService._handleImageUploadRequest: ImageService.upload must return a result with success boolean');
            }
            
            if (result.success === true) {
                // 成功情况：ImageService已发出image:upload-success事件
                // 这里不需要额外处理，事件已经被相关服务监听
            } else {
                // 处理验证失败情况 - 保持原有逻辑不变
                // 发出失败事件，确保UI层能正确隐藏加载框
                this.eventBus.emit('image:upload-error', {
                    fileName: file.name,
                    error: result.error,
                    type: result.type
                });
                
                // 所有错误都通过统一的错误处理系统处理
                // 不在这里重复发送UI事件，避免双重显示
            }
        } catch (error) {
            // 发出异常失败事件，确保UI层能正确隐藏加载框
            this.eventBus.emit('image:upload-error', {
                fileName: file.name,
                error: error.message,
                type: 'exception'
            });
            // 错误显示由统一的错误处理系统负责，不在这里重复发送
        }
    }

    /**
     * 处理图片替换成功的UI反馈
     * @param {Object} data - 替换成功数据
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleImageReplaceSuccess(data) {
        // Fail Fast: 验证必需参数
        if (!data || !data.fileName || typeof data.width !== 'number' || typeof data.height !== 'number') {
            throw new Error('BusinessOrchestrationService._handleImageReplaceSuccess: data with fileName, width, and height is required');
        }
        
        this.eventBus.emit('ui:show-success-message', {
            message: `图片替换成功！新图片：${data.fileName}，尺寸：${data.width} × ${data.height} 像素。滚动配置和入场动画配置已清空，请重新配置。`
        });
    }

    /**
     * 处理图片替换错误的UI反馈
     * @param {Object} error - 错误信息
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleImageReplaceError(error) {
        // Fail Fast: 验证必需参数
        if (!error || !error.type) {
            throw new Error('BusinessOrchestrationService._handleImageReplaceError: error with type is required');
        }
        
        switch (error.type) {
            case 'no-current-image':
                if (!error.message) {
                    throw new Error('BusinessOrchestrationService._handleImageReplaceError: error.message is required for no-current-image type');
                }
                this.eventBus.emit('ui:show-error-dialog', {
                    message: `<p style="margin: 0;">${error.message}</p>`,
                    options: { title: '无法替换图片' }
                });
                break;
            case 'validation':
                if (!error.message) {
                    throw new Error('BusinessOrchestrationService._handleImageReplaceError: error.message is required for validation type');
                }
                this.eventBus.emit('ui:show-validation-error', {
                    message: `<p style="margin: 0;">${error.message}</p>`,
                    options: {
                        title: '文件验证失败',
                        shortMessage: error.message
                    }
                });
                break;
            case 'dimension-validation':
                // 尺寸验证错误已经通过 image:dimension-warnings 事件显示了警告对话框
                // 这里不需要重复显示，直接返回
                return;
            case 'processing-error':
            default:
                // Fail Fast: 明确验证错误消息来源
                let errorDetail;
                if (error.error && error.error.message) {
                    errorDetail = error.error.message;
                } else if (error.message) {
                    errorDetail = error.message;
                } else {
                    throw new Error('BusinessOrchestrationService._handleImageReplaceError: error.error.message or error.message is required for processing-error type');
                }
                
                this.eventBus.emit('ui:show-validation-error', {
                    message: this._formatValidationErrorMessage('图片替换失败！', errorDetail),
                    options: {
                        title: '图片替换失败',
                        shortMessage: '图片替换失败！'
                    }
                });
                break;
        }
    }

    /**
     * 处理图片替换文件验证警告的UI反馈
     * System层职责：格式化警告消息并调用UI服务显示
     * @param {Object} data - 警告数据 { warnings: Array }
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleImageReplaceFileWarnings(data) {
        // Fail Fast: 验证必需参数
        if (!data || !Array.isArray(data.warnings)) {
            throw new Error('BusinessOrchestrationService._handleImageReplaceFileWarnings: data with warnings array is required');
        }
        
        if (data.warnings.length > 0) {
            const message = data.warnings.map(warning => `<p style="margin: 0 0 12px 0;">${warning}</p>`).join('');
            this.eventBus.emit('ui:show-warning-dialog', {
                message: message,
                options: {
                    title: '图片验证警告'
                }
            });
        }
    }

    /**
     * 处理滚动参数验证请求（架构分层：System层调用ValidationService）
     * @param {Object} data - 验证请求数据 { paramType, newValue }
     * @private
     * @returns {void}
     * @throws {Error} 如果参数无效
     */
    _handleScrollParameterValidation(data) {
        // Fail Fast: 验证必需参数
        if (!data || !data.paramType || data.newValue === undefined) {
            throw new Error('BusinessOrchestrationService._handleScrollParameterValidation: data with paramType and newValue is required');
        }
        
        const { paramType, newValue } = data;
        
        // 性能优化：缓存深层对象访问（已经在第一行缓存，无需额外优化）
        const scrollConfig = this.stateManager.state.playback.scroll;
        
        // 调用 ValidationService 进行验证
        const result = this.validationService.validateScrollParameterChange(
            paramType,
            newValue,
            scrollConfig
        );
        
        // 发送验证结果事件给 Business 层
        this.eventBus.emit('validation:scroll-parameter-result', {
            paramType,
            newValue,
            ...result
        });
    }

    /**
     * 设置同步验证请求监听器
     * 用于Business层通过EventBus.request()同步调用System层ValidationService
     * 
     * @private
     * @returns {void}
     */
    _setupValidationRequests() {
        // ========== 播放前业务规则验证 ==========
        
        // 播放前验证（检查性能监控和循环功能是否同时开启）
        this.eventBus.on('playback:validate-before-play', () => {
            const performanceEnabled = this.stateManager.state.preferences.performance.enabled;
            const loopEnabled = this.stateManager.state.playback.loop.enabled;
            
            if (performanceEnabled && loopEnabled) {
                this.eventBus.emit('ui:show-validation-error', {
                    message: '<p style="margin: 0;">性能监控和循环功能不能同时开启，请先关闭其中一个功能。</p>',
                    options: {
                        title: '功能冲突',
                        shortMessage: '性能监控和循环功能不能同时开启。'
                    }
                });
                return { isValid: false };
            }
            
            return { isValid: true };
        });
        
        // ========== Business层同步验证（LoopConfigurationService, DurationSequenceService） ==========
        
        // 循环次数验证（用于LoopConfigurationService）
        this.eventBus.on('validation:loop-count', (data) => {
            if (!data || data.loopCount === undefined) {
                throw new Error('BusinessOrchestrationService: validation:loop-count requires data.loopCount');
            }
            return this.validationService.validateLoopCount(data.loopCount);
        });

        // 时长序列单值验证（用于DurationSequenceService）
        this.eventBus.on('validation:sequence-value', (data) => {
            if (!data || data.inputValue === undefined) {
                throw new Error('BusinessOrchestrationService: validation:sequence-value requires data.inputValue');
            }
            return this.validationService.validateSequenceValue(data.inputValue);
        });

        // 时长序列批量错误检查（用于DurationSequenceService）
        this.eventBus.on('validation:sequence-errors', (data) => {
            if (!data || !Array.isArray(data.durationValues)) {
                throw new Error('BusinessOrchestrationService: validation:sequence-errors requires data.durationValues as array');
            }
            return this.validationService.hasSequenceValidationErrors(data.durationValues);
        });

        // ========== ImageService同步验证 ==========
        
        // 文件验证（文件类型、大小等）
        this.eventBus.on('validation:file', (data) => {
            if (!data || !data.file) {
                throw new Error('BusinessOrchestrationService: validation:file requires data.file');
            }
            return this.validationService.validateFile(data.file, data.expectedType);
        });

        // 图片尺寸验证（上传图片时）
        this.eventBus.on('validation:image-dimensions', (data) => {
            if (!data || !data.imageData) {
                throw new Error('BusinessOrchestrationService: validation:image-dimensions requires data.imageData');
            }
            if (typeof data.viewportWidth !== 'number' || typeof data.viewportHeight !== 'number') {
                throw new Error('BusinessOrchestrationService: validation:image-dimensions requires data.viewportWidth and viewportHeight');
            }
            if (!data.file || !(data.file instanceof File)) {
                throw new Error('BusinessOrchestrationService: validation:image-dimensions requires data.file as File object');
            }
            // validateImageDimensions返回warnings数组，传递file用于文件大小验证
            const warnings = this.validationService.validateImageDimensions(
                data.imageData,
                data.viewportWidth,
                data.viewportHeight,
                data.file
            );
            return { warnings };
        });

        // ========== ConfigService同步验证 ==========
        
        // 配置文件验证
        this.eventBus.on('validation:config-file', (data) => {
            if (!data || !data.file) {
                throw new Error('BusinessOrchestrationService: validation:config-file requires data.file');
            }
            this.validationService.validateConfigFile(data.file);
            return { isValid: true, errors: [] };
        });

        // 配置数据验证
        this.eventBus.on('validation:config-data', (data) => {
            if (!data || !data.configData) {
                throw new Error('BusinessOrchestrationService: validation:config-data requires data.configData');
            }
            const supportedVersions = this.stateManager.state.system.supportedVersions;
            return this.validationService.validateConfigData(data.configData, supportedVersions);
        });

        // 图片元数据格式验证
        this.eventBus.on('validation:image-metadata', (data) => {
            if (!data || !data.imageMetadata) {
                throw new Error('BusinessOrchestrationService: validation:image-metadata requires data.imageMetadata');
            }
            const errors = this.validationService.validateImageMetadataFormat(data.imageMetadata);
            return { errors };
        });

        // ========== ConfigService异步验证 ==========
        
        // 配置图片尺寸异步验证（需要parseFromBase64）
        this.eventBus.on('validation:config-image-dimensions', async (data) => {
            if (!data || !data.config) {
                throw new Error('BusinessOrchestrationService: validation:config-image-dimensions requires data.config');
            }
            // validateConfigImageDimensions是async的，直接返回Promise
            return await this.validationService.validateConfigImageDimensions(data.config);
        });
    }

    /**
     * 处理降采样确认请求
     * 显示确认对话框，让用户选择是否降采样
     * @param {Object} data - 降采样请求数据
     * @param {string} data.fileName - 文件名
     * @param {number} data.originalWidth - 原始宽度
     * @param {number} data.originalHeight - 原始高度
     * @param {number} data.totalPixels - 总像素数
     * @param {number} data.targetMaxPixels - 目标最大像素数
     * @returns {Promise<Object>} 用户决策 {confirmed: boolean}
     * @private
     */
    async _handleDownsamplingConfirmation(data) {
        const megaPixels = (data.totalPixels / 1000000).toFixed(0);
        
        // 使用 requestAsync 直接获取用户选择（同步等待）
        const userConfirmed = await this.eventBus.requestAsync('ui:show-confirm-dialog', {
            message: `
                <p style="margin: 0 0 12px 0;">检测到超大图片（<strong>${megaPixels}MP</strong>），建议降采样以确保流畅运行和避免浏览器崩溃。</p>
                <p style="margin: 0 0 12px 0;">降采样后画质会略有下降，但不影响滚动动画。如果您的设备性能较好，可以选择保持原图。</p>
                <p style="margin: 0;">是否降采样？</p>
            `,
            options: {
                title: '大图片优化建议',
                confirmText: '是，降低分辨率',
                cancelText: '否，保持原始分辨率'
            }
        });
        
        return { confirmed: userConfirmed };
    }

    /**
     * 处理降采样完成 - 显示优化对比信息
     * @param {Object} data - 降采样对比数据
     * @param {Object} data.original - 原始图片信息 {width, height, totalPixels}
     * @param {Object} data.downsampled - 降采样后图片信息 {width, height, totalPixels}
     * @returns {void}
     * @private
     */
    _handleDownsamplingComplete(data) {
        const originalMP = formatMP(data.original.totalPixels);
        const downsampledMP = formatMP(data.downsampled.totalPixels);
        const scale = Math.sqrt(data.downsampled.totalPixels / data.original.totalPixels);
        const memorySaved = formatPercentage((1 - data.downsampled.totalPixels / data.original.totalPixels), true);
        
        // 格式化文件大小
        const originalFileSize = formatFileSize(data.original.fileSize);
        const downsampledFileSize = formatFileSize(data.downsampled.fileSize);
        const fileSizeSaved = formatPercentage((1 - data.downsampled.fileSize / data.original.fileSize), true);
        
        const message = `
            <p style="margin: 0 0 12px 0; font-size: 16px;">🖼️ 图片降采样处理完成</p>
            <p style="margin: 0 0 8px 0;">原始尺寸：<strong>${data.original.width} × ${data.original.height}</strong></p>
            <p style="margin: 0 0 8px 0;">原始像素：<strong>${originalMP}</strong></p>
            <p style="margin: 0 0 8px 0;">原始文件大小：<strong>${originalFileSize}</strong></p>
            <p style="margin: 0 0 8px 0;">缩放比例：<strong>${formatPercentage(scale, true)}</strong></p>
            <p style="margin: 0 0 8px 0;">目标尺寸：<strong>${data.downsampled.width} × ${data.downsampled.height}</strong></p>
            <p style="margin: 0 0 8px 0;">目标像素：<strong>${downsampledMP}</strong></p>
            <p style="margin: 0 0 8px 0;">目标文件大小：<strong>${downsampledFileSize}</strong></p>
            <p style="margin: 0 0 8px 0;">内存节省：<strong style="color: #27ae60;">${memorySaved}</strong></p>
            <p style="margin: 0;">文件大小节省：<strong style="color: #27ae60;">${fileSizeSaved}</strong></p>
        `;
        
        this.eventBus.emit('ui:show-info-dialog', {
            message: message,
            options: {
                title: '图片优化完成'
            }
        });
    }

}

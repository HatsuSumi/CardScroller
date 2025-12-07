import { calculateDefaultEndPosition } from '../../helpers/positionCalculators.js';

/**
 * ImageService - 图片服务
 * 图片业务流程协调者，采用事件驱动架构，协调图片相关的各个统一服务完成复杂业务流程。负责上传协调、替换协调、拖拽协调、状态协调，通过EventBus与其他服务解耦通信。
 * 
 * 当前被使用的模块：
 * - ConfigService (services/business/ConfigService.js) - 配置服务导入配置时调用getCurrentImage和loadFromConfig
 * - BusinessOrchestrationService (services/system/BusinessOrchestrationService.js) - 系统级业务协调调用upload方法
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - fileProcessStrategyManager (patterns/file/FileProcessStrategyManager.js) - 文件处理策略管理器 (通过DI注入)
 * - imageProcessingService (business/ImageProcessingService.js) - 图片处理服务 (通过DI注入)
 * - calculateDefaultEndPosition (helpers/positionCalculators.js) - 位置计算工具 (通过ES6 import引入)
 */
export class ImageService {
    /**
     * @param {EventBus} eventBus - 事件总线
     * @param {StateManager} stateManager - 状态管理器
     * @param {FileProcessStrategyManager} fileProcessStrategyManager - 文件处理策略管理器
     * @param {ImageProcessingService} imageProcessingService - 图片处理服务
     * @throws {Error} 当必需依赖未提供时抛出错误
     */
    constructor(eventBus, stateManager, fileProcessStrategyManager, imageProcessingService) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.fileProcessStrategyManager = fileProcessStrategyManager;
        this.imageProcessingService = imageProcessingService;
        
        // Fail Fast: 验证必需依赖
        if (!fileProcessStrategyManager) {
            throw new Error('FileProcessStrategyManager is required for ImageService');
        }
        if (!imageProcessingService) {
            throw new Error('ImageProcessingService is required for ImageService');
        }
    }

    /**
     * 初始化服务
     * 绑定EventBus事件监听器
     * @returns {void}
     */
    init() {
        this._bindEvents();
    }

    /**
     * 处理图片降采样（上传和替换共用）
     * @param {Object} imageData - 图片数据 {dataUrl, width, height, fileName, fileSize, ...}
     * @param {File} file - 原始文件对象
     * @returns {Promise<Object>} 处理后的图片数据（可能已降采样）
     * @private
     */
    async _handleDownsampling(imageData, file) {
        // 检测是否需要降采样
        const downsamplingCheck = this.imageProcessingService.checkNeedsDownsampling(imageData);
        
        if (!downsamplingCheck.needsDownsampling) {
            return imageData;  // 不需要降采样，直接返回
        }
        
        // 请求用户确认 - 使用 requestAsync 等待用户决策
        const decision = await this.eventBus.requestAsync('image:needs-downsampling', {
            fileName: file.name,
            originalWidth: imageData.width,
            originalHeight: imageData.height,
            totalPixels: downsamplingCheck.totalPixels,
            targetMaxPixels: downsamplingCheck.targetMaxPixels
        });
        
        // 用户拒绝降采样
        if (!decision || !decision.confirmed) {
            return imageData;  // 使用原始分辨率
        }
        
        // 保存原始数据用于对比和显示
        const originalData = {
            width: imageData.width,
            height: imageData.height,
            totalPixels: downsamplingCheck.totalPixels,
            fileSize: imageData.fileSize
        };
        
        // 保存原始尺寸和文件大小到 imageData（用于图片信息模态框显示）
        imageData.originalWidth = imageData.width;
        imageData.originalHeight = imageData.height;
        imageData.originalFileSize = imageData.fileSize;
        
        // 执行降采样
        imageData = await this.imageProcessingService.downsampleImage(
            imageData,
            file,
            downsamplingCheck.targetMaxPixels
        );
        
        // 发射降采样完成事件，传递对比信息
        this.eventBus.emit('image:downsampled', {
            original: originalData,
            downsampled: {
                width: imageData.actualWidth,
                height: imageData.actualHeight,
                totalPixels: imageData.actualWidth * imageData.actualHeight,
                fileSize: imageData.actualFileSize
            }
        });
        
        // 更新 imageData 的 width/height/fileSize 为实际降采样后的值
        // metadata 应该反映实际加载图片的真实尺寸，确保数据一致性
        imageData.width = imageData.actualWidth;
        imageData.height = imageData.actualHeight;
        imageData.fileSize = imageData.actualFileSize;
        
        return imageData;
    }

    /**
     * 处理文件上传 - 协调验证、处理、状态更新流程
     * @param {File|File[]} files - 文件或文件数组
     * @returns {Promise<Object>} 上传结果 {success, data?, file?, validation?, error?, type?}
     */
    async upload(files) {
        const fileArray = Array.isArray(files) ? files : [files];
        
        // Fail Fast: 必须提供文件
        if (fileArray.length === 0) {
            throw new Error('ImageService.upload: files parameter is empty');
        }

        // 目前只支持单文件上传
        if (fileArray.length > 1) {
            throw new Error('ImageService.upload: multiple file upload not supported');
        }

        const file = fileArray[0];
        
        // 验证文件 - 通过EventBus.request()同步调用ValidationService，指定期望类型为图片
        const fileValidation = this._requestValidation('file', file, 'image');
        if (!fileValidation.isValid) {
            return { 
                success: false,
                fileName: file.name,
                error: fileValidation.errors[0],
                validation: fileValidation,
                type: 'validation_error'
            };
        }
        
        let imageData;
        let validationWarnings;
        
        try {
            // 处理文件 - 委托给FileProcessStrategyManager（业务异常可被捕获）
            imageData = await this.fileProcessStrategyManager.processFile(file);
            
            // 处理降采样（复用公共方法）
            imageData = await this._handleDownsampling(imageData, file);
            
        } catch (error) {
            // 捕获业务处理错误（processFile等）
            // 不主动发射事件，只返回错误结果
            return {
                success: false,
                error: error.message,
                fileName: file.name,
                type: 'technical_error'
            };
        }
        
        // 验证图片尺寸 - 通过EventBus.request()同步调用ValidationService，传递file用于文件大小验证
        const validationResult = this._requestValidation('imageDimensions', imageData, file);
        
        // Fail Fast: 验证返回格式（架构错误，不应被捕获）
        if (!validationResult || !validationResult.warnings) {
            throw new Error('Invalid validation result: missing warnings field');
        }
        
        validationWarnings = validationResult.warnings;
        if (validationWarnings.length > 0) {
            // 检查是否有 error 或 warning 级别的验证问题
            const hasBlockingIssues = validationWarnings.some(w => w.level === 'error' || w.level === 'warning');
            
            this.eventBus.emit('image:dimension-warnings', {
                fileName: file.name,
                warnings: validationWarnings
            });
            
            // 只有 error 或 warning 级别才阻止上传，info 级别允许上传
            if (hasBlockingIssues) {
                return {
                    success: false,
                    fileName: file.name,
                    error: 'Validation failed',
                    validation: validationWarnings,
                    type: 'dimension_validation_error'
                };
            }
        }
        
        // Fail Fast验证和状态更新在try-catch外面，确保架构错误不被捕获
        this._updateImageState(imageData);

        // 发布成功事件 - 纯事件协调，传递验证信息以便UI服务决定是否显示通用成功消息
        this.eventBus.emit('image:upload-success', {
            imageData: imageData,
            hasValidationInfo: validationWarnings.length > 0  // 有验证信息时UI不显示通用成功消息
        });
        this.eventBus.emit('image:info-updated', {
            imageData: {
                width: imageData.width,
                height: imageData.height,
                src: imageData.dataUrl
            },
            fileData: file,
            ppiInfo: null  // 正常上传时为 null，由 ImageInfoModalService 异步提取
        });
        
        return {
            success: true,
            data: imageData,
            file: file,
            validation: validationWarnings
        };
    }

    /**
     * 处理拖拽上传
     * @param {DataTransfer} dataTransfer - 拖拽数据
     * @returns {Promise<Object>} 上传结果 {success, data?, error?, validation?, type?}
     */
    async handleDrop(dataTransfer) {
        const files = Array.from(dataTransfer.files);
        
        // Fail Fast: 拖拽事件必须包含文件
        if (files.length === 0) {
            throw new Error('ImageService.handleDrop: dataTransfer.files is empty, this should not happen');
        }
        
        // 异步验证所有文件，指定期望类型为图片
        const validationResults = await Promise.all(
            files.map(file => this._requestValidation('file', file, 'image'))
        );
        
        const imageFiles = files.filter((file, index) => validationResults[index].isValid);
        
        if (imageFiles.length === 0) {
            // 返回验证失败结果，让UI层决定如何显示
            // 生成文件名列表用于错误消息（此时 files.length > 0 已确认）
            const fileNames = files.map(f => f.name).join(', ');
            
            return {
                success: false,
                error: '未找到有效的图片文件',
                fileName: fileNames,
                validation: {
                    title: '拖拽文件验证失败',
                    shortMessage: '未找到有效的图片文件。'
                },
                type: 'drop_validation_error'
            };
        }
        
        return this.upload(imageFiles[0]);
    }


    /**
     * 获取当前图片信息
     * 🎯 性能优化：缓存state.content.image引用，避免重复Proxy访问
     * @returns {Object} 图片信息 {data, isLoaded, metadata}
     */
    getCurrentImage() {
        const image = this.stateManager.state.content.image;
        return {
            data: image.data,
            isLoaded: image.isLoaded,
            metadata: image.metadata
        };
    }

    /**
     * 重置滚动和入场动画配置
     * 替换图片时调用，清空所有依赖图片尺寸的配置
     * @param {number} newImageWidth - 新图片的宽度（像素）
     * @private
     * @returns {void}
     * @throws {Error} 当newImageWidth无效时抛出错误（Fail Fast）
     */
    _resetScrollAndAnimationConfig(newImageWidth) {
        // Fail Fast: 验证参数
        if (typeof newImageWidth !== 'number' || newImageWidth <= 0) {
            throw new Error('ImageService._resetScrollAndAnimationConfig: newImageWidth must be a positive number');
        }
        
        const state = this.stateManager.state;
        
        // 重置滚动配置
        state.playback.scroll.startPosition = 0;
        
        // 计算新图片的默认结束位置（与上传流程一致）
        const scalingRatio = state.content.image.scaling.ratio;
        const viewportWidth = window.innerWidth;
        const endPosition = calculateDefaultEndPosition(newImageWidth, scalingRatio, viewportWidth);
        
        state.playback.scroll.endPosition = endPosition;
        state.playback.scroll.lockToImageEnd = false;
        
        // 重置入场动画配置
        state.playback.entryAnimation.enabled = false;
        state.playback.entryAnimation.cardBoundaries = [];
        state.playback.entryAnimation.cardAnimations = [];
        state.playback.entryAnimation.markedAtStartPosition = null;
        state.playback.entryAnimation.markedAtEndPosition = null;
    }

    /**
     * 替换图片时更新图片状态（全量更新，包含尺寸）
     * @param {Object} imageData - 新图片数据
     * @private
     * @returns {void}
     * @throws {Error} 当imageData缺少必需字段时抛出错误（Fail Fast）
     */
    _updateImageStateForReplace(imageData) {
        // Fail Fast: 验证必需字段
        if (!imageData.dataUrl) {
            throw new Error('ImageData missing required field: dataUrl');
        }
        if (!imageData.fileName) {
            throw new Error('ImageData missing required field: fileName');
        }
        if (imageData.fileSize === undefined || imageData.fileSize === null) {
            throw new Error('ImageData missing required field: fileSize');
        }
        if (!imageData.width) {
            throw new Error('ImageData missing required field: width');
        }
        if (!imageData.height) {
            throw new Error('ImageData missing required field: height');
        }
        if (imageData.lastModified === undefined || imageData.lastModified === null) {
            throw new Error('ImageData missing required field: lastModified');
        }
        
        const image = this.stateManager.state.content.image;
        const metadata = image.metadata;
        
        // 全量更新（包含尺寸）
        image.data = imageData.dataUrl;
        image.isLoaded = true;
        metadata.fileName = imageData.fileName;
        metadata.fileSize = imageData.fileSize;
        metadata.width = imageData.width;
        metadata.height = imageData.height;
        metadata.lastModified = imageData.lastModified;
        
        // 设置原始尺寸
        if (imageData.originalWidth && imageData.originalHeight) {
            metadata.originalWidth = imageData.originalWidth;
            metadata.originalHeight = imageData.originalHeight;
        } else {
            metadata.originalWidth = imageData.width;
            metadata.originalHeight = imageData.height;
        }
        
        // 设置原始文件大小（降采样时）
        if (imageData.originalFileSize) {
            metadata.originalFileSize = imageData.originalFileSize;
        }
    }

    /**
     * 统一更新图片状态
     * 🎯 性能优化：使用 batch() 批量更新7个图片状态属性，只触发一次 watcher 通知
     * @param {Object} imageData - 图片数据
     * @private
     * @throws {Error} 当imageData缺少必需字段时抛出错误（Fail Fast）
     */
    _updateImageState(imageData) {
        // Fail Fast: 验证必需字段
        if (!imageData.dataUrl) {
            throw new Error('ImageData missing required field: dataUrl');
        }
        if (!imageData.fileName) {
            throw new Error('ImageData missing required field: fileName');
        }
        if (imageData.fileSize === undefined || imageData.fileSize === null) {
            throw new Error('ImageData missing required field: fileSize');
        }
        if (!imageData.width) {
            throw new Error('ImageData missing required field: width');
        }
        if (!imageData.height) {
            throw new Error('ImageData missing required field: height');
        }
        if (imageData.lastModified === undefined || imageData.lastModified === null) {
            throw new Error('ImageData missing required field: lastModified');
        }
        
        this.stateManager.batch(() => {
            const image = this.stateManager.state.content.image;
            const metadata = image.metadata;
            
            image.data = imageData.dataUrl;
            image.isLoaded = true;
            metadata.fileName = imageData.fileName;
            metadata.fileSize = imageData.fileSize;
            metadata.width = imageData.width;
            metadata.height = imageData.height;
            
            // 设置原始尺寸和文件大小
            if (imageData.originalWidth && imageData.originalHeight) {
                // 降采样或配置导入：使用提供的原始尺寸
                metadata.originalWidth = imageData.originalWidth;
                metadata.originalHeight = imageData.originalHeight;
            } else {
                // 未降采样：原始尺寸就是当前尺寸
                metadata.originalWidth = imageData.width;
                metadata.originalHeight = imageData.height;
            }
            
            // 设置原始文件大小（降采样时）
            if (imageData.originalFileSize) {
                metadata.originalFileSize = imageData.originalFileSize;
            }
            
            metadata.lastModified = imageData.lastModified;
        }, {});
    }

    /**
     * 从配置数据加载图片（专用于ConfigService配置导入）
     * 跳过验证和冗余处理，直接加载已验证的配置数据
     * @param {Object} configImageData - 配置中的图片数据
     * @returns {Promise<Object>} 加载结果 {success, data}
     */
    async loadFromConfig(configImageData) {
        // Fail Fast: 验证配置数据完整性（架构错误，不应被捕获）
        if (configImageData.lastModified === undefined || configImageData.lastModified === null) {
            throw new Error('lastModified is required in configImageData. Configuration file may be corrupted.');
        }
        if (configImageData.fileSize === undefined || configImageData.fileSize === null) {
            throw new Error('fileSize is required in configImageData. Configuration file may be corrupted.');
        }
        
        // 转换配置格式为标准ImageData格式（不包含displayInfo，由UI层自己格式化）
        const standardImageData = {
            dataUrl: configImageData.dataUrl,
            fileName: configImageData.fileName,
            fileSize: configImageData.fileSize,
            width: configImageData.width,
            height: configImageData.height,
            originalWidth: configImageData.originalWidth,
            originalHeight: configImageData.originalHeight,
            lastModified: configImageData.lastModified
        };
        
        let fileData, ppiInfo;
        
        try {
            // 协调者职责：委托 ImageProcessingService 处理配置数据（业务异常可被捕获）
            const result = this.imageProcessingService.processConfigData(configImageData);
            fileData = result.fileData;
            ppiInfo = result.ppiInfo;
        } catch (error) {
            return {
                success: false,
                error: error.message,
                fileName: configImageData.fileName
            };
        }
        
        // Fail Fast验证和状态更新在try-catch外面，确保架构错误不被捕获
        this._updateImageState(standardImageData);
        
        // 协调者职责：统一发送 image:info-updated 事件（与正常上传流程一致）
        this.eventBus.emit('image:info-updated', {
            imageData: {
                width: standardImageData.width,
                height: standardImageData.height,
                src: standardImageData.dataUrl
            },
            fileData,
            ppiInfo
        });
        
        return {
            success: true,
            data: standardImageData
        };
    }

    /**
     * 请求验证（通过EventBus.request()同步调用ValidationService）
     * @private
     * @param {string} type - 验证类型
     * @param {*} data - 待验证数据（根据type不同而不同）
     * @param {*} extraData - 额外数据（可选）
     * @returns {Object} 验证结果
     */
    _requestValidation(type, data, extraData = null) {
        // 根据验证类型调用对应的同步验证
        switch (type) {
            case 'file':
                return this.eventBus.request('validation:file', { file: data, expectedType: extraData });
                
            case 'imageDimensions':
                // 获取当前视口尺寸（业务需求：确保图片适合当前浏览器环境滚动）
                return this.eventBus.request('validation:image-dimensions', {
                    imageData: data,
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight,
                    file: extraData
                });
                
            default:
                throw new Error(`Unknown validation type: ${type}`);
        }
    }

    /**
     * 绑定事件
     * 
     * 监听事件：
     * - image:replace - 图片替换请求
     * - image:drop - 拖拽上传请求
     * - state:change - 状态变化（监听图片卸载）
     * 
     * 使用的request()调用（同步验证 - 通过EventBus.request()）：
     * - validation:file - 文件验证
     * - validation:image-dimensions - 图片尺寸验证
     * 
     * 发射事件（业务流程）：
     * - image:upload-success, image:upload-error - 上传流程事件
     * - image:dimension-warnings - 图片尺寸警告
     * - image:info-updated - 图片信息更新
     * - image:replace-error - 图片替换错误
     * - image:replace-file-warnings - 图片替换文件验证警告
     * - image:replaced - 图片替换成功
     * - image:unloaded - 图片卸载事件
     * - image:downsampled - 图片降采样完成
     * 
     * @private
     */
    _bindEvents() {
        // 图片替换事件 - 保留在ImageService因为这是直接的业务操作
        this.eventBus.on('image:replace', async (file) => {
            try {
                await this.replaceImage(file);
            } catch (error) {
                // 捕获任何未被replaceImage内部处理的错误
                console.error('ImageService: Unexpected error in replaceImage:', error);
                this.eventBus.emit('image:replace-error', {
                    type: 'unexpected-error',
                    error: error,
                    message: `图片替换失败: ${error.message}`
                });
            }
        });

        // 拖拽上传事件 - 不使用.catch()，让Fail Fast错误自然向上传播直到崩溃
        this.eventBus.on('image:drop', async (dataTransfer) => {
            const result = await this.handleDrop(dataTransfer);
            
            // 处理拖拽验证失败的情况（成功情况已由upload()处理）
            if (result && result.success === false) {
                this.eventBus.emit('image:upload-error', {
                    fileName: result.fileName,
                    error: result.error,
                    validation: result.validation,
                    type: result.type
                });
            }
        });
    }

    /**
     * 替换当前图片（清空滚动和入场动画配置）
     * 支持任意尺寸替换，支持降采样
     * @param {File} file - 新的图片文件
     * @returns {Promise<void>}
     */
    async replaceImage(file) {
        try {
            // 1. 验证文件 - 通过EventBus.request()同步调用ValidationService，指定期望类型为图片
            const fileValidation = this._requestValidation('file', file, 'image');
            if (!fileValidation.isValid) {
                this.eventBus.emit('image:replace-error', {
                    type: 'validation',
                    validation: fileValidation,
                    message: fileValidation.errors[0]
                });
                return;
            }
            
            // 2. 发送文件验证警告事件（如果有）- 协调者职责：发送业务事件，由System层决定如何显示
            if (fileValidation.warnings?.length > 0) {
                this.eventBus.emit('image:replace-file-warnings', {
                    warnings: fileValidation.warnings
                });
            }

            // 3. 处理新图片 - 委托给FileProcessStrategyManager
            const newImageData = await this.fileProcessStrategyManager.processFile(file);
            
            // 4. 处理降采样（复用公共方法）
            const processedImageData = await this._handleDownsampling(newImageData, file);
            
            // 5. 验证图片尺寸 - 通过EventBus.request()同步调用ValidationService，传递file用于文件大小验证
            const dimensionValidation = this._requestValidation('imageDimensions', processedImageData, file);
            
            // Fail Fast: 验证返回格式（架构错误，不应被捕获）
            if (!dimensionValidation || !dimensionValidation.warnings) {
                throw new Error('Invalid validation result: missing warnings field');
            }
            
            // 如果有验证警告，发送事件通知用户
            if (dimensionValidation.warnings.length > 0) {
                // 检查是否有 error 或 warning 级别的验证问题（与upload流程一致）
                const hasBlockingIssues = dimensionValidation.warnings.some(w => w.level === 'error' || w.level === 'warning');
                
                this.eventBus.emit('image:dimension-warnings', {
                    fileName: file.name,
                    warnings: dimensionValidation.warnings
                });
                
                // 只有 error 或 warning 级别才阻止替换，info 级别允许替换
                if (hasBlockingIssues) {
                    this.eventBus.emit('image:replace-error', {
                        type: 'dimension-validation',
                        validation: dimensionValidation.warnings,
                        message: 'Image dimension validation failed'
                    });
                    return;
                }
            }
            
            // 6. 批量更新状态：全量更新图片 + 重置配置
            this.stateManager.batch(() => {
                // 6.1 全量更新图片状态（包含尺寸）
                this._updateImageStateForReplace(processedImageData);
                
                // 6.2 重置滚动和入场动画配置（传入新图片宽度以计算默认结束位置）
                this._resetScrollAndAnimationConfig(processedImageData.width);
            }, {});

            // 7. 发送替换成功事件
            this.eventBus.emit('image:replaced', {
                fileName: processedImageData.fileName,
                width: processedImageData.width,
                height: processedImageData.height
            });
            
            // 8. 发送图片信息更新事件（与上传流程一致）
            this.eventBus.emit('image:info-updated', {
                imageData: {
                    width: processedImageData.width,
                    height: processedImageData.height,
                    src: processedImageData.dataUrl
                },
                fileData: file,
                ppiInfo: null
            });
            
        } catch (error) {
            // 捕获所有未预期的错误
            this.eventBus.emit('image:replace-error', {
                type: 'unexpected-error',
                error: error,
                message: `图片替换失败: ${error.message}`
            });
        }
    }

}

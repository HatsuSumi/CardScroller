import { generateFileName } from '../../helpers/fileFormatters.js';

/**
 * ConfigService - 配置服务
 * 配置业务流程协调者，协调配置数据的创建、验证、导入导出和系统应用，委托专业服务处理具体任务（图片处理、格式转换、数据验证、文件操作等）
 * 
 * 当前被使用的模块：
 * - 无（被其他模块通过EventBus间接调用）
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线通信 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理，获取和更新配置状态 (通过DI注入)
 * - imageService (business/ImageService.js) - 图片服务，获取当前图片数据和加载配置图片 (通过DI注入)
 * - scrollService (business/ScrollService.js) - 滚动服务，用于配置导入后重置滚动状态 (通过DI注入)
 * - fileSaveService (utils/FileSaveService.js) - 文件保存服务，统一处理文件导出和下载 (通过DI注入)
 * - generateFileName (helpers/fileFormatters.js) - 文件名生成工具函数
 * - ppiExtractorService (utils/PPIExtractorService.js) - PPI提取服务，用于获取当前图片的PPI信息进行导出 (通过DI注入)
 * - fileProcessStrategyManager (patterns/file/FileProcessStrategyManager.js) - 文件处理策略管理器，用于读取和解析配置文件 (通过DI注入)
 */

// ============================================
// 配置文件格式映射（公共API契约 v1.0）
// ============================================

/**
 * 配置文件字段到内部状态路径的映射表
 * 
 * 设计目的：
 * - 将用户友好的扁平化字段名映射到内部模块化状态路径
 * - 解耦配置文件格式（公共API）和内部状态结构（私有实现）
 * - 支持内部重构而不破坏用户的配置文件
 * 
 * 维护规则：
 * - 添加新字段：向后兼容，直接添加即可
 * - 修改映射目标：谨慎操作，需要同步更新导出逻辑
 * - 删除字段：需要版本升级和迁移脚本
 * 
 * 架构原则：
 * - 配置文件格式 = 公共API（必须稳定）
 * - 内部状态结构 = 私有实现（可以重构）
 * - 映射表 = 转换层（解耦两者）
 * 
 * @type {Object<string, string>}
 */
const CONFIG_TO_STATE_MAPPING = {
    // 滚动控制 (来自 config.scroll)
    'startPosition': 'playback.scroll.startPosition',
    'endPosition': 'playback.scroll.endPosition',
    'duration': 'playback.scroll.duration',
    'reverseScroll': 'playback.scroll.reverseScroll',
    'lockToImageEnd': 'playback.scroll.lockToImageEnd',

    // 循环控制 (来自 config.playback)
    'loop': 'playback.loop.enabled',
    'loopCount': 'playback.loop.count',
    'variableDuration': 'playback.loop.variableDuration',
    'durationSequence': 'playback.loop.durationSequence',
    'intervalTime': 'playback.loop.intervalTime',
    'autoResetAfterComplete': 'playback.loop.autoResetAfterComplete',
    
    // 入场动画 (来自 config.playback)
    'entryAnimationEnabled': 'playback.entryAnimation.enabled',
    'entryAnimationCardBoundaries': 'playback.entryAnimation.cardBoundaries',
    'entryAnimationCardAnimations': 'playback.entryAnimation.cardAnimations',
    'entryAnimationDuration': 'playback.entryAnimation.duration',
    'entryAnimationStaggerDelay': 'playback.entryAnimation.staggerDelay',
    'entryAnimationIntervalBeforeScroll': 'playback.entryAnimation.intervalBeforeScroll',
    'entryAnimationMarkedAtStartPosition': 'playback.entryAnimation.markedAtStartPosition',
    'entryAnimationMarkedAtEndPosition': 'playback.entryAnimation.markedAtEndPosition',

    // 界面 (来自 config.ui)
    'sidebarOpacity': 'ui.layout.sidebarOpacity',
    'backgroundColor': 'ui.display.backgroundColor'
};

export class ConfigService {
    /**
     * 配置文件导出设置常量
     */
    static CONFIG_FILE_SETTINGS = {
        FILENAME_PREFIX: 'cardscroller-config',
        FILE_DESCRIPTION: 'CardScroller配置文件',
        SELECT_FOLDER: true
    };

    /**
     * 创建配置服务实例
     * 
     * @param {EventBus} eventBus - 事件总线，用于服务间通信
     * @param {StateManager} stateManager - 状态管理器，用于读取和更新配置状态
     * @param {ImageService} imageService - 图片服务，用于获取当前图片数据和加载配置图片
     * @param {ScrollService} scrollService - 滚动服务，用于配置导入后重置滚动状态
     * @param {FileSaveService} fileSaveService - 文件保存服务，用于导出配置文件
     * @param {PPIExtractorService} ppiExtractorService - PPI提取服务，用于导出图片PPI信息
     * @param {FileProcessStrategyManager} fileProcessStrategyManager - 文件处理策略管理器，用于读取和解析配置文件
     * @throws {Error} 当任何依赖注入失败时抛出错误（Fail Fast）
     */
    constructor(eventBus, stateManager, imageService, scrollService, fileSaveService, ppiExtractorService, fileProcessStrategyManager) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.imageService = imageService;
        this.scrollService = scrollService;
        this.fileSaveService = fileSaveService;
        this.ppiExtractorService = ppiExtractorService;
        this.fileProcessStrategyManager = fileProcessStrategyManager;
        // 当前处理的文件信息（简化的状态跟踪）
        this.currentImport = null;
        
        // 验证依赖
        if (!eventBus) {
            throw new Error('EventBus is required for ConfigService');
        }
        if (!stateManager) {
            throw new Error('StateManager is required for ConfigService');
        }
        if (!imageService) {
            throw new Error('ImageService is required for ConfigService');
        }
        if (!scrollService) {
            throw new Error('ScrollService is required for ConfigService');
        }
        if (!fileSaveService) {
            throw new Error('FileSaveService is required for ConfigService');
        }
        if (!ppiExtractorService) {
            throw new Error('PPIExtractorService is required for ConfigService');
        }
        if (!fileProcessStrategyManager) {
            throw new Error('FileProcessStrategyManager is required for ConfigService');
        }
    }

    /**
     * 初始化服务
     * 
     * 注册EventBus事件监听器：
     * - 监听来自FileOperationUIService的配置导入/导出请求事件
     * - 监听来自ValidationService的配置文件和数据验证结果事件
     * 
     * @returns {void}
     */
    init() {
        // 监听来自 FileOperationUIService 的文件导入导出请求
        this.eventBus.on('config:file-import-request', (data) => {
            // Fail Fast: 验证事件数据完整性
            if (!data || !data.file) {
                throw new Error('config:file-import-request event requires data.file');
            }
            this._handleFileImport(data.file);
        });

        this.eventBus.on('config:file-export-request', (data) => {
            // Fail Fast: 验证事件数据完整性
            if (!data || !data.options) {
                throw new Error('config:file-export-request event requires data.options');
            }
            this._handleFileExport(data.configData, data.options);
        });

    }

    /**
     * 处理文件导出请求
     * 
     * 创建配置数据、序列化为JSON、通过FileSaveService保存文件，最后发射成功或失败事件
     * 
     * @private
     * @param {Object} configData - 要导出的配置数据（如果为null则自动创建）
     * @param {Object} options - 导出选项
     * @param {boolean} [options.selectFolder=true] - 是否使用文件夹选择对话框
     * @returns {Promise<void>}
     * 
     * 注意：此方法捕获所有错误并通过EventBus发射error事件，不会向上抛出
     *       导出时强制包含图片数据，因为配置依赖图片尺寸无法独立使用
     */
    async _handleFileExport(configData, options) {
        // 声明变量供 catch 块使用
        let fileName = 'unknown';
        
        try {
            // Fail Fast: 验证必需参数
            if (!options || typeof options !== 'object') {
                throw new Error('options parameter is required for file export');
            }
            
            // Fail Fast: configData必须是对象或null/undefined
            if (configData !== null && configData !== undefined && typeof configData !== 'object') {
                throw new Error('configData parameter must be an object, null, or undefined');
            }
            
            // 如果没有提供configData，创建当前系统配置
            let actualConfigData;
            if (configData === null || configData === undefined) {
                // 强制包含图片数据（配置依赖图片尺寸，不可分离）
                actualConfigData = this._createExportData();
            } else {
                // Fail Fast: 验证提供的configData结构完整性
                if (!configData.version || typeof configData.version !== 'string') {
                    throw new Error('configData must have a valid version field');
                }
                if (!configData.config || typeof configData.config !== 'object') {
                    throw new Error('configData must have a valid config object');
                }
                actualConfigData = configData;
            }
            
            // 使用硬编码的 selectFolder 值（可通过 options 覆盖）
            const selectFolder = options.selectFolder !== undefined 
                ? options.selectFolder 
                : ConfigService.CONFIG_FILE_SETTINGS.SELECT_FOLDER;
            
            // 配置文件统一使用JSON格式
            const content = JSON.stringify(actualConfigData, null, 2);
            const mimeType = 'application/json';
            const extension = 'json';
            
            // 使用硬编码的文件名前缀和文件描述
            const filenamePrefix = ConfigService.CONFIG_FILE_SETTINGS.FILENAME_PREFIX;
            const fileDescription = ConfigService.CONFIG_FILE_SETTINGS.FILE_DESCRIPTION;
            
            // 生成带时间戳的文件名
            fileName = generateFileName(filenamePrefix, extension);
            
            // 使用FileSaveService统一处理文件保存
            const saveResult = await this.fileSaveService.saveFile(content, fileName, mimeType, {
                preferFileSystemAPI: selectFolder,
                fileDescription: fileDescription
            });
            
            // Fail Fast: 验证FileSaveService返回的结构完整性（所有字段必须存在且类型正确）
            if (!saveResult || typeof saveResult.cancelled !== 'boolean' || typeof saveResult.method !== 'string') {
                throw new Error('FileSaveService returned invalid result structure');
            }
            
            // 发射成功事件
            this.eventBus.emit('config:file-export-success', {
                cancelled: saveResult.cancelled
            });
            
        } catch (error) {
            // 发射失败事件（包含文件名供错误处理使用）
            this.eventBus.emit('config:file-export-error', {
                error: error.message,
                fileName: fileName
            });
        }
    }

    /**
     * 创建导出数据（强制包含图片）
     * @private
     * @returns {Object} 完整的导出数据对象（包含version、timestamp、config）
     * @throws {Error} 当ImageService不可用或获取图片数据失败时抛出错误（Fail Fast）
     */
    _createExportData() {
        // Fail Fast: 验证必需的依赖
        if (!this.imageService || typeof this.imageService.getCurrentImage !== 'function') {
            throw new Error('ImageService is required and must have getCurrentImage method');
        }
        
        // 获取图片数据
        const imageData = this.imageService.getCurrentImage();
        
        // 性能优化：缓存state子对象引用，减少Proxy链式访问开销
        const state = this.stateManager.state;
        const scrollState = state.playback.scroll;
        const loopState = state.playback.loop;
        const entryAnimationState = state.playback.entryAnimation;
        const layoutState = state.ui.layout;
        const displayState = state.ui.display;
        
        // 性能优化：解构imageData减少属性访问
        // Fail Fast: 导出配置时必须有已加载的图片
        if (!imageData || !imageData.isLoaded) {
            throw new Error('No image loaded. Cannot export config without image.');
        }
        
        let imageConfig = null;
        if (imageData.isLoaded) {
            const { metadata, data } = imageData;
            
            // Fail Fast: 验证已加载图片的关键字段
            if (!metadata) {
                throw new Error('Image metadata is missing for loaded image');
            }
            if (!metadata.width || !metadata.height) {
                throw new Error(`Invalid image dimensions: width=${metadata.width}, height=${metadata.height}`);
            }
            if (!data) {
                throw new Error('Image data is missing for loaded image');
            }
            if (typeof metadata.fileName !== 'string') {
                throw new Error('Image fileName is missing or invalid for loaded image');
            }
            if (typeof metadata.fileSize !== 'number') {
                throw new Error('Image fileSize is missing or invalid for loaded image');
            }
            if (typeof metadata.lastModified !== 'number') {
                throw new Error('Image lastModified is missing or invalid for loaded image');
            }
            
            const ppiInfo = this.ppiExtractorService.currentPPIInfo;
            imageConfig = {
                fileName: metadata.fileName,
                width: metadata.width,
                height: metadata.height,
                originalWidth: metadata.originalWidth,
                originalHeight: metadata.originalHeight,
                fileSize: metadata.fileSize,
                dataUrl: data,
                ppiX: ppiInfo?.xPPI ?? null,
                ppiY: ppiInfo?.yPPI ?? null,
                lastModified: metadata.lastModified
            };
        }
        
        const configData = {
            image: imageConfig,
            scroll: {
                startPosition: scrollState.startPosition,
                endPosition: scrollState.endPosition,
                duration: scrollState.duration,
                reverseScroll: scrollState.reverseScroll,
                lockToImageEnd: scrollState.lockToImageEnd
            },
            playback: {
                loop: loopState.enabled,
                loopCount: loopState.count,
                variableDuration: loopState.variableDuration,
                durationSequence: loopState.durationSequence,
                intervalTime: loopState.intervalTime,
                autoResetAfterComplete: loopState.autoResetAfterComplete,
                entryAnimationEnabled: entryAnimationState.enabled,
                entryAnimationCardBoundaries: entryAnimationState.cardBoundaries,
                entryAnimationCardAnimations: entryAnimationState.cardAnimations,
                entryAnimationDuration: entryAnimationState.duration,
                entryAnimationStaggerDelay: entryAnimationState.staggerDelay,
                entryAnimationIntervalBeforeScroll: entryAnimationState.intervalBeforeScroll,
                entryAnimationMarkedAtStartPosition: entryAnimationState.markedAtStartPosition,
                entryAnimationMarkedAtEndPosition: entryAnimationState.markedAtEndPosition
            },
            ui: {
                sidebarOpacity: layoutState.sidebarOpacity,
                backgroundColor: displayState.backgroundColor
            }
        };
        
        // 创建完整的导出数据
        const version = this.stateManager.state.system.version;
        
        // Fail Fast: 验证 version 字段存在（导入时必需）
        if (!version || typeof version !== 'string') {
            throw new Error(`Invalid system.version in state: expected non-empty string, got "${version}"`);
        }
        
        const timestamp = new Date().toISOString();
        
        const exportData = {
            version,
            timestamp,
            config: configData
        };
        
        return exportData;
    }

    /**
     * 处理文件导入请求
     * 
     * 完整流程：创建导入状态 → 验证文件 → 读取文件 → 解析JSON → 验证配置数据 → 应用配置
     * 
     * @private
     * @param {File} file - 要导入的配置文件
     * @returns {Promise<void>}
     * 
     * 注意：此方法捕获所有错误并通过EventBus发射error事件，不会向上抛出
     */
    async _handleFileImport(file) {
        try {
            // 🎯 先设置临时导入状态，供验证使用
            this.currentImport = {
                file,
                configData: null, // 暂时为null，稍后设置
                fileName: file.name,
                importId: `${file.name}_${Date.now()}`
            };
            
            // 验证文件类型
            const fileValidationPromise = this._requestValidation('file', file);
            const fileResult = await fileValidationPromise;
            this._checkValidationResult(fileResult);
            
            // 协调者职责：委托给FileProcessStrategyManager处理配置文件（读取+解析）
            const processResult = await this.fileProcessStrategyManager.processFile(file);
            
            // Fail Fast: 验证FileProcessStrategyManager返回的数据结构
            // 期望格式：{ fileName, fileSize, data: <实际JSON配置> }
            if (!processResult || typeof processResult !== 'object') {
                throw new Error('FileProcessStrategyManager returned invalid result: expected object');
            }
            if (!processResult.data || typeof processResult.data !== 'object') {
                throw new Error('FileProcessStrategyManager returned invalid result: missing or invalid data field');
            }
            
            // 提取真正的配置数据
            const configData = processResult.data;
            
            // 更新配置数据
            this.currentImport.configData = configData;
            
            // 开始验证和应用流程（文件已验证，只需验证数据）
            await this._validateAndApplyConfig();
            
        } catch (error) {
            this.eventBus.emit('config:file-import-error', {
                fileName: file.name,
                error: error.message
            });
            
            // 清理失败的导入状态
            this.currentImport = null;
        }
    }

    /**
     * 验证并应用配置
     * 
     * 执行配置数据验证（结构、图片元数据、图片尺寸），验证通过后应用到系统并发射成功事件
     * 
     * @private
     * @returns {Promise<void>}
     * @throws {Error} 当没有当前导入时抛出错误（Fail Fast）
     * 
     * 注意：验证和应用过程中的错误会被捕获并通过EventBus发射error事件
     */
    async _validateAndApplyConfig() {
        if (!this.currentImport) {
            throw new Error('No current import to validate');
        }
        
        const { configData, fileName } = this.currentImport;
        
        try {
            // 文件已在导入时验证，只需验证配置数据
            const dataValidationPromise = this._requestValidation('data', configData);
            const dataResult = await dataValidationPromise;
            this._checkValidationResult(dataResult);
            
            // 验证图片元数据的格式和类型（通过EventBus请求）
            if (configData.config.image) {
                const metadataValidationPromise = this._requestValidation('imageMetadata', configData.config.image);
                const metadataResult = await metadataValidationPromise;
                
                // Fail Fast: 验证结果必须包含 errors 数组
                if (!Array.isArray(metadataResult.errors)) {
                    throw new Error('ValidationService returned invalid image metadata result: errors must be an array');
                }
                if (metadataResult.errors.length > 0) {
                    
                    const error = new Error(metadataResult.errors[0]);
                    error.validationErrors = metadataResult.errors; // 保存所有错误信息
                    throw error;
                }
            }

            // 异步验证图片尺寸（从base64解析真实尺寸，通过EventBus请求）
            const dimensionValidationPromise = this._requestValidation('imageDimensions', configData.config);
            const dimensionResult = await dimensionValidationPromise;
            this._checkValidationResult(dimensionResult);
            
            // 应用配置（返回未映射字段列表）
            const unknownFields = await this._applyConfigToSystem(configData);
            
            // 检查配置是否包含图片数据
            const imageIncluded = !!(configData.config && configData.config.image);
            
            // 发射成功事件（包含未映射字段信息和图片包含标识，用于UI处理）
            this.eventBus.emit('config:file-import-success', { 
                unknownFields: unknownFields.length > 0 ? unknownFields : null,
                imageIncluded: imageIncluded
            });
            
        } catch (error) {
            this.eventBus.emit('config:file-import-error', {
                fileName,
                error: error.message
            });
        } finally {
            // 清理当前导入状态
            this.currentImport = null;
        }
    }

    /**
     * 检查验证结果并在失败时抛出错误
     * 
     * @private
     * @param {Object} result - 验证结果对象
     * @param {boolean} result.isValid - 验证是否通过
     * @param {string[]} result.errors - 错误消息数组（ValidationService统一返回格式）
     * @throws {Error} 当验证失败或返回格式不符合预期时抛出错误（Fail Fast）
     */
    _checkValidationResult(result) {
        if (!result.isValid) {
            // Fail Fast: 验证失败必须有明确的错误消息数组（ValidationService的API契约）
            if (!Array.isArray(result.errors)) {
                throw new Error('ValidationService returned invalid result: errors must be an array');
            }
            if (result.errors.length === 0) {
                throw new Error('ValidationService returned invalid result: errors array is empty for failed validation');
            }
        
            const error = new Error(result.errors[0]);
            error.validationErrors = result.errors; // 保存所有错误信息
            throw error;
        }
    }

    /**
     * 请求验证
     * 混合模式：同步验证使用EventBus.request()，异步验证使用EventBus.requestAsync()
     * 
     * @private
     * @param {string} type - 验证类型 ('file', 'data', 'imageMetadata', 'imageDimensions')
     * @param {File|Object} data - 要验证的数据
     * @returns {Promise<Object>|Object} 同步验证返回结果对象，异步验证返回Promise
     */
    _requestValidation(type, data) {
        // 同步验证：直接通过request()获取结果
        if (type === 'file') {
            return this.eventBus.request('validation:config-file', { file: data });
        } else if (type === 'data') {
            return this.eventBus.request('validation:config-data', { configData: data });
        } else if (type === 'imageMetadata') {
            return this.eventBus.request('validation:image-metadata', { imageMetadata: data });
        }
        
        // 异步验证：validateConfigImageDimensions（需要parseFromBase64）
        else if (type === 'imageDimensions') {
            return this.eventBus.requestAsync('validation:config-image-dimensions', { config: data });
        }
        
        // Fail Fast: 未知的验证类型
        else {
            throw new Error(`Unknown validation type: ${type}. Expected 'file', 'data', 'imageMetadata', or 'imageDimensions'.`);
        }
    }

    /**
     * 将配置应用到系统
     * @private
     * @param {Object} configData - 配置数据对象
     * @returns {Promise<Array<string>>} 返回未映射的字段列表
     * @throws {Error} 当图片加载失败时抛出错误（Fail Fast）
     */
    async _applyConfigToSystem(configData) {
        const config = configData.config;
        
        // Fail Fast: 配置文件必须包含图片数据（因为配置依赖图片尺寸，已由 validateConfigImageDimensions 保证）
        if (!config.image || !config.image.dataUrl) {
            throw new Error('ConfigService._applyConfigToSystem: config.image.dataUrl is required');
        }
        
        // 1. 先加载图片（必须在重置滚动之前，因为重置会触发 currentPosition 变化，需要图片已加载）
        await this._loadImageFromConfig(config.image);
        
        // 2. 应用其他配置（滚动参数等），并收集未映射的字段
        const unknownFields = this._applyStateConfig(config);
        
        // 3. 配置导入后重置滚动状态到起始位置（必须在图片加载和配置应用之后）
        this.scrollService.reset();
        
        // 返回未映射字段列表
        return unknownFields;
    }

    /**
     * 从配置加载图片
     * @private
     * @param {Object} imageConfig - 图片配置对象
     * @returns {Promise<void>}
     * @throws {Error} 当图片加载失败时抛出错误（Fail Fast）
     */
    async _loadImageFromConfig(imageConfig) {
        // 直接调用ImageService，确保能捕获错误并中断配置导入
        const result = await this.imageService.loadFromConfig(imageConfig);
        
        if (!result.success) {
            throw new Error(`图片加载失败: ${result.error}`);
        }
    }

    /**
     * 应用状态配置
     * 使用映射表将配置文件格式转换为内部状态结构
     * @private
     * @param {Object} config - 配置对象
     * @param {Object} [config.scroll] - 滚动配置
     * @param {Object} [config.playback] - 播放配置
     * @param {Object} [config.ui] - UI配置
     */
    _applyStateConfig(config) {   
        // 🎯 性能优化：使用 batch() 批量更新所有状态，只触发一次 watcher 通知
        // 收集未映射的字段（用于向用户报告）
        const unknownFields = [];
        
        // 批量更新配置：使用immediate标识避免触发用户交互的副作用（如清空入场动画配置）
        // 导入配置是恢复已保存的状态，不应触发"用户主动修改"的副作用逻辑（如反向滚动改变时清空入场动画）
        this.stateManager.batch(() => {
            // 遍历配置文件中的主要部分
            ['scroll', 'playback', 'ui'].forEach(sectionName => {
                const sectionData = config[sectionName];
                
                // 确保该部分存在
                if (sectionData && typeof sectionData === 'object') {
                    // 遍历该部分的所有键值对
                    Object.entries(sectionData).forEach(([key, value]) => {
                        // 使用统一的映射表查找目标状态路径
                        const targetPath = CONFIG_TO_STATE_MAPPING[key];
                        
                        // 如果找到了映射，说明是项目配置，则更新状态
                        if (targetPath) {
                            this.stateManager.setValue(targetPath, value, { immediate: true });
                        } else {
                            // Fail Fast: 记录未映射的字段，稍后通过UI通知用户
                            unknownFields.push(`${sectionName}.${key}`);
                        }
                    });
                }
            });
        }, {});
        
        // 返回未映射字段列表（供调用者决定如何通知用户）
        return unknownFields;
    }
}

/**
 * FileOperationUIService - 文件操作UI服务
 * 文件操作UI控制器，负责图片上传、图片替换、配置导入、配置导出、拖拽上传等文件操作的UI控制，包括加载状态管理、UI反馈协调
 * 
 * 当前被使用的模块：
 * - 无（纯UI服务，通过EventBus被动响应事件）
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，用于服务间通信 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器，管理拖拽状态等UI状态 (通过DI注入)
 * - fileProcessStrategyManager (patterns/file/FileProcessStrategyManager.js) - 文件处理策略管理器，用于判断文件类型 (通过DI注入)
 * 
 * 架构说明：
 * 为什么不继承 BaseUIService？
 * - BaseUIService的设计意图是"频繁访问同一个DOM元素"，即多个方法反复调用 _getElement() 获取同一元素，通过缓存避免重复查询
 * - FileOperationUIService只在各个setup方法中一次性获取DOM元素并绑定事件监听器，之后不会再次访问这些元素
 * - 继承BaseUIService会造成无意义的缓存：DOM元素只在事件绑定时使用一次，不需要缓存
 * - 直接使用原生 document.getElementById() 更清晰、更轻量
 */

export class FileOperationUIService {
    /**
     * 构造函数 - 注入所需依赖
     * @param {EventBus} eventBus - 事件总线，用于服务间通信
     * @param {StateManager} stateManager - 状态管理器，管理拖拽状态等UI状态
     * @param {FileProcessStrategyManager} fileProcessStrategyManager - 文件处理策略管理器，用于判断文件类型
     * @throws {Error} 依赖注入失败时抛出错误（Fail Fast）
     */
    constructor(eventBus, stateManager, fileProcessStrategyManager) {
        // Fail Fast: 验证依赖注入
        if (!eventBus) throw new Error('FileOperationUIService: eventBus is required');
        if (!stateManager) throw new Error('FileOperationUIService: stateManager is required');
        if (!fileProcessStrategyManager) throw new Error('FileOperationUIService: fileProcessStrategyManager is required');
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.fileProcessStrategyManager = fileProcessStrategyManager;
        
        // 拖拽事件处理器引用（用于后续移除）
        this.dragHandlers = null;
    }

    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        this._setupFileOperationEvents();
        this._setupDragAndDrop();
        this._setupFileOperationResultHandlers();
    }


    /**
     * 设置文件操作相关事件
     * @returns {void}
     * @private
     */
    _setupFileOperationEvents() {
        this._setupImageImport();
        this._setupConfigImport();
        this._setupConfigExport();
        this._setupImageReplace();
    }

    /**
     * 设置图片导入事件 - 专门处理图片上传
     * @returns {void}
     * @throws {Error} DOM元素不存在时抛出错误（Fail Fast）
     * @private
     */
    _setupImageImport() {
        const importImageBtn = document.getElementById('importImageBtn');
        const imageInput = document.getElementById('imageInput');

        // Fail Fast: 关键DOM元素必须存在
        if (!importImageBtn) throw new Error('FileOperationUIService: importImageBtn element not found');
        if (!imageInput) throw new Error('FileOperationUIService: imageInput element not found');

        importImageBtn.addEventListener('click', () => {
            this._clearInputAndClick(imageInput);
        });
        imageInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this._handleImageUpload(e.target.files[0]);
            }
        });
    }

    /**
     * 设置配置导入事件 - 专门处理配置文件导入
     * @returns {void}
     * @throws {Error} DOM元素不存在时抛出错误（Fail Fast）
     * @private
     */
    _setupConfigImport() {
        const importConfigBtn = document.getElementById('importConfigBtn');
        const configInput = document.getElementById('configInput');

        // Fail Fast: 关键DOM元素必须存在
        if (!importConfigBtn) throw new Error('FileOperationUIService: importConfigBtn element not found');
        if (!configInput) throw new Error('FileOperationUIService: configInput element not found');

        importConfigBtn.addEventListener('click', () => {
            this._clearInputAndClick(configInput);
        });
        configInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                // 设置加载状态
                this.stateManager.state.app.isLoading = true;
                
                // 显示加载对话框
                this.eventBus.emit('ui:show-loading', '配置正在导入.....');
                
                // 通过事件总线请求配置导入
                this.eventBus.emit('config:file-import-request', {
                    file: e.target.files[0],
                    requestId: Date.now()
                });
            }
        });
    }

    /**
     * 设置配置导出事件 - 专门处理配置文件导出
     * @returns {void}
     * @throws {Error} DOM元素不存在时抛出错误（Fail Fast）
     * @private
     */
    _setupConfigExport() {
        const exportConfigBtn = document.getElementById('exportConfigBtn');

        // Fail Fast: 关键DOM元素必须存在
        if (!exportConfigBtn) throw new Error('FileOperationUIService: exportConfigBtn element not found');

        exportConfigBtn.addEventListener('click', () => {
            try {
                // 通过事件总线请求配置导出（强制包含图片数据）
                this.eventBus.emit('config:file-export-request', {
                    configData: null, // 将由ConfigService获取
                    options: {
                        // selectFolder 现在由 ConfigService 内部硬编码控制
                    },
                    requestId: Date.now()
                });
            } catch (error) {
                // 统一错误处理
                this.eventBus.emit('ui:show-validation-error', {
                    message: `<p style="margin: 0 0 12px 0;"><strong>配置导出失败！</strong></p><p style="margin: 0;">错误详情：<br>${error.message}</p>`,
                    options: {
                        title: '配置导出失败',
                        shortMessage: '配置导出失败！'
                    }
                });
            }
        });
    }

    /**
     * 设置图片替换事件 - 专门处理图片替换
     * @returns {void}
     * @throws {Error} DOM元素不存在时抛出错误（Fail Fast）
     * @private
     */
    _setupImageReplace() {
        const replaceImageBtn = document.getElementById('replaceImageBtn');
        const replaceImageInput = document.getElementById('replaceImageInput');

        // Fail Fast: 关键DOM元素必须存在
        if (!replaceImageBtn) throw new Error('FileOperationUIService: replaceImageBtn element not found');
        if (!replaceImageInput) throw new Error('FileOperationUIService: replaceImageInput element not found');

        replaceImageBtn.addEventListener('click', () => {
            // UI事件服务只负责触发文件选择，业务验证交给ImageService处理
            replaceImageInput.click();
        });

        replaceImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this._handleReplaceImage(file);
                // 清空文件输入，允许选择相同文件
                replaceImageInput.value = '';
            }
        });
    }

    /**
     * 设置拖拽上传功能
     * @returns {void}
     * @throws {Error} DOM元素不存在时抛出错误（Fail Fast）
     * @private
     */
    _setupDragAndDrop() {
        // 获取拖拽区域
        const mainDisplay = document.getElementById('mainDisplay');
        
        // Fail Fast: 关键DOM元素必须存在
        if (!mainDisplay) throw new Error('FileOperationUIService: mainDisplay element not found');
        
        // 保存事件处理器为实例属性，以便后续移除
        this.dragHandlers = {
            mainDisplay: mainDisplay,
            preventDefault: (e) => {
                e.preventDefault();
                e.stopPropagation();
            },
            dragEnter: () => {
                this.stateManager.state.ui.layout.dragOver = true;
            },
            dragLeave: (e) => {
                if (!mainDisplay.contains(e.relatedTarget)) {
                    this.stateManager.state.ui.layout.dragOver = false;
                }
            },
            drop: (e) => {
                this.stateManager.state.ui.layout.dragOver = false;
                this._handleDragDrop(e.dataTransfer);
            }
        };
        
        const events = ['dragenter', 'dragover', 'dragleave', 'drop'];
        events.forEach(eventName => {
            mainDisplay.addEventListener(eventName, this.dragHandlers.preventDefault);
        });
        
        mainDisplay.addEventListener('dragenter', this.dragHandlers.dragEnter);
        mainDisplay.addEventListener('dragleave', this.dragHandlers.dragLeave);
        mainDisplay.addEventListener('drop', this.dragHandlers.drop);
    }

    /**
     * 清空input值并触发点击
     * @param {HTMLInputElement} inputElement - input元素
     * @returns {void}
     * @throws {Error} 参数无效时抛出错误（Fail Fast）
     * @private
     */
    _clearInputAndClick(inputElement) {
        // Fail Fast: 验证参数
        if (!inputElement) {
            throw new Error('FileOperationUIService._clearInputAndClick: inputElement is required');
        }
        
        // 清空输入框的值，确保选择同一个文件时也能触发change事件
        inputElement.value = '';
        inputElement.click();
    }

    /**
     * 处理替换图片
     * @param {File} file - 新的图片文件
     * @returns {void}
     * @throws {Error} 参数无效时抛出错误（Fail Fast）
     * @private
     */
    _handleReplaceImage(file) {
        // Fail Fast: 验证参数
        if (!file) {
            throw new Error('FileOperationUIService._handleReplaceImage: file is required');
        }
        
        // 设置加载状态
        this.stateManager.state.app.isLoading = true;
        
        // 显示加载对话框
        this.eventBus.emit('ui:show-loading', '图片正在替换.....');
        
        // 通过事件总线请求图片替换
        this.eventBus.emit('image:replace', file);
    }

    /**
     * 处理图片上传 - UI控制器核心方法
     * @param {File} file - 图片文件
     * @returns {void}
     * @throws {Error} 参数无效时抛出错误（Fail Fast）
     * @private
     */
    _handleImageUpload(file) {
        // Fail Fast: 验证参数
        if (!file) {
            throw new Error('FileOperationUIService._handleImageUpload: file is required');
        }
        
        // 设置加载状态
        this.stateManager.state.app.isLoading = true;
        
        // 显示加载对话框
        this.eventBus.emit('ui:show-loading', '图片正在加载.....');

        // 通过事件总线请求图片上传（不要在finally中立即隐藏，等待上传完成事件）
        this.eventBus.emit('image:upload', file);
    }

    /**
     * 处理拖拽上传 - 智能识别文件类型
     * @param {DataTransfer} dataTransfer - 拖拽数据
     * @returns {void}
     * @throws {Error} 参数无效时抛出错误（Fail Fast）
     * @private
     */
    _handleDragDrop(dataTransfer) {
        // Fail Fast: 验证参数
        if (!dataTransfer || !dataTransfer.files) {
            throw new Error('FileOperationUIService._handleDragDrop: dataTransfer with files is required');
        }
        
        // 性能优化：直接访问FileList，避免Array.from转换
        if (dataTransfer.files.length === 0) {
            this.eventBus.emit('ui:show-validation-error', {
                message: '<p style="margin: 0 0 12px 0;"><strong>未检测到文件！</strong></p><p style="margin: 0;">请确保拖拽了有效的文件。</p>',
                options: {
                    title: '文件检测失败',
                    shortMessage: '未检测到文件！'
                }
            });
            return;
        }
        
        const file = dataTransfer.files[0]; // 取第一个文件
        
        // 🎯 智能识别文件类型
        const strategy = this.fileProcessStrategyManager.findStrategyForFile(file);
        const strategyName = strategy?.getName();
        
        // 设置加载状态
        this.stateManager.state.app.isLoading = true;
        
        if (strategyName === 'image') {
            // 图片文件 → 图片上传
            this.eventBus.emit('ui:show-loading', '图片正在加载.....');
            this.eventBus.emit('image:drop', dataTransfer);
            
        } else if (strategyName === 'config') {
            // JSON配置文件 → 配置导入
            this.eventBus.emit('ui:show-loading', '配置正在导入.....');
            this.eventBus.emit('config:file-import-request', {
                file: file,
                requestId: Date.now()
            });
            
        } else {
            // 不支持的文件类型 - 重置状态并显示错误
            this.stateManager.state.app.isLoading = false;
            this.eventBus.emit('ui:show-validation-error', {
                message: `<p style="margin: 0 0 12px 0;"><strong>不支持的文件类型！</strong></p><p style="margin: 0 0 12px 0;">文件名：${file.name}<br>文件类型：${file.type || '未知'}</p><p style="margin: 0;">支持格式：<br>图片：JPG、PNG、GIF、WebP等<br>配置：JSON文件</p>`,
                options: {
                    title: '文件类型不支持',
                    shortMessage: '不支持的文件类型！'
                }
            });
        }
    }

    /**
     * 设置文件处理结果监听器 - 监听上传/导入完成事件来隐藏加载框
     * @returns {void}
     * @private
     */
    _setupFileOperationResultHandlers() {
        // 图片上传成功
        this.eventBus.on('image:upload-success', (data) => {
            this._hideLoadingAndResetState();
            
            // 隐藏上传按钮并禁用拖拽功能（首次上传后）
            this._hideUploadButton();
            this._disableDragAndDrop();
            
            // 只有在没有验证信息时才显示通用成功消息
            // 如果有验证信息，BusinessOrchestrationService会通过双重反馈处理
            if (!data.hasValidationInfo) {
                this.eventBus.emit('ui:show-success-message', {
                    message: `图片上传成功！`
                });
            }
        });

        // 图片上传失败
        this.eventBus.on('image:upload-error', () => {
            this._hideLoadingAndResetState();
        });

        // 图片替换成功
        this.eventBus.on('image:replaced', () => {
            this._hideLoadingAndResetState();
        });

        // 图片替换失败
        this.eventBus.on('image:replace-error', () => {
            this._hideLoadingAndResetState();
        });

        // 配置导入成功
        this.eventBus.on('config:file-import-success', (data) => {
            this._hideLoadingAndResetState();
            
            // 如果配置包含图片，同样隐藏上传按钮并禁用拖拽
            if (data && data.imageIncluded === true) {
                this._hideUploadButton();
                this._disableDragAndDrop();
            }
        });

        // 配置导入失败
        this.eventBus.on('config:file-import-error', () => {
            this._hideLoadingAndResetState();
        });
    }

    /**
     * 禁用拖拽上传功能
     * 在图片首次上传成功或配置导入包含图片后调用，防止意外拖拽触发替换
     * @returns {void}
     * @private
     */
    _disableDragAndDrop() {
        // 如果没有拖拽处理器，说明已经被禁用或未初始化
        if (!this.dragHandlers) {
            return;
        }
        
        const mainDisplay = this.dragHandlers.mainDisplay;
        
        // Fail Fast: 验证DOM元素存在
        if (!mainDisplay) {
            throw new Error('FileOperationUIService._disableDragAndDrop: mainDisplay element is missing from dragHandlers');
        }
        
        // 移除所有拖拽事件监听器
        const events = ['dragenter', 'dragover', 'dragleave', 'drop'];
        events.forEach(eventName => {
            mainDisplay.removeEventListener(eventName, this.dragHandlers.preventDefault);
        });
        
        mainDisplay.removeEventListener('dragenter', this.dragHandlers.dragEnter);
        mainDisplay.removeEventListener('dragleave', this.dragHandlers.dragLeave);
        mainDisplay.removeEventListener('drop', this.dragHandlers.drop);
        
        // 清空处理器引用
        this.dragHandlers = null;
    }

    /**
     * 隐藏"上传图片"按钮
     * 在图片首次上传成功或配置导入包含图片后调用
     * @returns {void}
     * @private
     */
    _hideUploadButton() {
        const importImageBtn = document.getElementById('importImageBtn');
        
        // Fail Fast: 验证DOM元素存在
        if (!importImageBtn) {
            throw new Error('FileOperationUIService._hideUploadButton: importImageBtn element not found');
        }
        
        importImageBtn.classList.add('hidden');
    }

    /**
     * 隐藏加载框并重置状态
     * @returns {void}
     * @private
     */
    _hideLoadingAndResetState() {
        // 确保加载状态被重置
        this.stateManager.state.app.isLoading = false;
        
        // 隐藏加载对话框
        this.eventBus.emit('ui:hide-loading');
    }
}


/**
 * DisplayCoordinatorService - 显示协调服务
 * 协调各种UI显示更新，负责侧边栏信息显示和主显示区图片位置更新。
 * 主要被动响应状态变化事件自动更新UI，同时主动监听窗口变化事件以保持Canvas正确渲染。
 * 
 * 当前被使用的模块：
 * - AdvancedLoopService (modal/AdvancedLoopService.js) - 使用循环提示更新功能
 * 
 * 当前依赖的模块：
 * - BaseUIService (base/BaseUIService.js) - UI服务基类，提供DOM缓存和事件管理 (通过继承)
 * - eventBus (core/EventBus.js) - 事件总线，监听数据变化事件 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器，读取显示相关状态 (通过DI注入)
 * - stateWatcherService (system/StateWatcherService.js) - 状态监听服务，监听状态变化并自动更新UI (通过DI注入)
 * - formatFileSize, getFileFormat (helpers/fileFormatters.js) - 文件格式化工具函数
 * - calculateScaling, calculateAspectRatio (helpers/imageDimensions.js) - 图片尺寸计算工具函数
 * - calculateDefaultEndPosition (helpers/positionCalculators.js) - 默认结束位置计算工具函数
 * - canvasRenderService (utils/CanvasRenderService.js) - Canvas渲染服务，负责Canvas绘制操作 (通过DI注入)
 * - debounce (helpers/debounce.js) - 防抖函数，用于优化resize事件处理
 */
import { BaseUIService } from '../base/BaseUIService.js';
import { debounce } from '../../helpers/debounce.js';
import { formatFileSize, getFileFormat } from '../../helpers/fileFormatters.js';
import { calculateScaling, calculateAspectRatio } from '../../helpers/imageDimensions.js';
import { calculateDefaultEndPosition } from '../../helpers/positionCalculators.js';

export class DisplayCoordinatorService extends BaseUIService {
    /**
     * 构造函数 - 初始化显示协调服务
     * @param {EventBus} eventBus - 事件总线，监听数据变化事件
     * @param {StateManager} stateManager - 状态管理器，读取显示相关状态
     * @param {StateWatcherService} stateWatcherService - 状态监听服务，监听状态变化
     * @param {CanvasRenderService} canvasRenderService - Canvas渲染服务，负责Canvas绘制操作
     * @throws {Error} 当任何依赖缺失时抛出错误（Fail Fast）
     */
    constructor(eventBus, stateManager, stateWatcherService, canvasRenderService) {
        super(); // 调用BaseUIService构造函数
        
        // Fail Fast 验证 - 确保必需依赖存在
        if (!eventBus) {
            throw new Error('DisplayCoordinatorService requires eventBus dependency');
        }
        if (!stateManager) {
            throw new Error('DisplayCoordinatorService requires stateManager dependency');
        }
        if (!stateWatcherService) {
            throw new Error('DisplayCoordinatorService requires stateWatcherService dependency');
        }
        if (!canvasRenderService) {
            throw new Error('DisplayCoordinatorService requires canvasRenderService dependency');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.stateWatcherService = stateWatcherService;
        this.canvasRenderService = canvasRenderService;
        
        // 内部状态标志：标记图片是否正在加载
        // 用于拦截加载期间的渲染请求，防止使用错误的 Canvas 尺寸渲染
        this.isImageLoading = false;
        
        // 窗口尺寸变化处理器（防抖优化）
        this.resizeHandler = null;
    }

    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        this._setupEventListeners();
        this._setupHelpLink();
        this._setupResizeHandler();
    }

    /**
     * 设置事件监听器
     * @private
     * @returns {void}
     */
    _setupEventListeners() {
        // 监听位置变化，更新滚动距离、速度和主显示区位置
        // 性能优化：提取为命名函数，避免创建多个相同的箭头函数
        const handlePositionChange = () => {
            this.updateScrollDistance();
            this.updateScrollSpeed();
            this.updateMainDisplayPosition();
        };
        
        this.eventBus.on('position:start-changed', handlePositionChange);
        this.eventBus.on('position:end-changed', handlePositionChange);
        
        // 监听滚动速度更新需求
        this.eventBus.on('ui:scroll-speed-update-needed', (data) => {
            // 接收可选的 duration 参数（用于处理非法输入时的实时反馈）
            this.updateScrollSpeed(data ? data.duration : undefined);
        });
        
        // 监听循环提示更新需求
        this.eventBus.on('ui:loop-hint-update-needed', () => {
            this.updateLoopHintDisplay();
        });
        
        // 监听图片上传成功，更新图片缩放和信息
        this.eventBus.on('image:upload-success', (data) => {
            // Fail Fast: 验证事件数据格式
            if (!data || !data.imageData) {
                throw new Error('DisplayCoordinatorService: image:upload-success event requires data.imageData');
            }
            this._handleImageDataUpdate(data.imageData);
        });
        
        // 监听图片替换成功，更新图片缩放和信息
        this.eventBus.on('image:replaced', (data) => {
            // Fail Fast: 验证事件数据格式
            if (!data || typeof data.width !== 'number' || typeof data.height !== 'number' || !data.fileName) {
                throw new Error('DisplayCoordinatorService: image:replaced event requires data with width, height, and fileName');
            }
            // 从StateManager读取完整的图片数据（包括fileSize）
            const imageData = {
                fileName: this.stateManager.state.content.image.metadata.fileName,
                fileSize: this.stateManager.state.content.image.metadata.fileSize,
                width: data.width,
                height: data.height
            };
            this._handleImageDataUpdate(imageData);
        });
        
        // 监听图片数据变化，更新主显示区
        this.stateWatcherService.watchState('content.image.data', (imageData) => {
            if (imageData) {
                this._handleImageDataChange();
            }
        });
        
        // 监听重新绘制完整图片事件（入场动画完成后需要恢复完整图片）
        this.eventBus.on('display:render-full-image', () => {
            const mainImage = this._getElement('mainImage');
            const scrollCanvas = this._getElement('scrollCanvas');
            
            // Fail Fast: 验证DOM元素存在
            if (!mainImage) {
                throw new Error('DisplayCoordinatorService: mainImage element not found when rendering full image');
            }
            if (!scrollCanvas) {
                throw new Error('DisplayCoordinatorService: scrollCanvas element not found when rendering full image');
            }
            
            // Fail Fast: 验证图片已加载
            if (!mainImage.complete || !mainImage.naturalWidth) {
                throw new Error('DisplayCoordinatorService: mainImage is not loaded when rendering full image');
            }
            
            // 重绘完整图片到Canvas（强制模式，忽略入场动画状态）
            // 用途：入场动画完成后恢复完整图片，为后续滚动动画做准备
            this._renderImageToCanvas(mainImage, scrollCanvas, true);
        });
        
        // 监听刷新Canvas事件（根据当前入场动画状态决定显示内容）
        this.eventBus.on('display:refresh-canvas', () => {
            this._switchCanvasByEntryAnimationState();
        });
        
        // 监听入场动画启用状态变化（切换Canvas显示）
        this.stateWatcherService.watchState('playback.entryAnimation.enabled', () => {
            this._switchCanvasByEntryAnimationState();
        });
        
        // 监听背景色状态变化（入场动画启用时需要更新Canvas背景色）
        this.stateWatcherService.watchState('ui.display.backgroundColor', (newColor) => {
            // Fail Fast: 验证背景色值
            if (!newColor) {
                throw new Error('DisplayCoordinatorService: backgroundColor cannot be empty');
            }
            if (typeof newColor !== 'string') {
                throw new Error('DisplayCoordinatorService: backgroundColor must be a string');
            }
            if (!/^#[0-9A-Fa-f]{6}$/.test(newColor)) {
                throw new Error(`DisplayCoordinatorService: backgroundColor must be a valid hex color (e.g., #000000), got ${newColor}`);
            }
            
            // 如果启用了入场动画，背景色变化需要刷新Canvas显示
            const entryAnimationEnabled = this.stateManager.state.playback.entryAnimation.enabled;
            
            if (entryAnimationEnabled) {
                const mainImage = this._getElement('mainImage');
                const entryCanvas = this._getElement('entryCanvas');
                
                // 只有在图片已加载的情况下才刷新entry-canvas
                if (mainImage && entryCanvas && mainImage.complete && mainImage.naturalWidth) {
                    // 🐛 Bug修复：只刷新entry-canvas，确保用户看到的背景色立即更新
                    this._renderImageToCanvas(mainImage, entryCanvas, false);
                }
            }
        });
        
        // 监听图片信息更新事件（统一处理正常上传和配置导入）
        // ImageService 在 upload() 和 loadFromConfig() 中发出此事件
        // 注：不使用 StateWatcher 监听 metadata，因为 batch() 修改对象属性不会触发监听器
        this.eventBus.on('image:info-updated', (data) => {
            if (data && data.imageData) {
                // 构造完整的元数据对象
                const imageMetadata = {
                    fileName: this.stateManager.state.content.image.metadata.fileName,
                    fileSize: this.stateManager.state.content.image.metadata.fileSize,
                    width: data.imageData.width,
                    height: data.imageData.height
                };
                
                // ♻️ 复用统一的处理逻辑：同时更新 Scaling 和 Info
                // 这确保了配置导入时 Scaling 也能被立即计算，避免后续渲染报错
                this._handleImageDataUpdate(imageMetadata);
            }
        });
        
        // 监听滚动位置变化，更新侧边栏位置显示
        this._setupPositionDisplayWatchers();
        
        // 监听滚动进度事件
        this.eventBus.on('scroll:progress', (data) => {
            // Fail Fast: 验证事件数据
            if (!data || typeof data.position !== 'number') {
                // 动画循环中不抛出错误以免 crash，但在控制台报错
                console.error('DisplayCoordinatorService: Invalid scroll:progress data', data);
                return;
            }
            this.renderViewport(data.position);
        });

        // 监听滚动位置状态变化（处理非动画场景，如滑块拖拽）
        this.stateWatcherService.watchState('playback.scroll.currentPosition', (position) => {
            // Fail Fast: 验证位置有效性
            if (position === undefined || position === null || isNaN(position)) {
                return;
            }
            
            // 避免冲突：如果正在播放动画，由 scroll:progress 驱动渲染，此处忽略
            // 这样可以防止每一帧触发两次渲染
            if (this.stateManager.state.playback.scroll.isPlaying) {
                return;
            }
            
            this.renderViewport(position);
        });
    }

    /**
     * 设置位置显示监听器 - 监听起始和结束位置的状态变化，更新侧边栏位置显示
     * @private
     * @returns {void}
     */
    _setupPositionDisplayWatchers() {
        // 提取公共的位置更新逻辑
        const updatePositionDisplay = (elementId, value) => {
            const element = this._getElement(elementId);
            if (element) {
                element.textContent = Math.round(value);
            }
        };
        
        // 监听起始位置变化
        this.stateWatcherService.watchState('playback.scroll.startPosition', (value) => {
            updatePositionDisplay('startPosValue', value);
        });
        
        // 监听结束位置变化
        this.stateWatcherService.watchState('playback.scroll.endPosition', (value) => {
            updatePositionDisplay('endPosValue', value);
        });
    }

    /**
     * 处理图片数据更新 - 提取的公共方法
     * @private
     * @param {Object} imageData - 图片数据对象
     * @returns {void}
     */
    _handleImageDataUpdate(imageData) {
        if (imageData.width) {
            this.updateImageScaling(imageData.width);
        }
        // 图片数据包含原始数据（width, height等），由updateImageInfo自己格式化
        if (imageData.width && imageData.height && imageData.fileName) {
            this.updateImageInfo(imageData);
        }
    }

    /**
     * 处理图片数据变化
     * @private
     * @returns {void}
     */
    _handleImageDataChange() {
        const mainImage = this._getElement('mainImage');
        const scrollCanvas = this._getElement('scrollCanvas');
        const imageData = this.stateManager.state.content.image.data;
        
        if (mainImage && scrollCanvas && imageData) {
            // 🛡️ 关键修复：标记图片正在加载
            // 在图片完全加载并完成布局计算之前，拦截所有渲染请求
            // 这防止了因 Canvas 尺寸未更新(如默认为200px)导致的画面拉伸/异常
            this.isImageLoading = true;
            
            // 设置隐藏图片的源
            mainImage.src = imageData;
            
            // 图片加载完成后，更新显示
            mainImage.addEventListener('load', () => {
                // 图片加载完成后总是重新计算缩放信息
                const imageWidth = this.stateManager.state.content.image.metadata.width;
                this.updateImageScaling(imageWidth);
                
                // 根据是否启用入场动画，渲染对应的Canvas并设置显示/隐藏状态
                this._switchCanvasByEntryAnimationState();
                
                // ✅ 关键修复：在触发渲染之前解除加载锁定
                // 防止 updateMainDisplayPosition 调用 renderViewport 时被自己的锁拦截导致空白
                this.isImageLoading = false;
                
                this.updateMainDisplayPosition();
                this.updateScrollDistance();
                this.updateScrollSpeed();
                 
                // 🆕 图片加载完成后，总是预初始化 entry Canvas 尺寸（即使未启用入场动画）
                // 原因：性能报告需要显示入场Canvas尺寸用于性能对比
                this.eventBus.emit('image:loaded-entry-preinit-needed');
            }, { once: true });
        }
    }
    
    /**
     * 根据入场动画状态切换Canvas显示和渲染
     * @private
     * @returns {void}
     */
    _switchCanvasByEntryAnimationState() {
        const mainImage = this._getElement('mainImage');
        const scrollCanvas = this._getElement('scrollCanvas');
        const entryCanvas = this._getElement('entryCanvas');
        
        // 只有在图片已加载的情况下才切换Canvas
        if (!mainImage || !scrollCanvas || !entryCanvas || !mainImage.complete || !mainImage.naturalWidth) {
            return;
        }
        
        // 检查scaling信息是否有效（导入配置时图片可能还在加载，scaling信息未更新）
        const scaling = this.stateManager.state.content.image.scaling;
        if (!scaling || 
            typeof scaling.scaledWidth !== 'number' || !isFinite(scaling.scaledWidth) || scaling.scaledWidth <= 0 ||
            typeof scaling.scaledHeight !== 'number' || !isFinite(scaling.scaledHeight) || scaling.scaledHeight <= 0) {
            return;
        }
        
        const entryAnimationEnabled = this.stateManager.state.playback.entryAnimation.enabled;
        
        if (entryAnimationEnabled) {
            // 启用入场动画：渲染并显示entry-canvas（背景色），隐藏scrollCanvas
            this._renderImageToCanvas(mainImage, entryCanvas, false);
            entryCanvas.classList.remove('hidden');
            scrollCanvas.classList.add('hidden');
        } else {
            // 未启用入场动画：渲染并显示scrollCanvas（完整图片），隐藏entry-canvas
            this._renderImageToCanvas(mainImage, scrollCanvas, false);
            entryCanvas.classList.add('hidden');
            scrollCanvas.classList.remove('hidden');
        }
    }
    
    /**
     * 将图片渲染到Canvas
     * @private
     * @param {HTMLImageElement} image - 图片元素
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @param {boolean} forceFullImage - 是否强制绘制完整图片（忽略入场动画状态），默认false
     * @returns {void}
     * @throws {Error} 当必需数据缺失时抛出错误（Fail Fast）
     */
    _renderImageToCanvas(image, canvas, forceFullImage = false) {
        // Fail Fast: 验证必需数据
        if (!image || !canvas) {
            throw new Error('DisplayCoordinatorService._renderImageToCanvas: image and canvas are required');
        }
        
        // Fail Fast: 验证scaling有效性
        const scaling = this.stateManager.state.content.image.scaling;
        if (!scaling || 
            typeof scaling.scaledWidth !== 'number' || !isFinite(scaling.scaledWidth) || scaling.scaledWidth <= 0 ||
            typeof scaling.scaledHeight !== 'number' || !isFinite(scaling.scaledHeight) || scaling.scaledHeight <= 0) {
            throw new Error('DisplayCoordinatorService._renderImageToCanvas: valid scaling info is required');
        }
        
        // 检查是否启用了入场动画（除非强制绘制完整图片）
        const entryAnimationEnabled = this.stateManager.state.playback.entryAnimation.enabled;
        const backgroundColor = this.stateManager.state.ui.display.backgroundColor;
        
        // 判断是否仅需渲染视口背景色（优化模式）
        // 如果是背景色模式，我们不需要创建全尺寸的超大 Canvas，只需要视口大小即可
        // 【重构说明】现在无论是背景色模式还是滚动模式，都只创建视口大小的 Canvas (Virtual Scrolling)
        const isViewportBackgroundOnly = entryAnimationEnabled && !forceFullImage;
        
        let targetWidth, targetHeight;
        
        // 获取容器尺寸（视口尺寸）
        const container = this._getElement('scrollContainer');
        
        // Fail Fast: 验证容器是否存在
        // scrollContainer 是核心 UI 元素，如果缺失说明 DOM 结构异常，必须报错
        if (!container) {
            throw new Error('DisplayCoordinatorService._renderImageToCanvas: scrollContainer element not found');
        }
        
        // 无论是哪种模式，Canvas 尺寸始终等于视口尺寸
        // 解决 Canvas 物理尺寸超过浏览器限制（如 16384px）导致渲染失效的问题
        targetWidth = container.clientWidth;
        targetHeight = container.clientHeight;
        
        // 设置Canvas尺寸
        this.canvasRenderService.setupCanvas(canvas, targetWidth, targetHeight);
        
        // 清空Canvas
        this.canvasRenderService.clear(canvas);
        
        if (isViewportBackgroundOnly) {
            // 启用了入场动画 + 非强制模式：只填充背景色，不绘制图片
            // 卡片将在播放时通过入场动画逐渐显示
            if (backgroundColor) {
                // 🛡️ 双重保险：设置 CSS 背景色
                canvas.style.backgroundColor = backgroundColor;

                // 使用CanvasRenderService填充背景色
                this.canvasRenderService.fillRect(
                    canvas, 
                    0, 
                    0, 
                    targetWidth, 
                    targetHeight, 
                    backgroundColor
                );
            } else {
                // 清除背景色
                canvas.style.backgroundColor = '';
            }
        } else {
            // 未启用入场动画 或 强制模式：绘制当前视口内容的切片
            // 清除 CSS 背景色
            canvas.style.backgroundColor = '';
            
            // 获取当前滚动位置进行初始渲染
            let currentPosition = this.stateManager.state.playback.scroll.currentPosition;
            
            // Fail Fast: 验证状态完整性
            if (currentPosition === undefined || currentPosition === null || isNaN(currentPosition)) {
                throw new Error('DisplayCoordinatorService: playback.scroll.currentPosition is missing or invalid in state');
            }
            
            // 执行虚拟滚动渲染
            this.renderViewport(currentPosition);
        }
    }

    /**
     * 渲染可视区域（虚拟滚动核心）
     * @param {number} scrollPosition - 当前滚动的逻辑像素位置
     * @throws {Error} 当位置参数无效或依赖状态缺失时抛出错误（Fail Fast）
     */
    renderViewport(scrollPosition) {
        // Fail Fast: 验证参数类型
        if (typeof scrollPosition !== 'number' || isNaN(scrollPosition)) {
            throw new Error(`DisplayCoordinatorService.renderViewport: scrollPosition must be a valid number, got ${scrollPosition}`);
        }
        
        // 🛡️ 关键修复：如果图片正在加载，坚决不渲染
        // 防止在 Canvas 尺寸尚未更新时渲染，导致画面拉伸
        if (this.isImageLoading) {
            return;
        }

        // Fail Fast: 验证DOM元素存在
        const mainImage = this._getElement('mainImage');
        const scrollCanvas = this._getElement('scrollCanvas');
        const entryCanvas = this._getElement('entryCanvas');
        // 🆕 获取容器元素用于可见性检查
        const scrollContainer = this._getElement('scrollContainer');
        
        if (!mainImage) {
            throw new Error('DisplayCoordinatorService.renderViewport: mainImage element not found');
        }
        if (!scrollCanvas) {
            throw new Error('DisplayCoordinatorService.renderViewport: scrollCanvas element not found');
        }

        // 🛡️ 防御：如果容器不可见（高度为0），无法计算正确的采样区域，跳过渲染
        // Fail Fast: 验证 Scaling 状态
        const scaling = this.stateManager.state.content.image.scaling;
        if (!scaling || typeof scaling.ratio !== 'number' || scaling.ratio <= 0) {
            throw new Error('DisplayCoordinatorService.renderViewport: invalid scaling state');
        }

        // 获取最新的 Canvas 尺寸（逻辑像素）
        const canvasWidth = scrollCanvas.width / window.devicePixelRatio; 
        // 获取Canvas高度（逻辑像素），用于计算垂直缩放比例
        const canvasHeight = scrollCanvas.height / window.devicePixelRatio;
        
        // 核心计算
        const scale = scaling.ratio;
        
        // 计算源图像上的采样区域
        // scrollPosition 已经是原始像素坐标，不需要除以 scale
        let sourceX = scrollPosition;
        let sourceWidth = canvasWidth / scale;
        let sourceHeight = canvasHeight / scale;
        
        // 边界钳制
        if (sourceX < 0) sourceX = 0;
        
        // 🛡️ 在绘制前清空 Canvas，防止因源图像采样越界导致 Canvas 右侧出现上一帧的残留（视觉上表现为拉伸）
        this.canvasRenderService.clear(scrollCanvas);
        
        // 调用底层服务绘制
        this.canvasRenderService.drawImageClipped(
            scrollCanvas,
            mainImage,
            sourceX,
            0,
            sourceWidth,
            sourceHeight
        );
    }

    /**
     * 更新图片信息显示
     * UI层负责调用专业格式化服务，而不是使用策略层的displayInfo
     * 
     * @param {Object} imageData - 图片数据（包含原始数据：fileName, fileSize, width, height）
     * @returns {void}
     * @throws {Error} 当必需数据缺失时抛出错误（Fail Fast）
     */
    updateImageInfo(imageData) {
        // Fail Fast: 验证必需数据
        if (!imageData || typeof imageData.fileSize !== 'number') {
            throw new Error('DisplayCoordinatorService.updateImageInfo: imageData.fileSize is required');
        }
        if (typeof imageData.width !== 'number' || typeof imageData.height !== 'number') {
            throw new Error('DisplayCoordinatorService.updateImageInfo: imageData.width and height are required');
        }
        if (!imageData.fileName) {
            throw new Error('DisplayCoordinatorService.updateImageInfo: imageData.fileName is required');
        }
        
        const imageSizeEl = this._getElement('imageSize');
        const imageDimensionsEl = this._getElement('imageDimensions');
        const imageFormatEl = this._getElement('imageFormat');
        const aspectRatioEl = this._getElement('aspectRatio');

        // UI层自己调用专业格式化服务进行格式化
        if (imageSizeEl) {
            const formattedSize = formatFileSize(imageData.fileSize);
            imageSizeEl.textContent = formattedSize;
        }
        if (imageDimensionsEl) {
            const dimensions = `${imageData.width} × ${imageData.height}`;
            imageDimensionsEl.textContent = dimensions;
        }
        if (imageFormatEl) {
            const format = getFileFormat(null, imageData.fileName);
            imageFormatEl.textContent = format;
        }
        if (aspectRatioEl) {
            // 使用专业的ImageDimensionService计算宽高比（支持常见比例识别）
            const aspectRatio = calculateAspectRatio(imageData.width, imageData.height);
            aspectRatioEl.textContent = aspectRatio;
        }
    }

    /**
     * 验证位置数据有效性
     * @private
     * @param {number} startPos - 起始位置
     * @param {number} endPos - 结束位置
     * @returns {boolean} 数据是否有效
     */
    _validatePositionData(startPos, endPos) {
        return !(startPos === undefined || endPos === undefined || 
                 startPos === null || endPos === null ||
                 isNaN(startPos) || isNaN(endPos));
    }

    /**
     * 设置元素为默认显示状态（显示0，灰色样式）
     * @private
     * @param {HTMLElement} element - 目标元素
     * @param {string} activeClass - 激活状态的CSS类名
     * @returns {void}
     */
    _setElementToDefault(element, activeClass) {
        element.textContent = '0';
        element.classList.add('text-muted');
        element.classList.remove(activeClass);
    }

    /**
     * 根据值切换元素样式状态
     * 当值为0时显示灰色（text-muted），否则显示指定的激活颜色
     * 
     * @private
     * @param {HTMLElement} element - 目标元素
     * @param {number} value - 判断值
     * @param {string} activeClass - 激活状态的CSS类名（如 'text-primary', 'text-success'）
     * @returns {void}
     */
    _toggleStyleByValue(element, value, activeClass) {
        if (value === 0) {
            element.classList.add('text-muted');
            element.classList.remove(activeClass);
        } else {
            element.classList.add(activeClass);
            element.classList.remove('text-muted');
        }
    }

    /**
     * 更新滚动距离显示
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    updateScrollDistance() {
        const scrollDistanceEl = this._getElement('scrollDistance');
        if (!scrollDistanceEl) {
            throw new Error('DisplayCoordinatorService.updateScrollDistance: scrollDistance element not found');
        }

        const scrollState = this.stateManager.state.playback.scroll;
        
        // 检查状态结构是否正常
        if (typeof scrollState !== 'object' || scrollState === null) {
            this._setElementToDefault(scrollDistanceEl, 'text-primary');
            return;
        }
        
        const startPos = scrollState.startPosition;
        const endPos = scrollState.endPosition;
        
        // 检查数据有效性 - 防止在状态未初始化时显示异常
        if (!this._validatePositionData(startPos, endPos)) {
            this._setElementToDefault(scrollDistanceEl, 'text-primary');
            return;
        }
        
        // 计算滚动距离（绝对值，因为可能从右到左或从左到右）
        const distance = Math.abs(endPos - startPos);
        
        // 更新显示
        scrollDistanceEl.textContent = Math.round(distance);
        
        // 根据值切换样式：距离为0时显示灰色，否则显示主色
        this._toggleStyleByValue(scrollDistanceEl, distance, 'text-primary');
    }

    /**
     * 更新滚动速度显示
     * @param {number} [overrideDuration] - 可选的覆盖时长（用于输入时的实时预览，即使值非法）
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    updateScrollSpeed(overrideDuration) {
        const scrollSpeedEl = this._getElement('scrollSpeed');
        if (!scrollSpeedEl) {
            throw new Error('DisplayCoordinatorService.updateScrollSpeed: scrollSpeed element not found');
        }

        // 性能优化：先缓存scrollState对象，减少属性访问次数
        const scrollState = this.stateManager.state.playback.scroll;
        const startPos = scrollState.startPosition;
        const endPos = scrollState.endPosition;
        
        // 优先使用传入的 overrideDuration，否则使用状态中的 duration
        // 注意：overrideDuration 可能是非法值（如 0 或负数），这是预期的，用于显示占位符
        const duration = overrideDuration !== undefined ? overrideDuration : scrollState.duration;
        
        // 检查数据有效性 - 防止在状态未初始化时显示异常
        if (!this._validatePositionData(startPos, endPos)) {
            this._setElementToDefault(scrollSpeedEl, 'text-success');
            return;
        }
        
        // 特殊处理：如果时长非法（空、0、负数），显示占位符 "-"
        if (duration === null || isNaN(duration) || duration <= 0) {
            scrollSpeedEl.textContent = '-';
            scrollSpeedEl.classList.add('text-muted');
            scrollSpeedEl.classList.remove('text-success');
            return;
        }
        
        // 计算滚动距离
        const distance = Math.abs(endPos - startPos);
        
        // 计算每秒滚动像素数
        const speed = Math.round(distance / duration);
        
        // 更新显示
        scrollSpeedEl.textContent = speed;
        
        // 根据值切换样式：速度为0时显示灰色，否则显示成功色
        this._toggleStyleByValue(scrollSpeedEl, speed, 'text-success');
    }

    /**
     * 更新主显示区图片位置
     * 根据反向滚动标志决定显示位置：正向滚动显示startPosition，反向滚动显示endPosition
     * @returns {void}
     */
    updateMainDisplayPosition() {
        const scrollCanvas = this._getElement('scrollCanvas');
        if (!scrollCanvas || !this.stateManager.state.content.image.isLoaded) {
            return;
        }

        // Fail Fast: 验证必需数据
        const scrollConfig = this.stateManager.state.playback.scroll;
        const startPosition = scrollConfig.startPosition;
        const endPosition = scrollConfig.endPosition;
        const reverseScroll = scrollConfig.reverseScroll;
        const scalingRatio = this.stateManager.state.content.image.scaling.ratio;
        
        if (typeof startPosition !== 'number' || isNaN(startPosition)) {
            throw new Error('DisplayCoordinatorService.updateMainDisplayPosition: startPosition (number) is required');
        }
        if (typeof endPosition !== 'number' || isNaN(endPosition)) {
            throw new Error('DisplayCoordinatorService.updateMainDisplayPosition: endPosition (number) is required');
        }
        if (typeof scalingRatio !== 'number' || isNaN(scalingRatio)) {
            throw new Error('DisplayCoordinatorService.updateMainDisplayPosition: scalingRatio (number) is required');
        }
        
        // 根据反向滚动标志决定初始显示位置
        // 正向滚动：从startPosition开始 → 显示startPosition
        // 反向滚动：从endPosition开始 → 显示endPosition
        const displayPosition = reverseScroll ? endPosition : startPosition;
        
        // 转换为缩放后的坐标
        // const scaledPosition = displayPosition * scalingRatio;
        
        // 【重构说明】不再使用 CSS 变量驱动滚动，改为直接调用 renderViewport 重绘
        // scrollCanvas.style.setProperty('--scroll-offset', `${scaledPosition}px`);
        this.renderViewport(displayPosition);
    }

    /**
     * 清理图片显示
     * @private
     * @returns {void}
     */
    _clearImageDisplay() {
        const scrollCanvas = this._getElement('scrollCanvas');
        const mainImage = this._getElement('mainImage');
        
        if (scrollCanvas) {
            // 清空Canvas
            this.canvasRenderService.clear(scrollCanvas);
            // scrollCanvas.style.setProperty('--scroll-offset', '0px');
        }
        
        if (mainImage) {
            // 清理隐藏图片
            mainImage.src = '';
        }
    }

    /**
     * 更新图片缩放信息
     * 
     * 注意：此方法会直接修改StateManager的state中的缩放相关状态（scaling.ratio, scaling.scaledWidth, scaling.scaledHeight）
     * 作为协调者，此方法负责：
     * 1. 获取容器高度（DOM操作，只有UI服务能做）
     * 2. 委托ImageDimensionService计算缩放信息
     * 3. 更新state（协调职责）
     * 滚动位置的初始化由 BusinessOrchestrationService 统一负责
     * 
     * @param {number} imageWidth - 图片原始宽度
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    updateImageScaling(imageWidth) {
        // 1. 获取容器高度（DOM操作，只有UI服务能做）
        const displayContainer = this._querySelector('.scroll-container');
        if (!displayContainer) {
            throw new Error('DisplayCoordinatorService.updateImageScaling: .scroll-container element not found');
        }
        
        const containerHeight = displayContainer.clientHeight;
        const imageHeight = this.stateManager.state.content.image.metadata.height;
        
        // 2. 委托ImageDimensionService计算缩放信息
        const scaling = calculateScaling(
            containerHeight,
            imageHeight,
            imageWidth
        );
        
        // 3. 更新state（协调职责）
        // ✅ 只更新UI相关的缩放信息，不修改业务状态
        // 滚动位置的初始化由 BusinessOrchestrationService 统一负责
        this.stateManager.state.content.image.scaling.ratio = scaling.ratio;
        this.stateManager.state.content.image.scaling.scaledWidth = scaling.scaledWidth;
        this.stateManager.state.content.image.scaling.scaledHeight = scaling.scaledHeight;
    }

    /**
     * 更新主页面的时长覆盖提示
     * @param {boolean} shouldShow - 是否应该显示提示
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    updateDurationOverrideHint(shouldShow) {
        // 使用BaseUIService的DOM缓存和Fail Fast检查
        const hintElement = this._requireElement('durationOverrideHint');
        
        if (shouldShow) {
            hintElement.classList.add('show');
        } else {
            hintElement.classList.remove('show');
        }
    }

    /**
     * 更新循环提示显示状态（综合考虑所有相关状态）
     * @returns {void}
     */
    updateLoopHintDisplay() {
        // 性能优化：一次性解构获取所需状态，减少属性访问次数
        const { enabled: loopEnabled, variableDuration, count: loopCount } = this.stateManager.state.playback.loop;
        
        // 只有同时满足以下条件时才显示提示：
        // 1. 循环播放已启用
        // 2. 启用变长时长
        // 3. 循环次数大于1
        const shouldShow = loopEnabled && variableDuration && loopCount > 1;
        
        this.updateDurationOverrideHint(shouldShow);
    }

    /**
     * 设置窗口尺寸变化监听器
     * @private
     * @returns {void}
     */
    _setupResizeHandler() {
        // 创建防抖处理器（250ms，性能优化技术细节）
        this.resizeHandler = debounce(() => {
            this._handleResize();
        }, 250);
        
        // 监听窗口尺寸变化
        window.addEventListener('resize', this.resizeHandler);
    }
    
    /**
     * 处理窗口尺寸变化
     * @private
     * @returns {void}
     */
    _handleResize() {
        // 只有在图片已加载的情况下才重新计算和渲染
        const imageData = this.stateManager.state.content.image.data;
        if (!imageData) {
            return;
        }
        
        const mainImage = this._getElement('mainImage');
        const scrollCanvas = this._getElement('scrollCanvas');
        
        // Fail Fast: 验证必需元素
        if (!mainImage) {
            throw new Error('DisplayCoordinatorService._handleResize: mainImage element not found');
        }
        if (!scrollCanvas) {
            throw new Error('DisplayCoordinatorService._handleResize: scrollCanvas element not found');
        }
        
        // 确保图片已加载
        if (!mainImage.complete) {
            return;
        }
        
        // 重新计算缩放比例
        const imageWidth = this.stateManager.state.content.image.metadata.width;
        this.updateImageScaling(imageWidth);
        
        // ⚠️ 锁定到图片末尾时需要自动调整 endPosition
        // 原因：窗口 resize 后视口宽度改变，endPosition 必须重新计算才能保证始终显示图片末尾
        // - 勾选"锁定到图片末尾"：用户明确希望视口右边界始终贴合图片右边界（无论正向还是反向滚动）
        // - 未勾选：用户配置的 endPosition 保持不变（用户控制固定像素位置）
        const lockToImageEnd = this.stateManager.state.playback.scroll.lockToImageEnd;
        if (lockToImageEnd) {
            const scalingRatio = this.stateManager.state.content.image.scaling.ratio;
            const viewportWidth = window.innerWidth;
            const newEndPosition = calculateDefaultEndPosition(imageWidth, scalingRatio, viewportWidth);
            this.stateManager.state.playback.scroll.endPosition = newEndPosition;
        }
        
        // 根据是否启用入场动画，重新渲染对应的Canvas并切换显示状态
        this._switchCanvasByEntryAnimationState();
        
        // 更新Canvas的transform偏移量
        this.updateMainDisplayPosition();
    }
    
    /**
     * 设置图片规格说明的帮助链接
     * @private
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    _setupHelpLink() {
        const helpLink = this._getElement('homeImageSpecHelpLink');
        
        // Fail Fast: 关键DOM元素必须存在
        if (!helpLink) {
            throw new Error('DisplayCoordinatorService._setupHelpLink: homeImageSpecHelpLink element not found');
        }
        
        helpLink.addEventListener('click', () => {
            // 发射对话框事件，显示引导文本
            this.eventBus.emit('ui:show-info-dialog', {
                message: '<p>不影响普通的滚动动画，但会影响卡片入场动画，如果您有这个需求可参考"更多功能 → 卡片入场动画"的说明。</p>',
                options: { title: '说明' }
            });
        });
    }
    
}


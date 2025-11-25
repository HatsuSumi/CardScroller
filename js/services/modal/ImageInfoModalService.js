import { BaseModalService } from '../base/BaseModalService.js';
import { debounce } from '../../helpers/debounce.js';
import { formatDate, formatFileSize, formatPixelCount } from '../../helpers/fileFormatters.js';
import { formatMP } from '../../helpers/numberFormatters.js';
import { calculateAspectRatio, calculateScalePercentage, formatActualDimensions, formatOriginalDimensions } from '../../helpers/imageDimensions.js';

/**
 * ImageInfoModalService - 图片详细信息模态框服务
 * 展示图片元数据和文件信息，纯UI协调者，负责模态框的显示和用户交互，所有业务逻辑委托给专门的服务。功能包括：文件信息展示、图片尺寸计算、PPI信息提取、实时更新窗口尺寸变化。继承自BaseModalService。
 * 
 * 当前被使用的模块:
 * - 无（通过 KeyboardService 快捷键机制自动触发打开）
 * 
 * 当前依赖的模块:
 * - BaseModalService (base/BaseModalService.js) - 模态框基类 (通过继承)
 *   ↳ BaseUIService (base/BaseUIService.js) - UI服务基类，提供DOM缓存和事件管理功能
 * - ppiExtractorService (utils/PPIExtractorService.js) - PPI信息提取服务 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线 (通过DI注入)
 * - keyboardService (utils/KeyboardService.js) - 键盘快捷键管理服务 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - formatDate, formatFileSize, formatPixelCount (helpers/fileFormatters.js) - 文件格式化工具函数
 * - formatMP (helpers/numberFormatters.js) - 百万像素格式化工具函数
 * - calculateAspectRatio, calculateScalePercentage, formatActualDimensions, formatOriginalDimensions (helpers/imageDimensions.js) - 图片尺寸计算工具函数
 * - debounce (helpers/debounce.js) - 防抖工具函数
 */
export class ImageInfoModalService extends BaseModalService {
    /**
     * 构造函数
     * @param {PPIExtractorService} ppiExtractorService - PPI信息提取服务
     * @param {EventBus} eventBus - 事件总线
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务
     * @param {StateManager} stateManager - 状态管理器
     * @throws {Error} 当核心依赖（ppiExtractorService/eventBus/keyboardService/stateManager）缺失时抛出错误（Fail Fast）
     */
    constructor(ppiExtractorService, eventBus, keyboardService, stateManager) {
        super(keyboardService);
        
        // Fail Fast: 验证核心依赖
        if (!ppiExtractorService) {
            throw new Error('ImageInfoModalService requires ppiExtractorService dependency');
        }
        if (!eventBus) {
            throw new Error('ImageInfoModalService requires eventBus dependency');
        }
        if (!stateManager) {
            throw new Error('ImageInfoModalService requires stateManager dependency');
        }
        
        // 业务服务依赖
        this.ppiExtractorService = ppiExtractorService;
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        
        // 当前显示的数据
        this.currentImageData = null;
        this.currentFileData = null;
        this.currentPPIInfo = null;
        
        // 实时更新相关
        this.resizeHandler = null;
        this.isRealtimeUpdateEnabled = false;
    }

    /**
     * 初始化服务
     * 重写父类方法，先调用父类初始化，再执行自己的初始化
     * @returns {void}
     * @throws {Error} 当必需的DOM元素或配置缺失时抛出错误（Fail Fast，来自父类）
     */
    init() {
        // 先调用父类初始化（设置DOM引用、事件监听、快捷键等）
        // 基类已经处理了防重复初始化逻辑
        super.init();
        
        // 再执行自己的初始化
        this._preloadElements();
    }

    /**
     * 预加载常用DOM元素
     * @returns {void}
     * @private
     */
    _preloadElements() {
        const commonElementIds = [
            'detailFileName', 'detailFileSize', 'detailOriginalFileSize', 'detailFileFormat', 'detailLastModified',
            'detailOriginalDimensions', 'detailDownsampledDimensions', 'detailActualDimensions', 'detailAspectRatio',
            'detailPPIX', 'detailPPIY', 'detailPixelCount', 'detailDownsampledPixelCount', 'detailMP', 'detailDownsampledMP',
            'viewportSize', 'calculationExample',
            'originalFileSizeRow', 'downsampledDimensionsRow', 'downsampledPixelCountRow', 'downsampledMPRow',
            'pixelCountLabel', 'mpLabel', 'fileSizeLabel'
        ];
        
        // 预加载DOM元素到缓存中提升性能
        commonElementIds.forEach(id => this._getElement(id));
    }

    /**
     * 设置事件监听
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @protected
     */
    _setupEventListeners(config) {
        // 🚨 重要：先调用父类方法设置按钮点击事件
        super._setupEventListeners(config);
        
        // 统一监听 image:info-updated 事件（正常上传和配置导入都使用此事件）
        this.eventBus.on('image:info-updated', (data) => this._handleImageInfoUpdated(data));
        
        // 监听图片替换事件（文件名、文件大小、修改时间会变）
        this.eventBus.on('image:replaced', (data) => this._handleImageReplaced(data));
    }

    /**
     * 处理图片信息更新事件（统一处理正常上传和配置导入）
     * @param {Object} data - 事件数据，包含以下属性：
     *   - imageData: 图片数据 {width, height, src}
     *   - fileData: 文件数据（File对象或模拟的fileData对象）
     *   - ppiInfo: PPI信息（有值则直接使用，null则异步提取或显示默认值）
     * @returns {void}
     * @private
     */
    _handleImageInfoUpdated(data) {
        this.currentImageData = data.imageData;
        this.currentFileData = data.fileData;
        
        // 处理 PPI 信息
        if (data.ppiInfo !== undefined && data.ppiInfo !== null) {
            // 有 PPI 数据：直接使用（配置导入且原图有PPI，或异步提取成功）
            this.currentPPIInfo = data.ppiInfo;
        } else if (data.fileData instanceof File) {
            // 正常上传的 File 对象：异步提取 PPI 信息
            this._extractPPIInfo(data.fileData);
        } else {
            // 无 PPI 数据：设置为 null，UI 层会显示"未检测到PPI信息"
            this.currentPPIInfo = null;
        }
    }

    /**
     * 处理图片替换事件（文件名、文件大小、修改时间、尺寸都可能变）
     * @param {Object} data - 事件数据 {fileName, width, height}
     * @returns {void}
     * @private
     */
    _handleImageReplaced(data) {
        // Fail Fast: 验证事件数据
        if (!data || typeof data.width !== 'number' || typeof data.height !== 'number') {
            throw new Error('ImageInfoModalService._handleImageReplaced: data with width and height is required');
        }
        
        const metadata = this.stateManager.state.content.image.metadata;
        
        // Fail Fast: 验证metadata存在
        if (!metadata) {
            throw new Error('ImageInfoModalService._handleImageReplaced: metadata not found in state');
        }
        
        // 更新currentImageData（src、宽度、高度都更新）
        if (this.currentImageData) {
            this.currentImageData.src = this.stateManager.state.content.image.data;
            this.currentImageData.width = data.width;
            this.currentImageData.height = data.height;
        } else {
            // 如果currentImageData不存在，创建新的
            this.currentImageData = {
                src: this.stateManager.state.content.image.data,
                width: data.width,
                height: data.height
            };
        }
        
        // 更新currentFileData（文件名、文件大小、修改时间会变）
        this.currentFileData = {
            name: metadata.fileName,
            size: metadata.fileSize,
            lastModified: metadata.lastModified,
            type: this.currentFileData ? this.currentFileData.type : 'image/png'  // 保留原有type或使用默认值
        };
        
        // 注意：PPI信息由后续的 image:info-updated 事件统一处理（会异步提取新图片的PPI）
    }

    /**
     * 获取模态框配置
     * @returns {Object} 模态框配置对象，包含以下属性：
     *   - modalId: 模态框容器元素ID
     *   - name: 模态框名称
     *   - openTrigger: 是否使用打开按钮触发
     *   - elements: DOM元素选择器配置（openBtn, closeBtn, additionalCloseBtns）
     *   - closeOnOverlayClick: 是否点击遮罩层关闭
     *   - escToClose: 是否ESC键关闭
     * @protected
     */
    _getModalConfig() {
        return {
            modalId: 'imageInfoModalOverlay',
            name: '图片信息模态框',
            openTrigger: true,
            elements: {
                openBtn: '#viewAllInfoBtn',
                closeBtn: '#imageInfoModalClose',
                additionalCloseBtns: ['#closeImageInfoModal']
            },
            closeOnOverlayClick: true,
            escToClose: true
        };
    }

    /**
     * 模态框打开前钩子 - 检查是否有图片信息
     * @returns {boolean}
     * @protected
     */
    _onBeforeOpen() {
        if (!this.currentImageData || !this.currentFileData) {
            return false; // 阻止打开
        }
        
        return true;
    }

    /**
     * 模态框打开后钩子 - 填充信息和设置实时更新
     * @returns {void}
     * @protected
     */
    _onAfterOpen() {
        this._populateDetails();
        this._setupRealtimeUpdate();
    }

    /**
     * 模态框关闭后钩子 - 移除实时更新
     * @returns {void}
     * @protected
     */
    _onAfterClose() {
        this._removeRealtimeUpdate();
    }


    /**
     * 获取图片实际显示尺寸（简单DOM读取，协调者职责）
     * @returns {Object|null} 包含width和height的对象，如果无法获取则返回null
     * @private
     */
    _getImageDisplayDimensions() {
        // 使用Canvas元素
        const canvas = this._querySelector('#scrollCanvas');
        if (!canvas) return null;
        
        const width = canvas.clientWidth || canvas.offsetWidth;
        const height = canvas.clientHeight || canvas.offsetHeight;
        
        return (width && height) ? { width, height } : null;
    }

    /**
     * 格式化实际尺寸文本
     * @param {Object} imageData - 图片数据对象
     * @param {Object|null} displayDims - 实际显示尺寸对象（{width, height}），如果为null则使用原始尺寸
     * @returns {string} 格式化的尺寸文本
     * @private
     */
    _formatActualDimensionsText(imageData, displayDims) {
        if (displayDims) {
            try {
                const scalePercentage = calculateScalePercentage(
                    imageData.width, imageData.height,
                    displayDims.width, displayDims.height
                );
                return formatActualDimensions(
                    displayDims.width, displayDims.height, scalePercentage
                );
            } catch (error) {
                console.warn('⚠️ 计算缩放比例失败:', error);
                return formatOriginalDimensions(imageData.width, imageData.height);
            }
        } else {
            return formatOriginalDimensions(imageData.width, imageData.height);
        }
    }

    /**
     * 填充详细信息
     * @returns {void}
     * @throws {Error} 当fileData数据不完整（缺少name/type）时抛出错误（Fail Fast）
     * @private
     */
    _populateDetails() {
        const imageData = this.currentImageData;
        const fileData = this.currentFileData;
        
        if (!imageData || !fileData) {
            return;
        }

        // Fail Fast: 验证fileData完整性
        if (!fileData.name) {
            throw new Error('fileData.name is required. Data structure error.');
        }
        if (!fileData.type) {
            throw new Error('fileData.type is required. Data structure error.');
        }

        // 检查是否进行了降采样（通过 metadata 中的 originalWidth 判断）
        const metadata = this.stateManager.state.content.image.metadata;
        const isDownsampled = metadata.originalWidth && metadata.originalWidth !== metadata.width;
        
        // 使用FileFormatService格式化文件信息 - 使用正确的HTML ID (带detail前缀)
        const fileInfoMap = {
            'detailFileName': fileData.name,
            'detailFileFormat': fileData.type,
            'detailLastModified': formatDate(fileData.lastModified)
        };
        
        // 处理文件大小显示（根据是否降采样）
        if (isDownsampled && metadata.originalFileSize) {
            // 降采样模式：显示原始和采样后的文件大小
            fileInfoMap['detailOriginalFileSize'] = formatFileSize(metadata.originalFileSize);
            fileInfoMap['detailFileSize'] = formatFileSize(metadata.fileSize);
            
            // 更新Label
            this._getElement('fileSizeLabel').textContent = '采样后文件大小:';
        } else {
            // 未降采样模式：只显示文件大小
            fileInfoMap['detailFileSize'] = formatFileSize(metadata.fileSize);
            
            // 恢复Label
            this._getElement('fileSizeLabel').textContent = '文件大小:';
        }
        
        // 获取实际显示尺寸并计算格式化文本（协调者承担简单DOM读取，委托计算和格式化）
        const displayDims = this._getImageDisplayDimensions();
        const actualDimensionsText = this._formatActualDimensionsText(imageData, displayDims);
        const aspectRatio = calculateAspectRatio(
            isDownsampled ? metadata.originalWidth : imageData.width, 
            isDownsampled ? metadata.originalHeight : imageData.height
        );
        
        // 构建尺寸信息
        const dimensionInfoMap = {};
        if (isDownsampled) {
            // 降采样模式：显示原始尺寸和采样后尺寸
            dimensionInfoMap['detailOriginalDimensions'] = `${metadata.originalWidth} × ${metadata.originalHeight} 像素`;
            dimensionInfoMap['detailDownsampledDimensions'] = `${imageData.width} × ${imageData.height} 像素`;
        } else {
            // 未降采样模式：只显示原始尺寸
            dimensionInfoMap['detailOriginalDimensions'] = `${imageData.width} × ${imageData.height} 像素`;
        }
        dimensionInfoMap['detailActualDimensions'] = actualDimensionsText;
        dimensionInfoMap['detailAspectRatio'] = aspectRatio;

        // 使用PPIExtractorService格式化PPI信息
        const ppiInfo = this.ppiExtractorService.formatPPIInfo(this.currentPPIInfo);
        
        // 计算像素相关信息
        const pixelInfoMap = {
            'detailPPIX': ppiInfo.x,
            'detailPPIY': ppiInfo.y
        };
        
        if (isDownsampled) {
            // 降采样模式：显示原始和采样后的像素信息
            const originalPixels = metadata.originalWidth * metadata.originalHeight;
            const downsampledPixels = imageData.width * imageData.height;
            pixelInfoMap['detailPixelCount'] = formatPixelCount(originalPixels);
            pixelInfoMap['detailDownsampledPixelCount'] = formatPixelCount(downsampledPixels);
            pixelInfoMap['detailMP'] = formatMP(originalPixels);
            pixelInfoMap['detailDownsampledMP'] = formatMP(downsampledPixels);
            
            // 更新Label文本
            this._getElement('pixelCountLabel').textContent = '原始像素总数:';
            this._getElement('mpLabel').textContent = '原始MP(百万像素):';
        } else {
            // 未降采样模式：只显示像素信息
            const totalPixels = imageData.width * imageData.height;
            pixelInfoMap['detailPixelCount'] = formatPixelCount(totalPixels);
            pixelInfoMap['detailMP'] = formatMP(totalPixels);
            
            // 恢复Label文本
            this._getElement('pixelCountLabel').textContent = '像素总数:';
            this._getElement('mpLabel').textContent = 'MP(百万像素):';
        }

        // 批量设置所有文本
        const allInfoMap = { ...fileInfoMap, ...dimensionInfoMap, ...pixelInfoMap };
        Object.entries(allInfoMap).forEach(([id, text]) => {
            this._getElement(id).textContent = text;
        });
        
        // 控制降采样相关行的显示/隐藏
        ['originalFileSizeRow', 'downsampledDimensionsRow', 'downsampledPixelCountRow', 'downsampledMPRow'].forEach(id => {
            this._getElement(id).classList.toggle('hidden', !isDownsampled);
        });

        // 更新动态信息
        this._updateDynamicInfo(imageData, displayDims);
    }

    /**
     * 生成计算示例文本
     * @param {Object} imageData - 图片数据对象
     * @param {Object|null} displayDims - 实际显示尺寸对象（{width, height}）
     * @param {number} viewportHeight - 视口高度
     * @returns {string} 计算示例文本
     * @private
     */
    _generateCalculationExampleText(imageData, displayDims, viewportHeight) {
        if (displayDims) {
            return this._generateImageScalingDescription(
                imageData.width,
                imageData.height,
                displayDims.width,
                displayDims.height,
                viewportHeight
            );
        } else {
            return this._generateOriginalDimensionDescription(
                imageData.width,
                imageData.height
            );
        }
    }

    /**
     * 更新动态信息（视口大小和计算示例）
     * @param {Object} imageData - 图片数据对象，包含以下属性：
     *   - width: 图片宽度（像素）
     *   - height: 图片高度（像素）
     *   - src: 图片源地址
     * @param {Object|null} displayDims - 实际显示尺寸对象（{width, height}），如果为null则显示原图尺寸
     * @returns {void}
     * @throws {Error} 当必需的DOM元素（viewportSize/calculationExample）不存在时抛出错误（Fail Fast）
     * @private
     */
    _updateDynamicInfo(imageData, displayDims) {
        // 更新视口大小
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const viewportSizeEl = this._requireElement('viewportSize');
        viewportSizeEl.textContent = `${viewportWidth} × ${viewportHeight} 像素 (已排除浏览器标签栏、地址栏、书签栏等，F11全屏不受影响)。`;

        // 更新计算示例
        const calculationExample = this._generateCalculationExampleText(imageData, displayDims, viewportHeight);
        const calculationExampleEl = this._requireElement('calculationExample');
        calculationExampleEl.textContent = calculationExample;
    }

    /**
     * 异步提取PPI信息
     * @param {File} fileData 文件数据
     * @returns {Promise<void>}
     * @private
     */
    async _extractPPIInfo(fileData) {
        try {
            this.currentPPIInfo = await this.ppiExtractorService.extractPPI(fileData);
        } catch (error) {
            // PPI提取失败是预期行为（部分图片格式不包含PPI信息），不需要显示错误提示
            console.warn('⚠️ Failed to extract PPI information:', error.message);
            this.currentPPIInfo = null;
        }
    }


    /**
     * 设置实时更新（窗口大小变化时）
     * @returns {void}
     * @private
     */
    _setupRealtimeUpdate() {
        if (this.isRealtimeUpdateEnabled) return;
        
        this.resizeHandler = debounce(() => {
            if (this._isModalVisible() && this.currentImageData) {
                this._updateDynamicDimensions();
            }
        }, 250);
        
        window.addEventListener('resize', this.resizeHandler);
        this.isRealtimeUpdateEnabled = true;
    }

    /**
     * 移除实时更新
     * @returns {void}
     * @private
     */
    _removeRealtimeUpdate() {
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
            this.isRealtimeUpdateEnabled = false;
        }
    }

    /**
     * 更新动态尺寸信息
     * @returns {void}
     * @throws {Error} 当必需的DOM元素（detailActualDimensions）不存在时抛出错误（Fail Fast）
     * @private
     */
    _updateDynamicDimensions() {
        if (!this.currentImageData) return;

        // 获取实际显示尺寸并计算格式化文本
        const displayDims = this._getImageDisplayDimensions();
        const actualDimensionsText = this._formatActualDimensionsText(this.currentImageData, displayDims);
        
        const detailActualDimensionsEl = this._requireElement('detailActualDimensions');
        detailActualDimensionsEl.textContent = actualDimensionsText;

        // 更新动态信息
        this._updateDynamicInfo(this.currentImageData, displayDims);
    }

    /**
     * 生成图片缩放计算的描述性文本
     * 用于向用户解释浏览器如何对大图进行等比例缩放
     * 
     * @param {number} originalWidth - 图片原始宽度（像素）
     * @param {number} originalHeight - 图片原始高度（像素）
     * @param {number} actualWidth - 实际显示宽度（像素）
     * @param {number} actualHeight - 实际显示高度（像素）
     * @param {number} viewportHeight - 视口高度（像素）
     * @returns {string} 格式化的计算说明文本
     * @throws {Error} 当参数不是有效的正数时抛出错误（Fail Fast）
     * @private
     */
    _generateImageScalingDescription(originalWidth, originalHeight, actualWidth, actualHeight, viewportHeight) {
        // Fail Fast: 验证所有参数
        if (typeof originalWidth !== 'number' || typeof originalHeight !== 'number' ||
            typeof actualWidth !== 'number' || typeof actualHeight !== 'number' ||
            typeof viewportHeight !== 'number') {
            throw new Error('ImageInfoModalService._generateImageScalingDescription: all parameters must be numbers');
        }
        if (!Number.isFinite(originalWidth) || !Number.isFinite(originalHeight) ||
            !Number.isFinite(actualWidth) || !Number.isFinite(actualHeight) ||
            !Number.isFinite(viewportHeight)) {
            throw new Error('ImageInfoModalService._generateImageScalingDescription: all parameters must be finite numbers');
        }
        if (originalWidth <= 0 || originalHeight <= 0 || actualWidth <= 0 || actualHeight <= 0 || viewportHeight <= 0) {
            throw new Error('ImageInfoModalService._generateImageScalingDescription: all parameters must be positive numbers');
        }
        
        // 计算缩放因子
        const scaleFactorW = originalWidth / actualWidth;
        const scaleFactorH = originalHeight / actualHeight;
        
        // 生成描述性文本
        return `计算过程：图片高度${originalHeight}px > 视口高度${viewportHeight}px → 缩放因子 = ${originalHeight} ÷ ${viewportHeight} ≈ ${scaleFactorH.toFixed(3)} → 实际尺寸 = ${originalWidth} ÷ ${scaleFactorW.toFixed(3)} ≈ ${actualWidth}，${originalHeight} ÷ ${scaleFactorH.toFixed(3)} ≈ ${actualHeight}`;
    }

    /**
     * 生成原图尺寸描述文本
     * 用于未缩放场景（图片小于视口时）
     * 
     * @param {number} width - 图片宽度（像素）
     * @param {number} height - 图片高度（像素）
     * @returns {string} 格式化的尺寸描述文本
     * @throws {Error} 当参数不是有效的正数时抛出错误（Fail Fast）
     * @private
     */
    _generateOriginalDimensionDescription(width, height) {
        // Fail Fast: 验证参数
        if (typeof width !== 'number' || typeof height !== 'number') {
            throw new Error('ImageInfoModalService._generateOriginalDimensionDescription: width and height must be numbers');
        }
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
            throw new Error('ImageInfoModalService._generateOriginalDimensionDescription: width and height must be finite numbers');
        }
        if (width <= 0 || height <= 0) {
            throw new Error('ImageInfoModalService._generateOriginalDimensionDescription: width and height must be positive numbers');
        }
        
        return `原图尺寸：${width} × ${height} 像素`;
    }

}


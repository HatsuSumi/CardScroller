import { convertPixelPositionToScrollDistance, convertScrollDistanceToPixelPosition } from '../../helpers/positionCalculators.js';

/**
 * PositionSliderService - 位置滑块服务
 * 专门处理滑块控制逻辑，负责设置位置滑块、更新位置显示等功能
 * 
 * 当前被使用的模块：
 * - PositionSelectorService (modal/PositionSelectorService.js) - 滑块控制功能
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理
 * - convertPixelPositionToScrollDistance, convertScrollDistanceToPixelPosition (helpers/positionCalculators.js) - 位置转换工具函数
 */
export class PositionSliderService {
    /**
     * 构造函数
     * @param {StateManager} stateManager - 状态管理器
     * @throws {Error} 当核心依赖缺失时抛出错误（Fail Fast）
     */
    constructor(stateManager) {
        // Fail Fast: 检查核心依赖
        if (!stateManager) {
            throw new Error('PositionSliderService requires stateManager');
        }
        
        this.stateManager = stateManager;
    }

    /**
     * 验证非负数参数
     * @param {*} value - 要验证的值
     * @param {string} paramName - 参数名称
     * @throws {Error} 当值不是有限的非负数时抛出错误
     * @private
     */
    _validateNonNegativeNumber(value, paramName) {
        if (typeof value !== 'number' || !isFinite(value) || value < 0) {
            throw new Error(`PositionSliderService: ${paramName} must be a non-negative finite number`);
        }
    }

    /**
     * 验证正数参数
     * @param {*} value - 要验证的值
     * @param {string} paramName - 参数名称
     * @throws {Error} 当值不是有限的正数时抛出错误
     * @private
     */
    _validatePositiveNumber(value, paramName) {
        if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
            throw new Error(`PositionSliderService: ${paramName} must be a positive finite number`);
        }
    }

    /**
     * 格式化位置显示文本
     * @param {number} pixelPosition - 像素位置
     * @returns {string} 格式化后的位置文本（如 "123px"）
     * @private
     */
    _formatPositionDisplay(pixelPosition) {
        return Math.round(pixelPosition) + 'px';
    }

    /**
     * 设置位置滑块
     * @param {HTMLElement} positionSlider 位置滑块元素
     * @param {HTMLElement} currentPosition 当前位置显示元素
     * @param {string} currentSelecting 当前选择类型 ('start' 或 'end')
     * @returns {number} 设置的临时位置值
     * @throws {Error} 当DOM元素缺失、图片状态数据不完整、参数无效或滑块范围无效时抛出错误（Fail Fast）
     */
    setupPositionSlider(positionSlider, currentPosition, currentSelecting, positionOverride = null) {
        // Fail Fast: 验证DOM元素
        if (!positionSlider) {
            throw new Error('PositionSliderService.setupPositionSlider: positionSlider element is required');
        }
        if (!currentPosition) {
            throw new Error('PositionSliderService.setupPositionSlider: currentPosition element is required');
        }
        
        // 使用主显示区域的缩放比例，保持一致性
        const imageState = this.stateManager.state.content.image;
        
        // Fail Fast: 验证图片状态数据
        if (!imageState || !imageState.metadata || !imageState.scaling) {
            throw new Error('PositionSliderService.setupPositionSlider: image state data is incomplete');
        }
        
        const imageWidth = imageState.metadata.width;
        const mainScalingRatio = imageState.scaling.ratio;
        
        // Fail Fast: 验证图片尺寸数据
        if (!imageWidth || imageWidth <= 0) {
            throw new Error('PositionSliderService.setupPositionSlider: invalid image width');
        }
        if (!mainScalingRatio || mainScalingRatio <= 0) {
            throw new Error('PositionSliderService.setupPositionSlider: invalid scaling ratio');
        }
        
        const mainImageWidth = imageWidth * mainScalingRatio;
        const windowWidth = window.innerWidth;
        
        // Fail Fast: 验证业务数据（滑块范围必须有效）
        if (mainImageWidth - windowWidth <= 0) {
            throw new Error('PositionSliderService.setupPositionSlider: invalid slider range (mainImageWidth - windowWidth <= 0)');
        }
        
        positionSlider.max = mainImageWidth; // 滑块最大值：完全滑出就是整个图片宽度
        positionSlider.step = 1; // 使用1像素精度，避免步长导致的最大值偏差
        
        // Fail Fast: 验证 currentSelecting 参数
        if (currentSelecting !== 'start' && currentSelecting !== 'end') {
            throw new Error(`PositionSliderService.setupPositionSlider: invalid currentSelecting value "${currentSelecting}" (must be "start" or "end")`);
        }
        
        // 🎯 转换原始位置为滚动距离坐标
        let pixelPosition = 0; // 原始像素位置，用于显示
        if (positionOverride !== null) {
            // 使用传入的覆盖值（如快照值）
            pixelPosition = positionOverride;
        } else if (currentSelecting === 'start') {
            pixelPosition = this.stateManager.state.playback.scroll.startPosition;
        } else { // currentSelecting === 'end'
            pixelPosition = this.stateManager.state.playback.scroll.endPosition;
        }
        
        const currentValue = convertPixelPositionToScrollDistance(pixelPosition, imageWidth, mainImageWidth);
        
        positionSlider.value = currentValue;
        
        // 直接显示原始像素位置，避免往返转换
        currentPosition.textContent = this._formatPositionDisplay(pixelPosition);
        
        return currentValue; // 返回临时位置（滚动距离）
    }

    /**
     * 更新位置显示
     * @param {HTMLElement} currentPosition 当前位置显示元素
     * @param {number} tempPosition 临时位置值（滚动距离）
     * @param {number} imageWidth 图片原始宽度
     * @param {number} mainImageWidth 主显示区域图片宽度（缩放后）
     * @returns {void}
     * @throws {Error} 当DOM元素缺失或参数类型/值无效时抛出错误（Fail Fast）
     */
    updatePositionDisplay(currentPosition, tempPosition, imageWidth, mainImageWidth) {
        // Fail Fast: 验证DOM元素
        if (!currentPosition) {
            throw new Error('PositionSliderService.updatePositionDisplay: currentPosition element is required');
        }
        
        // Fail Fast: 验证参数类型和值
        this._validateNonNegativeNumber(tempPosition, 'tempPosition');
        this._validatePositiveNumber(imageWidth, 'imageWidth');
        this._validatePositiveNumber(mainImageWidth, 'mainImageWidth');

        // 转换滚动距离为像素位置显示
        const pixelPosition = convertScrollDistanceToPixelPosition(tempPosition, imageWidth, mainImageWidth);
        currentPosition.textContent = this._formatPositionDisplay(pixelPosition);
    }

}


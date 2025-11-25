/**
 * ColorPicker - 自定义颜色选择器组件
 * 提供HSV颜色模型的可视化选择、固定预设颜色、自定义预设管理（通过StateManager持久化）
 * 
 * 当前被使用的模块：
 * - ColorPickerFactory (components/ColorPickerFactory.js) - 通过工厂创建实例
 * 
 * 当前依赖的模块：
 * - StateManager (core/StateManager.js) - 状态管理器，用于获取当前背景色 (通过工厂注入)
 * - keyboardService (services/utils/KeyboardService.js) - 键盘快捷键管理服务 (通过工厂注入)
 * - eventBus (core/EventBus.js) - 事件总线，用于发射用户提示消息 (通过工厂注入)
 * - validationService (services/system/ValidationService.js) - 验证服务，用于验证Hex输入、RGB/HSV通道值和预设数量 (通过工厂注入)
 * - hsvToRgb, rgbToHex, hexToRgb, hexToHsv (helpers/colorConverter.js) - 颜色转换工具函数
 * 
 * 架构说明：
 * - 通过工厂创建：由 ColorPickerFactory 统一管理实例创建
 * - 组件模式：纯UI组件，负责颜色选择交互和自定义预设管理
 * - 不继承BaseUIService：管理的是传入参数的container及其子元素，而非页面级固定元素
 * - 通过StateManager管理状态：所有持久化数据（如自定义预设）都通过StateManager读取和更新，实现与持久化层的解耦
 * - 设计原则：组件只操作传入容器，不操作全局DOM
 */

import { hsvToRgb, rgbToHex, hexToRgb, hexToHsv } from '../helpers/colorConverter.js';

export class ColorPicker {
    /**
     * 自定义预设颜色数量上限
     */
    static MAX_CUSTOM_PRESETS = 10;
    
    /**
     * 固定预设颜色：灰度系列（8个）
     */
    static PRESET_COLORS_GRAY = [
        '#000000', '#1a1a1a', '#333333', '#666666',
        '#999999', '#cccccc', '#e5e5e5', '#ffffff'
    ];
    
    /**
     * 固定预设颜色：常用色彩 - 第1行（8个）
     */
    static PRESET_COLORS_ROW1 = [
        '#f44336', '#e91e63', '#9c27b0', '#673ab7',
        '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4'
    ];
    
    /**
     * 固定预设颜色：常用色彩 - 第2行（8个）
     */
    static PRESET_COLORS_ROW2 = [
        '#009688', '#4caf50', '#8bc34a', '#cddc39',
        '#ffeb3b', '#ffc107', '#ff9800', '#ff5722'
    ];

    /**
     * 构造函数
     * @param {HTMLElement} container - 颜色选择器容器元素（由模态框提供）
     * @param {StateManager} stateManager - 状态管理器
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务
     * @param {EventBus} eventBus - 事件总线
     * @param {ValidationService} validationService - 验证服务
     * @param {Object} options - 配置选项
     * @param {Function} [options.onChange] - 颜色变化回调函数 (color: string) => void
     * @throws {Error} 当关键参数缺失时抛出错误
     */
    constructor(container, stateManager, keyboardService, eventBus, validationService, options = {}) {
        if (!container) {
            throw new Error('ColorPicker: container is required');
        }
        if (!stateManager) {
            throw new Error('ColorPicker: stateManager is required');
        }
        if (!keyboardService) {
            throw new Error('ColorPicker: keyboardService is required');
        }
        if (!eventBus) {
            throw new Error('ColorPicker: eventBus is required');
        }
        if (!validationService) {
            throw new Error('ColorPicker: validationService is required');
        }
        
        this.container = container;
        this.stateManager = stateManager;
        this.keyboardService = keyboardService;
        this.eventBus = eventBus;
        this.validationService = validationService;
        this.options = options;
        
        // 当前HSV值（内部状态）
        this.currentHSV = { h: 0, s: 100, v: 100 }; // 默认红色
        
        // Canvas拖拽状态
        this.isDraggingSVPicker = false;
        this.isDraggingHuePicker = false;
        
        // 自定义预设颜色数组
        this.customPresets = [];
        
        // RAF节流标识（性能优化）
        this.rafId = null;
        
        // 性能优化：保存全局事件监听器的绑定引用，用于destroy时移除（防止内存泄漏）
        this._boundSVMouseMove = (e) => this._onSVCanvasMouseMove(e);
        this._boundSVMouseUp = () => this._onSVCanvasMouseUp();
        this._boundHueMouseMove = (e) => this._onHueCanvasMouseMove(e);
        this._boundHueMouseUp = () => this._onHueCanvasMouseUp();
        
        // 缓存DOM元素
        this._cacheElements();
        
        // 初始化组件
        this.init();
    }
    
    /**
     * 缓存DOM元素和HTML模板
     * @private
     * @throws {Error} 当必需的DOM元素或模板不存在时抛出错误（Fail Fast）
     */
    _cacheElements() {
        // Canvas 元素
        this.svCanvas = this.container.querySelector('.color-picker-sv-canvas');
        if (!this.svCanvas) {
            throw new Error('ColorPicker: .color-picker-sv-canvas not found in container');
        }
        
        this.hueCanvas = this.container.querySelector('.color-picker-hue-canvas');
        if (!this.hueCanvas) {
            throw new Error('ColorPicker: .color-picker-hue-canvas not found in container');
        }
        
        // Canvas 上下文
        this.svCtx = this.svCanvas.getContext('2d');
        this.hueCtx = this.hueCanvas.getContext('2d');
        
        // 当前颜色显示
        this.currentColorDisplay = this.container.querySelector('.color-picker-current-color');
        if (!this.currentColorDisplay) {
            throw new Error('ColorPicker: .color-picker-current-color not found in container');
        }
        
        // Hex 输入框
        this.hexInput = this.container.querySelector('.color-picker-hex-input');
        if (!this.hexInput) {
            throw new Error('ColorPicker: .color-picker-hex-input not found in container');
        }
        
        // 吸管按钮
        this.eyedropperBtn = this.container.querySelector('#colorPickerEyedropperBtn');
        if (!this.eyedropperBtn) {
            throw new Error('ColorPicker: #colorPickerEyedropperBtn not found in container');
        }
        
        // RGB 输入框（3个独立输入框）
        this.rInput = this.container.querySelector('#colorPickerRInput');
        if (!this.rInput) {
            throw new Error('ColorPicker: #colorPickerRInput not found in container');
        }
        this.gInput = this.container.querySelector('#colorPickerGInput');
        if (!this.gInput) {
            throw new Error('ColorPicker: #colorPickerGInput not found in container');
        }
        this.bInput = this.container.querySelector('#colorPickerBInput');
        if (!this.bInput) {
            throw new Error('ColorPicker: #colorPickerBInput not found in container');
        }
        
        // HSV 输入框（3个独立输入框）
        this.hInput = this.container.querySelector('#colorPickerHInput');
        if (!this.hInput) {
            throw new Error('ColorPicker: #colorPickerHInput not found in container');
        }
        this.sInput = this.container.querySelector('#colorPickerSInput');
        if (!this.sInput) {
            throw new Error('ColorPicker: #colorPickerSInput not found in container');
        }
        this.vInput = this.container.querySelector('#colorPickerVInput');
        if (!this.vInput) {
            throw new Error('ColorPicker: #colorPickerVInput not found in container');
        }
        
        // 固定预设颜色容器
        this.presetGrayContainer = this.container.querySelector('.color-picker-preset-gray');
        this.presetRow1Container = this.container.querySelector('.color-picker-preset-row1');
        this.presetRow2Container = this.container.querySelector('.color-picker-preset-row2');
        
        if (!this.presetGrayContainer || !this.presetRow1Container || !this.presetRow2Container) {
            throw new Error('ColorPicker: preset color containers not found in container');
        }
        
        // 自定义预设容器
        this.customPresetsContainer = this.container.querySelector('.color-picker-custom-presets');
        if (!this.customPresetsContainer) {
            throw new Error('ColorPicker: .color-picker-custom-presets not found in container');
        }
        
        // "保存当前颜色"按钮
        this.addPresetBtn = this.container.querySelector('.color-picker-add-preset-btn');
        if (!this.addPresetBtn) {
            throw new Error('ColorPicker: .color-picker-add-preset-btn not found in container');
        }
        
        // 性能优化：缓存HTML模板引用，避免重复创建DOM元素
        this.presetBoxTemplate = document.getElementById('color-picker-preset-box-template');
        if (!this.presetBoxTemplate || !(this.presetBoxTemplate instanceof HTMLTemplateElement)) {
            throw new Error('ColorPicker: template #color-picker-preset-box-template not found or is not a <template> element');
        }
        
        this.customPresetBoxTemplate = document.getElementById('color-picker-custom-preset-box-template');
        if (!this.customPresetBoxTemplate || !(this.customPresetBoxTemplate instanceof HTMLTemplateElement)) {
            throw new Error('ColorPicker: template #color-picker-custom-preset-box-template not found or is not a <template> element');
        }
        
        this.customPresetsEmptyTemplate = document.getElementById('color-picker-custom-presets-empty-template');
        if (!this.customPresetsEmptyTemplate || !(this.customPresetsEmptyTemplate instanceof HTMLTemplateElement)) {
            throw new Error('ColorPicker: template #color-picker-custom-presets-empty-template not found or is not a <template> element');
        }
    }
    
    /**
     * 初始化组件
     * @returns {void}
     */
    init() {
        // 从StateManager加载当前背景色
        const currentColor = this.stateManager.getValue('ui.display.backgroundColor') || '#ffffff';
        this.setColor(currentColor);
        
        // 加载自定义预设
        this._loadCustomPresets();
        
        // 绘制Canvas
        this._drawSVCanvas();
        this._drawHueCanvas();
        this._updateCanvasCursors();
        
        // 渲染固定预设颜色
        this._renderFixedPresets();
        
        // 渲染自定义预设颜色
        this._renderCustomPresets();
        
        // 绑定事件
        this._bindEvents();
        
        // 注册键盘快捷键
        this._registerKeyboardShortcuts();
    }
    
    /**
     * 绑定事件
     * 性能优化：使用事件委托，减少事件监听器数量
     * @private
     */
    _bindEvents() {
        // SV Canvas 鼠标事件
        this.svCanvas.addEventListener('mousedown', (e) => this._onSVCanvasMouseDown(e));
        // 使用保存的绑定引用，便于在destroy时移除（防止内存泄漏）
        document.addEventListener('mousemove', this._boundSVMouseMove);
        document.addEventListener('mouseup', this._boundSVMouseUp);
        
        // Hue Canvas 鼠标事件
        this.hueCanvas.addEventListener('mousedown', (e) => this._onHueCanvasMouseDown(e));
        // 使用保存的绑定引用，便于在destroy时移除（防止内存泄漏）
        document.addEventListener('mousemove', this._boundHueMouseMove);
        document.addEventListener('mouseup', this._boundHueMouseUp);
        
        // Hex 输入框事件
        this.hexInput.addEventListener('input', (e) => this._onHexInput(e));
        this.hexInput.addEventListener('blur', (e) => this._onHexBlur(e));
        
        // 吸管按钮事件
        this.eyedropperBtn.addEventListener('click', () => this._onEyedropperClick());
        
        // RGB 输入框事件（3个独立输入框）
        this.rInput.addEventListener('change', (e) => this._onRgbChange(e));
        this.gInput.addEventListener('change', (e) => this._onRgbChange(e));
        this.bInput.addEventListener('change', (e) => this._onRgbChange(e));
        
        // HSV 输入框事件（3个独立输入框）
        this.hInput.addEventListener('change', (e) => this._onHsvChange(e));
        this.sInput.addEventListener('change', (e) => this._onHsvChange(e));
        this.vInput.addEventListener('change', (e) => this._onHsvChange(e));
        
        // "保存当前颜色"按钮
        this.addPresetBtn.addEventListener('click', () => this._onAddPresetClick());
        
        // 性能优化：事件委托 - 固定预设颜色点击（在3个容器上监听，而非每个色块）
        this.presetGrayContainer.addEventListener('click', (e) => this._onPresetBoxClick(e));
        this.presetRow1Container.addEventListener('click', (e) => this._onPresetBoxClick(e));
        this.presetRow2Container.addEventListener('click', (e) => this._onPresetBoxClick(e));
        
        // 性能优化：事件委托 - 自定义预设点击和删除（在容器上监听，而非每个元素）
        this.customPresetsContainer.addEventListener('click', (e) => this._onCustomPresetContainerClick(e));
    }
    
    /**
     * 固定预设色块点击事件（事件委托）
     * @private
     * @param {MouseEvent} e - 鼠标事件
     */
    _onPresetBoxClick(e) {
        const colorBox = e.target.closest('.color-picker-preset-box');
        if (!colorBox) return;
        
        const color = colorBox.dataset.color;
        if (color) {
            this.setColor(color);
            this._notifyColorChange();
        }
    }
    
    /**
     * 自定义预设容器点击事件（事件委托）
     * 处理色块点击和删除按钮点击
     * @private
     * @param {MouseEvent} e - 鼠标事件
     */
    _onCustomPresetContainerClick(e) {
        // 处理删除按钮点击
        const deleteBtn = e.target.closest('.color-picker-custom-preset-delete-btn');
        if (deleteBtn) {
            const colorBox = deleteBtn.closest('.color-picker-custom-preset-box');
            if (colorBox) {
                const color = colorBox.dataset.color;
                if (color) {
                    this.removeFromPresets(color);
                }
            }
            return;
        }
        
        // 处理色块点击
        const colorBox = e.target.closest('.color-picker-custom-preset-box');
        if (colorBox) {
            const color = colorBox.dataset.color;
            if (color) {
                this.setColor(color);
                this._notifyColorChange();
            }
        }
    }
    
    /**
     * 注册键盘快捷键
     * @private
     */
    _registerKeyboardShortcuts() {
        // Enter键 - 确认颜色输入（触发blur以应用change事件）
        this.keyboardService.register(
            'Enter',
            () => {
                const activeElement = document.activeElement;
                if (activeElement === this.hexInput ||
                    activeElement === this.rInput ||
                    activeElement === this.gInput ||
                    activeElement === this.bInput ||
                    activeElement === this.hInput ||
                    activeElement === this.sInput ||
                    activeElement === this.vInput) {
                    activeElement.blur();
                }
            },
            this,
            { preventDefault: true }
        );
    }
    
    /**
     * 设置颜色（外部调用，支持Hex格式）
     * @param {string} color - Hex颜色字符串（例如 "#FF0000"）
     * @returns {void}
     * @throws {Error} 当颜色格式无效时抛出错误（Fail Fast）
     */
    setColor(color) {
        // Fail Fast: 验证颜色格式（参数验证）
        if (typeof color !== 'string') {
            throw new Error('ColorPicker.setColor: color must be a string');
        }
        
        try {
            const hsv = hexToHsv(color);
            this.currentHSV = hsv;
            this._updateUI();
        } catch (error) {
            throw new Error(`ColorPicker.setColor: Invalid color format "${color}". ${error.message}`);
        }
    }
    
    /**
     * 获取当前颜色（Hex格式）
     * @returns {string} 当前颜色的Hex字符串
     */
    getColor() {
        const rgb = hsvToRgb(this.currentHSV.h, this.currentHSV.s, this.currentHSV.v);
        return rgbToHex(rgb.r, rgb.g, rgb.b);
    }
    
    /**
     * 销毁组件，清理RAF请求和全局事件监听器
     * 注意：由于组件生命周期与服务相同，不需要注销快捷键
     * @returns {void}
     */
    destroy() {
        // 取消RAF
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        
        // 移除全局事件监听器（防止内存泄漏）
        document.removeEventListener('mousemove', this._boundSVMouseMove);
        document.removeEventListener('mouseup', this._boundSVMouseUp);
        document.removeEventListener('mousemove', this._boundHueMouseMove);
        document.removeEventListener('mouseup', this._boundHueMouseUp);
        
        // 清空DOM引用
        this.container = null;
        this.svCanvas = null;
        this.hueCanvas = null;
        this.svCtx = null;
        this.hueCtx = null;
        this.currentColorDisplay = null;
        this.hexInput = null;
        this.rInput = null;
        this.gInput = null;
        this.bInput = null;
        this.hInput = null;
        this.sInput = null;
        this.vInput = null;
        this.presetGrayContainer = null;
        this.presetRow1Container = null;
        this.presetRow2Container = null;
        this.customPresetsContainer = null;
        this.addPresetBtn = null;
    }
    
    // ========================================
    // Canvas 绘制相关
    // ========================================
    
    /**
     * 绘制饱和度-明度选择器（SV Canvas）
     * @private
     */
    _drawSVCanvas() {
        const width = this.svCanvas.width;
        const height = this.svCanvas.height;
        const hue = this.currentHSV.h;
        
        // 获取当前色相的纯色RGB
        const pureColorRgb = hsvToRgb(hue, 100, 100);
        
        // 使用渐变绘制
        // 1. 水平渐变：从白色到纯色（饱和度0%到100%）
        const hGradient = this.svCtx.createLinearGradient(0, 0, width, 0);
        hGradient.addColorStop(0, '#ffffff');
        hGradient.addColorStop(1, `rgb(${pureColorRgb.r}, ${pureColorRgb.g}, ${pureColorRgb.b})`);
        
        this.svCtx.fillStyle = hGradient;
        this.svCtx.fillRect(0, 0, width, height);
        
        // 2. 垂直渐变：从透明到黑色（明度100%到0%）
        const vGradient = this.svCtx.createLinearGradient(0, 0, 0, height);
        vGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
        
        this.svCtx.fillStyle = vGradient;
        this.svCtx.fillRect(0, 0, width, height);
    }
    
    /**
     * 绘制色相选择器（Hue Canvas）
     * @private
     */
    _drawHueCanvas() {
        const width = this.hueCanvas.width;
        const height = this.hueCanvas.height;
        
        // 绘制色相渐变（垂直）
        const gradient = this.hueCtx.createLinearGradient(0, 0, 0, height);
        
        // 6个关键色相点（红→黄→绿→青→蓝→品红→红）
        gradient.addColorStop(0, '#ff0000');      // 0° 红
        gradient.addColorStop(1/6, '#ffff00');    // 60° 黄
        gradient.addColorStop(2/6, '#00ff00');    // 120° 绿
        gradient.addColorStop(3/6, '#00ffff');    // 180° 青
        gradient.addColorStop(4/6, '#0000ff');    // 240° 蓝
        gradient.addColorStop(5/6, '#ff00ff');    // 300° 品红
        gradient.addColorStop(1, '#ff0000');      // 360° 红
        
        this.hueCtx.fillStyle = gradient;
        this.hueCtx.fillRect(0, 0, width, height);
    }
    
    /**
     * 更新Canvas光标位置
     * @private
     */
    _updateCanvasCursors() {
        // SV Canvas 光标位置
        const svX = (this.currentHSV.s / 100) * this.svCanvas.width;
        const svY = ((100 - this.currentHSV.v) / 100) * this.svCanvas.height;
        this._drawSVCursor(svX, svY);
        
        // Hue Canvas 光标位置
        const hueY = (this.currentHSV.h / 360) * this.hueCanvas.height;
        this._drawHueCursor(hueY);
    }
    
    /**
     * 绘制SV Canvas光标
     * @private
     * @param {number} x - 光标X坐标
     * @param {number} y - 光标Y坐标
     */
    _drawSVCursor(x, y) {
        // 重绘Canvas（清除旧光标）
        this._drawSVCanvas();
        
        // 绘制外圈（白色）
        this.svCtx.beginPath();
        this.svCtx.arc(x, y, 7, 0, 2 * Math.PI);
        this.svCtx.strokeStyle = '#ffffff';
        this.svCtx.lineWidth = 2;
        this.svCtx.stroke();
        
        // 绘制内圈（黑色）
        this.svCtx.beginPath();
        this.svCtx.arc(x, y, 5, 0, 2 * Math.PI);
        this.svCtx.strokeStyle = '#000000';
        this.svCtx.lineWidth = 1;
        this.svCtx.stroke();
    }
    
    /**
     * 绘制Hue Canvas光标
     * @private
     * @param {number} y - 光标Y坐标
     */
    _drawHueCursor(y) {
        // 重绘Canvas（清除旧光标）
        this._drawHueCanvas();
        
        const width = this.hueCanvas.width;
        
        // 绘制水平指示线（白色边框 + 黑色线）
        this.hueCtx.strokeStyle = '#ffffff';
        this.hueCtx.lineWidth = 3;
        this.hueCtx.beginPath();
        this.hueCtx.moveTo(0, y);
        this.hueCtx.lineTo(width, y);
        this.hueCtx.stroke();
        
        this.hueCtx.strokeStyle = '#000000';
        this.hueCtx.lineWidth = 1;
        this.hueCtx.beginPath();
        this.hueCtx.moveTo(0, y);
        this.hueCtx.lineTo(width, y);
        this.hueCtx.stroke();
    }
    
    // ========================================
    // Canvas 交互事件
    // ========================================
    
    /**
     * SV Canvas 鼠标按下
     * @private
     * @param {MouseEvent} e - 鼠标事件
     */
    _onSVCanvasMouseDown(e) {
        this.isDraggingSVPicker = true;
        this._updateSVFromMouse(e);
    }
    
    /**
     * SV Canvas 鼠标移动
     * @private
     * @param {MouseEvent} e - 鼠标事件
     */
    _onSVCanvasMouseMove(e) {
        if (!this.isDraggingSVPicker) return;
        
        // RAF节流优化
        if (this.rafId) return;
        this.rafId = requestAnimationFrame(() => {
            this._updateSVFromMouse(e);
            this.rafId = null;
        });
    }
    
    /**
     * SV Canvas 鼠标抬起
     * @private
     */
    _onSVCanvasMouseUp() {
        this.isDraggingSVPicker = false;
    }
    
    /**
     * 从鼠标位置更新SV值
     * @private
     * @param {MouseEvent} e - 鼠标事件
     */
    _updateSVFromMouse(e) {
        const rect = this.svCanvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
        
        const s = (x / rect.width) * 100;
        const v = 100 - (y / rect.height) * 100;
        
        this.currentHSV.s = Math.round(s);
        this.currentHSV.v = Math.round(v);
        
        this._updateUI();
        this._notifyColorChange();
    }
    
    /**
     * Hue Canvas 鼠标按下
     * @private
     * @param {MouseEvent} e - 鼠标事件
     */
    _onHueCanvasMouseDown(e) {
        this.isDraggingHuePicker = true;
        this._updateHueFromMouse(e);
    }
    
    /**
     * Hue Canvas 鼠标移动
     * @private
     * @param {MouseEvent} e - 鼠标事件
     */
    _onHueCanvasMouseMove(e) {
        if (!this.isDraggingHuePicker) return;
        
        // RAF节流优化
        if (this.rafId) return;
        this.rafId = requestAnimationFrame(() => {
            this._updateHueFromMouse(e);
            this.rafId = null;
        });
    }
    
    /**
     * Hue Canvas 鼠标抬起
     * @private
     */
    _onHueCanvasMouseUp() {
        this.isDraggingHuePicker = false;
    }
    
    /**
     * 从鼠标位置更新Hue值
     * @private
     * @param {MouseEvent} e - 鼠标事件
     */
    _updateHueFromMouse(e) {
        const rect = this.hueCanvas.getBoundingClientRect();
        const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
        
        const h = (y / rect.height) * 360;
        this.currentHSV.h = Math.round(h) % 360;
        
        this._updateUI();
        this._notifyColorChange();
    }
    
    // ========================================
    // Hex 输入框事件
    // ========================================
    
    /**
     * Hex 输入框输入事件
     * 提供实时视觉反馈（边框变红），但不触发颜色更新
     * @private
     * @param {InputEvent} e - 输入事件
     */
    _onHexInput(e) {
        const inputValue = this.hexInput.value.trim();
        
        // 实时验证：提供视觉反馈，但不更新颜色
        const validation = this.validationService.validateHexColor(inputValue);
        
        if (validation.isValid) {
            // 格式有效：移除错误样式
            this.hexInput.classList.remove('invalid');
        } else {
            // 格式无效：添加错误样式（边框变红）
            this.hexInput.classList.add('invalid');
        }
    }
    
    /**
     * Hex 输入框失焦事件
     * @private
     * @param {FocusEvent} e - 失焦事件
     */
    _onHexBlur(e) {
        const inputValue = this.hexInput.value.trim();
        
        // 业务验证：通过 ValidationService 验证Hex格式
        const validation = this.validationService.validateHexColor(inputValue);
        
        if (validation.isValid) {
            // 格式有效：移除错误样式并应用颜色
            this.hexInput.classList.remove('invalid');
            try {
                const hsv = hexToHsv(inputValue);
                this.currentHSV = hsv;
                this._updateUI();
                this._notifyColorChange();
            } catch (error) {
                // hexToHsv 内部错误（理论上不应该发生，因为已验证格式）
                console.error('ColorPicker._onHexBlur: hexToHsv error:', error);
                this._resetHexInput();
            }
        } else {
            // 格式无效：恢复为当前颜色并移除错误样式
            this._resetHexInput();
            this.hexInput.classList.remove('invalid');
        }
    }
    
    /**
     * 重置Hex输入框为当前颜色
     * @private
     */
    _resetHexInput() {
        const currentColor = this.getColor();
        this.hexInput.value = currentColor;
    }
    
    /**
     * 拾色器按钮点击事件 - 使用 EyeDropper API 从页面吸取颜色
     * @private
     * @returns {Promise<void>}
     */
    async _onEyedropperClick() {
        // 检查浏览器是否支持 EyeDropper API
        if (!window.EyeDropper) {
            this.eventBus.emit('ui:show-warning-message', 
                '您的浏览器不支持拾色器功能（EyeDropper API）。请使用 Chrome 95+、Edge 95+ 或 Opera 81+ 浏览器。'
            );
            return;
        }
        
        // 通知模态框服务：拾色器开始，需要隐藏模态框（让用户能看到后面的图片）
        this.eventBus.emit('ui:color-picker-eyedropper-start');
        
        // 🔑 等待Canvas渲染完成（避免用户看到背景色而不是图片）
        // 手动实现一次性事件监听：注册监听器，触发后立即解绑
        await new Promise((resolve) => {
            const handler = () => {
                this.eventBus.off('ui:eyedropper-canvas-ready', handler);
                resolve();
            };
            this.eventBus.on('ui:eyedropper-canvas-ready', handler);
        });
        
        try {
            const eyeDropper = new EyeDropper();
            const result = await eyeDropper.open();
            
            // 用户选择了颜色
            if (result && result.sRGBHex) {
                const color = result.sRGBHex.toUpperCase();
                this.setColor(color);
                this._notifyColorChange();
            }
        } catch (error) {
            // 用户取消了操作或发生错误
            if (error.name === 'AbortError') {
                // 用户取消，不显示错误
                return;
            }
            
            // 其他错误
            console.error('ColorPicker._onEyedropperClick: EyeDropper error:', error);
            this.eventBus.emit('ui:show-error-message', 
                `拾色器功能调用失败：${error.message}`
            );
        } finally {
            // 无论成功、取消还是失败，都恢复模态框显示
            this.eventBus.emit('ui:color-picker-eyedropper-end');
        }
    }
    
    /**
     * RGB 输入框变化事件（3个独立输入框）
     * @private
     * @param {Event} e - change事件
     */
    _onRgbChange(e) {
        // 业务验证：通过 ValidationService 验证每个通道
        const rValidation = this.validationService.validateRgbChannel(this.rInput.value, 'R');
        const gValidation = this.validationService.validateRgbChannel(this.gInput.value, 'G');
        const bValidation = this.validationService.validateRgbChannel(this.bInput.value, 'B');
        
        if (!rValidation.isValid || !gValidation.isValid || !bValidation.isValid) {
            // 有无效值，恢复为当前颜色
            this._resetRgbInputs();
            return;
        }
        
        // 应用颜色（使用验证后的值）
        try {
            const hex = rgbToHex(rValidation.value, gValidation.value, bValidation.value);
            const hsv = hexToHsv(hex);
            this.currentHSV = hsv;
            this._updateUI();
            this._notifyColorChange();
        } catch (error) {
            console.error('ColorPicker._onRgbChange: conversion error:', error);
            this._resetRgbInputs();
        }
    }
    
    /**
     * HSV 输入框变化事件（3个独立输入框）
     * @private
     * @param {Event} e - change事件
     */
    _onHsvChange(e) {
        // 业务验证：通过 ValidationService 验证每个通道
        const hValidation = this.validationService.validateHsvChannel(this.hInput.value, 'H');
        const sValidation = this.validationService.validateHsvChannel(this.sInput.value, 'S');
        const vValidation = this.validationService.validateHsvChannel(this.vInput.value, 'V');
        
        if (!hValidation.isValid || !sValidation.isValid || !vValidation.isValid) {
            // 有无效值，恢复为当前颜色
            this._resetHsvInputs();
            return;
        }
        
        // 应用颜色（使用验证后的值）
        this.currentHSV = {
            h: hValidation.value,
            s: sValidation.value,
            v: vValidation.value
        };
        this._updateUI();
        this._notifyColorChange();
    }
    
    /**
     * 重置RGB输入框为当前颜色（3个独立输入框）
     * @private
     */
    _resetRgbInputs() {
        const rgb = hsvToRgb(this.currentHSV.h, this.currentHSV.s, this.currentHSV.v);
        this.rInput.value = rgb.r;
        this.gInput.value = rgb.g;
        this.bInput.value = rgb.b;
    }
    
    /**
     * 重置HSV输入框为当前颜色（3个独立输入框）
     * @private
     */
    _resetHsvInputs() {
        this.hInput.value = this.currentHSV.h;
        this.sInput.value = this.currentHSV.s;
        this.vInput.value = this.currentHSV.v;
    }
    
    // ========================================
    // 固定预设颜色
    // ========================================
    
    /**
     * 渲染固定预设颜色
     * @private
     */
    _renderFixedPresets() {
        this._renderPresetRow(this.presetGrayContainer, ColorPicker.PRESET_COLORS_GRAY);
        this._renderPresetRow(this.presetRow1Container, ColorPicker.PRESET_COLORS_ROW1);
        this._renderPresetRow(this.presetRow2Container, ColorPicker.PRESET_COLORS_ROW2);
    }
    
    /**
     * 渲染一行预设颜色
     * @private
     * @param {HTMLElement} container - 容器元素
     * @param {string[]} colors - 颜色数组
     */
    _renderPresetRow(container, colors) {
        // 使用 DocumentFragment 批量添加，减少重排次数
        const fragment = document.createDocumentFragment();
        
        colors.forEach(color => {
            const clone = this.presetBoxTemplate.content.cloneNode(true);
            const colorBox = clone.querySelector('.color-picker-preset-box');
            
            if (!colorBox) {
                throw new Error('ColorPicker._renderPresetRow: .color-picker-preset-box not found in template');
            }
            
            // 设置颜色和数据属性（用于事件委托）
            colorBox.style.backgroundColor = color;
            colorBox.dataset.tooltip = color;
            colorBox.dataset.color = color;
            
            fragment.appendChild(clone);
        });
        
        // 一次性批量添加，减少重排
        container.innerHTML = '';
        container.appendChild(fragment);
    }
    
    // ========================================
    // 自定义预设颜色（StateManager）
    // ========================================
    
    /**
     * 从 StateManager 加载自定义预设
     * @private
     */
    _loadCustomPresets() {
        // 从 StateManager 加载自定义预设
        const presets = this.stateManager.getValue('preferences.colorPicker.customPresets');
        
        // 数据结构验证
        if (presets && Array.isArray(presets)) {
            this.customPresets = [...presets]; // 创建副本以避免直接修改状态
        } else {
            this.customPresets = [];
        }
    }
    
    /**
     * 保存自定义预设到 StateManager
     * @private
     */
    _saveCustomPresets() {
        this.stateManager.state.preferences.colorPicker.customPresets = this.customPresets;
    }
    
    /**
     * 渲染自定义预设颜色
     * @private
     */
    _renderCustomPresets() {
        // 清空容器
        this.customPresetsContainer.innerHTML = '';
        
        if (this.customPresets.length === 0) {
            const clone = this.customPresetsEmptyTemplate.content.cloneNode(true);
            this.customPresetsContainer.appendChild(clone);
            return;
        }
        
        // 使用 DocumentFragment 批量添加，减少重排次数
        const fragment = document.createDocumentFragment();
        
        this.customPresets.forEach(color => {
            const clone = this.customPresetBoxTemplate.content.cloneNode(true);
            const colorBox = clone.querySelector('.color-picker-custom-preset-box');
            
            if (!colorBox) {
                throw new Error('ColorPicker._renderCustomPresets: .color-picker-custom-preset-box not found in template');
            }
            
            // 设置颜色和数据属性（用于事件委托）
            colorBox.style.backgroundColor = color;
            colorBox.dataset.tooltip = color;
            colorBox.dataset.color = color;
            
            fragment.appendChild(clone);
        });
        
        // 一次性批量添加，减少重排
        this.customPresetsContainer.appendChild(fragment);
    }
    
    /**
     * "保存当前颜色"按钮点击事件
     * @private
     */
    _onAddPresetClick() {
        const currentColor = this.getColor();
        this.addToPresets(currentColor);
    }
    
    /**
     * 添加当前颜色到自定义预设
     * @param {string} color - Hex颜色字符串
     * @returns {boolean} 是否添加成功
     */
    addToPresets(color) {
        // 统一转换为大写，避免大小写不同但视觉相同的颜色重复（如 #ff0000 vs #FF0000）
        const normalizedColor = color.toUpperCase();
        
        // 1. 检查重复并提示用户
        if (this.customPresets.includes(normalizedColor)) {
            this.eventBus.emit('ui:show-warning-message', {
                message: '该颜色已存在于自定义预设中。'
            });
            return false;
        }
        
        // 2. 检查数量上限并提示用户
        const validation = this.validationService.validateColorPresetLimit(
            this.customPresets.length,
            ColorPicker.MAX_CUSTOM_PRESETS
        );
        
        if (!validation.isValid) {
            this.eventBus.emit('ui:show-warning-message', {
                message: `自定义预设已达上限（最多${ColorPicker.MAX_CUSTOM_PRESETS}个）。`
            });
            return false;
        }
        
        // 3. 添加到数组
        this.customPresets.push(normalizedColor);
        
        // 4. 保存到 StateManager
        this._saveCustomPresets();
        
        // 5. 添加新色块到UI（带淡入动画）
        this._addCustomPresetElement(normalizedColor);
        
        return true;
    }
    
    /**
     * 添加单个自定义预设色块到UI（带淡入动画）
     * @private
     * @param {string} color - Hex颜色字符串
     */
    _addCustomPresetElement(color) {
        // 如果是第一个预设，为空状态提示添加淡出动画
        if (this.customPresets.length === 1) {
            const emptyHint = this.customPresetsContainer.querySelector('.color-picker-custom-presets-empty');
            if (!emptyHint) {
                throw new Error('ColorPicker._addCustomPresetElement: Expected empty state hint not found when adding first preset');
            }
            emptyHint.classList.add('removing');
            
            // 读取元素应用CSS后的实际动画时长
            const computedStyle = getComputedStyle(emptyHint);
            const animationDuration = computedStyle.animationDuration;
            const duration = parseFloat(animationDuration) * 1000;
            
            // Fail Fast: 验证时长有效性
            if (isNaN(duration) || duration <= 0) {
                throw new Error('ColorPicker._addCustomPresetElement: Invalid animation-duration on empty state hint');
            }
            
            // 动画播放完成后移除空状态提示
            setTimeout(() => {
                emptyHint.remove();
            }, duration);
        }
        
        const clone = this.customPresetBoxTemplate.content.cloneNode(true);
        const colorBox = clone.querySelector('.color-picker-custom-preset-box');
        
        if (!colorBox) {
            throw new Error('ColorPicker._addCustomPresetElement: .color-picker-custom-preset-box not found in template');
        }
        
        // 设置颜色和数据属性
        colorBox.style.backgroundColor = color;
        colorBox.dataset.tooltip = color;
        colorBox.dataset.color = color;
        
        // 添加淡入动画类
        colorBox.classList.add('adding');
        
        // 添加到容器
        this.customPresetsContainer.appendChild(clone);
        
        // 读取元素应用CSS后的实际动画时长
        const computedStyle = getComputedStyle(colorBox);
        const animationDuration = computedStyle.animationDuration;
        const duration = parseFloat(animationDuration) * 1000;
        
        // Fail Fast: 验证时长有效性
        if (isNaN(duration) || duration <= 0) {
            throw new Error('ColorPicker._addCustomPresetElement: Invalid animation-duration on color box');
        }
        
        // 动画播放完毕后移除动画类（避免影响后续hover效果）
        setTimeout(() => {
            const addedBox = this.customPresetsContainer.querySelector(`[data-color="${color}"]`);
            if (addedBox) {
                addedBox.classList.remove('adding');
            }
        }, duration);
    }
    
    /**
     * 从自定义预设中删除颜色
     * @param {string} color - Hex颜色字符串
     * @returns {boolean} 是否删除成功
     */
    removeFromPresets(color) {
        // 统一转换为大写后查找（与 addToPresets 保持一致）
        const normalizedColor = color.toUpperCase();
        const index = this.customPresets.indexOf(normalizedColor);
        if (index === -1) {
            return false;
        }
        
        // 1. 从数组移除
        this.customPresets.splice(index, 1);
        
        // 2. 保存到 StateManager
        this._saveCustomPresets();
        
        // 3. 从UI移除（带淡出动画）
        this._removeCustomPresetElement(normalizedColor);
        
        return true;
    }
    
    /**
     * 从UI移除单个自定义预设色块（带淡出动画）
     * @private
     * @param {string} color - Hex颜色字符串
     */
    _removeCustomPresetElement(color) {
        // 找到对应的色块元素
        const colorBox = this.customPresetsContainer.querySelector(`[data-color="${color}"]`);
        if (!colorBox) {
            return;
        }
        
        // 添加淡出动画类
        colorBox.classList.add('removing');
        
        // 读取元素应用CSS后的实际动画时长
        const computedStyle = getComputedStyle(colorBox);
        const animationDuration = computedStyle.animationDuration;
        const fadeOutDuration = parseFloat(animationDuration) * 1000;
        
        // Fail Fast: 验证时长有效性
        if (isNaN(fadeOutDuration) || fadeOutDuration <= 0) {
            throw new Error('ColorPicker._removeCustomPresetElement: Invalid animation-duration on color box');
        }
        
        // 等待动画播放完毕后从DOM移除
        setTimeout(() => {
            colorBox.remove();
            
            // 如果删除后没有预设了，显示空状态提示（带淡入动画）
            if (this.customPresets.length === 0) {
                const clone = this.customPresetsEmptyTemplate.content.cloneNode(true);
                const emptyHint = clone.querySelector('.color-picker-custom-presets-empty');
                if (!emptyHint) {
                    throw new Error('ColorPicker._removeCustomPresetElement: .color-picker-custom-presets-empty not found in template');
                }
                
                // 添加淡入动画类
                emptyHint.classList.add('adding');
                this.customPresetsContainer.appendChild(clone);
                
                // 读取元素应用CSS后的实际动画时长
                const emptyHintStyle = getComputedStyle(emptyHint);
                const emptyAnimDuration = emptyHintStyle.animationDuration;
                const fadeInDuration = parseFloat(emptyAnimDuration) * 1000;
                
                // Fail Fast: 验证时长有效性
                if (isNaN(fadeInDuration) || fadeInDuration <= 0) {
                    throw new Error('ColorPicker._removeCustomPresetElement: Invalid animation-duration on empty state hint');
                }
                
                // 动画播放完毕后移除动画类
                setTimeout(() => {
                    const addedHint = this.customPresetsContainer.querySelector('.color-picker-custom-presets-empty');
                    if (addedHint) {
                        addedHint.classList.remove('adding');
                    }
                }, fadeInDuration);
            }
        }, fadeOutDuration);
    }
    
    // ========================================
    // UI 更新相关
    // ========================================
    
    /**
     * 更新UI（当前颜色显示、Hex/RGB/HSV输入框、Canvas光标）
     * @private
     */
    _updateUI() {
        const currentColor = this.getColor();
        const rgb = hsvToRgb(this.currentHSV.h, this.currentHSV.s, this.currentHSV.v);
        
        // 更新当前颜色显示
        this.currentColorDisplay.style.backgroundColor = currentColor;
        
        // 更新Hex输入框
        this.hexInput.value = currentColor;
        
        // 更新RGB输入框（3个独立输入框）
        this.rInput.value = rgb.r;
        this.gInput.value = rgb.g;
        this.bInput.value = rgb.b;
        
        // 更新HSV输入框（3个独立输入框）
        this.hInput.value = this.currentHSV.h;
        this.sInput.value = this.currentHSV.s;
        this.vInput.value = this.currentHSV.v;
        
        // 更新Canvas光标
        this._updateCanvasCursors();
    }
    
    /**
     * 通知颜色变化（触发回调）
     * @private
     */
    _notifyColorChange() {
        if (typeof this.options.onChange === 'function') {
            const currentColor = this.getColor();
            this.options.onChange(currentColor);
        }
    }
}


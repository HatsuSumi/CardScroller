/**
 * CardBoundaryEditorService - 卡片边界编辑器服务
 * 提供可视化Canvas编辑器，允许用户通过拖拽竖线标记每张卡片的左右边界
 * 
 * 当前被使用的模块：
 * - BoundaryEditorManager (components/entry-animation/BoundaryEditorManager.js) - 通过工厂创建和使用编辑器实例
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 获取当前图片数据 (通过DI注入)
 * - keyboardService (utils/KeyboardService.js) - 注册键盘快捷键 (通过DI注入)
 * - viewportCalculatorService (utils/ViewportCalculatorService.js) - 视口计算服务 (通过DI注入)
 * - loadImageFromDataURL (helpers/imageLoader.js) - 图片加载工具函数 (动态import)
 * - debounce (helpers/debounce.js) - 窗口resize防抖
 * 
 * 架构说明：
 * - 不继承BaseUIService：作为多实例UI组件，面向特定Canvas元素，生命周期由EntryAnimationConfigPage管理，不需要全局DOM缓存和单例模式
 */

import { debounce } from '../../helpers/debounce.js';

export class CardBoundaryEditorService {
    /**
     * 构造函数 - 创建卡片边界编辑器服务
     * @param {StateManager} stateManager - 状态管理器
     * @param {KeyboardService} keyboardService - 键盘快捷键服务
     * @param {ViewportCalculatorService} viewportCalculatorService - 视口计算服务
     * @throws {Error} 当依赖缺失时立即抛出错误
     */
    constructor(stateManager, keyboardService, viewportCalculatorService) {
        if (!stateManager) {
            throw new Error('CardBoundaryEditorService requires stateManager dependency');
        }
        if (!keyboardService) {
            throw new Error('CardBoundaryEditorService requires keyboardService dependency');
        }
        if (!viewportCalculatorService) {
            throw new Error('CardBoundaryEditorService requires viewportCalculatorService dependency');
        }
        
        this.stateManager = stateManager;
        this.keyboardService = keyboardService;
        this.viewportCalculatorService = viewportCalculatorService;
        
        // Canvas相关
        this.canvas = null;
        this.ctx = null;
        this.magnifierCanvas = null;
        this.magnifierCtx = null;
        this.image = null;
        
        // 缩放和尺寸
        this.scale = 1;
        this.canvasWidth = 0;
        this.canvasHeight = 0;
        this.imageWidth = 0;
        this.imageHeight = 0;
        
        // 可视区域（原图坐标）
        this.viewportStartX = 0;      // 起始位置
        this.viewportWidth = 0;       // 可视区域宽度
        
        // 边界线数据（原图坐标）
        this.boundaries = [];
        
        // 交互状态
        this.draggingIndex = -1;
        this.draggingValue = null;  // 拖拽中的边界线的原始值（用于避免排序后索引错位）
        this.hoverIndex = -1;
        this.selectedIndex = -1;  // 选中的边界线索引
        this.isDraggableCursor = false;  // 跟踪cursor状态，避免重复DOM操作
        
        // 放大镜状态
        this.magnifier = {
            enabled: false,
            mouseX: 0,       // Canvas坐标
            mouseY: 0,       // Canvas坐标
            size: 180,       // 放大镜尺寸
            scale: 2.5,      // 放大倍数
            isActive: false  // 跟踪Canvas的active状态，避免重复DOM操作
        };
        
        // 🚀 性能优化：requestAnimationFrame 节流渲染
        this.rafId = null;           // RAF请求ID（用于取消）
        this.pendingRender = false;  // 是否有待处理的渲染请求
        this.hasBoundaryChanged = false;  // 拖拽过程中边界是否已变化（用于判断是否需要触发 _emitChange）
        
        // 事件监听器引用（用于清理）
        this.boundHandlers = {
            click: null,
            mousedown: null,
            mousemove: null,
            mouseup: null,
            contextmenu: null,
            mouseleave: null,
            resize: null
        };
        
        // 创建防抖版本的resize处理器（150ms延迟）
        this.debouncedResize = debounce(() => this._handleResize(), 150);
    }
    
    /**
     * 初始化编辑器
     * @param {HTMLCanvasElement} canvas - Canvas元素
     * @param {HTMLCanvasElement} magnifierCanvas - 放大镜Canvas元素
     * @param {Array<Array<number>>} initialBoundaries - 初始边界数据（可选）
     * @returns {void}
     * @throws {Error} 当Canvas无效或放大镜Canvas无效时立即抛出错误
     */
    init(canvas, magnifierCanvas, initialBoundaries = []) {
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error('CardBoundaryEditorService.init: canvas must be a valid HTMLCanvasElement');
        }
        if (!magnifierCanvas || !(magnifierCanvas instanceof HTMLCanvasElement)) {
            throw new Error('CardBoundaryEditorService.init: magnifierCanvas must be a valid HTMLCanvasElement');
        }
        
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        if (!this.ctx) {
            throw new Error('CardBoundaryEditorService.init: failed to get 2d context from canvas');
        }
        
        this.magnifierCanvas = magnifierCanvas;
        this.magnifierCtx = this.magnifierCanvas.getContext('2d');
        if (!this.magnifierCtx) {
            throw new Error('CardBoundaryEditorService.init: failed to get 2d context from magnifierCanvas');
        }
        
        // 🔑 设置放大镜Canvas尺寸（支持高DPI）
        // Fail Fast: 验证devicePixelRatio
        if (typeof window.devicePixelRatio !== 'number' || !isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
            throw new Error('CardBoundaryEditorService.init: Invalid window.devicePixelRatio');
        }
        const dpr = window.devicePixelRatio;
        const magnifierSize = this.magnifier.size;
        
        // 设置CSS样式尺寸
        this.magnifierCanvas.style.width = `${magnifierSize}px`;
        this.magnifierCanvas.style.height = `${magnifierSize}px`;
        
        // 设置物理像素尺寸
        this.magnifierCanvas.width = magnifierSize * dpr;
        this.magnifierCanvas.height = magnifierSize * dpr;
        
        // 缩放上下文以匹配DPR
        this.magnifierCtx.scale(dpr, dpr);
        
        // 获取图片数据
        const imageData = this.stateManager.state.content.image.data;
        
        // 加载图片
        this._loadImage(imageData).then(() => {
            this._updateCanvasDimensions();
            this.boundaries = [...initialBoundaries];
            this._bindEvents();
            this._registerShortcuts();
            this._render();
            
            // 初始化完成后始终触发一次 boundarieschange 事件
            // 通知外部组件（如EntryAnimationConfigPage）边界数据已加载
            // 即使边界为空也需要触发，以便正确显示"未标记卡片"状态
            this._emitChange();
        });
    }
    
    /**
     * 加载图片
     * @private
     * @param {string} imageData - Base64图片数据
     * @returns {Promise<void>}
     */
    _loadImage(imageData) {
        return import('../../helpers/imageLoader.js').then(({ loadImageFromDataURL }) => {
            return loadImageFromDataURL(imageData);
        }).then((image) => {
            this.image = image;
            this.imageWidth = image.naturalWidth;
            this.imageHeight = image.naturalHeight;
        });
    }
    
    /**
     * 计算可视区域宽度（使用ViewportCalculatorService统一方法）
     * @private
     * @param {number} startPosition - 起始位置（原图坐标）
     * @returns {number} 可视区域宽度（原图坐标）
     */
    _calculateViewportDimensions(startPosition) {
        return this.viewportCalculatorService.calculateViewportWidth(
            startPosition, 
            this.imageWidth, 
            this.imageHeight
        );
    }
    
    /**
     * 更新Canvas尺寸（使用ViewportCalculatorService统一方法）
     * @private
     * @returns {void}
     */
    _updateCanvasDimensions() {
        // 更新可视区域（考虑反向滚动）
        const scroll = this.stateManager.state.playback.scroll;
        
        let startPosition, viewportWidth;
        
        if (scroll.reverseScroll) {
            // 反向滚动：显示 endPosition 的视口（因为反向滚动从 endPosition 开始）
            // endPosition 的值由用户决定：
            // - 如果勾选"锁定到图片末尾"，DisplayCoordinatorService 会自动调整 endPosition
            // - 如果未勾选，endPosition 保持用户设置的固定值
            startPosition = scroll.endPosition;
            viewportWidth = this._calculateViewportDimensions(startPosition);
        } else {
            // 正向滚动：显示 startPosition 的视口
            startPosition = scroll.startPosition;
            viewportWidth = this._calculateViewportDimensions(startPosition);
        }
        
        this.viewportStartX = startPosition;
        this.viewportWidth = viewportWidth;
        
        // 使用ViewportCalculatorService统一设置Canvas尺寸
        const container = this.canvas.parentElement;
        
        // 如果容器还没渲染好（clientWidth = 0），延迟执行
        if (container.clientWidth === 0) {
            requestAnimationFrame(() => {
                this._updateCanvasDimensions();
            });
            return;
        }
        
        // 动态计算最大高度：使用容器的实际高度，或者基于窗口高度（留出一些空间给其他UI元素）
        // 优先使用容器高度（如果已经渲染），否则使用窗口高度的80%作为估算
        const maxHeight = container.clientHeight > 0 
            ? container.clientHeight - 64  // 容器高度减去padding
            : window.innerHeight * 0.8;     // 窗口高度的80%（预留空间给标题、按钮等）
        
        const result = this.viewportCalculatorService.setupCanvasForViewport(
            this.canvas,
            container,
            this.viewportWidth,
            this.imageHeight,
            64,  // padding
            maxHeight
        );
        
        // 更新内部状态
        this.canvasWidth = result.width;
        this.canvasHeight = result.height;
        this.scale = result.scale;
        
        // 🔑 关键修复：重新缩放Canvas上下文以匹配DPR
        // 原因：setupCanvasForViewport 重新设置了 canvas.width/height，这会重置上下文（清除之前的缩放）
        // 需要重新获取上下文并缩放，确保绘制坐标系统正确
        
        // Fail Fast: 验证devicePixelRatio
        if (typeof window.devicePixelRatio !== 'number' || !isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
            throw new Error('CardBoundaryEditorService._updateCanvasDimensions: Invalid window.devicePixelRatio');
        }
        const dpr = window.devicePixelRatio;
        
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(dpr, dpr);
    }
    
    /**
     * 绑定事件监听器
     * @private
     * @returns {void}
     */
    _bindEvents() {
        this.boundHandlers.click = (e) => this._handleClick(e);
        this.boundHandlers.mousedown = (e) => this._handleMouseDown(e);
        this.boundHandlers.mousemove = (e) => this._handleMouseMove(e);
        this.boundHandlers.mouseup = () => this._handleMouseUp();
        this.boundHandlers.contextmenu = (e) => this._handleContextMenu(e);
        this.boundHandlers.mouseleave = () => this._handleMouseLeave();
        this.boundHandlers.resize = this.debouncedResize;
        
        this.canvas.addEventListener('click', this.boundHandlers.click);
        this.canvas.addEventListener('mousedown', this.boundHandlers.mousedown);
        this.canvas.addEventListener('mousemove', this.boundHandlers.mousemove);
        this.canvas.addEventListener('mouseup', this.boundHandlers.mouseup);
        this.canvas.addEventListener('contextmenu', this.boundHandlers.contextmenu);
        this.canvas.addEventListener('mouseleave', this.boundHandlers.mouseleave);
        window.addEventListener('resize', this.boundHandlers.resize);
    }
    
    /**
     * 注册快捷键
     * @private
     * @returns {void}
     */
    _registerShortcuts() {
        // 检查配置页面是否可见（通过检查canvas的可见性）
        const isConfigPageVisible = () => {
            return this.canvas && this.canvas.offsetParent !== null;
        };
        
        const condition = () => this.selectedIndex !== -1 && isConfigPageVisible();
        
        // 注册左箭头：向左移动边界线（1px）
        this.keyboardService.registerConditional(
            'left',
            (e) => this._moveBoundary(-1, false),
            condition,
            this,
            { preventDefault: true }
        );
        
        // 注册 Shift+左箭头：向左移动边界线（10px）
        this.keyboardService.registerConditional(
            'shift+left',
            (e) => this._moveBoundary(-1, true),
            condition,
            this,
            { preventDefault: true }
        );
        
        // 注册右箭头：向右移动边界线（1px）
        this.keyboardService.registerConditional(
            'right',
            (e) => this._moveBoundary(1, false),
            condition,
            this,
            { preventDefault: true }
        );
        
        // 注册 Shift+右箭头：向右移动边界线（10px）
        this.keyboardService.registerConditional(
            'shift+right',
            (e) => this._moveBoundary(1, true),
            condition,
            this,
            { preventDefault: true }
        );
    }
    
    /**
     * 渲染Canvas
     * @private
     * @returns {void}
     */
    _render() {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        
        // 绘制图片（只绘制可视区域）
        // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        // sx, sy: 源图片裁剪起点
        // sWidth, sHeight: 源图片裁剪尺寸
        // dx, dy: Canvas绘制起点
        // dWidth, dHeight: Canvas绘制尺寸
        this.ctx.drawImage(
            this.image,
            this.viewportStartX, 0, this.viewportWidth, this.imageHeight,  // 源图片裁剪区域
            0, 0, this.canvasWidth, this.canvasHeight                       // Canvas绘制区域
        );
        
        // 绘制边界线（只绘制在可视区域内的线）
        this.boundaries.forEach((x, index) => {
            if (x >= this.viewportStartX && x <= this.viewportStartX + this.viewportWidth) {
                const isHover = index === this.hoverIndex || index === this.draggingIndex;
                const isSelected = index === this.selectedIndex;
                this._drawBoundaryLine(x, isHover, isSelected);
            }
        });
    }
    
    /**
     * 获取边界线样式
     * @private
     * @param {boolean} isHover - 是否hover状态
     * @param {boolean} isSelected - 是否选中状态
     * @returns {{strokeStyle: string, lineWidth: number}} 样式对象
     */
    _getBoundaryLineStyle(isHover, isSelected) {
        // 优先级：选中 > hover > 普通
        if (isSelected) {
            return { strokeStyle: '#0080ff', lineWidth: 4 };  // 蓝色表示选中
        } else if (isHover) {
            return { strokeStyle: '#ff0000', lineWidth: 3 };  // 红色表示hover
        } else {
            return { strokeStyle: '#00ff00', lineWidth: 2 };  // 绿色表示普通
        }
    }
    
    /**
     * 绘制边界线
     * @private
     * @param {number} x - 原图x坐标
     * @param {boolean} isHover - 是否hover状态
     * @param {boolean} isSelected - 是否选中状态
     * @returns {void}
     */
    _drawBoundaryLine(x, isHover, isSelected) {
        // 转换为Canvas坐标（使用统一坐标转换逻辑）
        const viewportX = this.viewportCalculatorService.convertToViewportCoordinate(x, this.viewportStartX);
        const canvasX = viewportX * this.scale;
        
        this.ctx.save();
        
        const style = this._getBoundaryLineStyle(isHover, isSelected);
        this.ctx.strokeStyle = style.strokeStyle;
        this.ctx.lineWidth = style.lineWidth;
        
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(canvasX, 0);
        this.ctx.lineTo(canvasX, this.canvasHeight);
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    /**
     * 查找距离指定Canvas坐标最近的边界线索引
     * @private
     * @param {number} canvasX - Canvas坐标X
     * @param {number} threshold - 容差范围（像素，默认10）
     * @returns {number} 边界线索引，未找到返回-1
     */
    _findBoundaryIndexNear(canvasX, threshold = 10) {
        return this.boundaries.findIndex(x => {
            // 使用统一坐标转换逻辑
            const viewportX = this.viewportCalculatorService.convertToViewportCoordinate(x, this.viewportStartX);
            const lineX = viewportX * this.scale;
            return Math.abs(lineX - canvasX) < threshold;
        });
    }
    
    /**
     * 绘制放大镜（在独立Canvas上）
     * @private
     * @returns {void}
     */
    _drawMagnifier() {
        const { mouseX, mouseY, size, scale: magScale } = this.magnifier;
        
        // 边界检查：鼠标必须在Canvas范围内
        if (mouseX < 0 || mouseY < 0 || mouseX > this.canvasWidth || mouseY > this.canvasHeight) {
            return; // 鼠标超出Canvas边界，不绘制放大镜
        }
        
        // Fail Fast: 验证scale有效性
        if (!this.scale || !isFinite(this.scale) || this.scale <= 0) {
            console.warn('CardBoundaryEditorService._drawMagnifier: Invalid scale, skipping magnifier draw');
            return;
        }
        
        // 计算鼠标位置对应的原图坐标（使用统一坐标转换逻辑）
        const viewportMouseX = mouseX / this.scale;
        const originalMouseX = this.viewportCalculatorService.convertToOriginalCoordinate(viewportMouseX, this.viewportStartX);
        const originalMouseY = mouseY / this.scale;
        
        // 计算放大镜显示的原图区域（以鼠标为中心）
        const sourceSize = size / magScale;  // 原图中要显示的尺寸
        const sourceX = originalMouseX - sourceSize / 2;
        const sourceY = originalMouseY - sourceSize / 2;
        
        // 清空放大镜Canvas
        this.magnifierCtx.clearRect(0, 0, size, size);
        
        this.magnifierCtx.save();
        
        // 绘制放大的图像
        this.magnifierCtx.drawImage(
            this.image,
            sourceX, sourceY, sourceSize, sourceSize,  // 原图裁剪区域
            0, 0, size, size                            // 放大镜Canvas绘制区域
        );
        
        // 绘制放大区域内的边界线
        this.boundaries.forEach((x, index) => {
            // 只绘制在放大区域内的线
            if (x >= sourceX && x <= sourceX + sourceSize) {
                // 转换为放大镜内的坐标
                const lineXInMag = (x - sourceX) * magScale;
                
                // 根据状态选择颜色和线宽（优先级：选中 > hover/拖拽 > 普通）
                const isHover = index === this.hoverIndex || index === this.draggingIndex;
                const isSelected = index === this.selectedIndex;
                
                const style = this._getBoundaryLineStyle(isHover, isSelected);
                this.magnifierCtx.strokeStyle = style.strokeStyle;
                this.magnifierCtx.lineWidth = style.lineWidth;
                
                this.magnifierCtx.setLineDash([3, 3]);
                this.magnifierCtx.beginPath();
                this.magnifierCtx.moveTo(lineXInMag, 0);
                this.magnifierCtx.lineTo(lineXInMag, size);
                this.magnifierCtx.stroke();
            }
        });
        
        // 绘制十字线标记鼠标位置
        this.magnifierCtx.strokeStyle = '#ff0000';
        this.magnifierCtx.lineWidth = 1;
        this.magnifierCtx.setLineDash([]);
        const centerX = size / 2;
        const centerY = size / 2;
        const crossSize = 10;
        
        // 垂直线
        this.magnifierCtx.beginPath();
        this.magnifierCtx.moveTo(centerX, centerY - crossSize);
        this.magnifierCtx.lineTo(centerX, centerY + crossSize);
        this.magnifierCtx.stroke();
        
        // 水平线
        this.magnifierCtx.beginPath();
        this.magnifierCtx.moveTo(centerX - crossSize, centerY);
        this.magnifierCtx.lineTo(centerX + crossSize, centerY);
        this.magnifierCtx.stroke();
        
        this.magnifierCtx.restore();
    }
    
    /**
     * 处理点击事件（添加或选中边界线）
     * @private
     * @param {MouseEvent} e - 鼠标事件
     * @returns {void}
     */
    _handleClick(e) {
        // 直接使用逻辑像素坐标（与 _handleMouseMove 保持一致）
        const canvasX = e.offsetX;
        
        // 检查是否点击在已有线附近（10px容差）
        const clickedIndex = this._findBoundaryIndexNear(canvasX);
        
        if (clickedIndex !== -1) {
            // 点击已有线，选中它
            this.selectedIndex = clickedIndex;
            this._render();
            return;
        }
        
        // 点击空白处，取消选中并添加新边界线
        this.selectedIndex = -1;
        
        // 使用统一坐标转换逻辑：Canvas坐标 → 视口坐标 → 原图坐标
        const viewportX = canvasX / this.scale;
        const originalX = Math.round(this.viewportCalculatorService.convertToOriginalCoordinate(viewportX, this.viewportStartX));
        this.boundaries.push(originalX);
        this.boundaries.sort((a, b) => a - b);
        
        this._render();
        this._emitChange();
    }
    
    /**
     * 处理鼠标按下事件（开始拖拽）
     * @private
     * @param {MouseEvent} e - 鼠标事件
     * @returns {void}
     */
    _handleMouseDown(e) {
        // 直接使用逻辑像素坐标（与 _handleMouseMove 保持一致）
        const canvasX = e.offsetX;
        
        // 检查是否在某条线附近
        this.draggingIndex = this._findBoundaryIndexNear(canvasX);
        
        // 保存拖拽的初始值（用于避免排序后索引错位）
        if (this.draggingIndex !== -1) {
            this.draggingValue = this.boundaries[this.draggingIndex];
            // 清除hover和选中状态，拖拽时通过draggingIndex显示红色
            this.hoverIndex = -1;
            this.selectedIndex = -1;
        }
    }
    
    /**
     * 处理鼠标移动事件（拖拽或hover）
     * @private
     * @param {MouseEvent} e - 鼠标事件
     * @returns {void}
     */
    _handleMouseMove(e) {
        // 🔑 关键修复：直接使用 offsetX/offsetY（逻辑像素坐标）
        // 原因：Canvas上下文已经通过 ctx.scale(dpr, dpr) 缩放，绘制时使用逻辑像素即可
        // 之前的错误：canvasX = offsetX × (canvas.width / offsetWidth) = offsetX × DPR，导致坐标被放大
        const canvasX = e.offsetX;
        const canvasY = e.offsetY;
        
        // 边界检查：只有鼠标在Canvas范围内时才启用放大镜
        const isWithinBounds = canvasX >= 0 && canvasY >= 0 && canvasX <= this.canvasWidth && canvasY <= this.canvasHeight;
        
        if (isWithinBounds) {
            // 更新放大镜位置并启用
            this.magnifier.enabled = true;
            this.magnifier.mouseX = canvasX;
            this.magnifier.mouseY = canvasY;
            
            // 显示放大镜Canvas（只在未激活时添加class，避免重复DOM操作）
            if (this.magnifierCanvas && !this.magnifier.isActive) {
                this.magnifierCanvas.classList.add('active');
                this.magnifier.isActive = true;
            }
        } else {
            // 鼠标移出Canvas边界，禁用放大镜
            this.magnifier.enabled = false;
            if (this.magnifierCanvas && this.magnifier.isActive) {
                this.magnifierCanvas.classList.remove('active');
                this.magnifier.isActive = false;
            }
        }
        
        if (this.draggingIndex !== -1 && this.draggingValue !== null) {
            // 拖拽中：限制鼠标坐标在Canvas范围内（允许拖拽时鼠标移出边界，但坐标会被钳制）
            const clampedX = Math.max(0, Math.min(this.canvasWidth, canvasX));
            
            // 使用统一坐标转换逻辑（Canvas坐标 → 视口坐标 → 原图坐标）
            const viewportX = clampedX / this.scale;
            const originalX = Math.round(this.viewportCalculatorService.convertToOriginalCoordinate(viewportX, this.viewportStartX));
            // 限制在可视区域内
            const minX = this.viewportStartX;
            const maxX = this.viewportStartX + this.viewportWidth;
            const newX = Math.max(minX, Math.min(maxX, originalX));
            
            // 先移除旧值
            const oldIndex = this.boundaries.indexOf(this.draggingValue);
            if (oldIndex !== -1) {
                this.boundaries.splice(oldIndex, 1);
            }
            
            // 添加新值并排序
            this.boundaries.push(newX);
            this.boundaries.sort((a, b) => a - b);
            
            // 更新 draggingValue 和 draggingIndex
            this.draggingValue = newX;
            this.draggingIndex = this.boundaries.indexOf(newX);
            
            // 🚀 性能优化：标记边界已变化（延迟到 mouseup 触发 _emitChange）
            this.hasBoundaryChanged = true;
            
            // 🚀 性能优化：使用 RAF 节流渲染，而不是立即渲染
            this._scheduleRender();
        } else {
            // 更新hover状态
            const prevHoverIndex = this.hoverIndex;
            this.hoverIndex = this._findBoundaryIndexNear(canvasX);
            
            if (prevHoverIndex !== this.hoverIndex) {
                // 🚀 性能优化：使用 RAF 节流渲染
                this._scheduleRender();
            }
            
            // 更新鼠标样式（只在状态改变时操作classList，避免重复DOM操作）
            const shouldBeDraggable = this.hoverIndex !== -1;
            if (shouldBeDraggable !== this.isDraggableCursor) {
                if (shouldBeDraggable) {
                    this.canvas.classList.add('draggable');
                } else {
                    this.canvas.classList.remove('draggable');
                }
                this.isDraggableCursor = shouldBeDraggable;
            }
        }
        
        // 🚀 性能优化：放大镜也通过 RAF 渲染
        if (this.magnifierCanvas && this.magnifier.enabled) {
            this._scheduleRender();
        }
    }
    
    /**
     * 处理鼠标抬起事件（结束拖拽）
     * @private
     * @returns {void}
     */
    _handleMouseUp() {
        // 🚀 性能优化：拖拽结束时才触发 _emitChange（而不是每次 mousemove）
        if (this.hasBoundaryChanged) {
            this._emitChange();
            this.hasBoundaryChanged = false;
        }
        
        this.draggingIndex = -1;
        this.draggingValue = null;
    }
    
    /**
     * 处理鼠标离开事件（隐藏放大镜）
     * @private
     * @returns {void}
     */
    _handleMouseLeave() {
        this.magnifier.enabled = false;
        
        // 隐藏放大镜Canvas并清空内容
        if (this.magnifierCanvas && this.magnifier.isActive) {
            this.magnifierCanvas.classList.remove('active');
            this.magnifier.isActive = false;
            if (this.magnifierCtx) {
                this.magnifierCtx.clearRect(0, 0, this.magnifier.size, this.magnifier.size);
            }
        }
        
        // 重置cursor状态
        if (this.isDraggableCursor) {
            this.canvas.classList.remove('draggable');
            this.isDraggableCursor = false;
        }
    }
    
    /**
     * 移动选中的边界线
     * @private
     * @param {number} direction - 移动方向（-1向左，1向右）
     * @param {boolean} isShift - 是否按住Shift键
     * @returns {void}
     */
    _moveBoundary(direction, isShift) {
        if (this.selectedIndex === -1) return;
        
        // 计算步长（按住Shift键时步长为10px，否则为1px）
        const step = isShift ? 10 : 1;
        
        // 获取当前选中的边界线位置
        const currentX = this.boundaries[this.selectedIndex];
        let newX = currentX + (direction * step);
        
        // 限制在可视区域内
        const minX = this.viewportStartX;
        const maxX = this.viewportStartX + this.viewportWidth;
        newX = Math.max(minX, Math.min(maxX, newX));
        
        // 更新位置并重新排序
        this.boundaries[this.selectedIndex] = newX;
        
        // 保存当前选中的线（排序后索引可能变化）
        const selectedX = newX;
        this.boundaries.sort((a, b) => a - b);
        
        // 找回选中的线的新索引
        this.selectedIndex = this.boundaries.indexOf(selectedX);
        
        // 🚀 性能优化：使用 RAF 节流渲染（用户可能按住方向键快速触发）
        this._scheduleRender();
        
        // 立即触发变更事件（键盘微调不需要延迟）
        this._emitChange();
    }
    
    /**
     * 处理右键菜单事件（删除边界线）
     * @private
     * @param {MouseEvent} e - 鼠标事件
     * @returns {void}
     */
    _handleContextMenu(e) {
        e.preventDefault();
        
        // 直接使用逻辑像素坐标（与 _handleMouseMove 保持一致）
        const canvasX = e.offsetX;
        
        // 查找点击的线
        const clickedIndex = this._findBoundaryIndexNear(canvasX);
        
        if (clickedIndex !== -1) {
            // 删除边界线
            this.boundaries.splice(clickedIndex, 1);
            this._render();
            this._emitChange();
        }
    }
    
    /**
     * 处理窗口大小改变事件
     * @private
     * @returns {void}
     */
    _handleResize() {
        // 更新Canvas尺寸
        this._updateCanvasDimensions();
        
        // 重新渲染
        this._render();
    }
    
    /**
     * 🚀 性能优化：调度渲染（使用 requestAnimationFrame 节流）
     * @private
     * @returns {void}
     */
    _scheduleRender() {
        // 如果已有待处理的渲染请求，不重复调度
        if (this.pendingRender) {
            return;
        }
        
        this.pendingRender = true;
        
        this.rafId = requestAnimationFrame(() => {
            // 渲染主Canvas
            this._render();
            
            // 渲染放大镜（如果启用）
            if (this.magnifierCanvas && this.magnifier.enabled) {
                this._drawMagnifier();
            }
            
            // 重置标志
            this.pendingRender = false;
            this.rafId = null;
        });
    }
    
    /**
     * 触发变化事件
     * @private
     * @returns {void}
     */
    _emitChange() {
        // 通过自定义事件通知变化（传递扁平数组格式的边界线数据）
        const event = new CustomEvent('boundarieschange', {
            detail: { boundaries: this.getBoundaries() }  // [x1, x2, x3, x4, ...]
        });
        this.canvas.dispatchEvent(event);
    }
    
    /**
     * 清空所有边界线
     * @returns {void}
     */
    clearAll() {
        if (this.boundaries.length === 0) {
            return;
        }
        
        this.boundaries = [];
        this.hoverIndex = -1;
        this.draggingIndex = -1;
        this.selectedIndex = -1;
        this.draggingValue = null;
        
        this._render();
        this._emitChange();
    }
    
    /**
     * 获取边界线数组（扁平数组格式）
     * @returns {Array<number>} 边界线数组 [x1, x2, x3, x4, ...]
     * @description 返回扁平数组，每张卡片由连续的两条边界线定义：[left1, right1, left2, right2, ...]
     */
    getBoundaries() {
        return [...this.boundaries];
    }
    
    /**
     * 设置边界线数组（用于恢复保存的边界线）
     * @param {Array<number>} boundaries - 边界线数组 [x1, x2, x3, x4, ...]
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误
     */
    setBoundaries(boundaries) {
        // Fail Fast: 验证参数
        if (!Array.isArray(boundaries)) {
            throw new Error('CardBoundaryEditorService.setBoundaries: boundaries must be an array');
        }
        
        // 验证所有元素都是数字
        const allNumbers = boundaries.every(b => typeof b === 'number' && !isNaN(b) && isFinite(b));
        if (!allNumbers) {
            throw new Error('CardBoundaryEditorService.setBoundaries: all boundary values must be valid numbers');
        }
        
        // 设置边界线并排序
        this.boundaries = [...boundaries].sort((a, b) => a - b);
        
        // 重置交互状态
        this.hoverIndex = -1;
        this.draggingIndex = -1;
        this.selectedIndex = -1;
        this.draggingValue = null;
        
        // 重新渲染
        this._render();
        
        // 发出变更事件
        this._emitChange();
    }
    
    /**
     * 获取卡片数量
     * @returns {number} 卡片数量
     */
    getCardCount() {
        return Math.floor(this.boundaries.length / 2);
    }
    
    /**
     * 获取边界线数量
     * @returns {number} 边界线数量
     */
    getBoundaryCount() {
        return this.boundaries.length;
    }
    
    /**
     * 清理编辑器
     * @returns {void}
     */
    destroy() {
        // 🚀 性能优化：取消待处理的 RAF 请求
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
            this.pendingRender = false;
        }
        
        // 取消防抖定时器
        if (this.debouncedResize) {
            this.debouncedResize.cancel();
        }
        
        // 移除Canvas事件监听器
        if (this.canvas) {
            if (this.boundHandlers.click) this.canvas.removeEventListener('click', this.boundHandlers.click);
            if (this.boundHandlers.mousedown) this.canvas.removeEventListener('mousedown', this.boundHandlers.mousedown);
            if (this.boundHandlers.mousemove) this.canvas.removeEventListener('mousemove', this.boundHandlers.mousemove);
            if (this.boundHandlers.mouseup) this.canvas.removeEventListener('mouseup', this.boundHandlers.mouseup);
            if (this.boundHandlers.contextmenu) this.canvas.removeEventListener('contextmenu', this.boundHandlers.contextmenu);
            if (this.boundHandlers.mouseleave) this.canvas.removeEventListener('mouseleave', this.boundHandlers.mouseleave);
        }
        
        // 注销快捷键
        this.keyboardService.unregister('left', this);
        this.keyboardService.unregister('shift+left', this);
        this.keyboardService.unregister('right', this);
        this.keyboardService.unregister('shift+right', this);
        
        // 移除window事件监听器
        if (this.boundHandlers.resize) {
            window.removeEventListener('resize', this.boundHandlers.resize);
        }
        
        // 清空引用
        this.canvas = null;
        this.ctx = null;
        this.magnifierCanvas = null;
        this.magnifierCtx = null;
        this.image = null;
        this.boundaries = [];
        this.boundHandlers = {};
        this.debouncedResize = null;
    }
}


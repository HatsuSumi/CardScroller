/**
 * PerformanceReportPage - 性能监控报告页面服务
 * 管理性能监控报告页面的UI渲染、用户交互处理和实时FPS显示
 * 
 * 职责说明：
 * - 这是一个"页面服务"（Page），管理独立配置页面的内容渲染
 * - 不继承BaseModalService（配置页面不是独立模态框，而是由BubbleMenuService管理的页面内容）
 * - 提供标准接口：renderConfig(), destroy()
 * - 协调子组件：DeviceInfoPanel、ImageInfoPanel、CanvasInfoPanel、PerformanceReportRenderer、MonitorControlPanel、RealtimeFPSMonitor
 * 
 * 当前被使用的模块：
 * - 无（通过BubbleMenuService注册表机制调用，不直接依赖）
 * 
 * 当前依赖的模块：
 * - Prism.js (外部CDN库) - 代码语法高亮库，用于技术实现细节展示
 * - stateManager (core/StateManager.js) - 状态管理器，读取性能监控配置和报告数据 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线，监听状态变化 (通过DI注入)
 * - ppiExtractorService (utils/PPIExtractorService.js) - PPI信息提取服务 (通过DI注入)
 * - validationService (system/ValidationService.js) - 验证服务 (通过DI注入)
 * - transitionFragmentPool (patterns/transition/TransitionFragmentPool.js) - 过渡动画碎片对象池 (通过DI注入)
 * - estimateRefreshRate (helpers/performanceUtils.js) - 刷新率估算工具函数
 * - DeviceInfoPanel (components/performance/DeviceInfoPanel.js) - 设备信息面板组件
 * - ImageInfoPanel (components/performance/ImageInfoPanel.js) - 图片信息面板组件
 * - CanvasInfoPanel (components/performance/CanvasInfoPanel.js) - Canvas信息面板组件
 * - PerformanceReportRenderer (components/performance/PerformanceReportRenderer.js) - 性能报告渲染组件
 * - PerformanceVisualizationPanel (components/performance/PerformanceVisualizationPanel.js) - 性能数据可视化面板组件
 * - MonitorControlPanel (components/performance/MonitorControlPanel.js) - 监控控制面板组件
 * - RealtimeFPSMonitor (components/performance/RealtimeFPSMonitor.js) - 实时FPS监控器组件
 * 
 * 架构说明：
 * - 项目统一架构模式：Page 负责克隆模板、查找元素、传给子组件
 * - 参考 EntryAnimationConfigPage 的架构实现
 * - 子组件只负责业务逻辑，不自己管理DOM创建
 */

import { DeviceInfoPanel } from '../../components/performance/DeviceInfoPanel.js';
import { ImageInfoPanel } from '../../components/performance/ImageInfoPanel.js';
import { CanvasInfoPanel } from '../../components/performance/CanvasInfoPanel.js';
import { PerformanceReportRenderer } from '../../components/performance/PerformanceReportRenderer.js';
import { MonitorControlPanel } from '../../components/performance/MonitorControlPanel.js';
import { RealtimeFPSMonitor } from '../../components/performance/RealtimeFPSMonitor.js';
import { PerformanceVisualizationPanel } from '../../components/performance/PerformanceVisualizationPanel.js';
import { estimateRefreshRate } from '../../helpers/performanceUtils.js';

export class PerformanceReportPage {
    /**
     * 构造函数 - 创建性能监控报告页面服务
     * @param {StateManager} stateManager - 状态管理器
     * @param {EventBus} eventBus - 事件总线
     * @param {ValidationService} validationService - 验证服务，用于验证用户输入
     * @param {PPIExtractorService} ppiExtractorService - PPI信息提取服务
     * @param {TransitionFragmentPool} transitionFragmentPool - 过渡动画对象池
     * @throws {Error} 当依赖缺失时立即抛出错误
     */
    constructor(stateManager, eventBus, validationService, ppiExtractorService, transitionFragmentPool) {
        if (!stateManager) {
            throw new Error('PerformanceReportPage requires stateManager dependency');
        }
        if (!eventBus) {
            throw new Error('PerformanceReportPage requires eventBus dependency');
        }
        if (!validationService) {
            throw new Error('PerformanceReportPage requires validationService dependency');
        }
        if (!ppiExtractorService) {
            throw new Error('PerformanceReportPage requires ppiExtractorService dependency');
        }
        if (!transitionFragmentPool) {
            throw new Error('PerformanceReportPage requires transitionFragmentPool dependency');
        }
        
        this.stateManager = stateManager;
        this.eventBus = eventBus;
        this.validationService = validationService;
        this.ppiExtractorService = ppiExtractorService;
        this.transitionFragmentPool = transitionFragmentPool;
        
        // 当前渲染的容器引用
        this.currentContainer = null;
        
        // HTML Template引用
        this.template = null;
        
        // DOM元素引用
        this.elements = {}; 
        
        // 子组件实例
        this.deviceInfoPanel = new DeviceInfoPanel();
        this.imageInfoPanel = new ImageInfoPanel(ppiExtractorService);
        this.canvasInfoPanel = new CanvasInfoPanel();
        this.reportRenderer = new PerformanceReportRenderer();
        this.controlPanel = new MonitorControlPanel();
        this.realtimeFPSMonitor = new RealtimeFPSMonitor();
        this.visualizationPanel = null; // 延迟创建，需要容器元素
        
        // 视图切换状态
        this.currentView = 'report'; // 'report' | 'visualization'
        this.isTransitioning = false; // 防止过渡动画期间重复触发
        
        // DOM事件处理函数引用（用于清理）
        this.domEventHandlers = {};
        
        // EventBus事件处理函数引用
        // 分为两类：全局功能事件（不解绑） + 页面UI事件（需解绑）
        this.eventBusHandlers = {
            global: {},  // 全局功能事件（实时FPS监控、刷新率估算）
            page: {}     // 页面UI事件（更新页面显示）
        };
        
        // 绑定全局功能事件（在构造函数中绑定，不解绑）
        // 确保即使用户未打开页面，实时FPS监控也能正常工作
        this._bindGlobalEvents();
    }
    
    /**
     * 渲染性能监控页面
     * @param {HTMLElement} container - 页面容器元素
     * @returns {void}
     * @throws {Error} 当容器无效或模板不存在时立即抛出错误
     */
    renderConfig(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('PerformanceReportPage.renderConfig: container must be a valid HTMLElement');
        }
        
        // 保存容器引用
        this.currentContainer = container;
        
        // 获取HTML Template
        this.template = document.getElementById('performance-report-page-template');
        if (!this.template) {
            throw new Error('PerformanceReportPage.renderConfig: template #performance-report-page-template not found');
        }
        
        // 验证template.content
        if (!this.template.content) {
            throw new Error('PerformanceReportPage.renderConfig: template.content is undefined, ensure #performance-report-page-template is a <template> element');
        }
        
        // 克隆模板并添加到容器（容器已在destroy()中清空）
        const clone = this.template.content.cloneNode(true);
        container.appendChild(clone);
        
        // 设置DOM引用
        this._setupDOMReferences(container);
        
        // 初始化子组件
        this._initComponents();
        
        // 初始化SVG边框跑马灯动画
        this._initBorderMarqueeAnimations(container);
        
        // 绑定页面UI事件（页面打开时绑定，关闭时解绑）
        this._bindPageEvents();
        
        // 绑定DOM事件
        this._bindDOMEvents();
        
        // 渲染初始状态
        this._renderInitialState();
        
        // 启用实时视口更新
        this.deviceInfoPanel.enableRealtimeViewportUpdate();
    }
    
    /**
     * 设置DOM元素引用（只查找父组件直接使用的元素）
     * @param {HTMLElement} container - 容器元素
     * @returns {void}
     * @throws {Error} 当关键DOM元素不存在时立即抛出错误
     * @private
     */
    _setupDOMReferences(container) {
        // 技术实现section
        this.elements.techSection = this._requireElement(container, '.tech-implementation-section');
        this.elements.techTitle = this._requireElement(container, '.tech-implementation-section .collapsible-title');
        
        // 视图切换相关元素
        this.elements.viewMoreBtn = this._requireElement(container, '#viewMoreBtn');
        // 可视化视图在body根层级（不在模板内），使用document查找
        this.elements.backToReportBtn = this._requireElement(document, '#backToReportBtn');
        this.elements.visualizationView = this._requireElement(document, '#performance-visualization-view');
    }
    
    /**
     * 辅助方法：查找必需元素（Fail Fast）
     * @param {HTMLElement} container - 容器元素
     * @param {string} selector - CSS选择器
     * @returns {HTMLElement} 找到的元素
     * @throws {Error} 当元素不存在时立即抛出错误
     * @private
     */
    _requireElement(container, selector) {
        const element = container.querySelector(selector);
        if (!element) {
            throw new Error(`PerformanceReportPage._requireElement: required element "${selector}" not found`);
        }
        return element;
    }
    
    /**
     * 初始化子组件（统一架构：传整个页面容器，子组件自己查找元素）
     * @returns {void}
     * @private
     */
    _initComponents() {
        // 统一架构：传整个页面容器，子组件自己知道需要什么元素
        this.deviceInfoPanel.init(this.currentContainer);
        this.imageInfoPanel.init(this.currentContainer);
        this.canvasInfoPanel.init(this.currentContainer);
        this.reportRenderer.init(this.currentContainer);
        this.controlPanel.init(this.currentContainer);
        
        // 初始化实时FPS监控器（全局共享）
        this.realtimeFPSMonitor.init();
    }
    
    /**
     * 初始化SVG边框跑马灯动画
     * 为每个.performance-section容器添加SVG边框跑马灯动画
     * @param {HTMLElement} container - 页面容器
     * @returns {void}
     * @private
     */
    _initBorderMarqueeAnimations(container) {
        // 6种颜色序列（每个容器从不同颜色开始，让动画错开）
        const colorSequences = [
            ['#3b82f6', '#10b981', '#a855f7', '#f97316', '#ef4444', '#06b6d4'],  // 从蓝色开始
            ['#10b981', '#a855f7', '#f97316', '#ef4444', '#06b6d4', '#3b82f6'],  // 从绿色开始
            ['#a855f7', '#f97316', '#ef4444', '#06b6d4', '#3b82f6', '#10b981'],  // 从紫色开始
            ['#f97316', '#ef4444', '#06b6d4', '#3b82f6', '#10b981', '#a855f7'],  // 从橙色开始
            ['#ef4444', '#06b6d4', '#3b82f6', '#10b981', '#a855f7', '#f97316'],  // 从红色开始
            ['#06b6d4', '#3b82f6', '#10b981', '#a855f7', '#f97316', '#ef4444']   // 从青色开始
        ];
        
        // 查找所有.performance-section容器
        const sections = container.querySelectorAll('.performance-section');
        
        sections.forEach((section, index) => {
            // 为每个容器创建SVG边框跑马灯（使用对应的颜色序列）
            const colors = colorSequences[index % colorSequences.length];
            // 容器1,3,5顺时针，容器2,4,6逆时针
            const isClockwise = index % 2 === 0;
            const svg = this._createBorderMarqueeSVG(colors, index, isClockwise);
            
            // 将SVG插入到容器的第一个位置
            section.insertBefore(svg, section.firstChild);
        });
    }
    
    /**
     * 创建单个边框跑马灯SVG元素
     * @param {string[]} colors - 跑马灯颜色序列（十六进制格式数组）
     * @param {number} index - 容器索引（用于生成唯一ID）
     * @param {boolean} isClockwise - 是否顺时针方向
     * @returns {SVGElement} SVG元素
     * @private
     */
    _createBorderMarqueeSVG(colors, index, isClockwise) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('performance-section-border-marquee');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        
        // 创建<defs>定义
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        
        // 创建发光滤镜（动态颜色）
        const filterId = `border-marquee-glow-${index}`;
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', filterId);
        
        const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
        blur.setAttribute('stdDeviation', '0.8');
        blur.setAttribute('result', 'blur');
        
        const flood = document.createElementNS('http://www.w3.org/2000/svg', 'feFlood');
        flood.setAttribute('flood-color', colors[0]);
        flood.setAttribute('flood-opacity', '0.6');
        
        const composite = document.createElementNS('http://www.w3.org/2000/svg', 'feComposite');
        composite.setAttribute('in2', 'blur');
        composite.setAttribute('operator', 'in');
        
        const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
        const mergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
        const mergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
        mergeNode2.setAttribute('in', 'SourceGraphic');
        
        merge.appendChild(mergeNode1);
        merge.appendChild(mergeNode2);
        
        filter.appendChild(blur);
        filter.appendChild(flood);
        filter.appendChild(composite);
        filter.appendChild(merge);
        
        // 发光颜色动画
        const floodColorAnimate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        floodColorAnimate.setAttribute('attributeName', 'flood-color');
        floodColorAnimate.setAttribute('values', colors.join(';') + ';' + colors[0]);
        floodColorAnimate.setAttribute('dur', '10s');
        floodColorAnimate.setAttribute('repeatCount', 'indefinite');
        flood.appendChild(floodColorAnimate);
        
        defs.appendChild(filter);
        svg.appendChild(defs);
        
        // 创建路径元素
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M 1,1 L 99,1 L 99,99 L 1,99 Z');
        path.setAttribute('stroke', colors[0]);
        path.setAttribute('stroke-width', '0.6');
        path.setAttribute('fill', 'none');
        path.setAttribute('filter', `url(#${filterId})`);
        path.setAttribute('pathLength', '100');
        path.setAttribute('stroke-dasharray', '10 90');
        path.setAttribute('stroke-dashoffset', '0');
        path.setAttribute('stroke-linecap', 'round');
        
        // 位置动画（负数=顺时针，正数=逆时针）
        const offsetAnimate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        offsetAnimate.setAttribute('attributeName', 'stroke-dashoffset');
        offsetAnimate.setAttribute('from', '0');
        offsetAnimate.setAttribute('to', isClockwise ? '-100' : '100');
        offsetAnimate.setAttribute('dur', '10s');
        offsetAnimate.setAttribute('repeatCount', 'indefinite');
        
        // 颜色动画
        const colorAnimate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        colorAnimate.setAttribute('attributeName', 'stroke');
        colorAnimate.setAttribute('values', colors.join(';') + ';' + colors[0]);
        colorAnimate.setAttribute('dur', '10s');
        colorAnimate.setAttribute('repeatCount', 'indefinite');
        
        path.appendChild(offsetAnimate);
        path.appendChild(colorAnimate);
        svg.appendChild(path);
        
        return svg;
    }
    
    /**
     * 绑定全局功能事件（在constructor中调用一次，不解绑）
     * 这些事件用于实时FPS监控和刷新率估算，需要在后台持续监听
     * 即使用户未打开性能监控页面，实时FPS浮动窗口也能正常工作
     * @returns {void}
     * @private
     */
    _bindGlobalEvents() {
        // 保存bind()后的函数引用
        this.eventBusHandlers.global.realtimeFPS = this._handleRealtimeFPS.bind(this);
        this.eventBusHandlers.global.firstPlay = this._handleFirstPlay.bind(this);
        this.eventBusHandlers.global.playbackStarted = this._handlePlaybackStarted.bind(this);
        this.eventBusHandlers.global.playbackReset = this._handlePlaybackReset.bind(this);
        
        // 监听实时FPS更新（用于更新浮动窗口）
        this.eventBus.on('performance:realtime:fps', this.eventBusHandlers.global.realtimeFPS);
        
        // 监听首次播放事件，开始估算刷新率（Fail Fast：播放时才估算）
        this.eventBus.on('playback:first-play', this.eventBusHandlers.global.firstPlay);
        
        // 监听播放状态变化，控制实时FPS显示（只在播放时显示）
        this.eventBus.on('entry-animation:started', this.eventBusHandlers.global.playbackStarted);
        this.eventBus.on('scroll:play-started', this.eventBusHandlers.global.playbackStarted);
        this.eventBus.on('scroll:reset', this.eventBusHandlers.global.playbackReset);
    }
    
    /**
     * 绑定页面UI事件（在renderConfig中调用，页面打开时绑定）
     * 这些事件用于更新页面显示，只在页面打开时需要
     * @returns {void}
     * @private
     */
    _bindPageEvents() {
        // 保存bind()后的函数引用（每次bind()都返回新函数，必须保存以便off()）
        this.eventBusHandlers.page.reportUpdated = this._handleReportUpdated.bind(this);
        this.eventBusHandlers.page.imageInfoUpdated = this._handleImageInfoUpdated.bind(this);
        
        // 监听性能报告更新（用于渲染报告到页面）
        this.eventBus.on('performance:report:updated', this.eventBusHandlers.page.reportUpdated);
        
        // 监听图片信息更新事件，实时更新图片信息面板（上传/配置导入/替换图片）
        this.eventBus.on('image:info-updated', this.eventBusHandlers.page.imageInfoUpdated);
    }
    
    /**
     * 解绑页面UI事件（在destroy中调用，页面关闭时解绑）
     * 防止重复绑定和内存泄漏
     * 注意：全局功能事件不解绑，确保实时FPS监控持续工作
     * @returns {void}
     * @private
     */
    _unbindPageEvents() {
        // 解绑页面UI事件监听器
        if (this.eventBusHandlers.page.reportUpdated) {
            this.eventBus.off('performance:report:updated', this.eventBusHandlers.page.reportUpdated);
        }
        if (this.eventBusHandlers.page.imageInfoUpdated) {
            this.eventBus.off('image:info-updated', this.eventBusHandlers.page.imageInfoUpdated);
        }
        
        // 清空页面UI事件处理函数引用
        this.eventBusHandlers.page = {};
    }
    
    /**
     * 绑定DOM事件（在renderConfig中调用，每次渲染时绑定）
     * @returns {void}
     * @private
     */
    _bindDOMEvents() {
        // 保存DOM事件处理函数引用
        this.domEventHandlers.monitorToggle = (e) => {
            this._handleMonitorToggle(e.detail);
        };
        this.domEventHandlers.realtimeFpsToggle = (e) => {
            this._handleRealtimeFPSToggle(e.detail);
        };
        this.domEventHandlers.refreshrateChange = (e) => {
            this._handleRefreshRateChange(e.detail);
        };
        this.domEventHandlers.commandCopySuccess = (e) => {
            // Fail Fast: 要求事件必须包含 detail.targetId
            if (!e.detail || !e.detail.targetId) {
                throw new Error('PerformanceReportPage.commandCopySuccess: e.detail.targetId is required');
            }
            
            const targetId = e.detail.targetId;
            let message = '命令已复制到剪贴板。';
            
            // 根据 targetId 确定命令类型
            if (targetId === 'windowsRefreshRateCommand') {
                message = 'PowerShell命令已复制到剪贴板。';
            } else if (targetId === 'windowsRefreshRateCommandWmic') {
                message = 'CMD命令已复制到剪贴板。';
            } else if (targetId === 'macRefreshRateCommand') {
                message = 'macOS命令已复制到剪贴板。';
            } else if (targetId === 'linuxRefreshRateCommand') {
                message = 'Linux命令已复制到剪贴板。';
            }
            
            this.eventBus.emit('ui:show-success-message', {
                message: message
            });
        };
        this.domEventHandlers.commandCopyFailed = (e) => {
            // 检查错误消息是否已经是 HTML 格式（以 < 开头）
            const errorMessage = e.detail.error;
            const isHtmlError = typeof errorMessage === 'string' && errorMessage.trim().startsWith('<');
            
            this.eventBus.emit('ui:show-validation-error', {
                message: isHtmlError ? errorMessage : `复制失败：${errorMessage}`,
                options: {
                    title: '复制失败',
                    shortMessage: '复制失败。'
                }
            });
        };
        this.domEventHandlers.techSectionToggle = () => {
            this._toggleTechSection();
        };
        this.domEventHandlers.viewMoreClick = () => {
            this._switchToVisualization();
        };
        this.domEventHandlers.backToReportClick = () => {
            this._switchToReport();
        };
        
        // 监听子组件发出的冒泡 CustomEvent
        this.currentContainer.addEventListener('monitor-toggle', this.domEventHandlers.monitorToggle);
        this.currentContainer.addEventListener('realtime-fps-toggle', this.domEventHandlers.realtimeFpsToggle);
        this.currentContainer.addEventListener('refreshrate-change', this.domEventHandlers.refreshrateChange);
        this.currentContainer.addEventListener('command-copy-success', this.domEventHandlers.commandCopySuccess);
        this.currentContainer.addEventListener('command-copy-failed', this.domEventHandlers.commandCopyFailed);
        
        // 监听技术实现section的点击事件
        this.elements.techTitle.addEventListener('click', this.domEventHandlers.techSectionToggle);
        
        // 监听视图切换按钮点击事件
        this.elements.viewMoreBtn.addEventListener('click', this.domEventHandlers.viewMoreClick);
        this.elements.backToReportBtn.addEventListener('click', this.domEventHandlers.backToReportClick);
    }
    
    /**
     * 渲染初始状态
     * @returns {void}
     * @private
     */
    _renderInitialState() {
        const performancePrefs = this.stateManager.state.preferences.performance;
        const performanceState = this.stateManager.state.debug.performance;
        const estimatedRefreshRate = performanceState.estimatedRefreshRate || null;
        const userRefreshRate = performancePrefs.userRefreshRate || null;
        
        // 渲染设备信息（优先使用用户设置的刷新率，否则使用估算值）
        this.deviceInfoPanel.render(estimatedRefreshRate, userRefreshRate);
        
        // 渲染图片信息（从PPIExtractorService读取PPI，与ConfigService保持一致）
        const imageMetadata = this.stateManager.state.content.image.metadata;
        const ppiInfo = this.ppiExtractorService.currentPPIInfo;
        this.imageInfoPanel.render(imageMetadata, ppiInfo);
        
        // 渲染Canvas信息
        this.canvasInfoPanel.render();
        
        // 渲染性能报告
        const hasReport = performanceState.lastReport && performanceState.lastReport.timestamp;
        if (hasReport) {
            // 确定使用哪个刷新率（优先级：用户设置 > 估算值）
            // Fail Fast：如果没有当前刷新率，跳过报告渲染
            const reportRefreshRate = userRefreshRate || estimatedRefreshRate;
            if (reportRefreshRate) {
                this.reportRenderer.render(performanceState.lastReport, reportRefreshRate);
                // 有报告数据时显示"查看更多"按钮
                this.elements.viewMoreBtn.parentElement.classList.remove('hidden');
            }
        } else {
            // 无报告数据时只隐藏"查看更多"按钮（reportRenderer会保持空状态显示）
            this.elements.viewMoreBtn.parentElement.classList.add('hidden');
        }
        
        // 更新监控控制面板状态
        this.controlPanel.updateState(performancePrefs.enabled, performancePrefs.showRealtimeFPS);
        
        // 注意：不在初始化时显示实时FPS浮动窗口
        // 只有播放时才显示（由播放状态事件控制）
        // 确保初始化时浮动窗口是隐藏的
        this.realtimeFPSMonitor.hide();
        
        // 更新实时FPS监控器的刷新率（优先级：用户设置 > 估算值）
        const refreshRateForMonitor = userRefreshRate || estimatedRefreshRate;
        if (refreshRateForMonitor) {
            this.realtimeFPSMonitor.updateRefreshRate(refreshRateForMonitor);
        }
    }
    
    /**
     * 处理性能报告更新事件
     * @param {Object} data - 事件数据
     * @param {Object} data.report - 性能报告数据
     * @returns {void}
     * @private
     */
    _handleReportUpdated(data) {
        if (!data || !data.report) {
            return;
        }
        
        // 如果页面还没渲染，跳过（无法访问DOM元素）
        if (!this.currentContainer) {
            return;
        }
        
        // 确定使用哪个刷新率（优先级：用户设置 > 估算值）
        const userRefreshRate = this.stateManager.state.preferences.performance.userRefreshRate;
        const estimatedRefreshRate = this.stateManager.state.debug.performance.estimatedRefreshRate;
        const refreshRate = userRefreshRate || estimatedRefreshRate;
        
        // Fail Fast：如果没有当前刷新率，跳过报告渲染
        if (refreshRate) {
            this.reportRenderer.render(data.report, refreshRate);
            // 有新报告时显示"查看更多"按钮
            this.elements.viewMoreBtn.parentElement.classList.remove('hidden');
        }
    }
    
    /**
     * 处理实时FPS更新事件
     * @param {Object} data - 事件数据
     * @param {number} data.fps - 当前FPS
     * @param {number} data.avgFPS - 平均FPS
     * @returns {void}
     * @private
     */
    _handleRealtimeFPS(data) {
        // Fail Fast: 验证数据
        if (!data || typeof data.fps !== 'number' || typeof data.avgFPS !== 'number') {
            return;
        }
        
        // 直接调用 update()，组件内部会处理"正在估算刷新率..."期间的跳过逻辑
        this.realtimeFPSMonitor.update(data.fps, data.avgFPS);
    }
    
    /**
     * 处理监控开关切换
     * @param {Object} detail - 事件详情
     * @param {boolean} detail.enabled - 是否启用监控
     * @returns {void}
     * @private
     */
    _handleMonitorToggle(detail) {
        this.stateManager.state.preferences.performance.enabled = detail.enabled;
        
        // 如果页面还没渲染，只更新state即可（无法访问DOM元素）
        if (!this.currentContainer) {
            return;
        }
        
        this.controlPanel.updateState(detail.enabled, this.stateManager.state.preferences.performance.showRealtimeFPS);
    }
    
    /**
     * 处理实时FPS显示开关切换
     * @param {Object} detail - 事件详情
     * @param {boolean} detail.showRealtimeFPS - 是否显示实时FPS
     * @returns {void}
     * @private
     */
    _handleRealtimeFPSToggle(detail) {
        this.stateManager.state.preferences.performance.showRealtimeFPS = detail.showRealtimeFPS;
        
        // 注意：不立即显示/隐藏浮动窗口
        // 只有播放时才显示，静置时隐藏（由播放状态事件控制）
        // 如果关闭开关，则立即隐藏（即使正在播放）
        if (!detail.showRealtimeFPS) {
            this.realtimeFPSMonitor.hide();
        }
    }
    
    /**
     * 处理播放开始事件（入场动画或滚动动画开始）
     * @returns {void}
     * @private
     */
    _handlePlaybackStarted() {
        // 只有当开关打开时，才显示实时FPS
        const showRealtimeFPS = this.stateManager.state.preferences.performance.showRealtimeFPS;
        if (!showRealtimeFPS) {
            return;
        }
        
        // 确保实时FPS监控器已初始化（如果用户没有打开性能监控页面）
        this._ensureRealtimeFPSMonitorInitialized();
        
        // 检查刷新率是否已估算完成
        const userRefreshRate = this.stateManager.state.preferences.performance.userRefreshRate;
        const estimatedRefreshRate = this.stateManager.state.debug.performance.estimatedRefreshRate;
        const hasValidRefreshRate = userRefreshRate || estimatedRefreshRate;
        
        if (hasValidRefreshRate) {
            // 刷新率已就绪，显示正常FPS
            this.realtimeFPSMonitor.show();
        } else {
            // 刷新率未就绪，显示"正在估算刷新率..."（立即反馈，用户体验更好）
            this.realtimeFPSMonitor.showEstimating();
        }
    }
    
    /**
     * 处理重置事件（用户点击重置按钮）
     * @returns {void}
     * @private
     */
    _handlePlaybackReset() {
        // 重置时隐藏实时FPS浮动窗口
        this.realtimeFPSMonitor.hide();
    }
    
    /**
     * 确保实时FPS监控器已初始化
     * 如果监控器未初始化（用户没有打开性能监控页面），则立即初始化
     * @returns {void}
     * @private
     */
    _ensureRealtimeFPSMonitorInitialized() {
        if (!this.realtimeFPSMonitor.container) {
            // 监控器未初始化，立即初始化（不传refreshRate，稍后通过updateRefreshRate设置）
            this.realtimeFPSMonitor.init();
            
            // 初始化后，如果有用户设置的刷新率或估算的刷新率，立即更新
            const userRefreshRate = this.stateManager.state.preferences.performance.userRefreshRate;
            const estimatedRefreshRate = this.stateManager.state.debug.performance.estimatedRefreshRate;
            const refreshRate = userRefreshRate || estimatedRefreshRate;
            if (refreshRate) {
                this.realtimeFPSMonitor.updateRefreshRate(refreshRate);
            }
        }
    }
    
    /**
     * 处理首次播放事件，开始估算刷新率
     * 
     * 策略（Fail Fast）：
     * 1. 用户播放动画时才开始估算刷新率（延迟估算，需要时才计算）
     * 2. 估算期间（约16ms），实时FPS暂不显示（_handlePlaybackStarted 会检查刷新率是否就绪）
     * 3. 估算完成后，如果正在播放且开关打开，自动显示实时FPS（颜色从显示那一刻起就准确）
     * 
     * @returns {Promise<void>}
     * @private
     */
    async _handleFirstPlay() {
        // 确保实时FPS监控器已初始化（如果用户没有打开性能监控页面）
        this._ensureRealtimeFPSMonitorInitialized();
        
        // 如果用户已手动设置刷新率，跳过估算
        const userRefreshRate = this.stateManager.state.preferences.performance.userRefreshRate;
        if (userRefreshRate) {
            return;
        }
        
        // 如果已有估算值（从配置恢复），跳过
        const existingEstimate = this.stateManager.state.debug.performance.estimatedRefreshRate;
        if (existingEstimate) {
            return;
        }
        
        try {
            // 开始估算刷新率（约2秒）
            const estimatedRefreshRate = await estimateRefreshRate();
            
            // 保存估算结果到 state
            this.stateManager.state.debug.performance.estimatedRefreshRate = estimatedRefreshRate;
            
            // 更新实时FPS监控器的刷新率
            this.realtimeFPSMonitor.updateRefreshRate(estimatedRefreshRate);
            
            // 如果页面已渲染，更新设备信息面板显示
            if (this.currentContainer) {
                this.deviceInfoPanel.render(estimatedRefreshRate, userRefreshRate);
            }
            
            // 估算完成后，如果正在播放且开关打开，自动显示实时FPS
            const showRealtimeFPS = this.stateManager.state.preferences.performance.showRealtimeFPS;
            const isPlaying = this.stateManager.state.playback.scroll.isPlaying;
            if (showRealtimeFPS && isPlaying) {
                this.realtimeFPSMonitor.show();
            }
        } catch (error) {
            console.error('Failed to estimate refresh rate during first play:', error);
            // 估算失败，refreshRate保持为null（Fail Fast：实时FPS不会显示）
        }
    }
    
    /**
     * 处理用户手动设置刷新率
     * 
     * 使用 ValidationService 验证用户输入，验证失败时显示错误提示
     * 
     * @param {Object} detail - 事件详情
     * @param {string|number} detail.refreshRate - 用户输入的刷新率值
     * @returns {void}
     * @private
     */
    _handleRefreshRateChange(detail) {
        // 使用 ValidationService 验证刷新率
        const validation = this.validationService.validateRefreshRate(detail.refreshRate);
        
        if (!validation.isValid) {
            // 验证失败，显示错误提示
            const errorHtml = validation.errors.map(err => `<p>${err}</p>`).join('');
            this.eventBus.emit('ui:show-validation-error', {
                message: errorHtml,
                options: {
                    title: '输入无效',
                    shortMessage: '刷新率验证失败。'
                }
            });
            return;
        }
        
        // 验证通过，解析为整数并保存
        const refreshRate = parseInt(detail.refreshRate, 10);
        this.stateManager.state.preferences.performance.userRefreshRate = refreshRate;
        this.realtimeFPSMonitor.updateRefreshRate(refreshRate);
        
        // 重新渲染设备信息（用户手动设置了刷新率，估算值使用null）
        this.deviceInfoPanel.render(null, refreshRate);
        
        // 如果有有效报告（timestamp不为null），重新渲染（使用新刷新率）
        const lastReport = this.stateManager.state.debug.performance.lastReport;
        if (lastReport && lastReport.timestamp) {
            this.reportRenderer.render(lastReport, refreshRate);
        }
    }
    
    /**
     * 处理图片信息更新事件（上传/配置导入）
     * 当用户上传新图片或导入配置时，自动更新图片信息面板
     * @param {Object} _data - 事件数据 {imageData, fileData, ppiInfo}（未使用，PPI从PPIExtractorService读取）
     * @returns {void}
     * @private
     * @throws {Error} 当图片元数据不存在时立即抛出错误
     */
    _handleImageInfoUpdated(_data) {
        // 如果页面还没渲染，跳过（无法访问DOM元素）
        if (!this.currentContainer) {
            return;
        }
        
        const imageMetadata = this.stateManager.state.content.image.metadata;
        
        // Fail Fast: 事件触发时图片元数据必须存在
        if (!imageMetadata) {
            throw new Error('PerformanceReportPage._handleImageInfoUpdated: imageMetadata is required when image:info-updated event is emitted');
        }
        
        // 从PPIExtractorService读取PPI信息（与ConfigService保持一致）
        const ppiInfo = this.ppiExtractorService.currentPPIInfo;
        this.imageInfoPanel.render(imageMetadata, ppiInfo);
    }
    
    /**
     * 切换技术实现section的折叠/展开状态
     * @returns {void}
     * @private
     */
    _toggleTechSection() {
        this.elements.techSection.classList.toggle('collapsed');
        
        // 触发 Prism.js 代码高亮（展开时）
        if (!this.elements.techSection.classList.contains('collapsed')) {
            // 延迟执行，确保内容已完全展开
            requestAnimationFrame(() => {
                if (window.Prism) {
                    window.Prism.highlightAllUnder(this.elements.techSection);
                }
            });
        }
    }
    
    /**
     * 切换到数据可视化视图
     * @returns {Promise<void>}
     * @private
     */
    async _switchToVisualization() {
        if (this.isTransitioning || this.currentView === 'visualization') return;
        
        const reportData = this.stateManager.state.debug.performance.lastReport;
        if (!reportData || (!reportData.entryAnimation && !reportData.scrollAnimation)) {
            return;
        }
        
        this.isTransitioning = true;
        this.elements.viewMoreBtn.disabled = true;
        
        try {
            // 1. 准备可视化面板
            if (!this.visualizationPanel) {
                this.visualizationPanel = new PerformanceVisualizationPanel(
                    this.elements.visualizationView
                );
            }
            
            // 获取当前刷新率（优先级：用户设置 > 估算值）
            const userRefreshRate = this.stateManager.state.preferences.performance.userRefreshRate;
            const estimatedRefreshRate = this.stateManager.state.debug.performance.estimatedRefreshRate;
            const refreshRate = userRefreshRate || estimatedRefreshRate;
            
            // 2. 先在后台显示可视化视图并渲染图表（使用visibility-hidden让元素存在但不可见，ECharts可以正确计算尺寸）
            this.elements.visualizationView.classList.add('visibility-hidden');
            this.elements.visualizationView.classList.remove('hidden');
            this.visualizationPanel.renderCharts(reportData, refreshRate);
            
            // 3. 播放遮罩动画
            await this._gridMaskTransition('out');
            
            // 4. 动画结束后移除visibility-hidden（此时已经完全显示）
            this.elements.visualizationView.classList.remove('visibility-hidden');
            
            this.currentView = 'visualization';
        } catch (error) {
            console.error('Failed to switch to visualization:', error);
        } finally {
            this.elements.viewMoreBtn.disabled = false;
            this.isTransitioning = false;
        }
    }
    
    /**
     * 切换回报告视图
     * @returns {Promise<void>}
     * @private
     */
    async _switchToReport() {
        if (this.isTransitioning || this.currentView === 'report') return;
        
        this.isTransitioning = true;
        this.elements.backToReportBtn.disabled = true;
        
        try {
            // 播放网格遮罩动画并切换回报告视图
            await this._gridMaskTransition('in');
            
            this.currentView = 'report';
        } catch (error) {
            console.error('Failed to switch to report:', error);
        } finally {
            this.elements.backToReportBtn.disabled = false;
            this.isTransitioning = false;
        }
    }
    
    /**
     * 网格遮罩转场动画
     * @param {string} direction - 'out'(去可视化) 或 'in'(返回报告)
     * @returns {Promise<void>}
     * @private
     */
    async _gridMaskTransition(direction) {
        // 设置转场状态，快捷键handler将检查此状态并给出提示
        this.stateManager.state.ui.isTransitioning = true;
        
        // 借用元素（对象池已在应用启动时初始化）
        const containers = this.transitionFragmentPool.borrow('mask-container');
        const tiles = this.transitionFragmentPool.borrow('mask-tile');
        
        if (containers.length === 0 || tiles.length === 0) {
            console.warn('[网格遮罩] TransitionFragmentPool is empty, skipping animation');
            this.stateManager.state.ui.isTransitioning = false; // 清除转场状态
            return;
        }
        
        const container = containers[0];
        document.body.appendChild(container);
        
        // 强制重排以确保容器尺寸计算完成（CSS已定义为全屏）
        void container.offsetHeight;
        
        // 创建8x8网格
        const gridSize = 8;
        const tileWidth = container.clientWidth / gridSize;
        const tileHeight = container.clientHeight / gridSize;
        
        // 创建网格方块
        for (let i = 0; i < gridSize * gridSize; i++) {
            const tile = tiles[i];
            const row = Math.floor(i / gridSize);
            const col = i % gridSize;
            
            // 设置方块位置和尺寸（动态定位例外）
            tile.style.left = `${col * tileWidth}px`;
            tile.style.top = `${row * tileHeight}px`;
            tile.style.width = `${tileWidth}px`;
            tile.style.height = `${tileHeight}px`;
            
            // 设置动画延迟（使用CSS变量）
            const delay = (row + col) * 0.05;
            tile.style.setProperty('--animation-delay', `${delay}s`);
            
            container.appendChild(tile);
        }
        
        // 根据方向添加对应的CSS类名并触发动画
        const animationClass = direction === 'out' ? 'mask-tile-fade-out' : 'mask-tile-fade-in';
        tiles.forEach(tile => tile.classList.add(animationClass));
        
        // 强制重排以触发CSS动画
        void container.offsetHeight;
        
        // 切换视图的时机（两个方向都在方块完全遮住时切换visibility）
        setTimeout(() => {
            if (direction === 'out') {
                // 去可视化：在方块完全遮住时让可视化视图真正可见
                this.elements.visualizationView.classList.remove('visibility-hidden');
            } else {
                // 返回报告：在方块完全遮住时隐藏可视化视图
                this.elements.visualizationView.classList.add('hidden');
            }
        }, 600); // 等待淡入阶段完成（0.8s * 40% + 最大延迟0.7s的一半）
        
        // 等待动画完成（从CSS变量读取时长）
        const computedStyle = getComputedStyle(document.documentElement);
        const variableName = direction === 'out' ? '--mask-tile-fade-out-duration' : '--mask-tile-fade-in-duration';
        const duration = parseFloat(
            computedStyle.getPropertyValue(variableName)
        ) * 1000;
        const maxDelay = (gridSize - 1 + gridSize - 1) * 0.05 * 1000; // 最大延迟
        const totalDuration = duration + maxDelay;
        
        await new Promise(resolve => {
            setTimeout(() => {
                // 清理
                tiles.forEach(tile => tile.classList.remove(animationClass));
                container.innerHTML = '';
                document.body.removeChild(container);
                this.transitionFragmentPool.return('mask-container', containers);
                this.transitionFragmentPool.return('mask-tile', tiles);
                
                // 动画完成，清除转场状态
                this.stateManager.state.ui.isTransitioning = false;
                
                resolve();
            }, totalDuration);
        });
    }
    
    /**
     * 销毁页面
     * @returns {void}
     */
    destroy() {
        // 移除DOM事件监听器（Fail Fast：如果为null说明destroy调用时机错误）
        this.currentContainer.removeEventListener('monitor-toggle', this.domEventHandlers.monitorToggle);
        this.currentContainer.removeEventListener('realtime-fps-toggle', this.domEventHandlers.realtimeFpsToggle);
        this.currentContainer.removeEventListener('refreshrate-change', this.domEventHandlers.refreshrateChange);
        this.currentContainer.removeEventListener('command-copy-success', this.domEventHandlers.commandCopySuccess);
        this.currentContainer.removeEventListener('command-copy-failed', this.domEventHandlers.commandCopyFailed);
        
        // 移除技术实现section的点击事件监听器
        this.elements.techTitle.removeEventListener('click', this.domEventHandlers.techSectionToggle);
        
        // 移除视图切换按钮的点击事件监听器
        this.elements.viewMoreBtn.removeEventListener('click', this.domEventHandlers.viewMoreClick);
        this.elements.backToReportBtn.removeEventListener('click', this.domEventHandlers.backToReportClick);
        
        // 清空DOM事件处理函数引用
        this.domEventHandlers = {};
        
        // 销毁可视化面板（按需创建的可选组件，保留if判断）
        if (this.visualizationPanel) {
            this.visualizationPanel.destroy();
            this.visualizationPanel = null;
        }
        
        // 解绑页面UI事件（页面关闭时解绑，防止重复绑定和内存泄漏）
        // 注意：全局功能事件不解绑，确保实时FPS监控持续工作
        this._unbindPageEvents();
        
        // 销毁子组件（Fail Fast：如果为null说明初始化有问题）
        this.deviceInfoPanel.destroy();
        this.imageInfoPanel.destroy();
        this.canvasInfoPanel.destroy();
        this.reportRenderer.destroy();
        this.controlPanel.destroy();
        this.realtimeFPSMonitor.destroy();
        
        // 清空容器（会自动清理所有DOM和事件监听器）
        this.currentContainer.innerHTML = '';
        
        // 清空引用
        this.currentContainer = null;
        this.template = null;
        this.elements = {};
    }
}

/**
 * EntryAnimationConfigPage - 卡片入场动画配置页面服务
 * 管理卡片入场动画配置页面的UI渲染、子组件协调和用户交互
 * 
 * 职责说明：
 * - 这是一个"页面服务"（Page），管理独立配置页面的内容渲染
 * - 不继承BaseModalService（配置页面不是独立模态框，而是由BubbleMenuService管理的页面内容）
 * - 提供标准接口：renderConfig(), getConfig(), save(), destroy()
 * - 协调子组件：PreviewManager、BoundaryEditorManager、ConfigDataManager、UIStateCoordinator
 * 
 * 当前被使用的模块：
 * - 无（通过BubbleMenuService注册表机制调用，不直接依赖）
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - customSelectFactory (components/CustomSelectFactory.js) - 自定义下拉菜单工厂 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线 (通过DI注入)
 * - validationService (system/ValidationService.js) - 验证服务 (通过DI注入)
 * - previewManagerFactory (components/entry-animation/PreviewManagerFactory.js) - 预览管理器工厂 (通过DI注入，隔离entryAnimationService和viewportCalculatorService)
 * - boundaryEditorManagerFactory (components/entry-animation/BoundaryEditorManagerFactory.js) - 边界编辑器管理器工厂 (通过DI注入，隔离cardBoundaryEditorFactory)
 * - entryAnimationHelpDialogsFactory (components/entry-animation/EntryAnimationHelpDialogsFactory.js) - 帮助对话框工厂 (通过DI注入，隔离viewportCalculatorService)
 * - ConfigDataManager (components/entry-animation/ConfigDataManager.js) - 配置数据管理组件 (内部创建)
 * - CardPositionInfoPanel (components/entry-animation/CardPositionInfoPanel.js) - 卡片位置信息面板辅助类 (内部创建)
 * - CardAnimationListManager (components/entry-animation/CardAnimationListManager.js) - 卡片动画列表管理辅助类 (内部创建)
 * 
 * 架构说明：
 * - 项目统一架构模式：Page 负责克隆模板、传容器给子组件
 * - 参考 PerformanceReportPage 的架构实现
 * - 子组件在构造函数内部创建，不通过DI注入
 * - 遵循"父传容器，子自查找"模式
 */

import { ConfigDataManager } from '../../components/entry-animation/ConfigDataManager.js';
import { UIStateCoordinator } from '../../components/entry-animation/UIStateCoordinator.js';
import { CardPositionInfoPanel } from '../../components/entry-animation/CardPositionInfoPanel.js';
import { CardAnimationListManager } from '../../components/entry-animation/CardAnimationListManager.js';

export class EntryAnimationConfigPage {
    /**
     * 构造函数 - 创建卡片入场动画配置页面服务
     * @param {StateManager} stateManager - 状态管理器
     * @param {CustomSelectFactory} customSelectFactory - 自定义下拉菜单工厂
     * @param {EventBus} eventBus - 事件总线
     * @param {ValidationService} validationService - 验证服务
     * @param {PreviewManagerFactory} previewManagerFactory - 预览管理器工厂
     * @param {BoundaryEditorManagerFactory} boundaryEditorManagerFactory - 边界编辑器管理器工厂
     * @param {EntryAnimationHelpDialogsFactory} helpDialogsFactory - 帮助对话框工厂
     * @throws {Error} 当依赖缺失时立即抛出错误
     */
    constructor(
        stateManager,
        customSelectFactory,
        eventBus,
        validationService,
        previewManagerFactory,
        boundaryEditorManagerFactory,
        helpDialogsFactory
    ) {
        // Fail Fast: 验证依赖
        if (!stateManager) {
            throw new Error('EntryAnimationConfigPage requires stateManager dependency');
        }
        if (!customSelectFactory) {
            throw new Error('EntryAnimationConfigPage requires customSelectFactory dependency');
        }
        if (!eventBus) {
            throw new Error('EntryAnimationConfigPage requires eventBus dependency');
        }
        if (!validationService) {
            throw new Error('EntryAnimationConfigPage requires validationService dependency');
        }
        if (!previewManagerFactory) {
            throw new Error('EntryAnimationConfigPage requires previewManagerFactory dependency');
        }
        if (!boundaryEditorManagerFactory) {
            throw new Error('EntryAnimationConfigPage requires boundaryEditorManagerFactory dependency');
        }
        if (!helpDialogsFactory) {
            throw new Error('EntryAnimationConfigPage requires helpDialogsFactory dependency');
        }
        
        this.stateManager = stateManager;
        this.customSelectFactory = customSelectFactory;
        this.eventBus = eventBus;
        this.validationService = validationService;
        
        // 子组件（通过工厂创建）
        this.previewManager = previewManagerFactory.create(stateManager);
        this.boundaryEditorManager = boundaryEditorManagerFactory.create(stateManager, eventBus, validationService);
        this.configDataManager = new ConfigDataManager(stateManager, eventBus);
        this.uiStateCoordinator = new UIStateCoordinator();
        
        // 辅助类（通过工厂创建或直接创建）
        this.helpDialogs = helpDialogsFactory.create(stateManager, eventBus);
        this.cardPositionInfoPanel = new CardPositionInfoPanel(validationService);
        this.cardAnimationListManager = new CardAnimationListManager(stateManager, customSelectFactory);
        
        // 当前渲染的容器引用
        this.currentContainer = null;
        
        // HTML Template引用
        this.template = null;
        this.cardItemTemplate = null;
        this.selectOptionTemplate = null;
        
        // DOM元素引用
        this.elements = {};
        
        // EventBus事件处理函数引用（用于清理，防止内存泄漏）
        this.eventBusHandlers = {};
        
        // DOM事件处理函数引用（用于清理，防止重复注册）
        this.boundariesEventHandlers = null;
    }
    
    /**
     * 渲染入场动画配置页面
     * @param {HTMLElement} container - 容器元素（由BubbleMenuService传入）
     * @returns {void}
     * @throws {Error} 当HTML模板缺失时立即抛出错误
     */
    renderConfig(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('EntryAnimationConfigPage.renderConfig: container must be a valid HTMLElement');
        }
        
        // 保存容器引用
        this.currentContainer = container;
        
        // 1. 查找HTML Templates
        this.template = document.querySelector('#entryAnimationConfigTemplate');
        this.cardItemTemplate = document.querySelector('#cardAnimationItemTemplate');
        this.selectOptionTemplate = document.querySelector('#selectOptionTemplate');
        
        // Fail Fast: 验证Template存在
        if (!this.template) {
            throw new Error('EntryAnimationConfigPage.renderConfig: #entryAnimationConfigTemplate not found');
        }
        if (!this.cardItemTemplate) {
            throw new Error('EntryAnimationConfigPage.renderConfig: #cardAnimationItemTemplate not found');
        }
        if (!this.selectOptionTemplate) {
            throw new Error('EntryAnimationConfigPage.renderConfig: #selectOptionTemplate not found');
        }
        
        // 2. 克隆Template并添加到容器（容器已在destroy()中清空）
        const clone = this.template.content.cloneNode(true);
        container.appendChild(clone);
        
        // 3. 查找页面级DOM元素
        this.elements = {
            enabledCheckbox: container.querySelector('#entryAnimationEnabled'),
            canvas: container.querySelector('#cardBoundaryCanvas'),
            previewBtn: container.querySelector('#entryAnimationPreviewBtn'),
            previewCanvas: container.querySelector('#entryAnimationPreviewCanvas')
        };
        
        // Fail Fast: 验证页面级DOM元素
        if (!this.elements.enabledCheckbox) {
            throw new Error('EntryAnimationConfigPage.renderConfig: #entryAnimationEnabled not found');
        }
        if (!this.elements.canvas) {
            throw new Error('EntryAnimationConfigPage.renderConfig: #cardBoundaryCanvas not found');
        }
        if (!this.elements.previewBtn) {
            throw new Error('EntryAnimationConfigPage.renderConfig: #entryAnimationPreviewBtn not found');
        }
        if (!this.elements.previewCanvas) {
            throw new Error('EntryAnimationConfigPage.renderConfig: #entryAnimationPreviewCanvas not found');
        }
        
        // 4. 初始化所有子组件（父传容器，子自查找）
        this.previewManager.init(container);
        this.boundaryEditorManager.init(container);
        this.configDataManager.init(container);
        this.uiStateCoordinator.init(container);
        
        // 5. 初始化辅助类（遵循统一架构：父传容器，子自查找）
        this.helpDialogs.init(container);
        this.cardPositionInfoPanel.init(container);
        this.cardAnimationListManager.init(container);
        
        // 6. 初始化预览背景色
        this.previewManager.initBackgroundColor();
        
        // 7. 设置子组件之间的回调通信
        this._setupComponentCommunication();
        
        // 8. 绑定页面级事件
        this._bindEvents();
        
        // 9. 加载配置数据到UI
        this.configDataManager.loadConfig();
        
        // 10. 初始化UI状态
        this.uiStateCoordinator.updateFieldsVisibility(
            this.configDataManager.isEnabled(),
            () => this._initBoundaryEditor()
        );
        
        // 11. 设置性能优化折叠功能
        this.uiStateCoordinator.setupPerformanceOptimizationsToggle();
    }
    
    /**
     * 设置子组件之间的回调通信
     * @private
     * @returns {void}
     */
    _setupComponentCommunication() {
        // BoundaryEditorManager → CardAnimationListManager + UIStateCoordinator
        this.boundaryEditorManager.setOnBoundariesChange((cardCount) => {
            this.cardAnimationListManager.updateCardAnimationsList(cardCount);
            this.uiStateCoordinator.updateTotalDuration(cardCount);
        });
        
        // BoundaryEditorManager → CardPositionInfoPanel（用于恢复边界后自动更新）
        this.boundaryEditorManager.setOnBoundariesRestored(() => {
            this.cardPositionInfoPanel.updateCardPositionInfo(
                this.boundaryEditorManager.getEditor(),
                false
            );
            // 记录用户偏好：用户想查看卡片位置信息
            this.stateManager.state.ui.entryAnimationPanel.showCardPositionInfo = true;
        });
        
        // ConfigDataManager → CardPositionInfoPanel（用于保存配置后自动更新）
        this.configDataManager.setOnConfigSaved(() => {
            this.cardPositionInfoPanel.updateCardPositionInfo(
                this.boundaryEditorManager.getEditor(),
                false
            );
            // 记录用户偏好：用户想查看卡片位置信息
            this.stateManager.state.ui.entryAnimationPanel.showCardPositionInfo = true;
        });
        
        // ConfigDataManager → BoundaryEditorManager + CardAnimationListManager（用于获取数据）
        this.configDataManager.setDataGetters(
            () => this.boundaryEditorManager.getBoundaries(),
            () => this.cardAnimationListManager.getCardAnimations()
        );
    }
    
    /**
     * 绑定页面级事件监听器
     * @private
     * @returns {void}
     */
    _bindEvents() {
        // 保存箭头函数引用（用于后续off()）
        this.eventBusHandlers.boundaryEditorInitialized = () => {
            this._syncPreviewCanvasSize();
        };
        
        // 监听编辑器初始化完成事件
        this.eventBus.on('boundary-editor:initialized', this.eventBusHandlers.boundaryEditorInitialized);
        
        // 启用开关变化
        this.elements.enabledCheckbox.addEventListener('change', () => {
            this.uiStateCoordinator.updateFieldsVisibility(
                this.configDataManager.isEnabled(),
                () => this._initBoundaryEditor()
            );
        });
        
        // 时长和延迟输入变化（更新总时长显示）
        const updateDuration = () => {
            const cardCount = this.boundaryEditorManager.getCardCount();
            this.uiStateCoordinator.updateTotalDuration(cardCount);
        };
        
        const durationInput = this.currentContainer.querySelector('#entryAnimationDuration');
        const staggerDelayInput = this.currentContainer.querySelector('#entryAnimationStaggerDelay');
        
        // Fail Fast: 验证元素存在
        if (!durationInput) {
            throw new Error('EntryAnimationConfigPage._bindEvents: #entryAnimationDuration not found');
        }
        if (!staggerDelayInput) {
            throw new Error('EntryAnimationConfigPage._bindEvents: #entryAnimationStaggerDelay not found');
        }
        
        durationInput.addEventListener('input', updateDuration);
        staggerDelayInput.addEventListener('input', updateDuration);
        
        // 预览按钮
        this.elements.previewBtn.addEventListener('click', () => {
            this._playPreview();
        });
        
        // 刷新卡片位置信息按钮
        const cardPositionRefreshBtn = this.currentContainer.querySelector('#cardPositionRefreshBtn');
        
        // Fail Fast: 验证按钮存在
        if (!cardPositionRefreshBtn) {
            throw new Error('EntryAnimationConfigPage._bindEvents: #cardPositionRefreshBtn not found');
        }
        
        cardPositionRefreshBtn.addEventListener('click', () => {
            // 传入 isManualTrigger=true，启用验证反馈
            this.cardPositionInfoPanel.updateCardPositionInfo(
                this.boundaryEditorManager.getEditor(),
                true
            );
            
            // 记录用户偏好：用户想查看卡片位置信息
            this.stateManager.state.ui.entryAnimationPanel.showCardPositionInfo = true;
        });
        
        // 监听子组件发出的冒泡 CustomEvent（从 CardPositionInfoPanel）
        // 保存事件处理函数引用，用于destroy时移除
        this.boundariesEventHandlers = {
            copySuccess: (e) => {
                this.eventBus.emit('ui:show-success-message', {
                    message: '边界线数组已复制到剪贴板。'
                });
            },
            copyFailed: (e) => {
                this.eventBus.emit('ui:show-validation-error', {
                    message: e.detail.message,
                    options: e.detail.options
                });
            },
            validationFailed: (e) => {
                this.eventBus.emit('ui:show-validation-error', {
                    message: e.detail.message,
                    options: e.detail.options
                });
            }
        };
        
        this.currentContainer.addEventListener('boundaries-copy-success', this.boundariesEventHandlers.copySuccess);
        this.currentContainer.addEventListener('boundaries-copy-failed', this.boundariesEventHandlers.copyFailed);
        this.currentContainer.addEventListener('boundaries-validation-failed', this.boundariesEventHandlers.validationFailed);
    }
    
    /**
     * 初始化边界编辑器
     * @private
     * @returns {void}
     */
    _initBoundaryEditor() {
        // 懒初始化：只有在启用时才创建编辑器
        // 注：编辑器在destroy()时会被销毁，所以每次renderConfig都会重新创建
        if (this.boundaryEditorManager.getEditor()) {
            return;
        }
        
        // 传入回调函数，用于首次加载时自动显示卡片位置信息
        // 注意：预览Canvas尺寸同步由 'boundary-editor:initialized' 事件触发（见_bindEvents）
        this.boundaryEditorManager.initEditor((editor) => {
            this.cardPositionInfoPanel.updateCardPositionInfo(editor);
        });
    }
    
    /**
     * 同步预览Canvas尺寸（使其与编辑器Canvas一致）
     * @private
     * @returns {void}
     */
    _syncPreviewCanvasSize() {
        const editorCanvas = this.elements.canvas;
        const previewCanvas = this.elements.previewCanvas;
        
        // 检查编辑器是否已初始化
        if (!editorCanvas || !previewCanvas || !this.boundaryEditorManager.getEditor()) {
            return;
        }
        
        // 检查编辑器Canvas尺寸是否有效
        if (editorCanvas.width === 0 || editorCanvas.height === 0) {
            return;
        }
        
        const editorRect = editorCanvas.getBoundingClientRect();
        
        // 复制物理像素尺寸
        previewCanvas.width = editorCanvas.width;
        previewCanvas.height = editorCanvas.height;
        
        // 复制CSS显示尺寸
        previewCanvas.style.width = `${editorRect.width}px`;
        previewCanvas.style.height = `${editorRect.height}px`;
        
        // 缩放Canvas上下文以支持高DPI显示
        const dpr = window.devicePixelRatio;
        const ctx = previewCanvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }
    
    /**
     * 播放预览动画
     * @private
     * @returns {void}
     */
    _playPreview() {
        // 获取当前配置
        const config = this.getConfig();
        
        // 验证配置
        const validation = this.validationService.validateEntryAnimationConfig(config);
        
        // 如果有错误，统一显示
        if (!validation.isValid) {
            const errorMessage = validation.errors.map((err, index) => `<p>${index + 1}. ${err}</p>`).join('');
            this.eventBus.emit('ui:show-validation-error', {
                message: errorMessage,
                options: {
                    title: '配置验证失败',
                    shortMessage: `配置验证失败：${validation.errors.length}个错误`
                }
            });
            return;
        }
        
        // 更新卡片位置信息（点击预览时自动刷新）
        this.cardPositionInfoPanel.updateCardPositionInfo(
            this.boundaryEditorManager.getEditor(),
            false
        );
        // 记录用户偏好：用户想查看卡片位置信息
        this.stateManager.state.ui.entryAnimationPanel.showCardPositionInfo = true;
        
        // 播放预览
        this.previewManager.playPreview(config);
    }
    
    /**
     * 获取用户配置
     * @returns {Object} 用户配置对象
     */
    getConfig() {
        return this.configDataManager.getConfig();
    }
    
    /**
     * 保存配置到StateManager
     * @returns {void}
     */
    save() {
        // 获取配置数据
        const config = this.getConfig();
        
        // 验证配置
        const validation = this.validationService.validateEntryAnimationConfig(config);
        
        // 如果有错误，统一显示
        if (!validation.isValid) {
            const errorMessage = validation.errors.map((err, index) => `<p>${index + 1}. ${err}</p>`).join('');
            this.eventBus.emit('ui:show-validation-error', {
                message: errorMessage,
                options: {
                    title: '配置验证失败',
                    shortMessage: `配置验证失败：${validation.errors.length}个错误`
                }
            });
            return;
        }
        
        // 验证通过，保存配置
        this.configDataManager.save();
    }
    
    /**
     * 清理配置UI和事件监听器
     * @returns {void}
     */
    destroy() {
        // 清理子组件
        this.previewManager.destroy();
        this.boundaryEditorManager.destroy();
        this.configDataManager.destroy();
        this.uiStateCoordinator.destroy();
        
        // 清理辅助类
        this.helpDialogs.destroy();
        this.cardPositionInfoPanel.destroy();
        this.cardAnimationListManager.destroy();
        
        // 取消EventBus事件订阅（防止内存泄漏）（Fail Fast：如果为null说明初始化有问题）
        this.eventBus.off('boundary-editor:initialized', this.eventBusHandlers.boundaryEditorInitialized);
        
        // 清空EventBus事件处理函数引用
        this.eventBusHandlers = {};
        
        // 移除DOM事件监听器（防止重复注册）（Fail Fast：如果为null说明初始化有问题）
        this.currentContainer.removeEventListener('boundaries-copy-success', this.boundariesEventHandlers.copySuccess);
        this.currentContainer.removeEventListener('boundaries-copy-failed', this.boundariesEventHandlers.copyFailed);
        this.currentContainer.removeEventListener('boundaries-validation-failed', this.boundariesEventHandlers.validationFailed);
        
        // 清空DOM事件处理函数引用
        this.boundariesEventHandlers = null;
        
        // 清空容器（会自动清理所有DOM和事件监听器）
        this.currentContainer.innerHTML = '';
        
        // 清空引用
        this.currentContainer = null;
        this.template = null;
        this.cardItemTemplate = null;
        this.selectOptionTemplate = null;
        this.elements = {};
    }
}

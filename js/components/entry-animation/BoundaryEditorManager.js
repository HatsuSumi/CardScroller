/**
 * BoundaryEditorManager - 卡片边界编辑器管理组件
 * 负责管理 CardBoundaryEditor 的生命周期和边界数据的加载、验证、恢复
 * 
 * 职责说明：
 * - 创建和初始化 CardBoundaryEditor 实例
 * - 监听边界变化事件并更新UI状态
 * - 处理边界数据的恢复和验证
 * - 提供边界数据的访问接口
 * 
 * 当前被使用的模块：
 * - EntryAnimationConfigPage (ui/EntryAnimationConfigPage.js) - 初始化和调用边界编辑器功能
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 读取已保存的边界数据 (通过DI注入)
 * - cardBoundaryEditorFactory (ui/CardBoundaryEditorFactory.js) - 创建编辑器实例 (通过DI注入)
 * - eventBus (core/EventBus.js) - 发送验证错误和成功消息 (通过DI注入)
 * - validationService (system/ValidationService.js) - 验证边界数据 (通过DI注入)
 * 
 * 架构说明：
 * - 遵循"父传容器，子自查找"模式，与 PerformanceReportPage 的子组件架构一致
 * - 通过回调函数与父组件通信，不直接依赖其他manager
 * - 所有DOM元素在 init() 中查找并验证（Fail Fast）
 */

export class BoundaryEditorManager {
    /**
     * 构造函数 - 创建边界编辑器管理组件
     * @param {StateManager} stateManager - 状态管理器
     * @param {CardBoundaryEditorFactory} cardBoundaryEditorFactory - 卡片边界编辑器工厂
     * @param {EventBus} eventBus - 事件总线
     * @param {ValidationService} validationService - 验证服务
     * @throws {Error} 当依赖缺失时立即抛出错误
     */
    constructor(stateManager, cardBoundaryEditorFactory, eventBus, validationService) {
        // Fail Fast: 验证依赖
        if (!stateManager) {
            throw new Error('BoundaryEditorManager requires stateManager dependency');
        }
        if (!cardBoundaryEditorFactory) {
            throw new Error('BoundaryEditorManager requires cardBoundaryEditorFactory dependency');
        }
        if (!eventBus) {
            throw new Error('BoundaryEditorManager requires eventBus dependency');
        }
        if (!validationService) {
            throw new Error('BoundaryEditorManager requires validationService dependency');
        }
        
        this.stateManager = stateManager;
        this.cardBoundaryEditorFactory = cardBoundaryEditorFactory;
        this.eventBus = eventBus;
        this.validationService = validationService;
        
        // DOM元素引用
        this.elements = {};
        
        // 卡片边界编辑器实例
        this.boundaryEditor = null;
        
        // 标记是否为初始加载
        this.isInitialBoundaryLoad = true;
        
        // 边界变化回调（由父组件设置）
        this.onBoundariesChange = null;
        
        // 恢复边界线后的回调（由父组件设置）
        this.onBoundariesRestored = null;
    }
    
    /**
     * 初始化组件，查找需要的DOM元素
     * @param {HTMLElement} container - 父容器元素
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时立即抛出错误
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('BoundaryEditorManager.init: container must be a valid HTMLElement');
        }
        
        // 查找所有需要的DOM元素
        this.elements = {
            canvas: container.querySelector('#cardBoundaryCanvas'),
            magnifierCanvas: container.querySelector('#cardBoundaryMagnifier'),
            boundaryStatus: container.querySelector('#cardBoundaryStatus'),
            clearBtn: container.querySelector('#cardBoundaryClearBtn'),
            boundaryRestoreInput: container.querySelector('#cardBoundaryRestoreInput'),
            boundaryRestoreBtn: container.querySelector('#cardBoundaryRestoreBtn')
        };
        
        // Fail Fast: 验证所有必需元素
        if (!this.elements.canvas) {
            throw new Error('BoundaryEditorManager.init: #cardBoundaryCanvas not found in container');
        }
        if (!this.elements.magnifierCanvas) {
            throw new Error('BoundaryEditorManager.init: #cardBoundaryMagnifier not found in container');
        }
        if (!this.elements.boundaryStatus) {
            throw new Error('BoundaryEditorManager.init: #cardBoundaryStatus not found in container');
        }
        if (!this.elements.clearBtn) {
            throw new Error('BoundaryEditorManager.init: #cardBoundaryClearBtn not found in container');
        }
        if (!this.elements.boundaryRestoreInput) {
            throw new Error('BoundaryEditorManager.init: #cardBoundaryRestoreInput not found in container');
        }
        if (!this.elements.boundaryRestoreBtn) {
            throw new Error('BoundaryEditorManager.init: #cardBoundaryRestoreBtn not found in container');
        }
    }
    
    /**
     * 设置边界变化回调函数
     * @param {Function} callback - 边界变化时的回调函数
     * @returns {void}
     */
    setOnBoundariesChange(callback) {
        this.onBoundariesChange = callback;
    }
    
    /**
     * 设置恢复边界线后的回调函数
     * @param {Function} callback - 恢复边界线后的回调函数
     * @returns {void}
     */
    setOnBoundariesRestored(callback) {
        this.onBoundariesRestored = callback;
    }
    
    /**
     * 初始化边界编辑器
     * @param {Function} onInitialLoad - 初始加载时的回调函数（用于自动显示卡片位置信息）
     * @returns {void}
     * @throws {Error} 当边界数据缺失或无效时立即抛出错误
     */
    initEditor(onInitialLoad) {
        // 创建编辑器实例
        this.boundaryEditor = this.cardBoundaryEditorFactory.create();
        
        // 获取已保存的边界数据（扁平数组格式）
        const savedBoundaries = this.stateManager.state.playback.entryAnimation.cardBoundaries;
        if (savedBoundaries === null || savedBoundaries === undefined) {
            throw new Error('BoundaryEditorManager.initEditor: cardBoundaries is missing from state');
        }
        if (!Array.isArray(savedBoundaries)) {
            throw new Error('BoundaryEditorManager.initEditor: cardBoundaries must be an array');
        }
        
        // 初始化编辑器（传入扁平数组：[x1, x2, x3, x4, ...]）
        this.boundaryEditor.init(this.elements.canvas, this.elements.magnifierCanvas, savedBoundaries);
        
        // 标记是否为初始加载
        this.isInitialBoundaryLoad = true;
        
        // 监听边界变化
        this.elements.canvas.addEventListener('boundarieschange', () => {
            this.handleBoundariesChange();
            
            // 🔑 如果是初始加载，发射编辑器初始化完成事件
            // 此时Canvas尺寸已设置完成，外部可以安全地同步预览Canvas尺寸
            if (this.isInitialBoundaryLoad) {
                this.isInitialBoundaryLoad = false;
                this.eventBus.emit('boundary-editor:initialized', { editor: this.boundaryEditor });
                
                // 如果用户之前查看过面板，则自动显示卡片位置信息
                if (onInitialLoad) {
                    const shouldShowCardPositionInfo = this.stateManager.state.ui.entryAnimationPanel.showCardPositionInfo;
                    
                    // Fail Fast: 验证 State 值类型
                    if (typeof shouldShowCardPositionInfo !== 'boolean') {
                        throw new Error(`BoundaryEditorManager.initEditor: ui.entryAnimationPanel.showCardPositionInfo must be a boolean, got ${typeof shouldShowCardPositionInfo}`);
                    }
                    
                    if (shouldShowCardPositionInfo) {
                        onInitialLoad(this.boundaryEditor);
                    }
                }
            }
        });
        
        // 绑定清空按钮
        this.elements.clearBtn.addEventListener('click', () => {
            if (this.boundaryEditor) {
                this.boundaryEditor.clearAll();
                
                // 触发恢复边界线回调（清空也需要重置卡片位置信息显示）
                if (this.onBoundariesRestored) {
                    this.onBoundariesRestored();
                }
            }
        });
        
        // 绑定恢复按钮
        this.elements.boundaryRestoreBtn.addEventListener('click', () => {
            this.restoreBoundaries();
        });
    }
    
    /**
     * 处理边界变化事件
     * @returns {void}
     */
    handleBoundariesChange() {
        if (!this.boundaryEditor) {
            return;
        }
        
        // 缓存cardCount，避免多次调用getCardCount()
        const cardCount = this.boundaryEditor.getCardCount();
        
        // 更新边界状态显示
        this.updateBoundaryStatus(cardCount);
        
        // 通知父组件边界已变化
        if (this.onBoundariesChange) {
            this.onBoundariesChange(cardCount);
        }
    }
    
    /**
     * 更新边界状态显示
     * @param {number} [cardCount] - 卡片数量（可选，如果不传则从editor获取）
     * @returns {void}
     */
    updateBoundaryStatus(cardCount) {
        if (!this.boundaryEditor) {
            return;
        }
        
        // 如果未传入cardCount，则从editor获取
        const count = cardCount !== undefined ? cardCount : this.boundaryEditor.getCardCount();
        
        // 更新状态文本
        if (count === 0) {
            this.elements.boundaryStatus.textContent = '未标记卡片';
        } else {
            const boundaryCount = this.boundaryEditor.getBoundaryCount();
            this.elements.boundaryStatus.textContent = `已标记 ${count} 张卡片 (${boundaryCount} 条边界线)`;
        }
    }
    
    /**
     * 恢复边界线数据
     * @returns {void}
     */
    restoreBoundaries() {
        const inputValue = this.elements.boundaryRestoreInput.value.trim();
        
        // Fail Fast: 验证输入不为空
        if (!inputValue) {
            this.eventBus.emit('ui:show-validation-error', {
                message: '<p>请输入边界线数组。</p>',
                options: {
                    title: '输入错误',
                    shortMessage: '请输入边界线数组。'
                }
            });
            return;
        }
        
        // 尝试解析 JSON 数组
        let boundaries;
        try {
            boundaries = JSON.parse(inputValue);
        } catch (error) {
            this.eventBus.emit('ui:show-validation-error', {
                message: `<p>无法解析输入内容，请确保格式正确。</p><p>示例：[28,1844,2065,3881,4102,5918,6139,7955]。</p>`,
                options: {
                    title: '格式错误',
                    shortMessage: '格式错误。'
                }
            });
            return;
        }
        
        // 使用 ValidationService 验证边界线数组（包含视口范围验证）
        // 构造验证上下文（从当前状态获取图片和滚动信息）
        const imageState = this.stateManager.state.content.image;
        const scrollState = this.stateManager.state.playback.scroll;
        
        let validationContext = null;
        if (imageState.isLoaded && 
            typeof imageState.metadata.width === 'number' &&
            typeof scrollState.startPosition === 'number' &&
            typeof scrollState.endPosition === 'number' &&
            typeof scrollState.reverseScroll === 'boolean') {
            validationContext = {
                imageWidth: imageState.metadata.width,
                startPosition: scrollState.startPosition,
                endPosition: scrollState.endPosition,
                reverseScroll: scrollState.reverseScroll
            };
        }
        
        const validation = this.validationService.validateCardBoundaries(boundaries, validationContext);
        if (!validation.isValid) {
            // 格式化错误信息为HTML
            const errorHtml = validation.errors.map(err => `<p style="margin: 0 0 12px 0;">${err}</p>`).join('');
            this.eventBus.emit('ui:show-validation-error', {
                message: errorHtml,
                options: {
                    title: '验证失败',
                    shortMessage: '边界线数据无效。'
                }
            });
            return;
        }
        
        // 应用边界线到编辑器
        this.boundaryEditor.setBoundaries(boundaries);
        
        // 清空输入框
        this.elements.boundaryRestoreInput.value = '';
        
        // 显示成功提示
        this.eventBus.emit('ui:show-success-message', {
            message: `已恢复 ${boundaries.length} 条边界线。`
        });
        
        // 触发恢复边界线回调（用于自动更新卡片位置信息）
        if (this.onBoundariesRestored) {
            this.onBoundariesRestored();
        }
    }
    
    /**
     * 获取当前边界数据
     * @returns {Array<number>|null} 边界线数组（扁平格式），如果编辑器未初始化则返回null
     */
    getBoundaries() {
        if (!this.boundaryEditor) {
            return null;
        }
        return this.boundaryEditor.getBoundaries();
    }
    
    /**
     * 获取卡片数量
     * @returns {number|null} 卡片数量，如果编辑器未初始化则返回null
     */
    getCardCount() {
        if (!this.boundaryEditor) {
            return null;
        }
        return this.boundaryEditor.getCardCount();
    }
    
    /**
     * 获取编辑器实例（供其他组件使用，如CardPositionInfoPanel）
     * @returns {Object|null} 编辑器实例，如果未初始化则返回null
     */
    getEditor() {
        return this.boundaryEditor;
    }
    
    /**
     * 销毁组件，清理资源
     * @returns {void}
     */
    destroy() {
        // 销毁编辑器实例
        if (this.boundaryEditor) {
            this.boundaryEditor.destroy();
            this.boundaryEditor = null;
        }
        
        // 清空DOM元素引用
        this.elements = {};
        
        // 清空回调
        this.onBoundariesChange = null;
    }
}


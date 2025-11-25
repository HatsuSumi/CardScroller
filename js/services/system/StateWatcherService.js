/**
 * StateWatcherService - 状态监听服务
 * 集中管理所有状态变化的监听和UI更新，专注于状态变化时的UI响应逻辑
 * 
 * 当前被使用的模块：
 * - ProgressBarService (services/ui/ProgressBarService.js) - 进度条服务，通过DI注入
 * - PositionSelectorService (services/modal/PositionSelectorService.js) - 位置选择器服务，通过DI注入
 * - AdvancedLoopService (services/modal/AdvancedLoopService.js) - 高级循环服务，通过DI注入
 * - SidebarService (services/ui/SidebarService.js) - 侧边栏服务，通过DI注入
 * - ParameterControlUIService (services/ui/ParameterControlUIService.js) - 参数控制UI服务，通过DI注入
 * - PlaybackUIDisablerService (services/ui/PlaybackUIDisablerService.js) - 全局UI协调服务，通过DI注入
 * - DisplayCoordinatorService (services/ui/DisplayCoordinatorService.js) - 显示协调服务，通过DI注入
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理器，监听所有状态变化 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线，用于发送状态变化事件 (通过DI注入)
 * 
 * 架构说明：
 * 为什么不继承 BaseUIService？
 * - BaseUIService的设计意图是"频繁访问同一个DOM元素"，通过缓存避免重复查询
 * - StateWatcherService的方法中，每个DOM元素只在当次调用中访问一次，不存在频繁访问同一元素的场景
 * - 直接使用原生 document.querySelector/getElementById 更清晰、更轻量
 */

export class StateWatcherService {
    /**
     * @param {StateManager} stateManager - 状态管理器
     * @param {EventBus} eventBus - 事件总线
     * @throws {Error} 如果必需的依赖未提供
     */
    constructor(stateManager, eventBus) {
        
        if (!stateManager) {
            throw new Error('StateWatcherService: stateManager is required');
        }
        if (!eventBus) {
            throw new Error('StateWatcherService: eventBus is required');
        }
        
        this.stateManager = stateManager;
        this.eventBus = eventBus;
        // 监听器管理 - Map<path, [callbacks]>
        this.pathListeners = new Map();
    }

    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        this._setupGlobalStateListener();
        this._setupStateWatchers();
        this._syncInitialUIState();
    }

    /**
     * 设置全局状态变化监听器 - 监听StateManager发出的变化事件
     * @returns {void}
     * @private
     */
    _setupGlobalStateListener() {
        this.eventBus.on('state:change', (changeData) => {
            if (!changeData) {
                throw new Error('StateWatcherService: state:change event data is required');
            }
            if (!changeData.path) {
                throw new Error('StateWatcherService: state:change event must include path');
            }
            this._handleStateChange(changeData.path, changeData.newValue, changeData.oldValue, changeData.context);
        });
    }

    /**
     * 处理状态变化 - 调用对应路径的监听器
     * @param {string} path - 状态路径
     * @param {*} newValue - 新值
     * @param {*} oldValue - 旧值
     * @param {Object} context - 变化上下文（包含immediate等标志）
     * @returns {void}
     * @private
     */
    _handleStateChange(path, newValue, oldValue, context = {}) {
        // 1. 触发精确匹配的监听器
        // 设计决策：不捕获错误（Fail Fast）- 与StateManager保持一致
        // 如果监听器抛出错误，应该立即暴露问题，而不是隐藏
        const exactCallbacks = this.pathListeners.get(path);
        if (exactCallbacks) {
            exactCallbacks.forEach(({ callback }) => {
                callback(newValue, oldValue, path, context);
            });
        }
        
        // 2. 触发深度监听的父路径监听器
        // 例如：path = 'preferences.sidebar.autoHide'，触发 'preferences' 的深度监听器
        for (const [watchPath, callbacks] of this.pathListeners.entries()) {
            // 如果 watchPath 是 path 的父路径，且该监听器开启了 deep 选项
            if (watchPath !== path && path.startsWith(watchPath + '.')) {
                callbacks.forEach(({ callback, deep }) => {
                    if (deep) {
                        // 深度监听时，传递整个被监听对象的当前值
                        const watchedValue = this._getValueByPath(watchPath);
                        callback(watchedValue, undefined, path, context);
                    }
                });
            }
        }
    }
    
    /**
     * 根据路径获取状态值
     * @param {string} path - 状态路径
     * @returns {*} 状态值
     * @private
     */
    _getValueByPath(path) {
        const parts = path.split('.');
        let value = this.stateManager.state;
        for (const part of parts) {
            value = value[part];
            if (value === undefined) {
                return undefined;
            }
        }
        return value;
    }

    /**
     * 设置状态监听器
     * @returns {void}
     * @private
     */
    _setupStateWatchers() {
        // 监听图片加载状态变化，控制主要UI区域的显示/隐藏
        this._addWatcher('content.image.isLoaded', (isLoaded) => {
            this._handleImageLoadedChange(isLoaded);
            // 发送事件给 Business 层（通过 EventBus 符合架构分层）
            this.eventBus.emit('state:image-loaded-changed', { isLoaded });
        });

        // 监听拖拽状态变化，控制拖拽样式
        this._addWatcher('ui.layout.dragOver', (isDragOver) => {
            this._handleDragOverChange(isDragOver);
        });

        // 监听播放状态变化，更新播放/暂停按钮状态
        this._addWatcher('playback.scroll.isPlaying', (newValue) => {
            this._handlePlayingStateChange();
        });
        
        // 监听暂停状态变化，更新播放/暂停按钮状态
        this._addWatcher('playback.scroll.isPaused', (newValue) => {
            this._updatePlaybackButtons();
        });
        
        // 监听完成状态变化，更新播放/暂停按钮状态
        this._addWatcher('playback.scroll.isCompleted', (newValue) => {
            this._updatePlaybackButtons();
        });
        
        // 监听滚动参数变化，发送验证请求（架构分层：System层监听，通过EventBus通知）
        // 注：静默更新不会触发此监听器，因此不需要防重入检查
        this._addWatcher('playback.scroll.duration', (newDuration) => {
            this.eventBus.emit('validation:scroll-parameter-changed', {
                paramType: 'duration',
                newValue: newDuration
            });
        });
        
        this._addWatcher('playback.scroll.startPosition', (newStartPosition) => {
            // 发送验证请求
            this.eventBus.emit('validation:scroll-parameter-changed', {
                paramType: 'startPosition',
                newValue: newStartPosition
            });
            // 发送位置变化事件给 Business 层
            this.eventBus.emit('state:scroll-start-position-changed', { startPosition: newStartPosition });
            
            // 🐛 Bug修复：正向滚动时，起始位置变化需要同步更新当前显示位置
            // 因为正向滚动时，播放的起始位置是 startPosition
            const reverseScroll = this.stateManager.state.playback.scroll.reverseScroll;
            const isPlaying = this.stateManager.state.playback.scroll.isPlaying;
            
            // 只在非播放状态下同步更新（播放中由动画控制位置）
            if (!reverseScroll && !isPlaying) {
                this.stateManager.state.playback.scroll.currentPosition = newStartPosition;
            }
        });
        
        this._addWatcher('playback.scroll.endPosition', (newEndPosition) => {
            this.eventBus.emit('validation:scroll-parameter-changed', {
                paramType: 'endPosition',
                newValue: newEndPosition
            });
            
            // 🐛 Bug修复：反向滚动时，结束位置变化需要同步更新当前显示位置
            // 因为反向滚动时，播放的起始位置是 endPosition
            const reverseScroll = this.stateManager.state.playback.scroll.reverseScroll;
            const isPlaying = this.stateManager.state.playback.scroll.isPlaying;
            
            // 只在非播放状态下同步更新（播放中由动画控制位置）
            if (reverseScroll && !isPlaying) {
                this.stateManager.state.playback.scroll.currentPosition = newEndPosition;
            }
        });
        
        // 监听反向滚动状态变化
        this._addWatcher('playback.scroll.reverseScroll', (reverseScroll) => {
            // 发送事件给 Business 层
            this.eventBus.emit('state:scroll-reverse-scroll-changed', { reverseScroll });
            
            // 🐛 Bug修复：切换反向滚动状态时，需要同步更新当前显示位置
            // 反向滚动时：currentPosition = endPosition
            // 正向滚动时：currentPosition = startPosition
            const isPlaying = this.stateManager.state.playback.scroll.isPlaying;
            const scrollConfig = this.stateManager.state.playback.scroll;
            
            // 只在非播放状态下同步更新（播放中由动画控制位置）
            if (!isPlaying) {
                const newPosition = reverseScroll ? scrollConfig.endPosition : scrollConfig.startPosition;
                this.stateManager.state.playback.scroll.currentPosition = newPosition;
            }
        });
        
        // 监听当前位置变化，发出状态通知（不是命令）
        this._addWatcher('playback.scroll.currentPosition', (newPosition) => {
            // 发送状态变化通知，让监听者自己决定如何响应
            this.eventBus.emit('state:scroll-current-position-changed', { position: newPosition });
        });
    }

    /**
     * 同步初始UI状态
     * 在服务初始化时，根据 defaultState.json 中的初始值手动触发UI更新
     * 
     * 设计说明：
     * - HTML中的初始状态类（如 scrollControls 的 hidden）是"初始默认外观"，避免页面加载时闪烁（FOUC）
     * - 该方法确保所有状态驱动的UI元素与 defaultState.json 保持一致
     * - JavaScript 完全控制后续的状态变化和UI更新
     * 
     * @returns {void}
     * @private
     */
    _syncInitialUIState() {
        // 同步图片加载状态（虽然 HTML 已设置初始 hidden，但保持代码完整性）
        const isLoaded = this.stateManager.state.content.image.isLoaded;
        this._handleImageLoadedChange(isLoaded);
        
        // 同步播放按钮状态
        this._updatePlaybackButtons();
    }

    /**
     * 辅助方法：验证DOM元素是否存在
     * @param {HTMLElement|null} element - DOM元素
     * @param {string} elementName - 元素名称（用于错误提示）
     * @returns {void}
     * @throws {Error} 如果element为null或undefined
     * @private
     */
    _validateElement(element, elementName) {
        if (!element) {
            throw new Error(`StateWatcherService: ${elementName} element not found`);
        }
    }

    /**
     * 辅助方法：根据条件切换CSS类
     * @param {HTMLElement} element - DOM元素
     * @param {string} className - CSS类名
     * @param {boolean} shouldAdd - 是否添加类（true添加，false移除）
     * @returns {void}
     * @throws {Error} 如果element为null或undefined
     * @private
     */
    _toggleClass(element, className, shouldAdd) {
        if (!element) {
            throw new Error('StateWatcherService._toggleClass: element is required');
        }
        
        if (shouldAdd) {
            element.classList.add(className);
        } else {
            element.classList.remove(className);
        }
    }

    /**
     * 添加状态监听器
     * @param {string} path - 状态路径
     * @param {Function} callback - 回调函数
     * @param {Object} [options={}] - 监听选项
     * @param {boolean} [options.deep=false] - 是否深度监听（监听所有子路径的变化）
     * @returns {void}
     * @throws {Error} 如果参数无效
     * @private
     */
    _addWatcher(path, callback, options = {}) {
        if (!path || typeof path !== 'string') {
            throw new Error('StateWatcherService._addWatcher: path must be a non-empty string');
        }
        if (typeof callback !== 'function') {
            throw new Error('StateWatcherService._addWatcher: callback must be a function');
        }
        if (options !== undefined && (typeof options !== 'object' || options === null)) {
            throw new Error('StateWatcherService._addWatcher: options must be an object or undefined');
        }
        
        // 性能优化：避免重复Map查询
        let callbacks = this.pathListeners.get(path);
        if (!callbacks) {
            callbacks = [];
            this.pathListeners.set(path, callbacks);
        }
        callbacks.push({ callback, deep: options.deep || false });
    }

    /**
     * 处理图片加载状态变化
     * @param {boolean} isLoaded - 是否已加载图片
     * @returns {void}
     * @private
     */
    _handleImageLoadedChange(isLoaded) {
        const emptyState = document.querySelector('.empty-state');
        this._validateElement(emptyState, '.empty-state');
        
        const scrollPreview = document.getElementById('scrollPreview');
        this._validateElement(scrollPreview, 'scrollPreview');
        
        const scrollControls = document.getElementById('scrollControls');
        this._validateElement(scrollControls, 'scrollControls');
        
        const autoHideControl = document.querySelector('.auto-hide-control');
        this._validateElement(autoHideControl, '.auto-hide-control');
        
        const autoResetControl = document.querySelector('.auto-reset-control');
        this._validateElement(autoResetControl, '.auto-reset-control');
        
        // 根据图片加载状态显示/隐藏相应的UI区域
        this._toggleClass(emptyState, 'hidden', isLoaded);
        this._toggleClass(scrollPreview, 'hidden', !isLoaded);
        this._toggleClass(scrollControls, 'hidden', !isLoaded);
        this._toggleClass(autoHideControl, 'hidden', !isLoaded);
        this._toggleClass(autoResetControl, 'hidden', !isLoaded);
    }

    /**
     * 处理拖拽状态变化
     * @param {boolean} isDragOver - 是否正在拖拽
     * @returns {void}
     * @private
     */
    _handleDragOverChange(isDragOver) {
        const mainDisplay = document.querySelector('.main-display');
        this._validateElement(mainDisplay, '.main-display');
        this._toggleClass(mainDisplay, 'drag-over', isDragOver);
    }

    /**
     * 处理播放状态变化
     * @returns {void}
     * @private
     */
    _handlePlayingStateChange() {
        this._updatePlaybackButtons();
    }

    /**
     * 辅助方法：设置按钮状态类（移除旧类，添加新类）
     * @param {HTMLElement} button - 按钮元素
     * @param {boolean} isActive - 是否激活状态
     * @returns {void}
     * @throws {Error} 如果button为null或undefined
     * @private
     */
    _setButtonState(button, isActive) {
        if (!button) {
            throw new Error('StateWatcherService._setButtonState: button is required');
        }
        
        // 移除所有状态类
        button.classList.remove('playback-btn-active', 'playback-btn-inactive');
        
        // 添加对应状态类
        button.classList.add(isActive ? 'playback-btn-active' : 'playback-btn-inactive');
    }

    /**
     * 更新播放控制按钮的状态
     * @returns {void}
     * @private
     */
    _updatePlaybackButtons() {
        const playBtn = document.getElementById('playBtn');
        this._validateElement(playBtn, 'playBtn');
        
        const pauseBtn = document.getElementById('pauseBtn');
        this._validateElement(pauseBtn, 'pauseBtn');
        
        // 性能优化：缓存状态引用，避免重复深度访问
        const scrollState = this.stateManager.state.playback.scroll;
        const isPlaying = scrollState.isPlaying;
        const isCompleted = scrollState.isCompleted;
        
        const playBtnShouldBeActive = !(isCompleted || isPlaying);
        const pauseBtnShouldBeActive = isPlaying && !isCompleted;
        
        // 完成状态或播放状态：播放按钮变暗；否则播放按钮正常
        this._setButtonState(playBtn, playBtnShouldBeActive);
        
        // 播放状态：暂停按钮正常；完成或停止/暂停状态：暂停按钮变暗
        this._setButtonState(pauseBtn, pauseBtnShouldBeActive);
    }

    /**
     * 通用状态监听方法 - 供其他服务使用
     * @param {string} path - 状态路径
     * @param {Function} callback - 回调函数 (newValue, oldValue, path, context) => void
     *                              context.immediate 标识是否为 immediate 调用
     * @param {Object} [options={}] - 监听选项
     * @param {boolean} [options.deep=false] - 是否深度监听（监听所有子路径的变化）
     * @param {boolean} [options.immediate=false] - 是否立即执行一次回调（使用当前状态值）
     * @returns {void}
     * @throws {Error} 如果参数无效（由_addWatcher验证）
     * @public
     */
    watchState(path, callback, options = {}) {
        this._addWatcher(path, callback, options);
        
        // 如果设置了 immediate，立即执行一次回调
        if (options.immediate) {
            const currentValue = this._getValueByPath(path);
            try {
                // 传递第四个参数标识这是 immediate 调用
                callback(currentValue, undefined, path, { immediate: true });
            } catch (error) {
                console.error(`❌ Error in immediate callback for ${path}:`, error);
            }
        }
    }

}

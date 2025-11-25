/**
 * SidebarService - 侧边栏服务
 * 处理侧边栏折叠、透明度控制、自动隐藏和快捷键，管理侧边栏的显示/隐藏状态、透明度调节、播放时自动隐藏逻辑，以及Ctrl+H快捷键切换
 * 
 * 当前被使用的模块：
 * - 无（纯UI服务，通过EventBus和StateWatcher被动响应）
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，监听播放状态变化 (通过DI注入)
 * - keyboardService (utils/KeyboardService.js) - 键盘服务，注册侧边栏切换快捷键 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器，读取播放状态 (通过DI注入)
 * - stateWatcherService (system/StateWatcherService.js) - 状态监听服务，监听透明度状态变化 (通过DI注入)
 * - debounce (helpers/debounce.js) - 防抖工具函数，用于透明度滑块防抖
 * 
 * 架构说明：
 * 为什么不继承 BaseUIService？
 * - BaseUIService的设计意图是"频繁访问同一个DOM元素"，即多个方法反复调用 _getElement() 获取同一元素，通过缓存避免重复查询
 * - SidebarService只在init()时查询一次DOM元素，之后都直接使用实例属性（this.elements），不会再次调用 _getElement()
 * - 继承BaseUIService会造成双重缓存：DOM元素既存在BaseUIService.domCache中，又存在this.elements实例属性中
 * - 直接使用原生 document.getElementById() 更清晰、更轻量
 */
import { debounce } from '../../helpers/debounce.js';

export class SidebarService {
    /**
     * 构造函数 - 初始化侧边栏服务
     * @param {EventBus} eventBus - 事件总线，监听播放状态变化
     * @param {KeyboardService} keyboardService - 键盘服务，注册侧边栏切换快捷键
     * @param {StateManager} stateManager - 状态管理器，读取播放状态
     * @param {StateWatcherService} stateWatcherService - 状态监听服务
     * @throws {Error} 当任何依赖缺失时抛出错误（Fail Fast）
     */
    constructor(eventBus, keyboardService, stateManager, stateWatcherService) {
        // 立即验证关键依赖
        if (!eventBus) {
            throw new Error('SidebarService requires eventBus dependency');
        }
        if (!keyboardService) {
            throw new Error('SidebarService requires keyboardService dependency');
        }
        if (!stateManager) {
            throw new Error('SidebarService requires stateManager dependency');
        }
        if (!stateWatcherService) {
            throw new Error('SidebarService requires stateWatcherService dependency');
        }
        
        this.eventBus = eventBus;
        this.keyboardService = keyboardService;
        this.stateManager = stateManager;
        this.stateWatcherService = stateWatcherService;
        // 侧边栏状态 - 从状态管理器读取默认值
        this.sidebarOpacity = this.stateManager.getDefaultValue('ui.layout.sidebarOpacity');
        
        // DOM 元素引用
        this.elements = {};
    }


    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        this._setupDOMReferences();
        this._setupSidebarCollapse();
        this._setupOpacityControl();
        this._setupAutoHide();
        this._registerShortcuts();
        this._setupStateListeners();
    }

    /**
     * 设置状态监听器（用于配置导入等场景）
     * @private
     * @returns {void}
     */
    _setupStateListeners() {
        this.stateWatcherService.watchState('ui.layout.sidebarOpacity', (opacity) => {
            this._syncOpacityFromState(opacity);
        });

        this.stateWatcherService.watchState('ui.layout.sidebarCollapsed', (isCollapsed) => {
            const { controlPanel } = this.elements;
            if (controlPanel) {
                if (isCollapsed) {
                    controlPanel.classList.add('collapsed');
                } else {
                    controlPanel.classList.remove('collapsed');
                }
            }
        });
        
        // 同步初始UI状态（确保从LocalStorage加载的偏好能正确反映到UI）
        const currentCollapsed = this.stateManager.state.ui.layout.sidebarCollapsed;
        const currentOpacity = this.stateManager.state.ui.layout.sidebarOpacity;
        const { controlPanel } = this.elements;
        if (controlPanel) {
            if (currentCollapsed) {
                controlPanel.classList.add('collapsed');
            } else {
                controlPanel.classList.remove('collapsed');
            }
        }
        this._syncOpacityFromState(currentOpacity);
    }

    /**
     * 从状态同步透明度到UI
     * @param {number} opacity - 透明度值
     * @private
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    _syncOpacityFromState(opacity) {
        // Fail Fast: 验证参数
        if (typeof opacity !== 'number') {
            throw new Error('SidebarService._syncOpacityFromState: opacity (number) is required');
        }
        
        const { opacitySlider, controlPanel, opacityValue } = this.elements;
        
        // 更新滑块值（如果不同）
        if (opacitySlider && opacitySlider.value !== opacity.toString()) {
            opacitySlider.value = opacity;
        }
        
        // 直接更新UI，不触发状态更新（避免循环）
        if (controlPanel && opacityValue) {
            this.sidebarOpacity = opacity;
            
            // 更新显示值
            opacityValue.textContent = `${opacity}%`;
            
            // 更新整个侧边栏的透明度
            const alpha = opacity / 100;
            controlPanel.style.setProperty('--sidebar-opacity', alpha.toString());
        }
    }

    /**
     * 设置DOM元素引用
     * @private
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时抛出错误（Fail Fast）
     */
    _setupDOMReferences() {
        // 一次性获取所有DOM元素并缓存到实例属性
        this.elements = {
            collapseBtn: document.getElementById('collapseBtn'),
            controlPanel: document.getElementById('controlPanel'),
            opacitySlider: document.getElementById('opacitySlider'),
            opacityValue: document.getElementById('opacityValue')
        };
        
        // Fail Fast: 验证关键DOM元素
        if (!this.elements.collapseBtn) {
            throw new Error('SidebarService: collapseBtn element not found');
        }
        if (!this.elements.controlPanel) {
            throw new Error('SidebarService: controlPanel element not found');
        }
        if (!this.elements.opacitySlider) {
            throw new Error('SidebarService: opacitySlider element not found');
        }
        if (!this.elements.opacityValue) {
            throw new Error('SidebarService: opacityValue element not found');
        }
    }

    /**
     * 设置侧边栏折叠功能
     * @private
     * @returns {void}
     * @throws {Error} 当关键UI元素不存在时抛出错误（Fail Fast）
     */
    _setupSidebarCollapse() {
        const { collapseBtn } = this.elements;
        
        // Fail Fast: 关键按钮必须存在
        if (!collapseBtn) {
            throw new Error('SidebarService._setupSidebarCollapse: collapseBtn element not found');
        }
        
        // 点击按钮切换折叠状态
        collapseBtn.addEventListener('click', () => {
            this.toggleSidebar();
        });
    }

    /**
     * 设置透明度控制
     * @private
     * @returns {void}
     * @throws {Error} 当关键UI元素不存在时抛出错误（Fail Fast）
     */
    _setupOpacityControl() {
        const { opacitySlider } = this.elements;
        
        // Fail Fast: 关键滑块必须存在
        if (!opacitySlider) {
            throw new Error('SidebarService._setupOpacityControl: opacitySlider element not found');
        }
        
        // 动态设置 min/max/value（从 JSON 读取）
        const { minOpacity, maxOpacity } = this._getOpacityConstraints();
        
        opacitySlider.setAttribute('min', minOpacity);
        opacitySlider.setAttribute('max', maxOpacity);
        opacitySlider.value = this.sidebarOpacity; // 复用构造函数中的值
        
        // 初始化透明度
        this.updateSidebarOpacity(this.sidebarOpacity);
        
        // 滑块变化事件（使用防抖）
        const debouncedUpdateOpacity = debounce((opacity) => {
            this.updateSidebarOpacity(opacity);
        }, 16); // 技术实现：滑块节流延迟（毫秒，约60FPS）
        
        opacitySlider.addEventListener('input', (e) => {
            const opacity = parseInt(e.target.value);
            debouncedUpdateOpacity(opacity);
        });
    }

    /**
     * 获取透明度约束值
     * @private
     * @returns {{minOpacity: number, maxOpacity: number}}
     */
    _getOpacityConstraints() {
        return {
            minOpacity: this.stateManager.getDefaultValue('validation.ui.minSidebarOpacity'),
            maxOpacity: this.stateManager.getDefaultValue('validation.ui.maxSidebarOpacity')
        };
    }

    /**
     * 切换侧边栏显示/隐藏
     * @returns {void}
     * @throws {Error} 当关键DOM元素不存在时抛出错误（Fail Fast）
     */
    toggleSidebar() {
        const isCollapsed = this.stateManager.state.ui.layout.sidebarCollapsed;
        this.stateManager.state.ui.layout.sidebarCollapsed = !isCollapsed;
    }

    /**
     * 更新侧边栏透明度
     * @param {number} opacity - 透明度值 (20-100)
     * @returns {void}
     * @throws {Error} 当参数无效或关键DOM元素不存在时抛出错误（Fail Fast）
     */
    updateSidebarOpacity(opacity) {
        // Fail Fast: 验证参数
        if (typeof opacity !== 'number') {
            throw new Error('SidebarService.updateSidebarOpacity: opacity (number) is required');
        }
        
        const { controlPanel, opacityValue } = this.elements;
        
        // Fail Fast: 关键元素必须存在
        if (!controlPanel) {
            throw new Error('SidebarService.updateSidebarOpacity: controlPanel element not found');
        }
        if (!opacityValue) {
            throw new Error('SidebarService.updateSidebarOpacity: opacityValue element not found');
        }
        
        this.sidebarOpacity = opacity;
        
        // 更新显示值
        opacityValue.textContent = `${opacity}%`;
        
        // 更新整个侧边栏的透明度（包括所有子元素）
        const alpha = opacity / 100;
        controlPanel.style.setProperty('--sidebar-opacity', alpha.toString());
        
        // 保存到StateManager
        this.stateManager.state.ui.layout.sidebarOpacity = opacity; // 直接存储0-100整数
    }

    /**
     * 设置自动隐藏侧边栏功能
     * @private
     * @returns {void}
     */
    _setupAutoHide() {
        // 自动隐藏定时器
        this.autoHideTimer = null;
        
        // 性能优化：复用同一个handler，避免创建多个箭头函数
        const handlePlayStarted = () => this._handlePlayStarted();
        const handlePlayStopped = () => this._handlePlayStopped();
        
        // 监听播放开始事件
        this.eventBus.on('scroll:play-started', handlePlayStarted);
        
        // 监听播放停止/重置/暂停事件（复用同一个handler）
        this.eventBus.on('scroll:stopped', handlePlayStopped);
        this.eventBus.on('scroll:reset', handlePlayStopped);
        this.eventBus.on('scroll:paused', handlePlayStopped);
    }

    /**
     * 清除自动隐藏定时器
     * @private
     * @returns {void}
     */
    _clearAutoHideTimer() {
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }

    /**
     * 处理播放开始时的自动隐藏逻辑
     * @private
     * @returns {void}
     */
    _handlePlayStarted() {
        const sidebarPrefs = this.stateManager.state.preferences.sidebar;
        const autoHide = sidebarPrefs.autoHide;
        const autoHideDelay = sidebarPrefs.autoHideDelay;

        if (!autoHide) return;
        
        // 清除之前的定时器
        this._clearAutoHideTimer();

        // 设置自动隐藏定时器
        if (autoHideDelay > 0) {
            this.autoHideTimer = setTimeout(
                () => this._autoHideSidebar(),
                autoHideDelay * 1000  // 转换秒为毫秒
            );
        } else {
            // 立即隐藏
            this._autoHideSidebar();
        }
    }

    /**
     * 处理播放停止时的逻辑
     * @private
     * @returns {void}
     */
    _handlePlayStopped() {
        // 清除自动隐藏定时器
        this._clearAutoHideTimer();
        
        // 自动显示侧边栏（如果之前被自动隐藏了）
        const autoHide = this.stateManager.state.preferences.sidebar.autoHide;
        if (autoHide) {
            this._autoShowSidebar();
        }
    }

    /**
     * 自动隐藏侧边栏
     * @private
     * @returns {void}
     */
    _autoHideSidebar() {
        const isCollapsed = this.stateManager.state.ui.layout.sidebarCollapsed;
        if (!isCollapsed) {
            this.toggleSidebar(); // 折叠
        }
    }

    /**
     * 自动显示侧边栏
     * @private
     * @returns {void}
     */
    _autoShowSidebar() {
        const isCollapsed = this.stateManager.state.ui.layout.sidebarCollapsed;
        if (isCollapsed) {
            this.toggleSidebar(); // 展开
        }
    }

    /**
     * 注册侧边栏快捷键
     * @returns {void}
     * @private
     */
    _registerShortcuts() {
        // 注册 Ctrl+H 切换侧边栏
        this.keyboardService.register(
            'ctrl+h',
            () => this.toggleSidebar(),
            this,
            { preventDefault: true }
        );
    }
}

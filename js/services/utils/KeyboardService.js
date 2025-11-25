/**
 * KeyboardService - 键盘快捷键服务
 * 提供全局键盘事件监听、快捷键注册、条件快捷键支持、冲突检测等功能，确保整个应用的快捷键统一管理
 * 
 * 当前被使用的模块：
 * - DialogService (system/DialogService.js) - 对话框服务，注册ESC快捷键
 * - BaseModalService (base/BaseModalService.js) - 模态框基类，注册ESC快捷键
 * - SidebarService (ui/SidebarService.js) - 侧边栏服务，注册侧边栏切换快捷键
 * - AdvancedLoopService (modal/AdvancedLoopService.js) - 高级循环服务，注册模态框快捷键
 * - PlaybackControlUIService (ui/PlaybackControlUIService.js) - 播放控制UI服务，注册播放/暂停快捷键
 * - BubbleMenuService (ui/BubbleMenuService.js) - 气泡菜单服务，注册Ctrl+E打开入场动画配置页面
 * - CardBoundaryEditorService (ui/CardBoundaryEditorService.js) - 卡片边界编辑器，注册箭头键微调快捷键
 * - PositionSelectorService (modal/PositionSelectorService.js) - 位置选择器服务，注册箭头键微调快捷键
 * - CustomSelect (components/CustomSelect.js) - 自定义下拉菜单组件，注册条件快捷键
 * - ColorPicker (components/ColorPicker.js) - 颜色选择器组件，注册Enter键确认Hex输入
 * 
 * 当前依赖的模块：
 * - 无直接依赖，纯JavaScript实现
 */
export class KeyboardService {
    /**
     * 构造函数 - 创建键盘快捷键服务实例
     * 初始化快捷键注册表和条件快捷键注册表
     */
    constructor() {
        // 快捷键注册表
        this.shortcuts = new Map();
        
        // 条件快捷键注册表（需要特殊条件判断的）- 支持同一键的多个条件
        this.conditionalShortcuts = new Map();
        
        // 是否已初始化
        this.initialized = false;
    }

    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        if (this.initialized) {
            console.warn('⚠️ KeyboardService already initialized');
            return;
        }
        
        document.addEventListener('keydown', (e) => {
            this._handleKeydown(e);
        });
        this.initialized = true;
    }

    /**
     * 处理键盘事件
     * @param {KeyboardEvent} e - 键盘事件对象
     * @returns {void}
     * @private
     */
    _handleKeydown(e) {
        const keyString = this._getKeyString(e);
        
        // 处理普通快捷键
        const shortcut = this.shortcuts.get(keyString);
        if (shortcut) {
            this._handlePreventDefault(e, shortcut);
            shortcut.handler();
            return;
        }
        
        // 处理条件快捷键（可能有多个）
        const conditionalShortcuts = this.conditionalShortcuts.get(keyString);
        if (conditionalShortcuts) {
            for (const conditionalShortcut of conditionalShortcuts) {
                // Fail Fast: 只捕获condition的错误，handler的错误应该抛出
                let shouldExecute = false;
                try {
                    shouldExecute = conditionalShortcut.condition(e);
                } catch (error) {
                    console.error(`KeyboardService: Condition check failed for ${conditionalShortcut.componentName}:`, error);
                    continue; // 跳过这个快捷键，继续检查下一个
                }
                
                if (shouldExecute) {
                    this._handlePreventDefault(e, conditionalShortcut);
                    // 不捕获handler错误
                    conditionalShortcut.handler(e);
                    break; // 只执行第一个匹配的条件
                }
            }
        }
    }

    /**
     * 注册快捷键
     * @param {string} keyString - 快捷键字符串，如 'ctrl+h', 'space', 'escape'
     * @param {Function} handler - 处理函数
     * @param {Object} component - 注册组件的引用
     * @param {Object} options - 选项
     * @param {boolean} [options.preventDefault] - 是否阻止默认行为，默认 true
     * @returns {void}
     * @throws {Error} 当必需参数缺失时抛出错误（Fail Fast）
     */
    register(keyString, handler, component, options) {
        // Fail Fast: 验证必需参数
        this._validateRegisterParams(keyString, handler, component, options, 'register');
        
        const normalizedKey = keyString.toLowerCase();
        
        // 性能优化：使用单次Map查询检查冲突
        const existingShortcut = this.shortcuts.get(normalizedKey);
        if (existingShortcut) {
            console.warn(`⚠️ 快捷键冲突: ${keyString} 已被 ${existingShortcut.component} 注册`);
        }
        
        const shortcutInfo = {
            handler,
            component: this._getComponentName(component),
            preventDefault: this._getPreventDefault(options)
        };
        
        this.shortcuts.set(normalizedKey, shortcutInfo);
    }

    /**
     * 注册条件快捷键（需要特殊条件判断的）
     * @param {string} keyString - 快捷键字符串
     * @param {Function} handler - 处理函数
     * @param {Function} condition - 条件判断函数
     * @param {Object} component - 注册组件的引用
     * @param {Object} options - 选项
     * @param {boolean} [options.preventDefault] - 是否阻止默认行为，默认 true
     * @returns {void}
     * @throws {Error} 当必需参数缺失时抛出错误（Fail Fast）
     */
    registerConditional(keyString, handler, condition, component, options) {
        // Fail Fast: 验证必需参数
        this._validateRegisterParams(keyString, handler, component, options, 'registerConditional');
        if (!condition || typeof condition !== 'function') {
            throw new Error('KeyboardService.registerConditional: condition (function) is required');
        }
        
        const normalizedKey = keyString.toLowerCase();
        const shortcutInfo = {
            handler,
            condition,
            component: component, // 保存原始组件引用（用于unregister时比较）
            componentName: this._getComponentName(component), // 保存组件名（用于调试）
            preventDefault: this._getPreventDefault(options)
        };
        
        // 性能优化：使用单次Map查询获取或创建数组
        let shortcuts = this.conditionalShortcuts.get(normalizedKey);
        if (!shortcuts) {
            shortcuts = [];
            this.conditionalShortcuts.set(normalizedKey, shortcuts);
        }
        shortcuts.push(shortcutInfo);
    }

    /**
     * 注销快捷键
     * @param {string} keyString - 快捷键字符串
     * @param {Object} component - 注册时的组件引用
     * @returns {void}
     */
    unregister(keyString, component) {
        const normalizedKey = keyString.toLowerCase();
        const componentName = this._getComponentName(component);
        
        // 从普通快捷键中移除
        const shortcut = this.shortcuts.get(normalizedKey);
        if (shortcut && shortcut.component === componentName) {
            this.shortcuts.delete(normalizedKey);
        }
        
        // 从条件快捷键中移除（通过组件引用比较）
        const conditionalShortcuts = this.conditionalShortcuts.get(normalizedKey);
        if (conditionalShortcuts) {
            const filtered = conditionalShortcuts.filter(s => s.component !== component);
            if (filtered.length === 0) {
                this.conditionalShortcuts.delete(normalizedKey);
            } else {
                this.conditionalShortcuts.set(normalizedKey, filtered);
            }
        }
    }

    /**
     * 生成快捷键字符串（将键盘事件转换为标准化的快捷键字符串格式）
     * @param {KeyboardEvent} e - 键盘事件对象
     * @returns {string} 标准化的快捷键字符串，如'ctrl+h'、'space'、'escape'
     * @private
     */
    _getKeyString(e) {
        const parts = [];
        
        if (e.ctrlKey) parts.push('ctrl');
        if (e.altKey) parts.push('alt');
        if (e.shiftKey) parts.push('shift');
        if (e.metaKey) parts.push('meta');
        
        // 处理特殊键
        let key = e.key.toLowerCase();
        if (e.code === 'Space') {
            key = 'space';
        } else if (key.startsWith('arrow')) {
            key = key.replace('arrow', '');
        }
        
        parts.push(key);
        
        return parts.join('+');
    }

    /**
     * 验证注册方法的公共参数
     * @param {string} keyString - 快捷键字符串
     * @param {Function} handler - 处理函数
     * @param {Object} component - 组件实例
     * @param {Object} options - 选项对象
     * @param {string} methodName - 调用方法名（用于错误提示）
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     * @private
     */
    _validateRegisterParams(keyString, handler, component, options, methodName) {
        if (!keyString || typeof keyString !== 'string') {
            throw new Error(`KeyboardService.${methodName}: keyString (string) is required`);
        }
        if (!handler || typeof handler !== 'function') {
            throw new Error(`KeyboardService.${methodName}: handler (function) is required`);
        }
        if (!component) {
            throw new Error(`KeyboardService.${methodName}: component is required`);
        }
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error(`KeyboardService.${methodName}: options (object) is required`);
        }
    }

    /**
     * 处理preventDefault逻辑
     * @param {KeyboardEvent} e - 键盘事件对象
     * @param {Object} shortcut - 快捷键信息对象
     * @returns {void}
     * @private
     */
    _handlePreventDefault(e, shortcut) {
        if (shortcut.preventDefault !== false) {
            e.preventDefault();
        }
    }

    /**
     * 获取组件名称
     * @param {Object} component - 组件实例
     * @returns {string} 组件名称
     * @throws {Error} 当组件没有constructor.name时抛出错误（Fail Fast）
     * @private
     */
    _getComponentName(component) {
        const name = component?.constructor?.name;
        if (!name) {
            throw new Error('KeyboardService: component must have a constructor name');
        }
        return name;
    }

    /**
     * 获取是否阻止默认行为
     * @param {Object} options - 选项对象
     * @returns {boolean} 是否阻止默认行为
     * @private
     */
    _getPreventDefault(options) {
        return options.preventDefault !== false;
    }

    /**
     * 检查输入框是否获得焦点
     * 用于条件快捷键判断，避免在用户输入时触发快捷键
     * @returns {boolean} 输入框获得焦点时返回true，否则返回false
     */
    isInputFocused() {
        const activeElement = document.activeElement;
        if (!activeElement) return false;
        
        const focusableInputs = ['INPUT', 'TEXTAREA', 'SELECT'];
        return focusableInputs.includes(activeElement.tagName) || 
               activeElement.contentEditable === 'true';
    }

}

/**
 * StateManager - 状态管理器
 * 模块化响应式状态存储，负责状态存储、模块注册、变化通知、默认值获取，不负责状态监听逻辑（由StateWatcherService负责）
 * 
 * 当前被使用的模块：
 * - （核心基础设施，被所有服务使用）
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，用于发射状态变化通知 (通过DI注入)
 * 
 * 架构说明：
 * StateManager作为底层基础设施，直接抛出错误，
 * 不依赖上层的ErrorDisplayService等统一服务，以避免循环依赖并保持架构层次清晰，即可绕过十二大统一服务
 */
class StateManager {
    /**
     * 创建状态管理器实例
     * 初始化六个核心数据结构：
     * - state: 模块化状态存储对象（响应式代理）
     * - modules: 存储模块配置和初始状态（Map<模块名, {initialState, options}>）
     * - proxyCache: Proxy对象缓存，避免重复创建（WeakMap<原对象, Proxy>）
     * - pathCache: 路径解析结果缓存，性能优化（Map<路径字符串, {pathParts, moduleName, propertyPath}>）
     * - _isBatching: 批量更新标志，标记是否在batch()调用中
     * - _batchedChanges: 批量更新缓存，收集batch()期间的所有变更（Map<path, {newValue, oldValue}>）
     * 
     * @param {EventBus} eventNotifier - 事件总线实例，用于发射状态变化通知
     * @throws {Error} 当 eventNotifier 缺失时抛出错误（Fail Fast）
     */
    constructor(eventNotifier) {
        // Fail Fast: 检查关键依赖
        if (!eventNotifier) {
            throw new Error('EventBus is required for StateManager');
        }
        
        this.eventNotifier = eventNotifier;
        
        // 模块化状态存储
        this.state = {};
        this.modules = new Map();
        
        // Proxy缓存
        this.proxyCache = new WeakMap();
        
        // 路径解析缓存 - 性能优化
        this.pathCache = new Map();
        
        // 批量更新标志和缓存
        this._isBatching = false;
        this._batchedChanges = new Map(); // Map<path, {newValue, oldValue, context}>
        this._currentContext = null; // 当前setValue的context
        
        // 静默更新标志：用于程序内部恢复值时不触发验证
        this._silentMode = false;
    }

    /**
     * 注册状态模块
     * @param {string} moduleName - 模块名称
     * @param {Object} initialState - 初始状态
     * @param {Object} options - 模块选项
     * @returns {StateManager} 返回自身以支持链式调用
     * @throws {Error} 当模块名称已被注册时抛出错误（Fail Fast）
     */
    registerModule(moduleName, initialState, options) {
        if (this.modules.has(moduleName)) {
            throw new Error(`Module '${moduleName}' is already registered`);
        }
        
        // 注册模块
        this.modules.set(moduleName, {
            initialState: JSON.parse(JSON.stringify(initialState)),
            options: { ...options }
        });
        
        // 初始化模块状态并设置响应式
        this.state[moduleName] = this._createProxy(initialState, moduleName);
        
        return this; // 支持链式调用
    }

    /**
     * 创建响应式代理
     * @param {Object} obj - 目标对象
     * @param {string} path - 路径前缀
     * @returns {Proxy} 响应式代理对象
     * @private
     */
    _createProxy(obj, path) {
        // 使用缓存避免重复创建 - 性能优化
        if (this.proxyCache.has(obj)) {
            return this.proxyCache.get(obj);
        }
        
        const self = this;
        const proxy = new Proxy(obj, {
            set(target, property, value) {
                const oldValue = target[property];
                const fullPath = `${path}.${property}`;
                const context = self._currentContext || {};
                
                // 设置新值
                target[property] = value;
                
                // 通知变化
                self._notifyChange(fullPath, value, oldValue, context);
                
                return true;
            },
            
            get(target, property) {
                const value = target[property];
                
                // 如果是对象，创建嵌套代理
                if (self._isObject(value)) {
                    return self._createProxy(value, `${path}.${property}`);
                }
                
                return value;
            }
        });
        
        // 缓存代理对象
        this.proxyCache.set(obj, proxy);
        return proxy;
    }

    /**
     * 检查是否为可代理对象
     * @param {*} value - 待检查的值
     * @returns {boolean} 是否为可代理对象
     * @private
     */
    _isObject(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    /**
     * 解析路径（带缓存，性能最优）
     * @param {string} path - 路径字符串
     * @returns {Object} 解析结果 {moduleName, propertyPath, pathParts}
     * @private
     */
    _parsePath(path) {
        if (this.pathCache.has(path)) {
            return this.pathCache.get(path);
        }
        
        const pathParts = path.split('.');
        const moduleName = pathParts[0];
        const propertyPath = pathParts.slice(1).join('.');
        
        const result = {
            pathParts,
            moduleName,
            propertyPath
        };
        
        // 缓存解析结果
        this.pathCache.set(path, result);
        return result;
    }

    /**
     * 路径工具方法集合
     */
    
    /**
     * 从对象中根据路径获取值（使用缓存，性能最优）
     * @param {Object} obj - 目标对象
     * @param {string} path - 路径字符串
     * @returns {*} 对应路径的值
     * @throws {Error} 当访问 null/undefined 的属性时抛出错误（Fail Fast）
     * @private
     */
    _getValueByPath(obj, path) {
        if (!path) return obj;
        
        const { pathParts } = this._parsePath(path);
        return pathParts.reduce((current, key) => {
            if (!current) {
                throw new Error(`Cannot access property '${key}' on null/undefined`);
            }
            return current[key];
        }, obj);
    }

    /**
     * 根据路径设置对象值（使用缓存，性能最优）
     * 性能优化：直接使用索引访问，避免展开运算符创建数组副本
     * 
     * @param {Object} obj - 目标对象
     * @param {string} path - 路径字符串
     * @param {*} value - 要设置的值
     * @returns {void}
     * @private
     */
    _setValueByPath(obj, path, value) {
        if (!path) return;
        
        const { pathParts } = this._parsePath(path);
        const lastIndex = pathParts.length - 1;
        
        // 性能优化：使用 slice 只创建需要的部分，避免展开运算符和 pop
        const target = pathParts.slice(0, lastIndex).reduce((current, key) => {
            return current[key];
        }, obj);
        
        target[pathParts[lastIndex]] = value;
    }

    /**
     * 通知状态变化
     * 设计决策：不捕获错误（Fail Fast）
     * 如果事件监听器抛出错误，应该立即暴露问题，而不是隐藏。
     * 所有监听器都应该保证不抛错，如果抛错说明代码有严重问题，应该立即修复。
     * 
     * 支持批量更新：在batch()调用期间，变更会被收集，batch结束后一次性通知。
     * 
     * @param {string} path - 状态路径
     * @param {*} newValue - 新值
     * @param {*} oldValue - 旧值
     * @throws {Error} 如果事件发射失败，错误会直接传播
     * @private
     */
    _notifyChange(path, newValue, oldValue, context = {}) {
        // 静默模式：不发送任何事件通知
        if (this._silentMode) {
            return;
        }
        
        // 如果在批量更新中，收集变更而不立即通知
        if (this._isBatching) {
            const existing = this._batchedChanges.get(path);
            if (existing) {
                // 同一路径多次修改：保留初始oldValue，更新最终newValue和context
                this._batchedChanges.set(path, { 
                    newValue, 
                    oldValue: existing.oldValue,
                    context: context  // 保留最新的context
                });
            } else {
                // 首次修改：记录当前的oldValue、newValue和context
                this._batchedChanges.set(path, { newValue, oldValue, context });
            }
            return;
        }
        
        // Fail Fast: 错误直接传播，不捕获
        this.eventNotifier.emit('state:change', {
            path,
            newValue,
            oldValue,
            context,
            timestamp: Date.now()
        });
    }

    /**
     * 检查是否正在批量更新中
     * @returns {boolean} 是否在batch()调用中
     */
    isBatching() {
        return this._isBatching;
    }

    /**
     * 批量状态更新
     * 在回调函数执行期间，所有状态变更会被收集，回调结束后一次性通知所有监听器。
     * 这样可以避免中间状态触发watcher，提高性能并避免UI闪烁。
     * 
     * 使用场景：
     * - 需要同时更新多个相关状态
     * - 避免中间状态触发不必要的UI更新
     * - 确保watcher只在最终状态下执行一次
     * 
     * @param {Function} callback - 批量更新的回调函数
     * @param {Object} options - 批量更新选项（必需）
     * @param {boolean} [options.silent=false] - 是否静默更新（不触发任何事件通知）
     * @returns {void}
     * @throws {Error} 如果回调执行失败、已经在batch中、或options参数无效，错误会直接传播（Fail Fast）
     * 
     * @example
     * // 普通批量更新（触发一次事件）
     * stateManager.batch(() => {
     *     stateManager.state.playback.loop.count = 5;
     *     stateManager.state.playback.loop.variableDuration = true;
     *     stateManager.state.playback.loop.durationSequence = [10, 15, 20, 25, 30];
     * }, {});
     * 
     * @example
     * // 静默批量更新（完全不触发事件）
     * stateManager.batch(() => {
     *     stateManager.state.playback.loop.count = this.originalSettings.loopCount;
     *     stateManager.state.playback.loop.variableDuration = this.originalSettings.variableDuration;
     * }, { silent: true });
     */
    batch(callback, options) {
        // Fail Fast: options参数必需且必须是对象
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('batch() requires an options object as second parameter. Use {} for default behavior or { silent: true } for silent mode.');
        }
        
        // Fail Fast: 不允许嵌套batch
        if (this._isBatching) {
            throw new Error('Cannot nest batch() calls. Already in a batch update.');
        }
        
        // Fail Fast: callback必须是函数
        if (typeof callback !== 'function') {
            throw new Error('batch() requires a function as first argument');
        }
        
        const { silent = false } = options;
        
        // 开始批量更新
        this._isBatching = true;
        this._batchedChanges.clear();
        
        // 如果是静默模式，设置静默标志
        const wasSilent = this._silentMode;
        if (silent) {
            this._silentMode = true;
        }
        
        try {
            // 执行批量更新回调
            callback();
            
            // 静默模式：不发送任何事件
            if (silent) {
                return;
            }
            
            // 回调成功执行后，一次性通知所有变更
            const timestamp = Date.now();
            for (const [path, { newValue, oldValue, context = {} }] of this._batchedChanges) {
                this.eventNotifier.emit('state:change', {
                    path,
                    newValue,
                    oldValue,
                    context,
                    timestamp
                });
            }
        } finally {
            // 确保标志被清除（即使回调抛出错误）
            this._isBatching = false;
            this._silentMode = wasSilent;
            this._batchedChanges.clear();
        }
    }

    /**
     * 重置指定属性到默认值 - 统一状态重置管理（使用缓存，性能最优）
     * @param {string} path - 状态路径（如 'playback.scroll.startPosition'）
     * @returns {void}
     * @throws {Error} 当默认值不存在或模块未找到时抛出错误（Fail Fast）
     */
    resetProperty(path) {
        const defaultValue = this.getDefaultValue(path);
        if (defaultValue === undefined) {
            throw new Error(`Default value not found for path: ${path}`);
        }

        const { moduleName, propertyPath } = this._parsePath(path);

        if (!this.modules.has(moduleName)) {
            throw new Error(`Module '${moduleName}' not found`);
        }

        // 使用现有的路径设置方法
        this._setValueByPath(this.state[moduleName], propertyPath, defaultValue);
    }

    /**
     * 根据路径获取当前状态值（公共方法，使用缓存，性能最优）
     * @param {string} path - 状态路径（如 'ui.layout.sidebarCollapsed'）
     * @returns {*} 对应路径的当前状态值
     */
    getValue(path) {
        return this._getValueByPath(this.state, path);
    }

    /**
     * 根据路径设置状态值（公共方法，处理动态路径场景）
     * 
     * 使用场景：
     * 1. 动态路径：路径是变量或运行时才能确定（如 ScrollService.updateConfig）
     * 2. 批量操作：循环设置多个不同路径的状态（如 ConfigService._applyStateConfig）
     * 3. 静默更新：程序内部恢复值，不触发验证（如 ScrollService 恢复默认值）
     * 
     * 注：大多数服务直接访问 this.stateManager.state.xxx 来修改状态（路径固定时更简洁），
     * 这样做会触发Proxy响应式机制，自动发送 state:change 事件。
     * setValue() 与直接访问等价，专门用于路径是变量的场景。
     * 
     * @param {string} path - 状态路径（如 'playback.scroll.duration'）
     * @param {*} value - 要设置的值
     * @param {Object} options - 设置选项（必需）
     * @param {boolean} [options.silent=false] - 是否静默更新（不触发任何事件通知）
     * @returns {void}
     * @throws {Error} 如果options参数无效，错误会直接传播（Fail Fast）
     * 
     * @example
     * // 动态路径场景（普通更新）
     * const path = 'playback.scroll.duration';
     * this.stateManager.setValue(path, 10, {});
     * 
     * @example
     * // 批量设置场景
     * Object.entries(config.scroll).forEach(([key, value]) => {
     *     this.stateManager.setValue(`playback.scroll.${key}`, value, {});
     * });
     * 
     * @example
     * // 静默更新（程序内部恢复值，不触发验证）
     * this.stateManager.setValue('playback.scroll.duration', defaultValue, { silent: true });
     */
    setValue(path, value, options) {
        // Fail Fast: options参数必需且必须是对象
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('setValue() requires an options object as third parameter. Use {} for default behavior or { silent: true } for silent mode.');
        }
        
        const { silent = false, immediate = false } = options;
        
        if (silent) {
            const wasSilent = this._silentMode;
            this._silentMode = true;
            try {
                this._setValueByPath(this.state, path, value);
            } finally {
                this._silentMode = wasSilent;
            }
        } else {
            // 临时存储context，供Proxy使用
            this._currentContext = { immediate };
            try {
                this._setValueByPath(this.state, path, value);
            } finally {
                this._currentContext = null;
            }
        }
    }

    /**
     * 根据路径获取配置文件中的默认值 - 从初始状态中获取未被用户修改的原始配置值（使用缓存，性能最优）
     * 
     * @param {string} path - 状态路径（如 'playback.scroll.duration'）
     * @returns {*} 对应路径的原始配置值
     * @throws {Error} 如果模块不存在
     */
    getDefaultValue(path) {
        const { moduleName, propertyPath } = this._parsePath(path);
        
        // Fail Fast: 模块不存在是严重错误，应该立即抛出
        if (!this.modules.has(moduleName)) {
            throw new Error(`StateManager: Module '${moduleName}' not found for path: ${path}`);
        }
        
        const moduleConfig = this.modules.get(moduleName);
        const initialState = moduleConfig.initialState;
        
        if (!propertyPath) {
            return JSON.parse(JSON.stringify(initialState));
        }
        return this._getValueByPath(initialState, propertyPath);
    }
}

// 导出类供直接使用
export { StateManager };

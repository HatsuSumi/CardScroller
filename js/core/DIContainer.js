/**
 * DIContainer - 依赖注入容器
 * 管理服务的依赖关系和生命周期，实现控制反转（IoC）模式，负责服务的注册、解析和依赖注入，提高代码的可测试性和可维护性。支持单例模式和原型模式两种生命周期管理，提供实例缓存机制优化性能。内置循环依赖检测机制，在服务解析时实时检测并报告循环依赖问题。采用链式调用API设计，支持流畅的服务注册语法，简化ServiceRegistry的配置代码。
 * 
 * 当前被使用的模块：
 * - （核心基础设施，被启动层使用）
 * 
 * 当前依赖的模块：
 * - 无直接依赖，纯JavaScript实现
 * 
 * 架构说明：
 * DIContainer作为底层基础设施，直接抛出错误而不通过ErrorDisplayService等统一服务，
 * 不依赖上层的ErrorDisplayService等统一服务，以避免循环依赖并保持架构层次清晰，即可绕过十一大统一服务
 */
class DIContainer {
    /**
     * 创建依赖注入容器实例
     * 初始化四个核心数据结构：
     * - services: 存储服务配置（Map<服务名, 配置对象>）
     * - instances: 存储单例实例缓存（Map<服务名, 实例>）
     * - singletons: 标记单例服务（Set<服务名>）
     * - resolving: 追踪正在解析的服务，用于循环依赖检测（Set<服务名>）
     */
    constructor() {
        this.services = new Map();
        this.instances = new Map();
        this.singletons = new Set();
        this.resolving = new Set(); 
    }

    /**
     * 注册服务
     * @param {string} name - 服务名称
     * @param {Function|Object} implementation - 服务实现（类构造函数或对象实例）
     * @param {Object} [options={}] - 配置选项，可包含 singleton（是否单例）和 dependencies（依赖项数组）
     * @returns {DIContainer} 返回自身以支持链式调用
     * @throws {Error} 当服务名称已被注册时抛出错误（Fail Fast）
     */
    register(name, implementation, options = {}) {
        if (this.services.has(name)) {
            throw new Error(`Service '${name}' is already registered`);
        }

        const config = {
            implementation,
            singleton: options.singleton || false,
            dependencies: options.dependencies || [],
            ...options
        };

        this.services.set(name, config);

        if (config.singleton) {
            this.singletons.add(name);
        }

        return this;
    }

    /**
     * 注册单例服务
     * @param {string} name - 服务名称
     * @param {Function|Object} implementation - 服务实现（类构造函数或对象实例）
     * @param {Object} [options={}] - 配置选项，可包含 dependencies（依赖项数组）
     * @returns {DIContainer} 返回自身以支持链式调用
     * @throws {Error} 当服务名称已被注册时抛出错误（Fail Fast）
     */
    singleton(name, implementation, options = {}) {
        return this.register(name, implementation, { ...options, singleton: true });
    }

    /**
     * 从容器中解析并返回服务实例（性能优化：优先检查缓存）
     * 设计决策：使用 finally 清理资源，直接传播错误（Fail Fast）
     * 不包装错误以保留完整的错误堆栈信息，便于调试
     * 
     * @param {string} name - 服务名称
     * @returns {*} 服务实例
     * @throws {Error} 服务创建过程中的任何错误都会直接传播（包括服务未注册、循环依赖等）
     */
    resolve(name) {
        // 性能优化：先检查缓存，避免不必要的验证
        const cachedInstance = this._getCachedInstance(name);
        if (cachedInstance) {
            return cachedInstance;
        }
        
        // 只有缓存未命中时才进行验证
        this._validateService(name);
        this._checkCircularDependency(name);

        this.resolving.add(name);
        
        try {
            const instance = this._createInstance(name);
            this._cacheInstance(name, instance);
            return instance;
        } finally {
            // 无论成功还是失败，都清理 resolving Set（避免影响后续调用）
            this.resolving.delete(name);
        }
    }

    /**
     * 验证服务是否存在
     * @param {string} name - 服务名称
     * @returns {void}
     * @throws {Error} 当服务未注册时抛出错误（Fail Fast）
     * @private
     */
    _validateService(name) {
        if (!this.services.has(name)) {
            throw new Error(`Service "${name}" not registered`);
        }
    }

    /**
     * 检查循环依赖
     * @param {string} name - 服务名称
     * @returns {void}
     * @throws {Error} 当检测到循环依赖时抛出错误（Fail Fast）
     * @private
     */
    _checkCircularDependency(name) {
        if (this.resolving.has(name)) {
            throw new Error(`Circular dependency detected for service "${name}"`);
        }
    }

    /**
     * 获取缓存实例
     * 性能优化：直接get判断，避免重复Map查询
     * 只有单例才会被缓存到instances，所以无需检查singletons
     * 
     * @param {string} name - 服务名称
     * @returns {*|null} 缓存的实例或null
     * @private
     */
    _getCachedInstance(name) {
        // 性能优化：直接get，避免 has + get 的双重查询
        const instance = this.instances.get(name);
        return instance !== undefined ? instance : null;
    }

    /**
     * 创建服务实例
     * @param {string} name - 服务名称
     * @returns {*} 服务实例
     * @private
     */
    _createInstance(name) {
        const config = this.services.get(name);
        
        if (typeof config.implementation === 'function') {
            return this._createFromConstructor(config);
        } else {
            return config.implementation;
        }
    }

    /**
     * 缓存实例
     * 性能优化：直接使用singletons Set，避免重复查询config
     * 
     * @param {string} name - 服务名称
     * @param {*} instance - 实例对象
     * @returns {void}
     * @private
     */
    _cacheInstance(name, instance) {
        // 性能优化：直接检查singletons Set，避免查询services Map
        if (this.singletons.has(name)) {
            this.instances.set(name, instance);
        }
    }

    /**
     * 从构造函数创建实例
     * @param {Object} config - 服务配置
     * @returns {*} 服务实例
     * @private
     */
    _createFromConstructor(config) {
        const Constructor = config.implementation;
        const dependencies = this._resolveDependencies(config.dependencies);
        
        return new Constructor(...dependencies);
    }

    /**
     * 解析依赖项
     * @param {Array} dependencies - 依赖项数组
     * @returns {Array} 已解析的依赖项
     * @private
     */
    _resolveDependencies(dependencies = []) {
        return dependencies.map(dep => {
            if (typeof dep === 'string') {
                return this.resolve(dep);
            } else {
                // 直接返回非字符串依赖（如常量值）
                return dep;
            }
        });
    }

}

// 导出类而非单例 
export { DIContainer };

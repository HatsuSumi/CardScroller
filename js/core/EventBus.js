/**
 * EventBus - 事件总线
 * 解耦模块间通信，实现发布-订阅模式，发布者和订阅者通过事件名称间接通信，完全解耦
 * 
 * 两种通信模式：
 * 1. emit() - 单向通知（fire-and-forget）：发送事件后不等待响应，适用于通知、状态变更等
 * 2. request() - 同步请求-响应：立即获取返回值，适用于需要Fail Fast的同步验证、计算等
 * 
 * 使用指南：
 * - 使用emit()：UI更新、状态通知、错误报告、异步操作（如图片解析）
 * - 使用request()：同步验证（文件、配置）、计算（无副作用的纯函数）、需要立即Fail Fast的场景
 * 
 * 当前被使用的模块：
 * - （核心基础设施，被所有服务使用）
 * 
 * 当前依赖的模块：
 * - 无直接依赖，纯JavaScript实现
 * 
 * 架构说明：
 * EventBus作为底层基础设施，直接抛出错误，
 * 不依赖上层的ErrorDisplayService等统一服务，以避免循环依赖并保持架构层次清晰，即可绕过十二大统一服务
 * 
 * 设计决策：何时使用 off() 方法？
 * 
 * 判断标准：**EventBus 监听器在哪里绑定？**
 * 
 * 1. **constructor 中绑定** → 无需 off()
 *    - 服务实例只创建一次，监听器应存活至应用结束
 *    - 例如：大部分单例服务（ImageService、ScrollService 等）
 * 
 * 2. **renderConfig/init 中绑定** → 必须在 destroy() 中 off()
 *    - renderConfig/init 可能被多次调用（用户反复打开/关闭页面）
 *    - 如果不解绑，会导致重复绑定和内存泄漏
 *    - 例如：Page 层服务（PerformanceReportPage、EntryAnimationConfigPage）
 * 
 * 注意事项：
 * - 必须保存回调引用（bind/箭头函数每次调用返回新引用）
 * - 建议统一架构：同一类型的服务采用相同的绑定/解绑模式
 */
class EventBus {
    /**
     * 创建事件总线实例
     * 初始化事件存储Map，用于保存所有事件名称和对应的监听器集合
     * 使用Set存储监听器以实现自动去重和更高效的内存管理
     */
    constructor() {
        this.events = new Map();
    }

    /**
     * 订阅事件
     * 允许同一事件注册多个监听器，按注册顺序依次执行
     * Set数据结构自动去重，同一回调不会被重复注册
     * 
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     * @returns {void}
     * @throws {TypeError} 如果callback不是函数类型（Fail Fast）
     */
    on(event, callback) {
        // Fail Fast: 立即验证参数类型
        if (typeof callback !== 'function') {
            throw new TypeError(`EventBus.on: callback must be a function, got ${typeof callback}`);
        }

        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        
        this.events.get(event).add(callback);
    }

    /**
     * 取消订阅事件
     * 移除指定事件的监听器，用于多实例组件的清理
     * 
     * 重要：必须传入与 on() 时相同的回调函数引用
     * - 使用 bind() 时：必须保存 bind() 返回的函数引用
     * - 使用箭头函数时：必须保存箭头函数的引用
     * 
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数（必须与 on() 时的引用相同）
     * @returns {void}
     * @throws {TypeError} 如果callback不是函数类型（Fail Fast）
     */
    off(event, callback) {
        // Fail Fast: 立即验证参数类型
        if (typeof callback !== 'function') {
            throw new TypeError(`EventBus.off: callback must be a function, got ${typeof callback}`);
        }

        // 如果事件不存在，静默返回（幂等性：多次 off() 不报错）
        if (!this.events.has(event)) {
            return;
        }

        const listeners = this.events.get(event);
        listeners.delete(callback);

        // 如果没有监听器了，清理事件entry（避免内存泄漏）
        if (listeners.size === 0) {
            this.events.delete(event);
        }
    }

    /**
     * 发布事件
     * 触发指定事件的所有监听器，依次执行回调函数
     * 使用Set副本进行遍历，防止监听器内部注册新监听器时的并发修改问题
     * 
     * 设计决策：不捕获监听器错误（Fail Fast）
     * 任何监听器抛出的错误都会直接传播，立即暴露问题。
     * 这是有意为之的设计：所有监听器都是内部可控的，应该保证不抛错，
     * 如果抛错说明代码有严重问题，应该立即修复而不是隐藏。
     * 
     * @param {string} event - 事件名称
     * @param {*} [data] - 事件数据，传递给所有监听器（可选）
     * @returns {void}
     * @throws {Error} 任何监听器抛出的错误都会直接传播
     */
    emit(event, data) {
        if (this.events.has(event)) {
            const listeners = this.events.get(event);
            // 遍历副本，防止监听器内部调用on()时修改原Set导致迭代异常
            [...listeners].forEach(callback => {
                callback(data); // Fail Fast: 错误直接抛出
            });
        }
    }

    /**
     * 同步请求-响应机制
     * 用于需要立即获取返回值的场景（如验证），与emit的"fire and forget"模式不同
     * 
     * 设计约束（Fail Fast）：
     * 1. 必须有且仅有一个监听器
     * 2. 监听器必须返回非undefined值
     * 3. 任何错误立即抛出，不捕获
     * 
     * 使用场景：
     * - Business层调用System层ValidationService进行同步验证
     * - 需要立即获取计算结果的跨层调用
     * 
     * @param {string} event - 请求事件名称
     * @param {*} [data] - 请求数据
     * @returns {*} 监听器的返回值
     * @throws {Error} 当没有监听器、监听器数量不为1、或监听器未返回值时抛出错误（Fail Fast）
     */
    request(event, data) {
        // Fail Fast: 必须有监听器
        if (!this.events.has(event)) {
            throw new Error(`EventBus.request: No listener registered for event "${event}"`);
        }

        const listeners = this.events.get(event);
        
        // Fail Fast: 必须有且仅有一个监听器
        if (listeners.size === 0) {
            throw new Error(`EventBus.request: No listener registered for event "${event}"`);
        }
        if (listeners.size > 1) {
            throw new Error(`EventBus.request: Multiple listeners (${listeners.size}) registered for event "${event}". Request events must have exactly one listener to ensure Single Source of Truth (SSOT).`);
        }

        // 获取唯一的监听器并同步执行
        const callback = [...listeners][0];
        const result = callback(data); // Fail Fast: 错误直接抛出

        // Fail Fast: 监听器必须返回值
        if (result === undefined) {
            throw new Error(`EventBus.request: Listener for event "${event}" must return a value (got undefined)`);
        }

        return result;
    }

    /**
     * 异步请求-响应机制
     * 用于需要异步操作并获取返回值的场景（如图片解析），支持Promise
     * 
     * 设计约束（Fail Fast）：
     * 1. 必须有且仅有一个监听器
     * 2. 监听器必须返回非undefined值（可以是Promise）
     * 3. 任何错误立即抛出，不捕获
     * 
     * 使用场景：
     * - 异步验证（如validateConfigImageDimensions需要parseFromBase64）
     * - 异步计算或查询
     * 
     * @param {string} event - 请求事件名称
     * @param {*} [data] - 请求数据
     * @returns {Promise<*>} 监听器的返回值（Promise）
     * @throws {Error} 当没有监听器、监听器数量不为1、或监听器未返回值时抛出错误（Fail Fast）
     */
    async requestAsync(event, data) {
        // Fail Fast: 必须有监听器
        if (!this.events.has(event)) {
            throw new Error(`EventBus.requestAsync: No listener registered for event "${event}"`);
        }

        const listeners = this.events.get(event);
        
        // Fail Fast: 必须有且仅有一个监听器
        if (listeners.size === 0) {
            throw new Error(`EventBus.requestAsync: No listener registered for event "${event}"`);
        }
        if (listeners.size > 1) {
            throw new Error(`EventBus.requestAsync: Multiple listeners (${listeners.size}) registered for event "${event}". Request events must have exactly one listener to ensure Single Source of Truth (SSOT).`);
        }

        // 获取唯一的监听器并执行（自动等待Promise）
        const callback = [...listeners][0];
        const result = await callback(data); // await处理Promise，Fail Fast: 错误直接抛出

        // Fail Fast: 监听器必须返回值
        if (result === undefined) {
            throw new Error(`EventBus.requestAsync: Listener for event "${event}" must return a value (got undefined)`);
        }

        return result;
    }
}

// 导出单例
const eventBus = new EventBus();
export { eventBus };

/**
 * PreferenceService - 全局偏好服务
 * 封装并统一管理与浏览器 LocalStorage 的所有交互，为应用提供一个持久化存储用户全局偏好的中心化服务。
 * 
 * 职责说明：
 * - 统一处理 LocalStorage 的读写 API 调用。
 * - 自动处理数据的 JSON 序列化和反序列化。
 * - 健壮地处理 LocalStorage 不可用、存储已满或数据损坏等异常情况。
 * 
 * 当前被使用的模块：
 * - 无 (这是一个底层的工具服务，将在应用启动时被引导模块调用)
 * 
 * 当前依赖的模块：
 * - 无
 * 
 * 架构说明：
 * - 本服务是一个底层的工具服务，不依赖任何其他项目服务，确保其高可复用性。
 * - 所有方法均在内部处理异常并打印错误日志，不会向外抛出，调用者无需进行 try...catch。
 */
export class PreferenceService {
    #isAvailable = false;

    /**
     * 创建 PreferenceService 实例。
     * 在构造函数中会立即检查 LocalStorage 是否可用，并设置可用性标志。
     */
    constructor() {
        this.#checkAvailability();
    }

    /**
     * 检查 LocalStorage 是否可用。
     * 通过尝试写入一个临时键值来做实际的可用性检测，以处理私密模式等场景。
     * @private
     */
    #checkAvailability() {
        try {
            const testKey = '__test_localstorage__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
            this.#isAvailable = true;
        } catch (e) {
            this.#isAvailable = false;
            console.warn(
                'PreferenceService: LocalStorage is not available. ' +
                'This might be due to private browsing mode or browser security settings. ' +
                'User preferences will not be saved.'
            );
        }
    }

    /**
     * 检查 LocalStorage 是否可用。
     * @returns {boolean} 如果可用则返回 true，否则返回 false。
     */
    isAvailable() {
        return this.#isAvailable;
    }

    /**
     * 从 LocalStorage 中获取一个值。
     * @param {string} key - 要获取的键。
     * @param {*} [defaultValue=null] - 如果键不存在或解析失败时返回的默认值。
     * @returns {*} 解析后的值，或默认值。
     */
    get(key, defaultValue = null) {
        // Fail Fast: 如果存储不可用，或 key 无效，则直接返回默认值。
        if (!this.#isAvailable) return defaultValue;
        if (typeof key !== 'string' || !key) {
            console.error('PreferenceService.get: Key must be a non-empty string.');
            return defaultValue;
        }

        try {
            const storedValue = localStorage.getItem(key);
            if (storedValue === null) {
                return defaultValue;
            }
            return JSON.parse(storedValue);
        } catch (error) {
            console.error(`PreferenceService.get: Failed to parse value for key "${key}". Returning default value.`, error);
            return defaultValue;
        }
    }

    /**
     * 向 LocalStorage 中设置一个值。
     * 值会被 JSON 序列化后存储。
     * 
     * 注意：本方法内部会捕获存储已满等异常，不会向外抛出错误。
     * 
     * @param {string} key - 要设置的键。
     * @param {*} value - 要设置的值。
     * @returns {void}
     */
    set(key, value) {
        // Fail Fast: 如果存储不可用，或 key 无效，则直接返回。
        if (!this.#isAvailable) return;
        if (typeof key !== 'string' || !key) {
            console.error('PreferenceService.set: Key must be a non-empty string.');
            return;
        }

        try {
            const serializedValue = JSON.stringify(value);
            localStorage.setItem(key, serializedValue);
        } catch (error) {
            console.error(`PreferenceService.set: Failed to set value for key "${key}". This might be due to storage limits.`, error);
        }
    }

    /**
     * 从 LocalStorage 中移除一个键值对。
     * 
     * @remarks
     * 这是一个基础的存储操作API。虽然在当前的重构计划中未被直接调用，
     * 但为了服务的完整性和未来的“恢复默认设置”等功能，此方法被保留。
     * 
     * @param {string} key - 要移除的键。
     * @returns {void}
     */
    remove(key) {
        if (!this.#isAvailable) return;
        if (typeof key !== 'string' || !key) {
            console.error('PreferenceService.remove: Key must be a non-empty string.');
            return;
        }

        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`PreferenceService.remove: Failed to remove key "${key}".`, error);
        }
    }

    /**
     * 清空所有由该服务管理的 LocalStorage 条目。
     * 注意：这将清除所有 LocalStorage 中的数据，请谨慎使用。
     * 
     * @remarks
     * 这是一个用于调试或“恢复出厂设置”等场景的底层API。
     * 虽然在当前的重构计划中未被直接调用，但为了API的完整性和未来的可维护性，此方法被保留。
     * 
     * @returns {void}
     */
    clear() {
        if (!this.#isAvailable) return;

        try {
            localStorage.clear();
        } catch (error) {
            console.error('PreferenceService.clear: Failed to clear LocalStorage.', error);
        }
    }
}

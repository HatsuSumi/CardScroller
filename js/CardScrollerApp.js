/**
 * CardScroller 主应用入口 - 应用生命周期管理和公共API入口
 * 负责应用的初始化启动、生命周期管理和对外API暴露。
 * 通过委托ApplicationBootstrap处理复杂的服务初始化流程，自身专注于应用级别的状态管理和公共接口提供。
 * 提供多个公共API方法（getService、getServices、getStateManager、isReady、getVersion）供外部调试、扩展和集成使用。
 * 
 * 当前被使用的模块：
 * - index.html - HTML页面启动脚本，通过script标签导入
 * 
 * 当前依赖的模块：
 * - ApplicationBootstrap (bootstrap/ApplicationBootstrap.js) - 应用引导服务（通过import导入）
 * 
 * 架构说明：
 * CardScrollerApp作为主应用入口，属于启动引导层基础设施，
 * 直接操作StateManager.state，不依赖上层的统一服务，
 * 以避免循环依赖并保持架构层次清晰，即可绕过十一大统一服务
 */
import { ApplicationBootstrap } from './bootstrap/ApplicationBootstrap.js';

class CardScrollerApp {
    /**
     * 创建主应用实例
     * 初始化核心属性：
     * - services: 存储所有已初始化的服务实例（从 ApplicationBootstrap 获取）
     * - bootstrap: 应用启动协调器实例
     * - container: 依赖注入容器实例，初始为 null，在 init() 中获取
     * - stateManager: 状态管理器实例，初始为 null，在 init() 中获取
     */
    constructor() {
        this.services = {};
        this.bootstrap = new ApplicationBootstrap();
        this.container = null;
        this.stateManager = null;
        }

    /**
     * 初始化应用
     * 
     * 完整的应用初始化流程：
     * 1. 检查是否已初始化（从全局状态读取），避免重复初始化
     * 2. 委托ApplicationBootstrap执行服务注册和初始化
     * 3. 获取并验证核心组件（DIContainer和StateManager）
     * 4. 缓存所有服务实例到this.services
     * 5. 批量更新应用状态为已初始化
     * 
     * @returns {Promise<void>}
     * @throws {Error} 如果DI容器或StateManager初始化失败
     */
    async init() {
        try {
            // 检查是否已初始化（从全局状态读取，避免状态冗余）
            if (this.stateManager && this.stateManager.state.app.isInitialized) {
                console.warn('⚠️ App already initialized');
                return;
            }

            // 使用 ApplicationBootstrap 处理复杂的初始化逻辑
            await this.bootstrap.init();
            
            // 获取核心组件
            this.container = this.bootstrap.getContainer();
            // Fail Fast: 检查关键依赖
            if (!this.container) {
                throw new Error('Failed to initialize DI container');
            }
            
            this.stateManager = this.bootstrap.getStateManager();
            // Fail Fast: 检查关键依赖
            if (!this.stateManager) {
                throw new Error('Failed to initialize StateManager');
            }
            
            this.services = this.bootstrap.getServices();
            
            // 使用 batch 批量更新应用状态（避免多次触发 state watcher）
            this.stateManager.batch(() => {
                this.stateManager.state.app.isInitialized = true;
                this.stateManager.state.app.isLoading = false;
            }, {});
            
        } catch (error) {
            console.error('❌ 应用初始化失败:', error);
            if (this.stateManager) {
                this.stateManager.state.app.isLoading = false;
            }
            throw error;
        }
    }

    /**
     * 获取服务实例
     * 性能优化：首次 resolve 后缓存到 this.services，避免重复解析
     * 
     * 注意：此方法为公共API（通过 window.cardScrollerApp 暴露），
     * 虽然项目内部未使用，但提供给外部调试、扩展和集成使用
     * 
     * @internal
     * @param {string} serviceName - 服务名称
     * @returns {Object} 服务实例
     * @throws {Error} 如果容器未初始化或服务不存在
     */
    getService(serviceName) {
        // Fail Fast: 容器未初始化
        if (!this.container) {
            throw new Error(`CardScrollerApp: 无法获取服务 '${serviceName}'，DI容器尚未初始化`);
        }
        
        // 先从缓存中查找
        if (this.services[serviceName]) {
            return this.services[serviceName];
        }
        
        // 从容器中 resolve
        // 注：container.resolve() 已有 Fail Fast 检查，此处无需重复验证
        const service = this.container.resolve(serviceName);
        
        // 性能优化：缓存 resolve 结果，避免下次重复解析
        this.services[serviceName] = service;
        return service;
    }

    /**
     * 获取所有服务
     * 
     * 注意：此方法为公共API（通过 window.cardScrollerApp 暴露），
     * 虽然项目内部未使用，但提供给外部调试、扩展和集成使用
     * 
     * @internal
     * @returns {Object} 所有服务实例的副本对象
     */
    getServices() {
        return { ...this.services };
    }

    /**
     * 获取状态管理器
     * 
     * 注意：此方法为公共API（通过 window.cardScrollerApp 暴露），
     * 虽然项目内部未使用，但提供给外部调试、扩展和集成使用
     * 
     * @internal
     * @returns {StateManager|null} 状态管理器实例，未初始化时为 null
     */
    getStateManager() {
        return this.stateManager;
    }

    /**
     * 检查应用是否准备就绪
     * 
     * 注意：此方法为公共API（通过 window.cardScrollerApp 暴露），
     * 虽然项目内部未使用，但提供给外部调试、扩展和集成使用
     * 
     * @internal
     * @returns {boolean} 已准备就绪返回 true，否则返回 false
     */
    isReady() {
        return this.stateManager && this.stateManager.state.app.isInitialized;
    }

    /**
     * 获取应用版本
     * 
     * 注意：此方法为公共API（通过 window.cardScrollerApp 暴露），
     * 虽然项目内部未使用，但提供给外部调试、扩展和集成使用
     * 
     * @internal
     * @returns {string} 应用版本号，从 defaultState.json 的 system.version 读取
     * @throws {Error} 如果 StateManager 未初始化
     */
    getVersion() {
        // Fail Fast: StateManager 未初始化
        if (!this.stateManager) {
            throw new Error('CardScrollerApp: 无法获取版本号，StateManager 尚未初始化');
        }
        return this.stateManager.state.system.version;
    }
}

// 应用启动入口
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 注意：将应用实例挂载到window用于调试和测试（这是项目唯一的全局变量）
        // - 开发调试：可在控制台访问 window.cardScrollerApp.stateManager.state 等
        // - E2E测试：测试脚本可以访问应用内部状态
        // - 命名特殊：cardScrollerApp 不太可能与其他库冲突
        // - 如需避免全局污染：可用IIFE封装，但会失去调试便利性
        window.cardScrollerApp = new CardScrollerApp();
        await window.cardScrollerApp.init();
    } catch (error) {
        alert(`应用启动失败，请检查网络连接或刷新页面重试。\n\n错误详情：${error.message}`);
    }
});

export { CardScrollerApp };

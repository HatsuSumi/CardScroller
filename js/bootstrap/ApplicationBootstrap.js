/**
 * ApplicationBootstrap - 应用启动协调器
 * 管理应用的启动流程和服务初始化，负责创建StateManager和DIContainer，按依赖顺序初始化所有服务。功能包括：状态模块加载、服务注册、6组服务分组初始化（基础、UI、模态框、业务、系统、UI协调）
 * 
 * 当前被使用的模块：
 * - 无（启动引导层，由主应用直接调用）
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线单例实例 (直接导入)
 * - StateManager (core/StateManager.js) - 状态管理器类 (直接导入)
 * - ServiceRegistry (bootstrap/ServiceRegistry.js) - 服务注册配置类 (直接导入)
 * - defaultState.json (config/defaultState.json) - 应用默认状态配置 (通过fetch加载)
 * - PreferenceService (services/utils/PreferenceService.js) - 全局偏好服务 (直接导入)
 * - StateWatcherService (system/StateWatcherService.js) - 状态监听服务 (通过DI容器获取)
 * 
 * 架构说明：
 * ApplicationBootstrap作为启动引导层基础设施，负责创建StateManager和DIContainer，
 * 并将EventBus与它们关联。直接抛出错误而不通过ErrorDisplayService等统一服务，
 * 不依赖上层的统一服务，以避免循环依赖并保持架构层次清晰，即可绕过十二大统一服务
 */
import { eventBus } from '../core/EventBus.js';
import { StateManager } from '../core/StateManager.js';
import { ServiceRegistry } from './ServiceRegistry.js';
import { PreferenceService } from '../services/utils/PreferenceService.js';

export class ApplicationBootstrap {
    /**
     * 创建应用启动协调器实例
     * 初始化四个核心属性：
     * - isInitialized: 标记应用是否已完成初始化
     * - services: 存储所有已初始化的服务实例（Object<服务名, 服务实例>）
     * - stateManager: 状态管理器实例，初始为 null，在 _createStateManager() 中创建
     * - container: 依赖注入容器实例，初始为 null，在 _registerServices() 中创建
     */
    constructor() {
        this.isInitialized = false;
        this.services = {};
        this.stateManager = null;
        this.container = null;
        this.preferenceService = null;
    }

    /**
     * 初始化应用启动流程
     * 按顺序执行：创建状态管理器 -> 加载状态模块 -> 注册服务 -> 初始化服务
     * 
     * @returns {Promise<void>}
     * @throws {Error} 初始化过程中的任何错误都会向上抛出
     */
    async init() {
        if (this.isInitialized) {
            console.warn('⚠️ Application is already initialized');
            return;
        }

        try {
            this._createStateManager();
            await this._loadStateModules();
            this._loadPreferences();
            this._registerServices();
            await this._initializeServices();
            this._setupPreferencePersistence();
            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Application initialization failed:', error);
            throw error;
        }
    }

    /**
     * 创建状态管理器实例
     * 将 StateManager 和 EventBus 相互关联，支持状态变化的事件通知
     * 
     * @returns {void}
     * @private
     * @throws {Error} 如果 eventBus 不存在，抛出错误
     */
    _createStateManager() {
        if (!eventBus) {
            throw new Error('EventBus is required for ApplicationBootstrap');
        }
        
        this.stateManager = new StateManager(eventBus);
        eventBus.stateManager = this.stateManager;
    }

    /**
     * 从配置文件加载并注册所有状态模块
     * 读取 defaultState.json 并逐个注册到 StateManager
     * 
     * @returns {Promise<void>}
     * @private
     * @throws {Error} 配置文件加载失败或模块注册失败时抛出错误
     */
    async _loadStateModules() {
        try {
            const response = await fetch('./config/defaultState.json');
            if (!response.ok) {
                throw new Error(`Failed to load default state config: ${response.status}`);
            }
            
            const defaultState = await response.json();
            
            Object.entries(defaultState).forEach(([moduleName, moduleState]) => {
                try {
                    this.stateManager.registerModule(moduleName, moduleState, {});
                } catch (error) {
                    console.error(`❌ Failed to register state module '${moduleName}':`, error);
                    throw error;
                }
            });
        } catch (error) {
            console.error('❌ Failed to initialize state modules from config:', error);
            throw error;
        }
    }

    /**
     * 加载并应用用户偏好
     * 从 PreferenceService 读取数据并覆盖 StateManager 中的默认值
     * @private
     */
    _loadPreferences() {
        this.preferenceService = new PreferenceService();
        if (!this.preferenceService.isAvailable()) {
            console.warn('LocalStorage is not available. User preferences will not be loaded or saved.');
            return;
        }

        const savedPreferences = this.preferenceService.get('userPreferences');
        if (savedPreferences && typeof savedPreferences === 'object') {
            this.stateManager.batch(() => {
                // 必须通过 setValue 逐一设置，以确保响应式系统能精确追踪到每个叶子节点的变化
                this._applyPreferencesRecursively(savedPreferences, 'preferences');
            }, {});
        }
    }

    /**
     * 递归地应用偏好设置
     * 遍历偏好对象，并使用 StateManager.setValue 来更新每个叶子节点
     * @private
     * @param {Object} preferencesObject - 当前要应用的偏好对象
     * @param {string} currentPath - 当前状态的基础路径
     */
    _applyPreferencesRecursively(preferencesObject, currentPath) {
        for (const key in preferencesObject) {
            if (Object.prototype.hasOwnProperty.call(preferencesObject, key)) {
                const value = preferencesObject[key];
                const newPath = `${currentPath}.${key}`;
                
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    // 如果是对象，则继续递归
                    this._applyPreferencesRecursively(value, newPath);
                } else {
                    // 如果是叶子节点（或数组），则使用 setValue 更新
                    // 必须使用普通的 setValue，让 batch() 能够收集变更
                    this.stateManager.setValue(newPath, value, {});
                }
            }
        }
    }

    /**
     * 设置用户偏好的持久化
     * 监听 StateManager 中 'preferences' 模块的变化，并保存到 PreferenceService
     * @private
     */
    _setupPreferencePersistence() {
        if (!this.preferenceService || !this.preferenceService.isAvailable()) {
            return;
        }

        const stateWatcherService = this.container.resolve('stateWatcherService');
        if (!stateWatcherService) {
            throw new Error('ApplicationBootstrap: StateWatcherService not found in DI container. It may not have been registered or initialized yet.');
        }

        stateWatcherService.watchState(
            'preferences',
            (newPreferences) => {
                this.preferenceService.set('userPreferences', newPreferences);
            },
            { deep: true }
        );
    }

    /**
     * 注册所有服务到依赖注入容器
     * 创建 DIContainer 并注册 eventBus 和 stateManager 为单例
     * 
     * @returns {void}
     * @private
     * @throws {Error} 如果 stateManager 或 eventBus 不存在，抛出错误
     */
    _registerServices() {
        if (!this.stateManager) {
            throw new Error('StateManager must be created before registering services');
        }
        if (!eventBus) {
            throw new Error('EventBus is required for service registration');
        }
        
        const serviceRegistry = new ServiceRegistry();
        this.container = serviceRegistry.registerAllServices();
        this.container.singleton('eventBus', eventBus);
        this.container.singleton('stateManager', this.stateManager);
    }

    /**
     * 初始化所有服务
     * 按依赖顺序串行初始化6个服务组，每组内部并行初始化以提升性能
     * 顺序：基础服务 -> UI服务 -> 模态框服务 -> 业务服务 -> 系统服务 -> UI协调服务
     * 
     * @returns {Promise<void>}
     * @private
     */
    async _initializeServices() {
        await this._initializeBasicServices();
        await this._initializeUIServices();
        await this._initializeModalServices();
        await this._initializeBusinessServices();
        await this._initializeSystemServices();
        await this._initializeUICoordinationServices();
        this._initializeObjectPools();
    }

    /**
     * 初始化并缓存服务组
     * 
     * @param {Array<{name: string, service: Object}>} services - 服务配置数组
     * @returns {Promise<void>}
     * @private
     */
    async _initializeAndCacheServices(services) {
        // 并行执行所有服务的 init()
        await Promise.all(services.map(({ service }) => service.init()));
        
        // 初始化完成后统一缓存
        services.forEach(({ name, service }) => {
            this.services[name] = service;
        });
    }

    /**
     * 初始化基础服务组（第一组）
     * 包括：KeyboardService、LoadingService、DialogService、MessageService、
     *       ErrorDisplayService、ProgressBarService、TooltipService
     * 组内并行初始化以提升性能
     * 
     * @returns {Promise<void>}
     * @private
     */
    async _initializeBasicServices() {
        const services = [
            { name: 'keyboardService', service: this.container.resolve('keyboardService') },
            { name: 'loadingService', service: this.container.resolve('loadingService') },
            { name: 'dialogService', service: this.container.resolve('dialogService') },
            { name: 'messageService', service: this.container.resolve('messageService') },
            { name: 'errorDisplayService', service: this.container.resolve('errorDisplayService') },
            { name: 'progressBarService', service: this.container.resolve('progressBarService') },
            { name: 'tooltipService', service: this.container.resolve('tooltipService') }
        ];
        
        await this._initializeAndCacheServices(services);
    }

    /**
     * 初始化UI服务组（第二组）
     * 包括：SidebarService、DisplayCoordinatorService、BubbleMenuService
     * 组内并行初始化以提升性能
     * 
     * @returns {Promise<void>}
     * @private
     */
    async _initializeUIServices() {
        const services = [
            { name: 'sidebarService', service: this.container.resolve('sidebarService') },
            { name: 'displayCoordinatorService', service: this.container.resolve('displayCoordinatorService') },
            { name: 'bubbleMenuService', service: this.container.resolve('bubbleMenuService') }
        ];
        
        await this._initializeAndCacheServices(services);
        
        // 注册配置页面到 BubbleMenuService（注册表模式）
        // 在 UI 服务初始化后注册，确保配置页面服务已准备好
        this._registerConfigPages();
    }
    
    /**
     * 注册配置页面到 BubbleMenuService
     * 使用注册表模式，解耦具体配置页面，支持动态扩展
     * @returns {void}
     * @private
     */
    _registerConfigPages() {
        const bubbleMenuService = this.services.bubbleMenuService;
        const entryAnimationConfigPage = this.container.resolve('entryAnimationConfigPage');
        const performanceReportPage = this.container.resolve('performanceReportPage');
        
        // 注册入场动画配置页面
        bubbleMenuService.registerConfigPage('entry-animation', entryAnimationConfigPage);
        
        // 注册性能监控页面
        bubbleMenuService.registerConfigPage('performance-monitor', performanceReportPage);
        
        // 未来添加更多配置页面时，在此继续注册
        // bubbleMenuService.registerConfigPage('future-feature', futureConfigPage);
    }

    /**
     * 初始化模态框服务组（第三组）
     * 包括：PositionSelectorService、AdvancedLoopService、AboutModalService、ImageInfoModalService、ColorPickerModalService
     * 组内并行初始化以提升性能
     * 
     * @returns {Promise<void>}
     * @private
     */
    async _initializeModalServices() {
        const services = [
            { name: 'positionSelectorService', service: this.container.resolve('positionSelectorService') },
            { name: 'advancedLoopService', service: this.container.resolve('advancedLoopService') },
            { name: 'aboutModalService', service: this.container.resolve('aboutModalService') },
            { name: 'imageInfoModalService', service: this.container.resolve('imageInfoModalService') },
            { name: 'colorPickerModalService', service: this.container.resolve('colorPickerModalService') }
        ];
        
        await this._initializeAndCacheServices(services);
    }

    /**
     * 初始化业务服务组（第四组）
     * 包括：ScrollService、ImageService、ConfigService
     * 组内并行初始化以提升性能
     * 
     * @returns {Promise<void>}
     * @private
     */
    async _initializeBusinessServices() {
        const services = [
            { name: 'scrollService', service: this.container.resolve('scrollService') },
            { name: 'imageService', service: this.container.resolve('imageService') },
            { name: 'configService', service: this.container.resolve('configService') }
        ];
        
        await this._initializeAndCacheServices(services);
    }

    /**
     * 初始化系统服务组（第五组）
     * 包括：StateWatcherService、BusinessOrchestrationService
     * 组内并行初始化以提升性能
     * 
     * @returns {Promise<void>}
     * @private
     */
    async _initializeSystemServices() {
        const services = [
            { name: 'stateWatcherService', service: this.container.resolve('stateWatcherService') },
            { name: 'businessOrchestrationService', service: this.container.resolve('businessOrchestrationService') }
        ];
        
        await this._initializeAndCacheServices(services);
    }

    /**
     * 初始化UI协调服务组（第六组）
     * 包括：FileOperationUIService、PlaybackControlUIService、
     *       ParameterControlUIService、PlaybackUIDisablerService
     * 组内并行初始化以提升性能
     * 
     * @returns {Promise<void>}
     * @private
     */
    async _initializeUICoordinationServices() {
        const services = [
            { name: 'fileOperationUIService', service: this.container.resolve('fileOperationUIService') },
            { name: 'playbackControlUIService', service: this.container.resolve('playbackControlUIService') },
            { name: 'parameterControlUIService', service: this.container.resolve('parameterControlUIService') },
            { name: 'PlaybackUIDisablerService', service: this.container.resolve('PlaybackUIDisablerService') }
        ];
        
        await this._initializeAndCacheServices(services);
    }

    /**
     * 获取指定的服务实例
     * 
     * 注意：此方法为内部保留接口，虽然项目内部未使用，
     * 但提供给 CardScrollerApp 或外部调试使用
     * 
     * @internal
     * @param {string} serviceName - 服务名称
     * @returns {Object|undefined} 服务实例，如果不存在返回 undefined
     */
    getService(serviceName) {
        return this.services[serviceName];
    }

    /**
     * 获取所有已初始化的服务实例（副本）
     * 
     * 注意：此方法为内部保留接口，虽然项目内部未使用，
     * 但提供给 CardScrollerApp 或外部调试使用
     * 
     * @internal
     * @returns {Object} 所有服务实例的副本对象
     */
    getAllServices() {
        return { ...this.services };
    }

    /**
     * 获取所有已初始化的服务实例（getAllServices 的别名）
     * 
     * @returns {Object} 所有服务实例的副本对象
     */
    getServices() {
        return this.getAllServices();
    }

    /**
     * 获取状态管理器实例
     * 
     * @returns {StateManager|null} 状态管理器实例，未初始化时为 null
     */
    getStateManager() {
        return this.stateManager;
    }

    /**
     * 获取依赖注入容器实例
     * 
     * @returns {DIContainer|null} DI容器实例，未初始化时为 null
     */
    getContainer() {
        return this.container;
    }

    /**
     * 初始化对象池
     * 一次性初始化所有过渡动画需要的对象池类型
     * 
     * @returns {void}
     * @private
     */
    _initializeObjectPools() {
        const transitionFragmentPool = this.container.resolve('transitionFragmentPool');
        
        // 一次性初始化所有类型的池
        transitionFragmentPool.initialize({
            'mask-container': 1,
            'mask-tile': 64  // 8x8 网格
        });
    }

    /**
     * 检查应用是否已完成初始化
     * 
     * 注意：此方法为内部保留接口，虽然项目内部未使用，
     * 但提供给 CardScrollerApp 或外部调试使用
     * 
     * @internal
     * @returns {boolean} 已初始化返回 true，否则返回 false
     */
    isReady() {
        return this.isInitialized;
    }
}

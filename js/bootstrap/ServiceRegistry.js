/**
 * ServiceRegistry - DI组件注册配置
 * 管理所有DI组件的注册和依赖关系，负责将所有可注册类注册到依赖注入容器，定义组件间的依赖关系和注册顺序。采用分组注册策略，按功能域（核心、工具、业务、系统、UI）组织注册逻辑，确保依赖正确解析。
 * 
 * 当前被使用的模块：
 * - 无（启动引导层，由ApplicationBootstrap调用）
 * 
 * 当前依赖的模块：
 * - DIContainer (core/DIContainer.js) - 依赖注入容器（通过ServiceImports导入）
 * - 所有50个DI注册类（通过ServiceImports集中导入）：
 *   包括3个策略管理器、1个对象池、6个工厂、2个页面、38个服务（10个业务服务、5个工具服务、8个系统服务、12个UI服务、5个模态框服务）
 *   （注1：核心服务 = 3个策略管理器 + 1个对象池 + 1个customSelectFactory = 5个；其余5个工厂在UI服务中注册）
 *   （注2：PreferenceService虽在utils/目录，但不在DI中注册，由ApplicationBootstrap直接使用）
 *   详见ServiceImports.js的导出列表
 * 
 * 架构说明：
 * ServiceRegistry作为启动引导层基础设施，负责将所有DI组件注册到DIContainer，
 * 只负责定义组件依赖关系和注册配置，没有业务逻辑，
 * 不依赖上层的统一服务，以保持架构层次清晰，即可绕过十二大统一服务
 */
import { 
    DIContainer,
    ScrollStrategyManager,
    FileProcessStrategyManager,
    EntryAnimationStrategyManager,
    TransitionFragmentPool,
    CustomSelectFactory,
    CardBoundaryEditorFactory,
    PreviewManagerFactory,
    BoundaryEditorManagerFactory,
    EntryAnimationHelpDialogsFactory,
    ColorPickerFactory,
    ImageService,
    ImageProcessingService,
    ScrollService,
    ScrollAnimationService,
    PlaybackCoordinatorService,
    ConfigService,
    PerformanceMonitorService,
    ValidationService,
    PPIExtractorService,
    LoopConfigurationService,
    DurationSequenceService,
    EntryAnimationService,
    LoadingService,
    DialogService,
    ProgressBarService,
    MessageService,
    KeyboardService,
    FileSaveService,
    ErrorDisplayService,
    PositionPreviewService,
    PositionSliderService,
    CanvasRenderService,
    ViewportCalculatorService,
    PositionSelectorService,
    AdvancedLoopService,
    AboutModalService,
    ImageInfoModalService,
    ColorPickerModalService,
    SidebarService,
    FileOperationUIService,
    PlaybackControlUIService,
    ParameterControlUIService,
    PlaybackUIDisablerService,
    DisplayCoordinatorService,
    BubbleMenuService,
    EntryAnimationConfigPage,
    PerformanceReportPage,
    StateWatcherService,
    BusinessOrchestrationService,
    TooltipService
} from './ServiceImports.js';

/**
 * 服务注册表类
 * 
 * 负责将所有服务注册到依赖注入容器，定义服务间的依赖关系。
 * 采用分组注册策略，按功能域组织服务注册逻辑。
 */
export class ServiceRegistry {
    /**
     * 构造函数
     * 创建一个新的DIContainer实例，用于管理所有服务的依赖注入
     */
    constructor() {
        this.container = new DIContainer();
    }

    /**
     * 注册所有服务到容器
     * 
     * 按照以下顺序注册DI组件：
     * 1. 核心服务（5个：3个策略管理器 + 1个对象池 + 1个组件工厂）
     * 2. 工具服务（5个：纯工具服务，文件在utils/）
     * 3. 业务服务（10个：核心业务逻辑，文件在business/）
     * 4. 系统服务（8个：系统级服务，文件在system/）
     * 5. UI服务（22个：界面服务，文件在ui/和modal/，含5个工厂/页面）
     * 
     * 总计：50个DI注册类 (5+5+10+8+22)
     * 
     * @returns {DIContainer} 注册完成的依赖注入容器实例
     */
    registerAllServices() {
        this._registerCoreServices();
        this._registerUtilServices();
        this._registerBusinessServices();
        this._registerSystemServices();
        this._registerUIServices();
        
        return this.container;
    }

    /**
     * 注册核心服务
     * 
     * 包括3个策略管理器 + 1个对象池 + 1个组件工厂，总计5个核心服务：
     * - scrollStrategyManager: 滚动策略管理器
     * - fileProcessStrategyManager: 文件处理策略管理器
     * - entryAnimationStrategyManager: 入场动画策略管理器
     * - transitionFragmentPool: 过渡动画碎片对象池
     * - customSelectFactory: 自定义下拉菜单组件工厂
     * 
     * 注：cardBoundaryEditorFactory 虽然是工厂，但注册在UI服务中（因为它只被UI层使用）
     * @returns {void}
     * @private
     */
    _registerCoreServices() {
        this.container
            .singleton('scrollStrategyManager', ScrollStrategyManager)
            .singleton('fileProcessStrategyManager', FileProcessStrategyManager)
            .singleton('entryAnimationStrategyManager', EntryAnimationStrategyManager)
            .singleton('transitionFragmentPool', TransitionFragmentPool)
            .singleton('customSelectFactory', CustomSelectFactory, {
                dependencies: ['stateManager', 'keyboardService']
            });
    }

    /**
     * 注册工具服务
     * 
     * 包括5个纯工具服务（文件在utils/目录，注：PreferenceService不在DI中注册）：
     * - fileSaveService: 文件保存服务
     * - keyboardService: 键盘快捷键管理
     * - ppiExtractorService: PPI信息提取服务
     * - canvasRenderService: Canvas渲染服务
     * - viewportCalculatorService: 视口计算服务
     * 
     * @returns {void}
     * @private
     */
    _registerUtilServices() {
        this.container
            .singleton('fileSaveService', FileSaveService)
            .singleton('keyboardService', KeyboardService)
            .singleton('ppiExtractorService', PPIExtractorService)
            .singleton('canvasRenderService', CanvasRenderService)
            .singleton('viewportCalculatorService', ViewportCalculatorService);
    }

    /**
     * 注册业务服务
     * 
     * 包括10个核心业务逻辑服务（文件在business/目录）：
     * - imageProcessingService: 图片处理服务
     * - loopConfigurationService: 循环配置管理服务
     * - durationSequenceService: 时长序列管理服务
     * - scrollAnimationService: 滚动动画技术引擎
     * - entryAnimationService: 入场动画服务
     * - imageService: 图片业务流程协调者
     * - playbackCoordinatorService: 播放协调服务
     * - scrollService: 滚动业务流程协调者
     * - configService: 配置管理服务
     * - performanceMonitorService: 性能监控服务
     * @returns {void}
     * @private
     */
    _registerBusinessServices() {
        this.container
            .singleton('imageProcessingService', ImageProcessingService, {
                dependencies: ['stateManager']
            })
            .singleton('loopConfigurationService', LoopConfigurationService, {
                dependencies: ['stateManager', 'eventBus']
            })
            .singleton('durationSequenceService', DurationSequenceService, {
                dependencies: ['stateManager', 'eventBus']
            })
            .singleton('performanceMonitorService', PerformanceMonitorService, {
                dependencies: ['stateManager', 'eventBus']
            })
            .singleton('scrollAnimationService', ScrollAnimationService, {
                dependencies: ['eventBus', 'stateManager', 'scrollStrategyManager', 'performanceMonitorService']
            })
            .singleton('entryAnimationService', EntryAnimationService, {
                dependencies: ['eventBus', 'stateManager', 'entryAnimationStrategyManager', 'canvasRenderService', 'validationService', 'performanceMonitorService']
            })
            .singleton('imageService', ImageService, {
                dependencies: ['eventBus', 'stateManager', 'fileProcessStrategyManager', 'imageProcessingService']
            })
            .singleton('playbackCoordinatorService', PlaybackCoordinatorService, {
                dependencies: ['eventBus', 'stateManager', 'entryAnimationService', 'scrollAnimationService', 'durationSequenceService', 'viewportCalculatorService', 'canvasRenderService', 'performanceMonitorService']
            })
            .singleton('scrollService', ScrollService, {
                dependencies: ['eventBus', 'stateManager', 'playbackCoordinatorService']
            })
            .singleton('configService', ConfigService, {
                dependencies: ['eventBus', 'stateManager', 'imageService', 'scrollService', 'fileSaveService', 'ppiExtractorService', 'fileProcessStrategyManager']
            });
    }

    /**
     * 注册系统服务
     * 
     * 包括8个系统级服务（文件在system/目录）：
     * - loadingService: 加载提示服务
     * - dialogService: 自定义对话框服务
     * - messageService: 消息显示服务
     * - validationService: 统一验证逻辑服务
     * - errorDisplayService: 统一错误显示服务
     * - stateWatcherService: 统一状态监听服务
     * - businessOrchestrationService: 业务流程协调服务
     * - tooltipService: 统一提示框管理服务
     * @returns {void}
     * @private
     */
    _registerSystemServices() {
        this.container
            .singleton('loadingService', LoadingService, {
                dependencies: ['eventBus']
            })
            .singleton('dialogService', DialogService, {
                dependencies: ['keyboardService']
            })
            .singleton('messageService', MessageService, {
                dependencies: []
            })
            .singleton('validationService', ValidationService, {
                dependencies: ['stateManager', 'fileProcessStrategyManager', 'scrollStrategyManager']
            })
            .singleton('errorDisplayService', ErrorDisplayService, {
                dependencies: ['eventBus', 'dialogService', 'messageService']
            })
            .singleton('stateWatcherService', StateWatcherService, {
                dependencies: ['stateManager', 'eventBus']
            })
            .singleton('businessOrchestrationService', BusinessOrchestrationService, {
                dependencies: ['eventBus', 'stateManager', 'imageService', 'scrollService', 'validationService']
            })
            .singleton('tooltipService', TooltipService);
    }

    /**
     * 注册UI服务
     * 
     * 包括22个用户界面服务（文件在ui/和modal/目录）：
     * - progressBarService: 进度条服务
     * - positionPreviewService: 位置选择预览显示服务
     * - positionSliderService: 位置滑块控制服务
     * - positionSelectorService: 位置选择模态框服务
     * - advancedLoopService: 高级循环设置模态框服务
     * - aboutModalService: 关于页面模态框服务
     * - imageInfoModalService: 图片详细信息模态框服务
     * - colorPickerModalService: 颜色选择器模态框服务
     * - sidebarService: 侧边栏管理服务
     * - fileOperationUIService: 文件操作UI服务
     * - playbackControlUIService: 播放控制UI服务
     * - parameterControlUIService: 参数控制UI服务
     * - PlaybackUIDisablerService: 全局UI协调服务
     * - displayCoordinatorService: 显示协调服务
     * - cardBoundaryEditorFactory: 卡片边界编辑器工厂
     * - previewManagerFactory: 预览管理器工厂
     * - boundaryEditorManagerFactory: 边界编辑器管理器工厂
     * - entryAnimationHelpDialogsFactory: 入场动画帮助对话框工厂
     * - colorPickerFactory: 颜色选择器组件工厂
     * - entryAnimationConfigPage: 卡片入场动画配置页面
     * - performanceReportPage: 性能监控报告页面
     * - bubbleMenuService: 气泡菜单服务
     * @returns {void}
     * @private
     */
    _registerUIServices() {
        this.container
            .singleton('progressBarService', ProgressBarService, {
                dependencies: ['eventBus', 'stateManager', 'stateWatcherService']
            })
            .singleton('positionPreviewService', PositionPreviewService, {
                dependencies: ['stateManager']
            })
            .singleton('positionSliderService', PositionSliderService, {
                dependencies: ['stateManager']
            })
            .singleton('positionSelectorService', PositionSelectorService, {
                dependencies: ['eventBus', 'validationService', 'keyboardService', 'stateManager', 'positionPreviewService', 'positionSliderService', 'stateWatcherService']
            })
            .singleton('advancedLoopService', AdvancedLoopService, {
                dependencies: ['keyboardService', 'stateManager', 'loopConfigurationService', 'durationSequenceService', 'displayCoordinatorService', 'stateWatcherService', 'customSelectFactory']
            })
            .singleton('aboutModalService', AboutModalService, {
                dependencies: ['keyboardService', 'stateManager', 'eventBus']
            })
            .singleton('imageInfoModalService', ImageInfoModalService, {
                dependencies: ['ppiExtractorService', 'eventBus', 'keyboardService', 'stateManager']
            })
            .singleton('colorPickerFactory', ColorPickerFactory, {
                dependencies: ['stateManager', 'keyboardService', 'eventBus']
            })
            .singleton('colorPickerModalService', ColorPickerModalService, {
                dependencies: ['keyboardService', 'eventBus', 'stateManager', 'validationService', 'colorPickerFactory']
            })
            .singleton('sidebarService', SidebarService, {
                dependencies: ['eventBus', 'keyboardService', 'stateManager', 'stateWatcherService']
            })
            .singleton('fileOperationUIService', FileOperationUIService, {
                dependencies: ['eventBus', 'stateManager', 'fileProcessStrategyManager']
            })
            .singleton('playbackControlUIService', PlaybackControlUIService, {
                dependencies: ['eventBus', 'stateManager', 'scrollService', 'validationService', 'keyboardService']
            })
            .singleton('parameterControlUIService', ParameterControlUIService, {
                dependencies: ['eventBus', 'stateManager', 'stateWatcherService', 'scrollStrategyManager', 'customSelectFactory', 'colorPickerModalService']
            })
            .singleton('PlaybackUIDisablerService', PlaybackUIDisablerService, {
                dependencies: ['stateManager', 'stateWatcherService']
            })
            .singleton('displayCoordinatorService', DisplayCoordinatorService, {
                dependencies: ['eventBus', 'stateManager', 'stateWatcherService', 'canvasRenderService']
            })
            .singleton('cardBoundaryEditorFactory', CardBoundaryEditorFactory, {
                dependencies: ['stateManager', 'keyboardService', 'viewportCalculatorService']
            })
            .singleton('previewManagerFactory', PreviewManagerFactory, {
                dependencies: ['entryAnimationService', 'viewportCalculatorService']
            })
            .singleton('boundaryEditorManagerFactory', BoundaryEditorManagerFactory, {
                dependencies: ['cardBoundaryEditorFactory']
            })
            .singleton('entryAnimationHelpDialogsFactory', EntryAnimationHelpDialogsFactory, {
                dependencies: ['viewportCalculatorService']
            })
            .singleton('entryAnimationConfigPage', EntryAnimationConfigPage, {
                dependencies: ['stateManager', 'customSelectFactory', 'eventBus', 'validationService', 'previewManagerFactory', 'boundaryEditorManagerFactory', 'entryAnimationHelpDialogsFactory']
            })
            .singleton('performanceReportPage', PerformanceReportPage, {
                dependencies: ['stateManager', 'eventBus', 'validationService', 'ppiExtractorService', 'transitionFragmentPool']
            })
            .singleton('bubbleMenuService', BubbleMenuService, {
                dependencies: ['eventBus', 'stateManager', 'keyboardService']
            });
    }
}

/**
 * ServiceImports - DI组件导入集中管理
 * 统一管理所有DI注册组件的导入，仅负责集中管理导入语句，本身不包含任何业务逻辑，只是导入声明的集合
 * 
 * 当前被使用的模块：
 * - 无（启动引导层，为ServiceRegistry提供导入）
 * 
 * 当前依赖的模块：
 * - 所有50个DI注册类 + DIContainer（详见下方import语句和export说明）
 *   包括3个策略管理器、1个对象池、6个工厂、2个页面、38个服务（10个业务服务、5个工具服务、8个系统服务、12个UI服务、5个模态框服务）+ 1个DIContainer
 * 
 * 架构说明：
 * ServiceImports作为启动引导层基础设施，仅负责集中管理DI组件导入语句，
 * 作为纯静态导入层，天然不依赖上层服务，即可绕过十二大统一服务
 */

// Core architecture
import { DIContainer } from '../core/DIContainer.js';

// Design patterns
import { ScrollStrategyManager } from '../patterns/scroll/ScrollStrategyManager.js';
import { FileProcessStrategyManager } from '../patterns/file/FileProcessStrategyManager.js';
import { EntryAnimationStrategyManager } from '../patterns/entry/EntryAnimationStrategyManager.js';
import { TransitionFragmentPool } from '../patterns/transition/TransitionFragmentPool.js';

// Components
import { CustomSelectFactory } from '../components/CustomSelectFactory.js';
import { ColorPickerFactory } from '../components/ColorPickerFactory.js';

// Business services (business/)
import { ImageService } from '../services/business/ImageService.js';
import { ImageProcessingService } from '../services/business/ImageProcessingService.js';
import { LoopConfigurationService } from '../services/business/LoopConfigurationService.js';
import { DurationSequenceService } from '../services/business/DurationSequenceService.js';
import { ScrollService } from '../services/business/ScrollService.js';
import { ScrollAnimationService } from '../services/business/ScrollAnimationService.js';
import { EntryAnimationService } from '../services/business/EntryAnimationService.js';
import { PlaybackCoordinatorService } from '../services/business/PlaybackCoordinatorService.js';
import { ConfigService } from '../services/business/ConfigService.js';
import { PerformanceMonitorService } from '../services/business/PerformanceMonitorService.js';

// Utils services (utils/)
import { FileSaveService } from '../services/utils/FileSaveService.js';
import { KeyboardService } from '../services/utils/KeyboardService.js';
import { PPIExtractorService } from '../services/utils/PPIExtractorService.js';
import { CanvasRenderService } from '../services/utils/CanvasRenderService.js';
import { ViewportCalculatorService } from '../services/utils/ViewportCalculatorService.js';

// System services (system/)
import { LoadingService } from '../services/system/LoadingService.js';
import { DialogService } from '../services/system/DialogService.js';
import { MessageService } from '../services/system/MessageService.js';
import { ValidationService } from '../services/system/ValidationService.js';
import { ErrorDisplayService } from '../services/system/ErrorDisplayService.js';
import { StateWatcherService } from '../services/system/StateWatcherService.js';
import { BusinessOrchestrationService } from '../services/system/BusinessOrchestrationService.js';
import { TooltipService } from '../services/system/TooltipService.js';

// UI services (ui/)
import { ProgressBarService } from '../services/ui/ProgressBarService.js';
import { PositionPreviewService } from '../services/ui/PositionPreviewService.js';
import { PositionSliderService } from '../services/ui/PositionSliderService.js';
import { SidebarService } from '../services/ui/SidebarService.js';
import { FileOperationUIService } from '../services/ui/FileOperationUIService.js';
import { PlaybackControlUIService } from '../services/ui/PlaybackControlUIService.js';
import { ParameterControlUIService } from '../services/ui/ParameterControlUIService.js';
import { PlaybackUIDisablerService } from '../services/ui/PlaybackUIDisablerService.js';
import { DisplayCoordinatorService } from '../services/ui/DisplayCoordinatorService.js';
import { BubbleMenuService } from '../services/ui/BubbleMenuService.js';
import { EntryAnimationConfigPage } from '../services/ui/EntryAnimationConfigPage.js';
import { PerformanceReportPage } from '../services/ui/PerformanceReportPage.js';
import { CardBoundaryEditorFactory } from '../services/ui/CardBoundaryEditorFactory.js';

// Entry Animation Component Factories
import { PreviewManagerFactory } from '../components/entry-animation/PreviewManagerFactory.js';
import { BoundaryEditorManagerFactory } from '../components/entry-animation/BoundaryEditorManagerFactory.js';
import { EntryAnimationHelpDialogsFactory } from '../components/entry-animation/EntryAnimationHelpDialogsFactory.js';

// Modal services (modal/)
import { PositionSelectorService } from '../services/modal/PositionSelectorService.js';
import { AdvancedLoopService } from '../services/modal/AdvancedLoopService.js';
import { AboutModalService } from '../services/modal/AboutModalService.js';
import { ImageInfoModalService } from '../services/modal/ImageInfoModalService.js';
import { ColorPickerModalService } from '../services/modal/ColorPickerModalService.js';

/**
 * 导出所有服务类和核心架构组件，供ServiceRegistry使用
 * 
 * 导出内容说明（按export分组）：
 * - DIContainer: 依赖注入容器（1个）
 * - 策略管理器 (3个): ScrollStrategyManager, FileProcessStrategyManager, EntryAnimationStrategyManager
 * - 对象池 (1个): TransitionFragmentPool
 * - 组件工厂 (6个): CustomSelectFactory, ColorPickerFactory, CardBoundaryEditorFactory, PreviewManagerFactory, BoundaryEditorManagerFactory, EntryAnimationHelpDialogsFactory
 * - Business services (10个): 业务逻辑服务（文件在business/目录）
 * - Utils services (5个): 纯工具服务（文件在utils/目录）
 * - System services (8个): 系统服务（文件在system/目录）
 * - UI services (12个): 界面服务（文件在ui/目录，包括2个Page和1个CardBoundaryEditorFactory）
 * - Modal services (5个): 模态框服务（文件在modal/目录）
 * 
 * 总计：50个DI注册类 (3+1+6+10+5+8+12+5) + 1个DIContainer = 51个类
 * 
 * 注：此分类与ServiceRegistry的注册分层保持一致，均按文件目录划分
 * 
 * 注意：
 * - 所有导出的类都会被ServiceRegistry导入并注册到DIContainer中
 * - StateManager不在此导出，因为它在ApplicationBootstrap中直接创建，不通过DI容器管理
 */
export {
    // Core
    DIContainer,
    
    // Patterns
    ScrollStrategyManager,
    FileProcessStrategyManager,
    EntryAnimationStrategyManager,
    TransitionFragmentPool,
    
    // Components
    CustomSelectFactory,
    ColorPickerFactory,
    PreviewManagerFactory,
    BoundaryEditorManagerFactory,
    EntryAnimationHelpDialogsFactory,
    
    // Business services (business/)
    ImageService,
    ImageProcessingService,
    LoopConfigurationService,
    DurationSequenceService,
    ScrollService,
    ScrollAnimationService,
    EntryAnimationService,
    PlaybackCoordinatorService,
    ConfigService,
    PerformanceMonitorService,
    
    // Utils services (utils/)
    FileSaveService,
    KeyboardService,
    PPIExtractorService,
    CanvasRenderService,
    ViewportCalculatorService,
    
    // System services (system/)
    LoadingService,
    DialogService,
    MessageService,
    ValidationService,
    ErrorDisplayService,
    StateWatcherService,
    BusinessOrchestrationService,
    TooltipService,
    
    // UI services (ui/)
    ProgressBarService,
    PositionPreviewService,
    PositionSliderService,
    SidebarService,
    FileOperationUIService,
    PlaybackControlUIService,
    ParameterControlUIService,
    PlaybackUIDisablerService,
    DisplayCoordinatorService,
    BubbleMenuService,
    EntryAnimationConfigPage,
    PerformanceReportPage,
    CardBoundaryEditorFactory,
    
    // Modal services (modal/)
    PositionSelectorService,
    AdvancedLoopService,
    AboutModalService,
    ImageInfoModalService,
    ColorPickerModalService
};

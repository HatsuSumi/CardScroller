#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
检查架构分层违规：是否存在反向依赖（下层→上层）
"""

# 服务到层级的映射（基于 ARCHITECTURE_LAYERS.md）
SERVICE_LAYERS = {
    # 第2层：核心基础设施
    'eventBus': 2,
    'stateManager': 2,
    
    # 第3层：算法策略
    'scrollStrategyManager': 3,
    'entryAnimationStrategyManager': 3,
    'fileProcessStrategyManager': 3,
    'transitionFragmentPool': 3,
    
    # 第5层：纯工具服务
    'canvasRenderService': 5,
    'viewportCalculatorService': 5,
    'ppiExtractorService': 5,
    
    # 第6层：技术工具服务
    'keyboardService': 6,
    'fileSaveService': 6,
    'messageService': 6,
    'loadingService': 6,
    'positionSliderService': 6,
    
    # 第7层：UI组件
    'customSelectFactory': 7,
    'cardBoundaryEditorFactory': 7,
    'colorPickerFactory': 7,
    'boundaryEditorManagerFactory': 7,
    'entryAnimationHelpDialogsFactory': 7,
    
    # 第10层：工厂（持有高层依赖）
    'previewManagerFactory': 10,  # 持有 entryAnimationService (Layer 10)
    
    # 第9层：系统服务
    'validationService': 9,
    'stateWatcherService': 9,
    'errorDisplayService': 9,
    'dialogService': 9,
    'tooltipService': 9,
    
    # 第10层：业务逻辑服务
    'imageProcessingService': 10,
    'scrollAnimationService': 10,
    'entryAnimationService': 10,
    'performanceMonitorService': 10,
    'durationSequenceService': 10,
    'loopConfigurationService': 10,
    'positionPreviewService': 10,
    
    # 第11层：业务协调
    'imageService': 11,
    'configService': 11,
    'playbackCoordinatorService': 11,
    'scrollService': 11,
    'businessOrchestrationService': 11,
    
    # 第12层：UI控制
    'aboutModalService': 12,
    'advancedLoopService': 12,
    'imageInfoModalService': 12,
    'colorPickerModalService': 12,
    'positionSelectorService': 12,
    'fileOperationUIService': 12,
    'parameterControlUIService': 12,
    'playbackControlUIService': 12,
    'progressBarService': 12,
    'sidebarService': 12,
    'displayCoordinatorService': 12,
    'PlaybackUIDisablerService': 12,
    'bubbleMenuService': 12,
    'entryAnimationConfigPage': 12,
    'performanceReportPage': 12,
}

# 从 ServiceRegistry.js 提取的依赖关系
DEPENDENCIES = {
    # 核心服务（无依赖的策略管理器和对象池）
    'scrollStrategyManager': [],
    'fileProcessStrategyManager': [],
    'entryAnimationStrategyManager': [],
    'transitionFragmentPool': [],
    
    # 核心服务（有依赖的工厂）
    'customSelectFactory': ['stateManager', 'keyboardService'],
    
    # 工具服务（纯工具服务，无依赖）
    'fileSaveService': [],
    'keyboardService': [],
    'ppiExtractorService': [],
    'canvasRenderService': [],
    'viewportCalculatorService': [],
    
    # 业务服务
    'imageProcessingService': ['stateManager'],
    'loopConfigurationService': ['stateManager', 'eventBus'],
    'durationSequenceService': ['stateManager', 'eventBus'],
    'performanceMonitorService': ['stateManager', 'eventBus'],
    'scrollAnimationService': ['eventBus', 'stateManager', 'scrollStrategyManager', 'performanceMonitorService'],
    'entryAnimationService': ['eventBus', 'stateManager', 'entryAnimationStrategyManager', 'canvasRenderService', 'validationService', 'performanceMonitorService'],
    'imageService': ['eventBus', 'stateManager', 'fileProcessStrategyManager', 'imageProcessingService'],
    'playbackCoordinatorService': ['eventBus', 'stateManager', 'entryAnimationService', 'scrollAnimationService', 'durationSequenceService', 'viewportCalculatorService', 'canvasRenderService', 'performanceMonitorService'],
    'scrollService': ['eventBus', 'stateManager', 'playbackCoordinatorService'],
    'configService': ['eventBus', 'stateManager', 'imageService', 'scrollService', 'fileSaveService', 'ppiExtractorService', 'fileProcessStrategyManager'],
    'loadingService': ['eventBus'],
    'dialogService': ['keyboardService', 'stateManager'],
    'messageService': ['stateManager'],
    'validationService': ['stateManager', 'fileProcessStrategyManager', 'scrollStrategyManager'],
    'errorDisplayService': ['eventBus', 'dialogService', 'messageService'],
    'stateWatcherService': ['stateManager', 'eventBus'],
    'businessOrchestrationService': ['eventBus', 'stateManager', 'imageService', 'scrollService', 'validationService'],
    'tooltipService': [],
    'progressBarService': ['eventBus', 'stateManager', 'stateWatcherService'],
    'positionPreviewService': ['stateManager'],
    'positionSliderService': ['stateManager'],
    'positionSelectorService': ['eventBus', 'validationService', 'keyboardService', 'stateManager', 'positionPreviewService', 'positionSliderService', 'stateWatcherService'],
    'advancedLoopService': ['keyboardService', 'stateManager', 'loopConfigurationService', 'durationSequenceService', 'displayCoordinatorService', 'stateWatcherService', 'customSelectFactory'],
    'aboutModalService': ['keyboardService', 'stateManager', 'eventBus'],
    'imageInfoModalService': ['ppiExtractorService', 'eventBus', 'keyboardService', 'stateManager'],
    'colorPickerFactory': ['stateManager', 'keyboardService', 'eventBus'],
    'colorPickerModalService': ['keyboardService', 'eventBus', 'stateManager', 'validationService', 'colorPickerFactory'],
    'sidebarService': ['eventBus', 'keyboardService', 'stateManager', 'stateWatcherService'],
    'fileOperationUIService': ['eventBus', 'stateManager', 'fileProcessStrategyManager'],
    'playbackControlUIService': ['eventBus', 'stateManager', 'scrollService', 'validationService', 'keyboardService'],
    'parameterControlUIService': ['eventBus', 'stateManager', 'stateWatcherService', 'scrollStrategyManager', 'customSelectFactory', 'colorPickerModalService'],
    'PlaybackUIDisablerService': ['stateManager', 'stateWatcherService'],
    'displayCoordinatorService': ['eventBus', 'stateManager', 'stateWatcherService', 'canvasRenderService'],
    'cardBoundaryEditorFactory': ['stateManager', 'keyboardService', 'viewportCalculatorService'],
    'previewManagerFactory': ['entryAnimationService', 'viewportCalculatorService'],
    'boundaryEditorManagerFactory': ['cardBoundaryEditorFactory'],
    'entryAnimationHelpDialogsFactory': ['viewportCalculatorService'],
    'entryAnimationConfigPage': ['stateManager', 'customSelectFactory', 'eventBus', 'validationService', 'previewManagerFactory', 'boundaryEditorManagerFactory', 'entryAnimationHelpDialogsFactory'],
    'performanceReportPage': ['stateManager', 'eventBus', 'validationService', 'ppiExtractorService', 'transitionFragmentPool'],
    'bubbleMenuService': ['eventBus', 'stateManager', 'keyboardService'],
}

def check_dependencies():
    """检查所有依赖关系是否符合分层原则"""
    violations = []
    
    for service, deps in DEPENDENCIES.items():
        if service not in SERVICE_LAYERS:
            print(f"⚠️  警告: {service} 不在层级映射中")
            continue
            
        service_layer = SERVICE_LAYERS[service]
        
        for dep in deps:
            if dep not in SERVICE_LAYERS:
                # eventBus 和 stateManager 是第1层，总是允许的
                if dep in ['eventBus', 'stateManager']:
                    continue
                print(f"⚠️  警告: 依赖 {dep} 不在层级映射中")
                continue
            
            dep_layer = SERVICE_LAYERS[dep]
            
            # 检查是否反向依赖（下层→上层）
            if service_layer < dep_layer:
                violations.append({
                    'service': service,
                    'service_layer': service_layer,
                    'dependency': dep,
                    'dependency_layer': dep_layer,
                    'violation': f"第{service_layer}层 → 第{dep_layer}层"
                })
    
    return violations

def main():
    print("=" * 80)
    print("检查架构分层违规：反向依赖（下层→上层）")
    print("=" * 80)
    print()
    
    violations = check_dependencies()
    
    if not violations:
        print("OK - 未发现反向依赖违规！所有服务都符合架构分层原则。")
        print()
        print("依赖方向检查通过：")
        print("   - 所有服务只依赖同层或更低层的服务")
        print("   - 没有下层服务依赖上层服务的情况")
    else:
        print(f"ERROR - 发现 {len(violations)} 个反向依赖违规：")
        print()
        for i, v in enumerate(violations, 1):
            print(f"{i}. {v['service']} (第{v['service_layer']}层)")
            print(f"   -> 依赖")
            print(f"   {v['dependency']} (第{v['dependency_layer']}层)")
            print(f"   WARNING: 违规：{v['violation']}")
            print()
    
    print("=" * 80)
    return len(violations)

if __name__ == '__main__':
    violations_count = main()
    exit(0 if violations_count == 0 else 1)


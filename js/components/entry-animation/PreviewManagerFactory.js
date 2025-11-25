import { PreviewManager } from './PreviewManager.js';

/**
 * PreviewManagerFactory - 预览管理器工厂
 * 负责创建PreviewManager组件实例，隔离EntryAnimationConfigPage不需要的依赖
 * 
 * 当前被使用的模块：
 * - EntryAnimationConfigPage (ui/EntryAnimationConfigPage.js) - 创建预览管理器实例
 * 
 * 当前依赖的模块：
 * - entryAnimationService (business/EntryAnimationService.js) - 入场动画服务 (通过DI注入)
 * - viewportCalculatorService (utils/ViewportCalculatorService.js) - 视口计算服务 (通过DI注入)
 * - PreviewManager (components/entry-animation/PreviewManager.js) - 预览管理器组件 (直接导入)
 */
export class PreviewManagerFactory {
    /**
     * 构造函数
     * @param {EntryAnimationService} entryAnimationService - 入场动画服务
     * @param {ViewportCalculatorService} viewportCalculatorService - 视口计算服务
     * @throws {Error} 当依赖缺失时抛出错误（Fail Fast）
     */
    constructor(entryAnimationService, viewportCalculatorService) {
        // Fail Fast: 验证依赖
        if (!entryAnimationService) {
            throw new Error('PreviewManagerFactory requires entryAnimationService dependency');
        }
        if (!viewportCalculatorService) {
            throw new Error('PreviewManagerFactory requires viewportCalculatorService dependency');
        }
        
        this.entryAnimationService = entryAnimationService;
        this.viewportCalculatorService = viewportCalculatorService;
    }
    
    /**
     * 创建PreviewManager组件实例
     * @param {StateManager} stateManager - 状态管理器
     * @returns {PreviewManager} PreviewManager组件实例
     * @throws {Error} 当stateManager无效时抛出错误（Fail Fast）
     */
    create(stateManager) {
        // Fail Fast: 验证参数
        if (!stateManager) {
            throw new Error('PreviewManagerFactory.create: stateManager is required');
        }
        
        return new PreviewManager(stateManager, this.entryAnimationService, this.viewportCalculatorService);
    }
}


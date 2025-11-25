import { CardBoundaryEditorService } from './CardBoundaryEditorService.js';

/**
 * CardBoundaryEditorFactory - 卡片边界编辑器工厂
 * 负责创建CardBoundaryEditorService组件实例，统一管理编辑器创建
 * 
 * 当前被使用的模块：
 * - BoundaryEditorManager (components/entry-animation/BoundaryEditorManager.js) - 创建卡片边界编辑器实例
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - keyboardService (utils/KeyboardService.js) - 键盘快捷键服务 (通过DI注入)
 * - viewportCalculatorService (utils/ViewportCalculatorService.js) - 视口计算服务 (通过DI注入)
 * - CardBoundaryEditorService (ui/CardBoundaryEditorService.js) - 卡片边界编辑器服务 (直接导入)
 */
export class CardBoundaryEditorFactory {
    /**
     * 构造函数
     * @param {StateManager} stateManager - 状态管理器
     * @param {KeyboardService} keyboardService - 键盘快捷键服务
     * @param {ViewportCalculatorService} viewportCalculatorService - 视口计算服务
     * @throws {Error} 当依赖缺失时抛出错误
     */
    constructor(stateManager, keyboardService, viewportCalculatorService) {
        if (!stateManager) {
            throw new Error('CardBoundaryEditorFactory requires stateManager dependency');
        }
        if (!keyboardService) {
            throw new Error('CardBoundaryEditorFactory requires keyboardService dependency');
        }
        if (!viewportCalculatorService) {
            throw new Error('CardBoundaryEditorFactory requires viewportCalculatorService dependency');
        }
        
        this.stateManager = stateManager;
        this.keyboardService = keyboardService;
        this.viewportCalculatorService = viewportCalculatorService;
    }
    
    /**
     * 创建CardBoundaryEditorService实例
     * @returns {CardBoundaryEditorService} CardBoundaryEditorService实例
     */
    create() {
        return new CardBoundaryEditorService(this.stateManager, this.keyboardService, this.viewportCalculatorService);
    }
}


import { EntryAnimationHelpDialogs } from './EntryAnimationHelpDialogs.js';

/**
 * EntryAnimationHelpDialogsFactory - 入场动画帮助对话框工厂
 * 负责创建EntryAnimationHelpDialogs组件实例，隔离EntryAnimationConfigPage不需要的依赖
 * 
 * 当前被使用的模块：
 * - EntryAnimationConfigPage (ui/EntryAnimationConfigPage.js) - 创建帮助对话框实例
 * 
 * 当前依赖的模块：
 * - viewportCalculatorService (utils/ViewportCalculatorService.js) - 视口计算服务 (通过DI注入)
 * - EntryAnimationHelpDialogs (components/entry-animation/EntryAnimationHelpDialogs.js) - 帮助对话框组件 (直接导入)
 */
export class EntryAnimationHelpDialogsFactory {
    /**
     * 构造函数
     * @param {ViewportCalculatorService} viewportCalculatorService - 视口计算服务
     * @throws {Error} 当依赖缺失时抛出错误（Fail Fast）
     */
    constructor(viewportCalculatorService) {
        // Fail Fast: 验证依赖
        if (!viewportCalculatorService) {
            throw new Error('EntryAnimationHelpDialogsFactory requires viewportCalculatorService dependency');
        }
        
        this.viewportCalculatorService = viewportCalculatorService;
    }
    
    /**
     * 创建EntryAnimationHelpDialogs组件实例
     * @param {StateManager} stateManager - 状态管理器
     * @param {EventBus} eventBus - 事件总线
     * @returns {EntryAnimationHelpDialogs} EntryAnimationHelpDialogs组件实例
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    create(stateManager, eventBus) {
        // Fail Fast: 验证参数
        if (!stateManager) {
            throw new Error('EntryAnimationHelpDialogsFactory.create: stateManager is required');
        }
        if (!eventBus) {
            throw new Error('EntryAnimationHelpDialogsFactory.create: eventBus is required');
        }
        
        return new EntryAnimationHelpDialogs(stateManager, eventBus, this.viewportCalculatorService);
    }
}


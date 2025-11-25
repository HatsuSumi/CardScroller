import { BoundaryEditorManager } from './BoundaryEditorManager.js';

/**
 * BoundaryEditorManagerFactory - 边界编辑器管理器工厂
 * 负责创建BoundaryEditorManager组件实例，隔离EntryAnimationConfigPage不需要的依赖
 * 
 * 当前被使用的模块：
 * - EntryAnimationConfigPage (ui/EntryAnimationConfigPage.js) - 创建边界编辑器管理器实例
 * 
 * 当前依赖的模块：
 * - cardBoundaryEditorFactory (ui/CardBoundaryEditorFactory.js) - 卡片边界编辑器工厂 (通过DI注入)
 * - BoundaryEditorManager (components/entry-animation/BoundaryEditorManager.js) - 边界编辑器管理器组件 (直接导入)
 */
export class BoundaryEditorManagerFactory {
    /**
     * 构造函数
     * @param {CardBoundaryEditorFactory} cardBoundaryEditorFactory - 卡片边界编辑器工厂
     * @throws {Error} 当依赖缺失时抛出错误（Fail Fast）
     */
    constructor(cardBoundaryEditorFactory) {
        // Fail Fast: 验证依赖
        if (!cardBoundaryEditorFactory) {
            throw new Error('BoundaryEditorManagerFactory requires cardBoundaryEditorFactory dependency');
        }
        
        this.cardBoundaryEditorFactory = cardBoundaryEditorFactory;
    }
    
    /**
     * 创建BoundaryEditorManager组件实例
     * @param {StateManager} stateManager - 状态管理器
     * @param {EventBus} eventBus - 事件总线
     * @param {ValidationService} validationService - 验证服务
     * @returns {BoundaryEditorManager} BoundaryEditorManager组件实例
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    create(stateManager, eventBus, validationService) {
        // Fail Fast: 验证参数
        if (!stateManager) {
            throw new Error('BoundaryEditorManagerFactory.create: stateManager is required');
        }
        if (!eventBus) {
            throw new Error('BoundaryEditorManagerFactory.create: eventBus is required');
        }
        if (!validationService) {
            throw new Error('BoundaryEditorManagerFactory.create: validationService is required');
        }
        
        return new BoundaryEditorManager(stateManager, this.cardBoundaryEditorFactory, eventBus, validationService);
    }
}


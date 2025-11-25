import { CustomSelect } from './CustomSelect.js';

/**
 * CustomSelectFactory - 自定义下拉菜单组件工厂
 * 负责创建CustomSelect组件实例，统一管理组件创建
 * 
 * 当前被使用的模块：
 * - ParameterControlUIService (services/ui/ParameterControlUIService.js) - 创建动画策略选择器
 * - AdvancedLoopService (services/modal/AdvancedLoopService.js) - 创建循环次数选择器
 * - CardAnimationListManager (components/entry-animation/CardAnimationListManager.js) - 创建卡片动画策略选择器
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - keyboardService (services/utils/KeyboardService.js) - 键盘快捷键管理服务 (通过DI注入)
 * - CustomSelect (components/CustomSelect.js) - 自定义下拉菜单组件 (直接导入)
 */
export class CustomSelectFactory {
    /**
     * 构造函数
     * @param {StateManager} stateManager - 状态管理器
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务
     * @throws {Error} 当依赖缺失时抛出错误（Fail Fast）
     */
    constructor(stateManager, keyboardService) {
        // Fail Fast: 验证依赖
        if (!stateManager) {
            throw new Error('CustomSelectFactory requires stateManager dependency');
        }
        if (!keyboardService) {
            throw new Error('CustomSelectFactory requires keyboardService dependency');
        }
        
        this.stateManager = stateManager;
        this.keyboardService = keyboardService;
    }
    
    /**
     * 创建CustomSelect组件实例
     * @param {HTMLElement} element - 自定义下拉菜单容器元素
     * @returns {CustomSelect} CustomSelect组件实例
     * @throws {Error} 当element无效时抛出错误（Fail Fast）
     */
    create(element) {
        // Fail Fast: 验证element参数
        if (!element) {
            throw new Error('CustomSelectFactory.create: element is required');
        }
        
        return new CustomSelect(element, this.stateManager, this.keyboardService);
    }
}


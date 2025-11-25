import { ColorPicker } from './ColorPicker.js';

/**
 * ColorPickerFactory - 颜色选择器组件工厂
 * 负责创建ColorPicker组件实例，统一管理组件创建和依赖注入
 * 
 * 当前被使用的模块：
 * - ColorPickerModalService (services/modal/ColorPickerModalService.js) - 创建颜色选择器实例
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - keyboardService (services/utils/KeyboardService.js) - 键盘快捷键管理服务 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线 (通过DI注入)
 * - ColorPicker (components/ColorPicker.js) - 颜色选择器组件 (直接导入)
 * 
 * 架构说明：
 * 工厂位于第7层（UI组件），只持有低层依赖（第2层StateManager/EventBus、第6层KeyboardService）
 * 高层依赖（如ValidationService）通过create()方法参数传入，由调用者（ColorPickerModalService）提供
 * 这样符合架构分层原则：下层不依赖上层
 */
export class ColorPickerFactory {
    /**
     * 构造函数
     * @param {StateManager} stateManager - 状态管理器
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务
     * @param {EventBus} eventBus - 事件总线
     * @throws {Error} 当依赖缺失时抛出错误
     */
    constructor(stateManager, keyboardService, eventBus) {
        if (!stateManager) {
            throw new Error('ColorPickerFactory requires stateManager dependency');
        }
        if (!keyboardService) {
            throw new Error('ColorPickerFactory requires keyboardService dependency');
        }
        if (!eventBus) {
            throw new Error('ColorPickerFactory requires eventBus dependency');
        }
        
        this.stateManager = stateManager;
        this.keyboardService = keyboardService;
        this.eventBus = eventBus;
    }
    
    /**
     * 创建ColorPicker组件实例
     * @param {HTMLElement} container - 颜色选择器容器元素
     * @param {ValidationService} validationService - 验证服务（由调用者提供）
     * @param {Object} [options={}] - 配置选项
     * @param {Function} [options.onChange] - 颜色变化回调函数 (color: string) => void
     * @returns {ColorPicker} ColorPicker组件实例
     * @throws {Error} 当container或validationService无效时抛出错误（Fail Fast）
     */
    create(container, validationService, options = {}) {
        // Fail Fast: 验证参数
        if (!container) {
            throw new Error('ColorPickerFactory.create: container is required');
        }
        if (!validationService) {
            throw new Error('ColorPickerFactory.create: validationService is required');
        }
        
        return new ColorPicker(
            container,
            this.stateManager,
            this.keyboardService,
            this.eventBus,
            validationService,
            options
        );
    }
}


/**
 * BaseUIService - 基础UI服务类
 * DOM元素缓存基类，为需要频繁访问页面DOM元素的服务提供缓存机制，提升DOM查询性能
 * 
 * 设计原则：
 * - 仅提供DOM缓存功能，不封装原生DOM API
 * - 服务继承此类后，使用 _getElement/_querySelector 获取缓存的元素引用
 * - 然后直接使用原生DOM API操作元素（如 element.textContent =, element.classList.add() 等）
 * 
 * 何时继承此类：
 * - 服务需要频繁访问页面中的同一个DOM元素（避免重复 getElementById/querySelector）
 * - 例如：DisplayCoordinatorService 频繁更新侧边栏显示元素
 * 
 * 何时不需要继承：
 * - 服务不访问页面DOM（如纯计算服务、业务逻辑服务）
 * - 服务只操作临时对象（如 new Image(), FileReader）
 * 
 * 当前被使用的模块：
 * - BaseModalService (base/BaseModalService.js) - 模态框基类，继承此类并为子类提供DOM缓存能力
 * - ScrollAnimationService (business/ScrollAnimationService.js) - 滚动动画服务，继承此类（频繁访问模式：60fps动画循环）
 * - DisplayCoordinatorService (ui/DisplayCoordinatorService.js) - 显示协调服务，继承此类（频繁访问模式）
 * - ParameterControlUIService (ui/ParameterControlUIService.js) - 参数控制UI服务，继承此类（频繁访问模式）
 * - PlaybackUIDisablerService (ui/PlaybackUIDisablerService.js) - 全局UI协调服务，继承此类（频繁访问模式）
 * - PositionPreviewService (ui/PositionPreviewService.js) - 位置预览服务，继承此类（频繁访问模式）
 * 
 * 当前依赖的模块：
 * - 无直接依赖，纯JavaScript实现
 */
export class BaseUIService {
    /**
     * 构造函数
     * 初始化DOM缓存机制，提升DOM查询性能
     * - domCache: 用于缓存通过ID查询的DOM元素（Map<id, Element>）
     * - selectorCache: 用于缓存通过选择器查询的DOM元素（Map<selector, Element>）
     */
    constructor() {
        // DOM元素缓存，提升性能
        this.domCache = new Map();
        // CSS选择器缓存
        this.selectorCache = new Map();
    }

    /**
     * 验证DOM元素是否有效
     * @param {*} element - 待验证的元素
     * @returns {boolean} 是否为有效的DOM元素
     * @protected
     */
    _isValidElement(element) {
        return element && element.nodeType === Node.ELEMENT_NODE;
    }

    /**
     * 获取DOM元素（带缓存）- 解决性能问题
     * @param {string} id - 元素ID
     * @returns {Element|null} DOM元素
     * @protected
     */
    _getElement(id) {
        if (!this.domCache.has(id)) {
            const element = document.getElementById(id);
            this.domCache.set(id, element);
        }
        return this.domCache.get(id);
    }

    /**
     * 获取必需的DOM元素（带缓存和Fail Fast检查）
     * 当元素不存在时立即抛出错误，确保问题早期暴露
     * @param {string} id - 元素ID
     * @returns {Element} DOM元素
     * @throws {Error} 当元素不存在时抛出错误（Fail Fast）
     * @protected
     */
    _requireElement(id) {
        const element = this._getElement(id);
        if (!element) {
            throw new Error(`Required element not found: ${id}. Please check HTML structure.`);
        }
        return element;
    }

    /**
     * 使用选择器查询元素（带缓存）
     * @param {string} selector - CSS选择器
     * @returns {Element|null} DOM元素
     * @protected
     */
    _querySelector(selector) {
        if (!this.selectorCache.has(selector)) {
            const element = document.querySelector(selector);
            this.selectorCache.set(selector, element);
        }
        return this.selectorCache.get(selector);
    }

}

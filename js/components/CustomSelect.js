/**
 * CustomSelect - 自定义下拉菜单组件
 * 提供完整的下拉菜单功能，包括点击/键盘交互、选项导航、自动定位、滚动视图等
 * 
 * 当前被使用的模块：
 * - CustomSelectFactory (components/CustomSelectFactory.js) - 通过工厂创建实例
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理器，用于获取当前状态以应用样式 (通过工厂注入)
 * - keyboardService (services/utils/KeyboardService.js) - 键盘快捷键管理服务 (通过工厂注入)
 * 
 * 架构说明：
 * - 通过工厂创建：由 CustomSelectFactory 统一管理实例创建
 * - 组件模式：每个下拉菜单创建独立实例，不共享状态
 * - 不继承BaseUIService：管理的是传入参数的element及其子元素，而非页面级固定元素
 * - DOM缓存：在构造函数中已手动缓存所有需要的DOM元素引用
 * - 设计原则：组件只操作传入元素，不操作全局DOM
 */

export class CustomSelect {
    /**
     * 构造函数
     * @param {HTMLElement} element - 自定义下拉菜单容器元素
     * @param {StateManager} stateManager - 状态管理器
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务
     * @throws {Error} 当关键参数（element/stateManager/keyboardService）缺失时抛出错误（Fail Fast）
     * @throws {Error} 当必需的DOM元素（trigger/valueDisplay/optionsContainer）不存在时抛出错误（Fail Fast）
     */
    constructor(element, stateManager, keyboardService) {
        // Fail Fast: 验证关键参数
        if (!element) {
            throw new Error('Element is required for CustomSelect');
        }
        if (!stateManager) {
            throw new Error('StateManager is required for CustomSelect');
        }
        if (!keyboardService) {
            throw new Error('KeyboardService is required for CustomSelect');
        }
        
        this.element = element;
        this.stateManager = stateManager;
        this.keyboardService = keyboardService;
        this.isOpen = false;
        this.selectedValue = null;
        
        // 技术实现细节：硬编码的UI布局常量
        this.MAX_DROPDOWN_HEIGHT = 200;  // 下拉菜单最大高度（像素）
        
        // Fail Fast: 验证必需的DOM元素
        this.trigger = this.element.querySelector('.select-trigger');
        if (!this.trigger) {
            throw new Error('Required element not found: .select-trigger in custom select. Please check HTML structure.');
        }
        
        this.valueDisplay = this.element.querySelector('.select-value');
        if (!this.valueDisplay) {
            throw new Error('Required element not found: .select-value in custom select. Please check HTML structure.');
        }
        
        this.optionsContainer = this.element.querySelector('.select-options');
        if (!this.optionsContainer) {
            throw new Error('Required element not found: .select-options in custom select. Please check HTML structure.');
        }
        
        // 性能优化：转换为数组避免后续重复Array.from调用
        this.optionElements = Array.from(this.element.querySelectorAll('.select-option'));
        
        this.init();
    }
    
    /**
     * 初始化组件
     * @returns {void}
     * @throws {Error} 当选项缺少必需的标题元素或没有可选项时抛出错误（Fail Fast）
     */
    init() {
        this._setupAccessibility();
        this._bindEvents();
        this._registerKeyboardShortcuts();
        this._selectDefaultOption();
    }
    
    /**
     * 设置无障碍访问属性
     * @returns {void}
     * @private
     */
    _setupAccessibility() {
        this.element.setAttribute('tabindex', '0');
        this.element.setAttribute('role', 'combobox');
        this.element.setAttribute('aria-expanded', 'false');
        this.element.setAttribute('aria-haspopup', 'listbox');
    }
    
    /**
     * 获取选项的标题元素
     * @param {HTMLElement} option - 选项元素
     * @returns {HTMLElement} 标题元素
     * @throws {Error} 当标题元素不存在时抛出错误（Fail Fast）
     * @private
     */
    _getTitleElement(option) {
        const titleElement = option.querySelector('span:first-child');
        if (!titleElement) {
            throw new Error('Required element not found: span:first-child in select option. Please check HTML structure.');
        }
        return titleElement;
    }
    
    /**
     * 验证字符串参数
     * @param {*} value - 要验证的值
     * @param {string} paramName - 参数名称
     * @param {string} methodName - 方法名称
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     * @private
     */
    _validateStringParam(value, paramName, methodName) {
        if (value === undefined || value === null) {
            throw new Error(`${methodName}: ${paramName} parameter is required`);
        }
        if (typeof value !== 'string') {
            throw new Error(`${methodName}: ${paramName} must be a string`);
        }
        if (value === '') {
            throw new Error(`${methodName}: ${paramName} cannot be empty string`);
        }
    }
    
    /**
     * 验证布尔参数
     * @param {*} value - 要验证的值
     * @param {string} paramName - 参数名称
     * @param {string} methodName - 方法名称
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     * @private
     */
    _validateBooleanParam(value, paramName, methodName) {
        if (value === undefined) {
            throw new Error(`${methodName}: ${paramName} parameter is required`);
        }
        if (typeof value !== 'boolean') {
            throw new Error(`${methodName}: ${paramName} must be a boolean`);
        }
    }
    
    /**
     * 绑定事件监听器
     * @returns {void}
     * @throws {Error} 当选项缺少必需的标题元素时抛出错误（Fail Fast）
     * @private
     */
    _bindEvents() {
        // 触发器点击事件
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        // 选项点击事件
        this.optionElements.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = option.dataset.value;
                const text = this._getTitleElement(option).textContent;
                this.selectOption(value, text, true);
                this.close();
            });
        });
        
        // 全局点击关闭
        document.addEventListener('click', (e) => {
            if (!this.element.contains(e.target)) {
                this.close();
            }
        });
    }
    
    /**
     * 注册键盘快捷键（通过KeyboardService）
     * 只注册上下箭头导航，避免与播放控制（Space）和模态框（Escape）冲突
     * @returns {void}
     * @private
     */
    _registerKeyboardShortcuts() {
        // 条件：下拉菜单元素或其子元素获得焦点时（事件冒泡逻辑）
        const isFocused = () => this.element.contains(document.activeElement);
        
        // ArrowDown：向下导航或打开
        this.keyboardService.registerConditional(
            'down',
            () => {
                if (this.isOpen) {
                    this.navigateOptions(1);
                } else {
                    this.open();
                }
            },
            isFocused,
            this,
            { preventDefault: true }
        );
        
        // ArrowUp：向上导航或打开
        this.keyboardService.registerConditional(
            'up',
            () => {
                if (this.isOpen) {
                    this.navigateOptions(-1);
                } else {
                    this.open();
                }
            },
            isFocused,
            this,
            { preventDefault: true }
        );
    }
    
    /**
     * 选择默认选项
     * @returns {void}
     * @throws {Error} 当没有可选项时抛出错误（Fail Fast）
     * @throws {Error} 当选项缺少必需的标题元素时抛出错误（Fail Fast）
     * @private
     */
    _selectDefaultOption() {
        // Fail Fast: 必须至少有一个选项
        if (this.optionElements.length === 0) {
            throw new Error('No options found in custom select. Please check HTML structure.');
        }
        
        const firstOption = this.optionElements[0];
        const displayText = this._getTitleElement(firstOption).textContent;
        this.selectOption(firstOption.dataset.value, displayText, false);
    }
    
    /**
     * 切换下拉菜单开关状态
     * @returns {void}
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    /**
     * 打开下拉菜单
     * @returns {void}
     */
    open() {
        if (this.isOpen) return;
        
        this.isOpen = true;
        this.element.classList.add('active');
        this.element.setAttribute('aria-expanded', 'true');
        
        this.updateOptionsPosition();
    }
    
    /**
     * 关闭下拉菜单
     * @returns {void}
     */
    close() {
        if (!this.isOpen) return;
        
        this.isOpen = false;
        this.element.classList.remove('active');
        this.element.setAttribute('aria-expanded', 'false');
    }
    
    /**
     * 选择选项
     * @param {string} value - 选项值
     * @param {string} text - 显示文本
     * @param {boolean} triggerChange - 是否触发change事件（必需参数）
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    selectOption(value, text, triggerChange) {
        // Fail Fast: 验证必需参数
        this._validateStringParam(value, 'value', 'CustomSelect.selectOption');
        this._validateStringParam(text, 'text', 'CustomSelect.selectOption');
        this._validateBooleanParam(triggerChange, 'triggerChange', 'CustomSelect.selectOption');
        
        // 更新内部状态
        this.selectedValue = value;
        
        // 更新UI显示
        this.valueDisplay.textContent = text;
        
        // 更新选中状态，并滚动到可视区域
        this.optionElements.forEach(option => {
            if (option.dataset.value === value) {
                option.classList.add('selected');
                // 将选中的选项滚动到可视区域（使用nearest避免不必要的滚动）
                option.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                option.classList.remove('selected');
            }
        });
        
        // 触发change事件
        if (triggerChange) {
            const changeEvent = new CustomEvent('change', {
                detail: { value, text }
            });
            this.element.dispatchEvent(changeEvent);
        }
    }
    
    /**
     * 设置选中值
     * @param {string} value - 要设置的值
     * @returns {void}
     * @throws {Error} 当参数无效或选项不存在时抛出错误（Fail Fast）
     * @throws {Error} 当选项缺少必需的标题元素时抛出错误（Fail Fast）
     */
    setValue(value) {
        // Fail Fast: 验证参数
        this._validateStringParam(value, 'value', 'CustomSelect.setValue');
        
        const option = this.optionElements.find(opt => opt.dataset.value === value);
        
        // Fail Fast: 必须找到对应的选项
        if (!option) {
            throw new Error(`CustomSelect.setValue: Option with value "${value}" not found in custom select`);
        }
        
        const text = this._getTitleElement(option).textContent;
        this.selectOption(value, text, false);
    }
    
    /**
     * 键盘导航选项
     * @param {number} direction - 导航方向 (1向下, -1向上)
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     * @throws {Error} 当选项缺少必需的标题元素时抛出错误（Fail Fast）
     */
    navigateOptions(direction) {
        // Fail Fast: 验证参数
        if (direction === undefined || direction === null) {
            throw new Error('CustomSelect.navigateOptions: direction parameter is required');
        }
        if (typeof direction !== 'number') {
            throw new Error('CustomSelect.navigateOptions: direction must be a number');
        }
        if (direction !== 1 && direction !== -1) {
            throw new Error('CustomSelect.navigateOptions: direction must be 1 (down) or -1 (up)');
        }
        
        const currentIndex = this.optionElements.findIndex(opt => opt.classList.contains('selected'));
        
        let newIndex = currentIndex + direction;
        
        if (newIndex < 0) {
            newIndex = this.optionElements.length - 1;
        } else if (newIndex >= this.optionElements.length) {
            newIndex = 0;
        }
        
        const newOption = this.optionElements[newIndex];
        const text = this._getTitleElement(newOption).textContent;
        this.selectOption(newOption.dataset.value, text, true);
    }
    
    /**
     * 动态更新下拉选项位置
     * 防止被父容器截断
     * @returns {void}
     */
    updateOptionsPosition() {
        const triggerRect = this.trigger.getBoundingClientRect();
        const optionsHeight = this.optionsContainer.scrollHeight;
        const viewportHeight = window.innerHeight;
        
        // 检查是否在高级循环模态框内
        const modalContent = this.element.closest('.advanced-loop-modal-content');
        let spaceBelow, spaceAbove, maxHeight = this.MAX_DROPDOWN_HEIGHT;
        
        if (modalContent) {
            // 模态框内的特殊处理
            const modalRect = modalContent.getBoundingClientRect();
            spaceBelow = modalRect.bottom - triggerRect.bottom - 20; // 留20px边距
            spaceAbove = triggerRect.top - modalRect.top - 20;
            
            // 确保不超出模态框边界
            maxHeight = Math.min(this.MAX_DROPDOWN_HEIGHT, Math.max(spaceBelow, spaceAbove) - 10);
        } else {
            // 普通情况
            spaceBelow = viewportHeight - triggerRect.bottom;
            spaceAbove = triggerRect.top;
        }
        
        // 判断是向上还是向下展开
        if (spaceBelow < Math.min(optionsHeight, maxHeight) && spaceAbove > spaceBelow) {
            // 空间不足，向上显示 - 使用CSS自定义属性
            this.optionsContainer.style.setProperty('--dropdown-top', 'auto');
            this.optionsContainer.style.setProperty('--dropdown-bottom', '100%');
            maxHeight = Math.min(maxHeight, spaceAbove - 10);
        } else {
            // 正常向下显示 - 使用CSS自定义属性
            this.optionsContainer.style.setProperty('--dropdown-top', '100%');
            this.optionsContainer.style.setProperty('--dropdown-bottom', 'auto');
            maxHeight = Math.min(maxHeight, spaceBelow - 10);
        }
        
        // 设置宽度和最大高度 - 使用CSS自定义属性
        this.optionsContainer.style.setProperty('--dropdown-width', triggerRect.width + 'px');
        this.optionsContainer.style.setProperty('--dropdown-max-height', maxHeight + 'px');
    }
    
}


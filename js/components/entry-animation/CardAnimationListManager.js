/**
 * CardAnimationListManager - 卡片动画列表管理
 * 管理入场动画配置页面中的卡片动画类型列表的显示、更新和用户交互
 * 
 * 职责说明：
 * - 这是一个辅助类，专门为 EntryAnimationConfigPage 提供卡片动画列表管理功能
 * - 根据卡片数量动态创建/更新动画类型选择器
 * - 管理动画区域的显示/隐藏（带动画效果）
 * - 收集所有卡片的动画类型配置
 * 
 * 当前被使用的模块：
 * - EntryAnimationConfigPage (services/ui/EntryAnimationConfigPage.js) - 主配置页面
 * 
 * 当前依赖的模块：
 * - StateManager (core/StateManager.js) - 状态管理器，读取动画配置 (通过构造器注入)
 * - CustomSelectFactory (components/CustomSelectFactory.js) - 自定义下拉菜单工厂，创建选择器 (通过构造器注入)
 * 
 * 架构说明：
 * - DOM 元素通过 init() 方法传入，不在构造函数中初始化（支持动态 DOM）
 * - 使用 DocumentFragment 批量添加 DOM，减少重排
 * - 使用 CSS 变量控制动画时长，保持样式和逻辑分离
 */

export class CardAnimationListManager {
    /**
     * 入场动画类型常量
     * 这些类型与 EntryAnimationStrategyManager.STRATEGY_NAMES 中的策略名称对应
     */
    static ANIMATION_TYPES = [
        { value: 'fade', label: '淡入' },
        { value: 'slide-left', label: '左滑入' },
        { value: 'slide-right', label: '右滑入' },
        { value: 'slide-up', label: '上滑入' },
        { value: 'slide-down', label: '下滑入' },
        { value: 'scale', label: '缩放' },
        { value: 'rotate-scale', label: '旋转缩放' },
        { value: 'zoom-blur', label: '模糊缩放' },
        { value: 'flip-horizontal', label: '水平翻转' },
        { value: 'bounce-in', label: '弹跳入场' },
        { value: 'flip-vertical', label: '垂直翻转' },
        { value: 'swing', label: '摇摆入场' },
        { value: 'glitch', label: '故障效果' },
        { value: 'wave-reveal', label: '波浪揭示' },
        { value: 'fragment-reassembly', label: '碎片重组' }
    ];

    /**
     * 构造函数
     * @param {StateManager} stateManager - 状态管理器
     * @param {CustomSelectFactory} customSelectFactory - 自定义下拉菜单工厂
     * @throws {Error} 当依赖缺失时立即抛出错误（Fail Fast）
     */
    constructor(stateManager, customSelectFactory) {
        // Fail Fast: 验证依赖
        if (!stateManager) {
            throw new Error('CardAnimationListManager requires stateManager dependency');
        }
        if (!customSelectFactory) {
            throw new Error('CardAnimationListManager requires customSelectFactory dependency');
        }
        
        this.stateManager = stateManager;
        this.customSelectFactory = customSelectFactory;
        
        // DOM 元素引用（通过 init 传入）
        this.elements = null;
        
        // 模板引用
        this.templates = null;
        
        // 卡片动画类型下拉组件实例
        this.animationSelects = [];
        
        // 动画时长缓存（性能优化：避免重复查询getComputedStyle）
        // 使用WeakMap，以元素为key，自动垃圾回收
        this.animationDurations = new WeakMap();
    }
    
    /**
     * 初始化列表管理器
     * @param {HTMLElement} container - 父容器元素
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时立即抛出错误（Fail Fast）
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('CardAnimationListManager.init: container must be a valid HTMLElement');
        }
        
        // 查找所有需要的DOM元素
        this.elements = {
            animationsSection: container.querySelector('#cardAnimationsSection'),
            animationsList: container.querySelector('#cardAnimationsList'),
            animationsHint: container.querySelector('#cardAnimationsHint')
        };
        
        // Fail Fast: 验证所有必需元素
        if (!this.elements.animationsSection) {
            throw new Error('CardAnimationListManager.init: #cardAnimationsSection not found in container');
        }
        if (!this.elements.animationsList) {
            throw new Error('CardAnimationListManager.init: #cardAnimationsList not found in container');
        }
        if (!this.elements.animationsHint) {
            throw new Error('CardAnimationListManager.init: #cardAnimationsHint not found in container');
        }
        
        // 查找模板
        const cardItemTemplate = document.querySelector('#cardAnimationItemTemplate');
        const selectOptionTemplate = document.querySelector('#selectOptionTemplate');
        
        // Fail Fast: 验证模板存在
        if (!cardItemTemplate) {
            throw new Error('CardAnimationListManager.init: #cardAnimationItemTemplate not found');
        }
        if (!selectOptionTemplate) {
            throw new Error('CardAnimationListManager.init: #selectOptionTemplate not found');
        }
        
        this.templates = {
            cardItemTemplate,
            selectOptionTemplate
        };
    }
    
    /**
     * 更新卡片动画类型列表
     * @param {number} cardCount - 卡片数量
     * @returns {void}
     * @throws {Error} 当 state 中的 savedAnimations 缺失时立即抛出错误（Fail Fast）
     */
    updateCardAnimationsList(cardCount) {
        const section = this.elements.animationsSection;
        const isCurrentlyVisible = section.classList.contains('show');
        
        if (cardCount === 0) {
            const allItems = this.elements.animationsList.querySelectorAll('.card-animation-item');
            
            // 如果列表中有卡片，先触发退出动画
            if (allItems.length > 0) {
                // 读取动画时长（所有item共用）
                const computedStyle = getComputedStyle(allItems[0]);
                const transitionDuration = computedStyle.transitionDuration;
                const duration = parseFloat(transitionDuration) * 1000;
                
                // Fail Fast: 验证时长有效
                if (isNaN(duration) || duration <= 0) {
                    throw new Error('CardAnimationListManager.updateCardAnimationsList: Invalid transition-duration on card-animation-item');
                }
                
                // 为所有item添加removing类
                allItems.forEach(item => {
                    item.classList.add('removing');
                });
                
                // 同时隐藏提示和区域（与卡片退出动画同步）
                this._hideElement(this.elements.animationsHint);
                if (isCurrentlyVisible) {
                    this._hideElement(section);
                }
                
                // 等待动画完成后清空列表
                setTimeout(() => {
                    this.elements.animationsList.textContent = '';
                    this.animationSelects = [];
                }, duration);
            } else {
                // 列表本来就是空的，直接清空并隐藏
                this.elements.animationsList.textContent = '';
                this.animationSelects = [];
                
                // 隐藏卡片动画区域
                if (isCurrentlyVisible) {
                    this._hideElement(section);
                }
                
                // 隐藏提示（带动画）
                this._hideElement(this.elements.animationsHint);
            }
            
            return;
        }
        
        // 显示卡片动画区域
        if (!isCurrentlyVisible) {
            this._showElement(section);
        }
        
        // 显示提示（带动画）
        this._showElement(this.elements.animationsHint);
        
        const previousCount = this.animationSelects.length;
        
        // 删除多余的item（从后往前删除）
        if (cardCount < previousCount) {
            const allItems = this.elements.animationsList.querySelectorAll('.card-animation-item');
            
            // Fail Fast: 验证DOM元素数量和数组长度一致
            if (allItems.length !== previousCount) {
                throw new Error(`CardAnimationListManager.updateCardAnimationsList: DOM items count (${allItems.length}) does not match animationSelects length (${previousCount})`);
            }
            
            // 读取动画时长（所有item共用）
            const computedStyle = getComputedStyle(allItems[0]);
            const transitionDuration = computedStyle.transitionDuration;
            const duration = parseFloat(transitionDuration) * 1000;
            
            // Fail Fast: 验证时长有效
            if (isNaN(duration) || duration <= 0) {
                throw new Error('CardAnimationListManager.updateCardAnimationsList: Invalid transition-duration on card-animation-item');
            }
            
            for (let i = previousCount - 1; i >= cardCount; i--) {
                const itemToRemove = allItems[i];
                
                // 添加移除动画类
                itemToRemove.classList.add('removing');
                
                // 等待动画完成后移除
                setTimeout(() => {
                    itemToRemove.remove();
                }, duration);
            }
            this.animationSelects.splice(cardCount);
            return;
        }
        
        // 缓存 state 路径，避免重复访问
        const entryAnimationConfig = this.stateManager.state.playback.entryAnimation;
        
        if (!entryAnimationConfig) {
            throw new Error('CardAnimationListManager.updateCardAnimationsList: playback.entryAnimation is missing from state');
        }
        
        const savedAnimations = entryAnimationConfig.cardAnimations;
        const animationTypes = CardAnimationListManager.ANIMATION_TYPES;
        
        if (!savedAnimations) {
            throw new Error('CardAnimationListManager.updateCardAnimationsList: savedAnimations is missing from state');
        }
        
        // 使用 DocumentFragment 批量添加 DOM，减少重排
        const fragment = document.createDocumentFragment();
        
        // 为每张卡片创建动画类型选择器
        for (let i = 0; i < cardCount; i++) {
            // 如果这个 item 已经存在，跳过
            if (i < previousCount && cardCount >= previousCount) {
                continue;
            }
            
            this._createCardAnimationItem(i, savedAnimations, animationTypes, fragment);
        }
        
        // 一次性批量添加所有新 item 到 DOM
        if (fragment.hasChildNodes()) {
            this.elements.animationsList.appendChild(fragment);
            
            // 批量添加入场动画
            requestAnimationFrame(() => {
                const newItems = this.elements.animationsList.querySelectorAll('.card-animation-item:not(.animate-in)');
                newItems.forEach(item => {
                    item.classList.add('animate-in');
                });
            });
        }
    }
    
    /**
     * 创建单个卡片动画配置项
     * @private
     * @param {number} index - 卡片索引
     * @param {Array<string>} savedAnimations - 已保存的动画类型数组（如果该索引不存在，使用默认值）
     * @param {Array<Object>} animationTypes - 动画类型选项数组
     * @param {DocumentFragment} fragment - 用于添加 DOM 的文档片段
     * @returns {void}
     * @throws {Error} 当 template 结构错误时立即抛出错误
     */
    _createCardAnimationItem(index, savedAnimations, animationTypes, fragment) {
        // 克隆 template
        const clone = this.templates.cardItemTemplate.content.cloneNode(true);
        
        // 设置 label 文本
        const label = clone.querySelector('.config-label-main');
        if (!label) {
            throw new Error('CardAnimationListManager._createCardAnimationItem: .config-label-main not found in cardItemTemplate');
        }
        label.textContent = `卡片 ${index + 1}:`;
        
        // 设置 select 容器
        const selectContainer = clone.querySelector('.custom-select');
        if (!selectContainer) {
            throw new Error('CardAnimationListManager._createCardAnimationItem: .custom-select not found in cardItemTemplate');
        }
        // 如果 savedAnimations 中没有该索引的值，使用默认值（第一个动画类型）
        const animationValue = savedAnimations[index] !== undefined 
            ? savedAnimations[index] 
            : animationTypes[0].value;
        selectContainer.dataset.value = animationValue;
        
        // 设置 select 显示值
        const selectValue = clone.querySelector('.select-value');
        if (!selectValue) {
            throw new Error('CardAnimationListManager._createCardAnimationItem: .select-value not found in cardItemTemplate');
        }
        selectValue.textContent = this._getAnimationLabel(animationValue, animationTypes);
        
        // 使用 Template 创建 options
        const selectOptions = clone.querySelector('.select-options');
        if (!selectOptions) {
            throw new Error('CardAnimationListManager._createCardAnimationItem: .select-options not found in cardItemTemplate');
        }
        const optionsFragment = document.createDocumentFragment();
        
        animationTypes.forEach(type => {
            const optionClone = this.templates.selectOptionTemplate.content.cloneNode(true);
            const option = optionClone.querySelector('.select-option');
            if (!option) {
                throw new Error('CardAnimationListManager._createCardAnimationItem: .select-option not found in selectOptionTemplate');
            }
            option.dataset.value = type.value;
            
            const optionText = optionClone.querySelector('.option-text');
            if (!optionText) {
                throw new Error('CardAnimationListManager._createCardAnimationItem: .option-text not found in selectOptionTemplate');
            }
            optionText.textContent = type.label;
            
            optionsFragment.appendChild(optionClone);
        });
        
        selectOptions.appendChild(optionsFragment);
        
        // 添加到 fragment
        fragment.appendChild(clone);
        
        // 使用 CustomSelectFactory 创建组件
        const selectComponent = this.customSelectFactory.create(selectContainer);
        // 创建后立即设置值（CustomSelect初始化时会选择第一个选项，需要覆盖）
        selectComponent.setValue(animationValue);
        this.animationSelects.push(selectComponent);
        
        // 监听下拉菜单值变化，同步更新 dataset.value（供 getCardAnimations() 读取）
        selectContainer.addEventListener('change', (event) => {
            const newValue = event.detail.value;
            selectContainer.dataset.value = newValue;
        });
        
        // 监听右键点击选项，应用到所有卡片
        const options = selectContainer.querySelectorAll('.select-option');
        options.forEach(option => {
            option.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const value = option.dataset.value;
                // 将所有卡片的动画类型设置为相同值
                this.animationSelects.forEach(select => {
                    select.setValue(value);
                    // 同步更新 dataset.value
                    select.element.dataset.value = value;
                });
                // 关闭当前打开的下拉菜单
                selectComponent.close();
            });
        });
    }
    
    /**
     * 获取动画类型标签
     * @private
     * @param {string} value - 动画类型值
     * @param {Array<Object>} animationTypes - 动画类型选项数组
     * @returns {string} 动画类型标签
     * @throws {Error} 当动画类型不存在时立即抛出错误（Fail Fast）
     */
    _getAnimationLabel(value, animationTypes) {
        const type = animationTypes.find(t => t.value === value);
        if (!type) {
            throw new Error(`CardAnimationListManager._getAnimationLabel: Animation type "${value}" not found in animationTypes`);
        }
        return type.label;
    }
    
    /**
     * 获取所有卡片的动画类型配置
     * @returns {Array<string>} 每张卡片的动画类型数组
     * @throws {Error} 当 select 组件或 dataset 值缺失时立即抛出错误（Fail Fast）
     */
    getCardAnimations() {
        const cardAnimations = [];
        
        this.animationSelects.forEach(select => {
            const selectElement = select.element;
            if (!selectElement) {
                throw new Error('CardAnimationListManager.getCardAnimations: select.element is undefined');
            }
            const animationValue = selectElement.dataset.value;
            if (!animationValue) {
                throw new Error('CardAnimationListManager.getCardAnimations: selectElement.dataset.value is undefined');
            }
            cardAnimations.push(animationValue);
        });
        
        return cardAnimations;
    }
    
    /**
     * 显示元素（带动画）
     * @private
     * @param {HTMLElement} element - 要显示的元素
     * @returns {void}
     */
    _showElement(element) {
        element.classList.remove('hiding');
        element.classList.add('show');
    }
    
    /**
     * 隐藏元素（带动画）
     * @private
     * @param {HTMLElement} element - 要隐藏的元素
     * @returns {void}
     */
    _hideElement(element) {
        element.classList.remove('show');
        element.classList.add('hiding');
        
        // 优先使用缓存
        let duration = this.animationDurations.get(element);
        
        if (duration === undefined) {
            // 读取元素应用CSS后的实际动画时长
            const computedStyle = getComputedStyle(element);
            const animationDuration = computedStyle.animationDuration;
            
            // 解析动画时长（格式如"0.3s"）
            duration = parseFloat(animationDuration) * 1000;
            
            // 缓存结果
            this.animationDurations.set(element, duration);
        }
        
        setTimeout(() => {
            element.classList.remove('hiding');
        }, duration);
    }
    
    /**
     * 清理资源
     * @returns {void}
     */
    destroy() {
        this.elements = null;
        this.templates = null;
        this.animationSelects = [];
    }
}


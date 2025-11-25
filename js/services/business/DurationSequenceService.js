/**
 * DurationSequenceService - 时长序列管理服务
 * 处理时长序列的创建、更新、验证和数据同步（UI层）
 * 
 * 当前被使用的模块：
 * - AdvancedLoopService (modal/AdvancedLoopService.js) - 管理高级循环模态框中的时长序列功能
 * - PlaybackCoordinatorService (business/PlaybackCoordinatorService.js) - 播放协调服务
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理，访问播放配置和滚动配置 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线，通过request()同步调用System层ValidationService(通过DI注入)
 * - parseDuration, calculateLoopDuration (helpers/durationCalculators.js) - 时长计算工具函数
 * - debounce (helpers/debounce.js) - 防抖工具函数 (直接导入)
 */

import { debounce } from '../../helpers/debounce.js';
import { parseDuration, calculateLoopDuration } from '../../helpers/durationCalculators.js';

export class DurationSequenceService {
    /**
     * 构造函数
     * @param {StateManager} stateManager - 状态管理器
     * @param {EventBus} eventBus - 事件总线（用于通过request()同步调用System层ValidationService）
     * @throws {Error} 当核心依赖（stateManager/eventBus）缺失时抛出错误（Fail Fast）
     */
    constructor(stateManager, eventBus) {
        // Fail Fast: 验证核心依赖
        if (!stateManager) {
            throw new Error('StateManager is required for DurationSequenceService');
        }
        if (!eventBus) {
            throw new Error('EventBus is required for DurationSequenceService');
        }
        
        this.stateManager = stateManager;
        this.eventBus = eventBus;
        
        // 创建防抖的验证方法
        this._debouncedValidate = null;
    }

    /**
     * 验证并获取 durationSequenceList 元素
     * @param {Object} elements - DOM元素引用
     * @returns {HTMLElement} durationSequenceList 元素
     * @throws {Error} 当 durationSequenceList 缺失时抛出错误（Fail Fast）
     * @private
     */
    _getDurationSequenceList(elements) {
        const { durationSequenceList } = elements;
        if (!durationSequenceList) {
            throw new Error('Required element not found: durationSequenceList. Please check HTML structure.');
        }
        return durationSequenceList;
    }

    /**
     * 初始化防抖验证方法
     * 必须在 stateManager 完全初始化后调用
     * @returns {void}
     * @throws {Error} 当配置值缺失时抛出错误（Fail Fast）
     */
    initDebouncedValidation() {
        if (!this._debouncedValidate) {
            const delay = 300;  // 技术实现：防抖延迟（毫秒）
            if (delay == null) {
                throw new Error('Input debounce delay configuration is missing or invalid');
            }
            this._debouncedValidate = debounce((input) => {
                this._validateSequenceInputUI(input);
            }, delay);
        }
    }

    /**
     * 验证时长序列输入框并更新UI（处理DOM操作）
     * 
     * 职责：
     * - 调用 ValidationService 获取验证结果
     * - 根据验证结果更新 DOM 状态（CSS类管理）
     * 
     * @param {HTMLInputElement} input - 输入框元素
     * @returns {void}
     * @throws {Error} 当DOM结构不符合预期时抛出错误（Fail Fast）
     * @private
     */
    _validateSequenceInputUI(input) {
        const inputValue = input.value.trim();
        // 通过EventBus.request()同步调用System层ValidationService
        const validation = this.eventBus.request('validation:sequence-value', { inputValue });
        
        const sequenceItem = input.closest('.duration-sequence-item');
        const errorElement = sequenceItem?.querySelector('.sequence-item-error');
        
        // Fail Fast: DOM 结构必须正确
        if (!sequenceItem) {
            throw new Error('Invalid DOM structure: missing parent element .duration-sequence-item');
        }
        if (!errorElement) {
            throw new Error('Invalid DOM structure: missing error element .sequence-item-error');
        }
        
        // 清除之前的错误状态
        input.classList.remove('error');
        errorElement.classList.remove('show');
        errorElement.classList.remove('show-empty');
        errorElement.classList.remove('show-min');
        
        if (!validation.isValid) {
            // 根据错误类型添加对应的样式
            input.classList.add('error');
            errorElement.classList.add('show');
            
            if (validation.errorType === 'empty') {
                errorElement.classList.add('show-empty');
            } else if (validation.errorType === 'min') {
                errorElement.classList.add('show-min');
            }
        }
        // 如果输入有效，保持清除后的状态
    }

    /**
     * 更新时长序列显示
     * @param {Object} elements - DOM元素引用
     * @param {HTMLElement} elements.durationSequenceList - 时长序列列表容器
     * @param {HTMLInputElement} elements.variableDurationCheckbox - 变长时长复选框
     * @param {HTMLElement} elements.durationPatternControl - 时长模式控制容器
     * @param {HTMLTemplateElement} elements.durationSequenceItemTemplate - 序列项模板
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    updateDurationSequence(elements) {
        const { variableDurationCheckbox, durationPatternControl } = elements;
        if (!variableDurationCheckbox) {
            throw new Error('Required element not found: variableDurationCheckbox. Please check HTML structure.');
        }
        if (!durationPatternControl) {
            throw new Error('Required element not found: durationPatternControl. Please check HTML structure.');
        }
        
        // 性能优化：一次性解构所有需要的状态，减少重复访问
        const { loop, scroll } = this.stateManager.state.playback;
        const loopCount = loop.count;
        
        // Fail Fast: 验证关键配置
        if (scroll?.duration == null) {
            throw new Error('Scroll duration configuration is missing or invalid');
        }
        const baseDuration = parseFloat(scroll.duration);
        
        const savedDurationSequence = loop.durationSequence;
        const isVariableDurationEnabled = variableDurationCheckbox.checked;
        
        
        // 只有在启用变长时长且循环次数大于1时才显示时长序列
        if (loopCount <= 1 || !isVariableDurationEnabled) {
            durationPatternControl.classList.add('hidden');
            this.clearDurationSequence(elements);
            return;
        }
        
        // 性能优化：一次性获取并验证 durationSequenceList，避免重复检查
        const durationSequenceList = this._getDurationSequenceList(elements);
        
        // 显示序列控件
        durationPatternControl.classList.remove('hidden');
        
        // 生成时长序列输入框
        this.createDurationSequenceItems(loopCount, baseDuration, elements, durationSequenceList);
        
        // 如果StateManager中有保存的时长序列，智能加载数据
        if (savedDurationSequence && savedDurationSequence.length > 0) {
            this.loadDurationSequenceFromStateIntelligent(savedDurationSequence, baseDuration, durationSequenceList);
        }
        
        // 设置输入框启用状态
        this.setDurationSequenceEnabled(true, durationSequenceList);
    }

    /**
     * 智能加载时长序列：保持已有数据，新增部分使用默认值，减少时截取
     * @param {Array<number>} savedDurationSequence - 已保存的时长序列
     * @param {number} baseDuration - 默认时长
     * @param {HTMLElement} durationSequenceList - 时长序列列表容器（已验证）
     * @returns {void}
     */
    loadDurationSequenceFromStateIntelligent(savedDurationSequence, baseDuration, durationSequenceList) {
        const inputs = durationSequenceList.querySelectorAll('input[data-loop-index]');
        
        inputs.forEach((input, index) => {
            if (index < savedDurationSequence.length) {
                // 使用已保存的数据
                input.value = savedDurationSequence[index];
            } else {
                // 新增的输入框使用默认值
                input.value = baseDuration;
            }
        });
    }

    /**
     * 设置时长序列输入框的启用/禁用状态
     * @param {boolean} enabled - 是否启用
     * @param {HTMLElement} durationSequenceList - 时长序列列表容器（已验证）
     * @returns {void}
     */
    setDurationSequenceEnabled(enabled, durationSequenceList) {
        const inputs = durationSequenceList.querySelectorAll('input');
        inputs.forEach(input => {
            input.disabled = !enabled;
            if (enabled) {
                input.classList.remove('disabled-opacity');
            } else {
                input.classList.add('disabled-opacity');
            }
        });
    }

    /**
     * 清空时长序列
     * @param {Object} elements - DOM元素引用
     * @param {HTMLElement} elements.durationSequenceList - 时长序列列表容器
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    clearDurationSequence(elements) {
        const durationSequenceList = this._getDurationSequenceList(elements);
        // 移除所有子元素，避免内存泄漏
        while (durationSequenceList.firstChild) {
            durationSequenceList.removeChild(durationSequenceList.firstChild);
        }
    }

    /**
     * 创建时长序列项目
     * @param {number} loopCount - 循环次数
     * @param {number} baseDuration - 基础时长
     * @param {Object} elements - DOM元素引用
     * @param {HTMLTemplateElement} elements.durationSequenceItemTemplate - 序列项模板
     * @param {HTMLElement} durationSequenceList - 时长序列列表容器（已验证）
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    createDurationSequenceItems(loopCount, baseDuration, elements, durationSequenceList) {
        const { durationSequenceItemTemplate } = elements;
        if (!durationSequenceItemTemplate) {
            throw new Error('Required element not found: durationSequenceItemTemplate. Please check HTML structure.');
        }
        
        // 使用 DocumentFragment 批量操作
        const fragment = document.createDocumentFragment();
        
        for (let i = 1; i <= loopCount; i++) {
            const itemElement = this.cloneSequenceItem(i, baseDuration, durationSequenceItemTemplate);
            fragment.appendChild(itemElement);
        }
        
        // 先清空，然后一次性添加所有元素
        this.clearDurationSequence(elements);
        durationSequenceList.appendChild(fragment);
    }

    /**
     * 克隆并配置序列项目
     * @param {number} index - 序列索引
     * @param {number} duration - 时长值
     * @param {HTMLTemplateElement} template - 模板元素
     * @returns {DocumentFragment} 克隆的元素
     * @throws {Error} 当模板元素或必需的DOM子元素缺失时抛出错误（Fail Fast）
     */
    cloneSequenceItem(index, duration, template) {
        if (!template) {
            throw new Error('Template element is required for cloneSequenceItem');
        }
        // 从HTML模板克隆
        const clone = template.content.cloneNode(true);
        
        // 配置标签
        const label = clone.querySelector('.sequence-item-label');
        if (!label) {
            throw new Error('Required element not found: .sequence-item-label in template. Please check HTML structure.');
        }
        label.textContent = `第${index}次:`;
        
        // 配置输入框
        const input = clone.querySelector('input');
        if (!input) {
            throw new Error('Required element not found: input in template. Please check HTML structure.');
        }
        input.value = duration.toString();
        input.setAttribute('data-loop-index', index.toString());
        
        // 添加事件监听器 - 使用内部的防抖验证方法
        input.addEventListener('input', (e) => {
            // 使用内部防抖验证方法，实现完整的输入框生命周期管理
            if (this._debouncedValidate) {
                this._debouncedValidate(e.target);
            }
        });
        
        // 为容器元素添加进入动画类
        const itemContainer = clone.querySelector('.duration-sequence-item');
        if (!itemContainer) {
            throw new Error('Required element not found: .duration-sequence-item in template. Please check HTML structure.');
        }
        itemContainer.classList.add('entering');
        // 动画完成后移除entering类
        const removeEnteringCallback = () => {
            itemContainer.classList.remove('entering');
        };
        const delay = 400;  // 技术实现：CSS动画延迟（毫秒）
        if (delay == null) {
            throw new Error('Animation class removal delay configuration is missing or invalid');
        }
        setTimeout(removeEnteringCallback, delay);
        
        return clone;
    }

    /**
     * 更新时长序列数据到状态管理器
     * 
     * 职责：
     * - 从DOM输入框收集用户输入的时长数据
     * - 更新到 StateManager 的 playback.loop.durationSequence
     * 
     * 性能优化说明：
     * - 如果需要与其他状态更新合并为批量更新，调用者应使用 stateManager.batch()
     * - 例如：batch(() => { updateDurationSequenceData(); state.loop.count = 5; })
     * 
     * @param {Object} elements - DOM元素引用
     * @param {HTMLElement} elements.durationSequenceList - 时长序列列表容器
     * @returns {void}
     * @throws {Error} 当必需的DOM元素缺失时抛出错误（Fail Fast）
     */
    updateDurationSequenceData(elements) {
        const durationSequenceList = this._getDurationSequenceList(elements);
        const inputs = durationSequenceList.querySelectorAll('input[data-loop-index]');
        
        // 🎯 如果没有输入框（DOM已清空），不要覆盖已保存的数据
        // 场景：用户编辑时长序列后切换到无限循环/1次，然后切换回来
        // 期望：保留之前编辑的数据，而不是用空数组覆盖
        if (inputs.length === 0) {
            return;
        }
        
        const durationSequence = [];
        
        inputs.forEach((input, index) => {
            // 委托给 DurationCalculatorService 解析时长值（处理NaN和边界情况）
            const minDuration = this.stateManager.getDefaultValue('validation.sequence.minDuration');
            const value = parseDuration(input.value, minDuration);
            durationSequence.push(value);
        });
        
        // 直接更新状态，由 Proxy 触发响应式通知
        // 如果调用者在 batch() 中调用，通知会被自动延迟和合并
        this.stateManager.state.playback.loop.durationSequence = durationSequence;
    }

    /**
     * 计算下一次循环的时长（委托给 DurationCalculatorService）
     * @param {number} loopNumber - 循环次数（从1开始）
     * @returns {number} - 新的时长（秒）
     */
    calculateNextLoopDuration(loopNumber) {
        // 性能优化：一次性解构状态，减少重复访问（此方法在循环中被高频调用）
        const { scroll, loop } = this.stateManager.state.playback;
        const baseDuration = scroll.duration;
        const durationSequence = loop.durationSequence || [];
        
        // 委托给 DurationCalculatorService 进行计算
        return calculateLoopDuration(loopNumber, baseDuration, durationSequence);
    }

    /**
     * 检查时长序列是否有验证错误
     * 
     * 职责：
     * - 收集所有输入框的值
     * - 批量验证，判断是否有任何错误
     * - 供外部（如模态框确认）调用，判断是否可以提交
     * 
     * @param {Object} elements - DOM元素引用
     * @param {HTMLElement} [elements.durationSequenceList] - 时长序列列表容器（可选，如果不存在则返回false）
     * @returns {boolean} 是否有错误
     */
    hasValidationErrors(elements) {
        const { durationSequenceList } = elements;
        
        // 如果没有序列列表，说明当前不需要验证（如循环次数≤1）
        if (!durationSequenceList) {
            return false;
        }
        
        // 收集所有输入框的值
        const inputs = durationSequenceList.querySelectorAll('input');
        const values = Array.from(inputs).map(input => input.value.trim());
        
        // 通过EventBus.request()同步调用System层ValidationService
        return this.eventBus.request('validation:sequence-errors', { durationValues: values });
    }
}


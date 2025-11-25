/**
 * UIStateCoordinator - 入场动画配置页面UI状态协调组件
 * 负责UI元素的显示/隐藏、动画管理和总时长计算显示
 * 
 * 职责说明：
 * - 管理配置字段容器的显示/隐藏（带动画）
 * - 管理性能优化项的折叠/展开功能
 * - 计算和更新入场动画总时长显示
 * - 提供CSS动画时长查询和缓存
 * 
 * 当前被使用的模块：
 * - EntryAnimationConfigPage (ui/EntryAnimationConfigPage.js) - 初始化和调用UI状态管理功能
 * 
 * 当前依赖的模块：
 * - formatMilliseconds (helpers/timeFormatters.js) - 格式化时间显示
 * - calculateEntryAnimationTotalDuration (helpers/durationCalculators.js) - 计算总时长
 * 
 * 架构说明：
 * - 遵循"父传容器，子自查找"模式，与 PerformanceReportPage 的子组件架构一致
 * - 纯UI操作组件，不依赖业务服务
 * - 所有DOM元素在 init() 中查找并验证（Fail Fast）
 */

import { formatMilliseconds } from '../../helpers/timeFormatters.js';
import { calculateEntryAnimationTotalDuration } from '../../helpers/durationCalculators.js';

export class UIStateCoordinator {
    /**
     * 构造函数 - 创建UI状态协调组件
     */
    constructor() {
        // DOM元素引用
        this.elements = {};
        
        // CSS动画时长缓存
        this.cssAnimationDurations = new Map();
    }
    
    /**
     * 初始化组件，查找需要的DOM元素
     * @param {HTMLElement} container - 父容器元素
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时立即抛出错误
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('UIStateCoordinator.init: container must be a valid HTMLElement');
        }
        
        // 查找所有需要的DOM元素
        this.elements = {
            fieldsContainer: container.querySelector('#entryAnimationFields'),
            totalDuration: container.querySelector('#entryAnimationTotalDuration'),
            performanceOptimizationsToggle: container.querySelector('#performanceOptimizationsToggle'),
            performanceOptimizationsList: container.querySelector('#performanceOptimizationsList'),
            performanceOptimizationsFade: container.querySelector('#performanceOptimizationsFade'),
            durationInput: container.querySelector('#entryAnimationDuration'),
            staggerDelayInput: container.querySelector('#entryAnimationStaggerDelay')
        };
        
        // Fail Fast: 验证所有必需元素
        if (!this.elements.fieldsContainer) {
            throw new Error('UIStateCoordinator.init: #entryAnimationFields not found in container');
        }
        if (!this.elements.totalDuration) {
            throw new Error('UIStateCoordinator.init: #entryAnimationTotalDuration not found in container');
        }
        if (!this.elements.performanceOptimizationsToggle) {
            throw new Error('UIStateCoordinator.init: #performanceOptimizationsToggle not found in container');
        }
        if (!this.elements.performanceOptimizationsList) {
            throw new Error('UIStateCoordinator.init: #performanceOptimizationsList not found in container');
        }
        if (!this.elements.performanceOptimizationsFade) {
            throw new Error('UIStateCoordinator.init: #performanceOptimizationsFade not found in container');
        }
        if (!this.elements.durationInput) {
            throw new Error('UIStateCoordinator.init: #entryAnimationDuration not found in container');
        }
        if (!this.elements.staggerDelayInput) {
            throw new Error('UIStateCoordinator.init: #entryAnimationStaggerDelay not found in container');
        }
    }
    
    /**
     * 更新配置字段容器的可见性
     * @param {boolean} isEnabled - 是否启用入场动画
     * @param {Function} onInitEditor - 初始化编辑器的回调函数（首次显示时调用）
     * @returns {void}
     */
    updateFieldsVisibility(isEnabled, onInitEditor) {
        const container = this.elements.fieldsContainer;
        
        if (isEnabled) {
            // 启用：显示容器
            this.showElement(container);
            
            // 懒初始化：等待容器显示后才初始化Canvas编辑器（确保clientWidth正确）
            if (onInitEditor) {
                requestAnimationFrame(() => {
                    onInitEditor();
                });
            }
        } else {
            // 禁用：隐藏容器（带退出动画）
            this.hideElement(container);
        }
    }
    
    /**
     * 显示元素（带动画）
     * @param {HTMLElement} element - 要显示的元素
     * @returns {void}
     */
    showElement(element) {
        element.classList.remove('hiding');
        element.classList.add('show');
    }
    
    /**
     * 隐藏元素（带动画）
     * @param {HTMLElement} element - 要隐藏的元素
     * @returns {void}
     */
    hideElement(element) {
        element.classList.remove('show');
        element.classList.add('hiding');
        
        const duration = this.getCSSAnimationDuration('--entry-animation-fields-fade-out-duration');
        
        setTimeout(() => {
            element.classList.remove('hiding');
        }, duration);
    }
    
    /**
     * 获取CSS动画时长（毫秒）
     * 使用缓存避免重复查询getComputedStyle，提升性能
     * @param {string} cssVariableName - CSS变量名
     * @returns {number} 动画时长（毫秒）
     * @throws {Error} 当CSS变量不存在或无效时立即抛出错误
     */
    getCSSAnimationDuration(cssVariableName) {
        // 优先使用缓存
        if (this.cssAnimationDurations.has(cssVariableName)) {
            return this.cssAnimationDurations.get(cssVariableName);
        }
        
        // 查询CSS变量
        const value = getComputedStyle(document.documentElement).getPropertyValue(cssVariableName);
        if (!value || value.trim() === '') {
            throw new Error(`UIStateCoordinator.getCSSAnimationDuration: CSS variable ${cssVariableName} not found or empty`);
        }
        
        const duration = parseFloat(value.replace('s', ''));
        if (!Number.isFinite(duration) || duration < 0) {
            throw new Error(`UIStateCoordinator.getCSSAnimationDuration: Invalid duration value "${value}"`);
        }
        
        const durationMs = duration * 1000;
        
        // 缓存结果
        this.cssAnimationDurations.set(cssVariableName, durationMs);
        
        return durationMs;
    }
    
    /**
     * 更新入场动画总时长显示
     * @param {number|null} cardCount - 卡片数量，如果为null则显示"-"
     * @returns {void}
     */
    updateTotalDuration(cardCount) {
        if (cardCount === null || cardCount === undefined || cardCount === 0) {
            this.elements.totalDuration.textContent = '-';
            return;
        }
        
        const duration = parseFloat(this.elements.durationInput.value);
        const staggerDelay = parseFloat(this.elements.staggerDelayInput.value);
        
        // 使用 calculateEntryAnimationTotalDuration 计算总时长
        const totalMs = calculateEntryAnimationTotalDuration(cardCount, duration, staggerDelay);
        
        // 使用 formatMilliseconds 格式化显示
        this.elements.totalDuration.textContent = formatMilliseconds(totalMs);
    }
    
    /**
     * 设置性能优化项折叠/展开功能
     * @returns {void}
     */
    setupPerformanceOptimizationsToggle() {
        this.elements.performanceOptimizationsToggle.addEventListener('click', () => {
            const isExpanded = this.elements.performanceOptimizationsList.classList.contains('expanded');
            
            if (isExpanded) {
                // 折叠
                this.elements.performanceOptimizationsList.classList.remove('expanded');
                this.elements.performanceOptimizationsToggle.classList.remove('expanded');
                this.elements.performanceOptimizationsFade.classList.remove('hidden');
            } else {
                // 展开
                this.elements.performanceOptimizationsList.classList.add('expanded');
                this.elements.performanceOptimizationsToggle.classList.add('expanded');
                this.elements.performanceOptimizationsFade.classList.add('hidden');
            }
        });
    }
    
    /**
     * 销毁组件，清理资源
     * @returns {void}
     */
    destroy() {
        // 清空DOM元素引用
        this.elements = {};
        
        // 清空CSS缓存
        this.cssAnimationDurations.clear();
    }
}


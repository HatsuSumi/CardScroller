/**
 * CanvasInfoPanel - Canvas信息面板组件
 * 负责显示入场Canvas和滚动Canvas的详细信息，包括逻辑尺寸和物理尺寸
 * 
 * 职责说明：
 * - 这是一个纯UI渲染组件，专门为 PerformanceReportPage 提供Canvas信息展示功能
 * - 从Canvas元素中读取尺寸数据并格式化显示
 * - 遵循容器-内容分离模式：接收容器元素，自己管理内部DOM
 * 
 * 当前被使用的模块：
 * - PerformanceReportPage (services/ui/PerformanceReportPage.js) - 性能监控主页面
 * 
 * 当前依赖的模块：
 * - getScrollCanvas, getEntryCanvasSafe (helpers/canvasAccessors.js) - Canvas元素访问工具函数
 * 
 * 架构说明：
 * - DOM 元素通过 init() 方法传入，不在构造函数中初始化（支持动态 DOM）
 * - 使用 Fail Fast 原则验证所有关键参数和DOM元素
 * - Canvas元素通过统一的工具函数获取
 */
import { getScrollCanvas, getEntryCanvasSafe } from '../../helpers/canvasAccessors.js';

export class CanvasInfoPanel {
    /**
     * 构造函数 - 创建Canvas信息面板实例
     */
    constructor() {
        // DOM 元素引用（通过 init 传入）
        this.elements = null;
    }
    
    /**
     * 初始化面板（接收容器，自己查找元素）
     * @param {HTMLElement} container - 面板容器元素
     * @returns {void}
     * @throws {Error} 当容器无效或关键元素缺失时立即抛出错误
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('CanvasInfoPanel.init: container must be a valid HTMLElement');
        }
        
        // 子组件自己查找需要的元素（封装）
        this.elements = {
            entryCanvasInfo: container.querySelector('#entryCanvasInfo'),
            scrollCanvasInfo: container.querySelector('#scrollCanvasInfo')
        };
        
        // Fail Fast: 验证所有必需元素
        if (!this.elements.entryCanvasInfo) {
            throw new Error('CanvasInfoPanel.init: #entryCanvasInfo not found in container');
        }
        if (!this.elements.scrollCanvasInfo) {
            throw new Error('CanvasInfoPanel.init: #scrollCanvasInfo not found in container');
        }
    }
    
    /**
     * 渲染Canvas信息
     * @returns {void}
     * @throws {Error} 当滚动Canvas元素不存在时立即抛出错误
     */
    render() {
        // 使用统一的Canvas访问工具函数获取元素
        const scrollCanvasElement = getScrollCanvas();
        const entryCanvasElement = getEntryCanvasSafe();
        
        // 渲染滚动Canvas信息
        const scrollInfo = `${scrollCanvasElement.width} × ${scrollCanvasElement.height} (逻辑) | ${scrollCanvasElement.offsetWidth} × ${scrollCanvasElement.offsetHeight}px (物理)`;
        this.elements.scrollCanvasInfo.textContent = scrollInfo;
        
        // 渲染入场Canvas信息（可选）
        if (entryCanvasElement) {
            let physicalWidth = entryCanvasElement.offsetWidth;
            let physicalHeight = entryCanvasElement.offsetHeight;
            
            // Fail Fast: 如果Canvas有hidden类，临时显示以获取真实尺寸；否则尺寸为0是错误
            const hasHiddenClass = entryCanvasElement.classList.contains('hidden');
            if (hasHiddenClass) {
                // Canvas被隐藏是正常的，临时显示以获取真实尺寸
                entryCanvasElement.classList.remove('hidden');
                
                // 强制浏览器重新计算布局
                entryCanvasElement.offsetHeight; // 触发reflow
                
                // 读取真实尺寸
                physicalWidth = entryCanvasElement.offsetWidth;
                physicalHeight = entryCanvasElement.offsetHeight;
                
                // 恢复隐藏状态
                entryCanvasElement.classList.add('hidden');
            }
            
            // Fail Fast: 如果没有hidden类但尺寸仍为0，说明有问题
            if (!hasHiddenClass && (physicalWidth === 0 || physicalHeight === 0)) {
                throw new Error(`CanvasInfoPanel.render: entryCanvas has invalid dimensions (${physicalWidth} × ${physicalHeight}px) without hidden class. Check CSS or parent container.`);
            }
            
            const entryInfo = `${entryCanvasElement.width} × ${entryCanvasElement.height} (逻辑) | ${physicalWidth} × ${physicalHeight}px (物理)`;
            this.elements.entryCanvasInfo.textContent = entryInfo;
        } else {
            this.elements.entryCanvasInfo.textContent = '未启用';
        }
    }
    
    /**
     * 销毁组件，清理引用
     * @returns {void}
     */
    destroy() {
        this.elements = null;
    }
}


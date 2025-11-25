/**
 * debounce - 防抖工具函数
 * 纯函数工具，创建防抖函数以限制高频事件的触发频率。在指定延迟时间内多次调用只执行最后一次，常用于输入框搜索、窗口resize、滚动事件等场景的性能优化。
 * 
 * 当前被使用的模块：
 * - DurationSequenceService (services/business/DurationSequenceService.js) - 时长序列输入防抖
 * - AdvancedLoopService (services/modal/AdvancedLoopService.js) - 高级循环模态框输入防抖
 * - PositionSelectorService (services/modal/PositionSelectorService.js) - 位置选择器输入防抖
 * - ImageInfoModalService (services/modal/ImageInfoModalService.js) - 图片信息模态框窗口resize防抖
 * - ParameterControlUIService (services/ui/ParameterControlUIService.js) - 参数输入控件防抖
 * - SidebarService (services/ui/SidebarService.js) - 透明度滑块防抖
 * - CardBoundaryEditorService (services/ui/CardBoundaryEditorService.js) - Canvas编辑器窗口resize防抖
 * - DisplayCoordinatorService (services/ui/DisplayCoordinatorService.js) - 窗口resize防抖
 * - EntryAnimationHelpDialogs (components/entry-animation/EntryAnimationHelpDialogs.js) - 帮助对话框窗口resize防抖
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 */

/**
 * 创建防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 防抖延迟时间（毫秒）
 * @returns {Function} 防抖后的函数（带cancel方法）
 * @throws {Error} 当func不是函数或delay无效时抛出错误（Fail Fast）
 * 
 * @example
 * import { debounce } from '../../helpers/debounce.js';
 * 
 * const debouncedSave = debounce(() => saveData(), 300);
 * input.addEventListener('input', debouncedSave);
 * // 停止防抖
 * debouncedSave.cancel();
 */
export function debounce(func, delay) {
    if (typeof func !== 'function') {
        throw new Error('debounce: func must be a function');
    }
    
    if (typeof delay !== 'number' || delay < 0) {
        throw new Error('debounce: delay must be a non-negative number');
    }
    
    let timeoutId = null;
    
    const debouncedFunction = (...args) => {
        // 清除之前的定时器
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        
        // 创建新的延时器
        timeoutId = setTimeout(() => {
            func(...args);
        }, delay);
    };
    
    // 添加取消方法
    debouncedFunction.cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };
    
    return debouncedFunction;
}


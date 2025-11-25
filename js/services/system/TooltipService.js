import { isLightColor } from '../../helpers/colorAnalyzer.js';

/**
 * TooltipService - 统一提示框管理服务
 * 支持hover触发（data-tooltip / data-tooltip-html属性），提供智能定位、随机渐变背景和动画效果
 * 支持嵌套tooltip（内层tooltip会叠加显示在外层之上，z-index自动递增）
 * 
 * 当前被使用的模块：
 * - 无（通过DI容器注册，由ApplicationBootstrap初始化）
 * 
 * 当前依赖的模块：
 * - isLightColor (helpers/colorAnalyzer.js) - 颜色亮度判断
 */
export class TooltipService {
    // 背景渐变数组（25种 - 跨色系渐变为主，炫酷多彩）
    static BACKGROUNDS = [
        // 彩虹渐变系列（5个）
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // 蓝紫→深紫（保留经典）
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', // 粉紫→粉红（保留经典）
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', // 粉色→黄色（保留经典）
        'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)', // 柔和蓝色（替换刺眼的亮青）
        'linear-gradient(135deg, #ff9a56 0%, #ff6a88 50%, #ff99ac 100%)', // 橙→粉→浅粉
        // 霓虹渐变系列（5个）
        'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)', // 粉红→蓝色（保留经典）
        'linear-gradient(135deg, #00d2ff 0%, #3a47d5 100%)', // 亮青→深蓝
        'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)', // 粉紫→红色
        'linear-gradient(135deg, #05ffa3 0%, #00d4ff 100%)', // 亮绿→亮青
        'linear-gradient(135deg, #fdbb2d 0%, #22c1c3 100%)', // 金黄→青色
        // 自然渐变系列（5个）
        'linear-gradient(135deg, #ff6a00 0%, #ee0979 100%)', // 日落：橙→粉红
        'linear-gradient(135deg, #2196f3 0%, #00bcd4 100%)', // 海洋：蓝→青
        'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', // 薄荷→粉（替换刺眼的亮青）
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', // 森林：绿→青
        'linear-gradient(135deg, #fa8bff 0%, #2bd2ff 90%, #2bff88 100%)', // 极光：粉→青→绿
        // 深色经典系列（5个）
        'linear-gradient(135deg, #434343 0%, #000000 100%)', // 灰→黑（保留）
        'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', // 深蓝渐变
        'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)', // 紫色渐变
        'linear-gradient(135deg, #d32f2f 0%, #7b1fa2 100%)', // 红→紫
        'linear-gradient(135deg, #1a2980 0%, #26d0ce 100%)', // 深蓝→青
        // 暖色系列（5个）
        'linear-gradient(135deg, #f83600 0%, #f9d423 100%)', // 橙红→黄
        'linear-gradient(135deg, #ff512f 0%, #dd2476 100%)', // 橙→粉红
        'linear-gradient(135deg, #ffc107 0%, #ff6f00 100%)', // 黄→橙（保留但优化）
        'linear-gradient(135deg, #ff758c 0%, #ff7eb3 100%)', // 粉红渐变
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%)' // 浅粉渐变
    ];

    // 浅色文字颜色（用于深色背景）
    static LIGHT_TEXT_COLORS = [
        '#ffffff', // 纯白
        '#f0f0f0', // 浅灰白
        '#e3f2fd', // 浅蓝白
        '#fce4ec', // 浅粉白
        '#e8f5e9', // 浅绿白
        '#fff3e0', // 浅橙白
        '#f3e5f5', // 浅紫白
        '#e0f7fa', // 浅青白
        '#fffde7', // 浅黄白
        '#fafafa'  // 极浅灰
    ];

    // 深色文字颜色（用于浅色背景，优化对比度）
    static DARK_TEXT_COLORS = [
        '#000000', // 纯黑
        '#1a237e', // 深蓝
        '#4a148c', // 深紫
        '#1b5e20', // 深绿
        '#6d1b07', // 深棕红（替换#bf360c，更深，在暖色背景上可读）
        '#33691e', // 深绿棕（替换#e65100，更深）
        '#004d40', // 深青
        '#212121', // 深灰
        '#880e4f', // 深粉红
        '#311b92', // 深靛蓝
        '#263238', // 深蓝灰（新增）
        '#3e2723'  // 深棕（新增）
    ];

    // 动画类型数组（6种）
    static ANIMATIONS = [
        'scale-fade',
        'slide-up',
        'slide-down',
        'bounce',
        'rotate-fade',
        'blur-fade'
    ];

    static HOVER_DELAY = 300;
    static HIDE_DELAY = 100; // 延迟隐藏时间，给用户时间移动到 Tooltip
    static OFFSET_FROM_MOUSE = 12;
    static VIEWPORT_PADDING = 16;
    static BASE_Z_INDEX = 100000; 

    constructor() {
        this.template = null;
        // 嵌套 tooltip 支持：使用栈结构存储多层 tooltip
        this.tooltipStack = []; // [{element, trigger}]
        this.hoverTimer = null;
        this.hideTimer = null; // 延迟隐藏定时器
        this.lastBackground = null;
        this.lastTextColor = null;
        this.lastAnimation = null;
    }

    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        this._cacheTemplate();
        this._bindEvents();
    }

    /**
     * 缓存模板元素
     * @returns {void}
     * @throws {Error} 模板元素不存在时抛出错误
     * @private
     */
    _cacheTemplate() {
        this.template = document.getElementById('tooltip-template');
        if (!this.template) {
            throw new Error('TooltipService._cacheTemplate: #tooltip-template not found');
        }
    }

    /**
     * 绑定事件（事件委托）
     * @returns {void}
     * @private
     */
    _bindEvents() {
        document.addEventListener('mouseover', this._handleMouseEnter.bind(this), true);
        document.addEventListener('mouseout', this._handleMouseLeave.bind(this), true);
    }

    /**
     * 处理鼠标进入
     * @param {MouseEvent} event - 鼠标事件
     * @returns {void}
     * @private
     */
    _handleMouseEnter(event) {
        let target = event.target;
        
        // 向上查找带有 data-tooltip 或 data-tooltip-html 的元素
        let tooltipTrigger = target;
        while (tooltipTrigger && tooltipTrigger !== document) {
            if (tooltipTrigger.dataset && (tooltipTrigger.dataset.tooltip || tooltipTrigger.dataset.tooltipHtml)) {
                break;
            }
            tooltipTrigger = tooltipTrigger.parentElement;
        }
        
        // 检查是否进入了任意层级的 tooltip
        const insideTooltip = this.tooltipStack.some(item => item.element.contains(target));
        
        if (insideTooltip) {
            // 取消隐藏定时器（用户已经成功移到 Tooltip 了）
            if (this.hideTimer) {
                clearTimeout(this.hideTimer);
                this.hideTimer = null;
            }
            
            // 如果在 tooltip 内部找到了嵌套的 tooltip 触发器，显示嵌套的 tooltip
            if (tooltipTrigger && tooltipTrigger !== document) {
                // 检查这个触发器是否已经在栈中显示了
                const alreadyShown = this.tooltipStack.some(item => item.trigger === tooltipTrigger);
                if (!alreadyShown) {
                    // 取消现有的 hover 定时器
                    if (this.hoverTimer) {
                        clearTimeout(this.hoverTimer);
                        this.hoverTimer = null;
                    }
                    
                    const tooltipText = tooltipTrigger.dataset.tooltip;
                    const tooltipHtml = tooltipTrigger.dataset.tooltipHtml;

                    this.mouseX = event.clientX;
                    this.mouseY = event.clientY;

                    this.hoverTimer = setTimeout(() => {
                        const content = tooltipHtml || tooltipText;
                        const isHtml = !!tooltipHtml;
                        this._show(content, isHtml, tooltipTrigger);
                    }, TooltipService.HOVER_DELAY);
                } else {
                    // 已经显示了，取消定时器避免重复触发
                    if (this.hoverTimer) {
                        clearTimeout(this.hoverTimer);
                        this.hoverTimer = null;
                    }
                }
            } else {
                // 在 Tooltip 内但不在触发器上，取消定时器
                if (this.hoverTimer) {
                    clearTimeout(this.hoverTimer);
                    this.hoverTimer = null;
                }
            }
            return;
        }
        
        if (!tooltipTrigger || tooltipTrigger === document) {
            return;
        }
        
        // 检查这个触发器是否已经在栈中显示了
        const alreadyShown = this.tooltipStack.some(item => item.trigger === tooltipTrigger);
        
        if (alreadyShown) {
            // 取消隐藏定时器（用户回到了触发器）
            if (this.hideTimer) {
                clearTimeout(this.hideTimer);
                this.hideTimer = null;
            }
            return;
        }
        
        // 取消现有的 hover 定时器，避免多个触发器同时触发
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        
        // 取消隐藏定时器（用户进入了触发器）
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        
        // 🐛 Bug修复：如果有已显示的tooltip，检查新触发器是否是嵌套关系
        // 如果不是嵌套（新触发器不在任何现有tooltip内部），则隐藏所有现有tooltip
        if (this.tooltipStack.length > 0) {
            const isNested = this.tooltipStack.some(item => item.element.contains(tooltipTrigger));
            if (!isNested) {
                // 不是嵌套关系，隐藏所有现有tooltip，避免多个平级tooltip同时显示
                this._hide();
            }
        }
        
        const tooltipText = tooltipTrigger.dataset.tooltip;
        const tooltipHtml = tooltipTrigger.dataset.tooltipHtml;

        this.mouseX = event.clientX;
        this.mouseY = event.clientY;

        this.hoverTimer = setTimeout(() => {
            const content = tooltipHtml || tooltipText;
            const isHtml = !!tooltipHtml;
            this._show(content, isHtml, tooltipTrigger);
        }, TooltipService.HOVER_DELAY);
    }

    /**
     * 处理鼠标离开
     * @param {MouseEvent} event - 鼠标事件
     * @returns {void}
     * @private
     */
    _handleMouseLeave(event) {
        let target = event.target;
        let relatedTarget = event.relatedTarget;
        
        // 找到鼠标离开的是哪一层（优先找最内层，因为内层的DOM在外层里）
        let leavingIndex = -1;
        for (let i = this.tooltipStack.length - 1; i >= 0; i--) {
            const item = this.tooltipStack[i];
            if (item.trigger.contains(target) || item.element.contains(target)) {
                leavingIndex = i;
                break;
            }
        }
        
        if (leavingIndex === -1) {
            // 不在任何已显示的 tooltip 或触发器上
            // 但可能是从一个"正在等待显示"的触发器离开
            // 需要检查并取消 hoverTimer
            
            // 向上查找是否在某个触发器上
            let tooltipTrigger = target;
            while (tooltipTrigger && tooltipTrigger !== document) {
                if (tooltipTrigger.dataset && (tooltipTrigger.dataset.tooltip || tooltipTrigger.dataset.tooltipHtml)) {
                    // 找到了触发器，取消 hoverTimer
                    if (this.hoverTimer) {
                        clearTimeout(this.hoverTimer);
                        this.hoverTimer = null;
                    }
                    break;
                }
                tooltipTrigger = tooltipTrigger.parentElement;
            }
            
            return;
        }
        
        const leavingItem = this.tooltipStack[leavingIndex];
        
        // 情况1：从触发器离开
        if (leavingItem.trigger.contains(target)) {
            // 如果鼠标移动到触发器的子元素，不应该隐藏tooltip
            if (relatedTarget && leavingItem.trigger.contains(relatedTarget)) {
                return;
            }
            
            // 如果鼠标移动到对应的 tooltip 上，不应该隐藏tooltip
            if (relatedTarget && leavingItem.element.contains(relatedTarget)) {
                // 取消隐藏定时器
                if (this.hideTimer) {
                    clearTimeout(this.hideTimer);
                    this.hideTimer = null;
                }
                return;
            }
            
            // 鼠标从触发器移到外部，延迟隐藏（给用户时间移动到 Tooltip）
            if (this.hoverTimer) {
                clearTimeout(this.hoverTimer);
                this.hoverTimer = null;
            }
            
            // 如果已有隐藏定时器，先取消
            if (this.hideTimer) {
                clearTimeout(this.hideTimer);
            }
            
            this.hideTimer = setTimeout(() => {
                this._hideFrom(leavingIndex);
                this.hideTimer = null;
            }, TooltipService.HIDE_DELAY);
            return;
        }
        
        // 情况2：从 tooltip 离开
        if (leavingItem.element.contains(target)) {
            // 如果鼠标移回触发器，保持显示
            if (relatedTarget && leavingItem.trigger.contains(relatedTarget)) {
                // 取消隐藏定时器
                if (this.hideTimer) {
                    clearTimeout(this.hideTimer);
                    this.hideTimer = null;
                }
                return;
            }
            
            // 如果鼠标还在 tooltip 内部移动，保持显示
            if (relatedTarget && leavingItem.element.contains(relatedTarget)) {
                return;
            }
            
            // 如果鼠标移到了更内层的tooltip，保持显示
            const movingToInnerTooltip = this.tooltipStack.slice(leavingIndex + 1).some(item =>
                item.element.contains(relatedTarget) || item.trigger.contains(relatedTarget)
            );
            if (movingToInnerTooltip) {
                return;
            }
            
            // 如果鼠标移到了更外层的tooltip或其触发器，只隐藏当前层及更内层
            const movingToOuterLayer = this.tooltipStack.slice(0, leavingIndex).some(item =>
                item.element.contains(relatedTarget) || item.trigger.contains(relatedTarget)
            );
            if (movingToOuterLayer) {
                this._hideFrom(leavingIndex);
                return;
            }
            
            // 鼠标从 tooltip 移到完全外部，隐藏该层及其上面的所有层
            this._hideFrom(leavingIndex);
            return;
        }
    }

    /**
     * 显示tooltip（支持嵌套叠加）
     * @param {string} content - 内容
     * @param {boolean} isHtml - 是否为HTML内容
     * @param {HTMLElement} trigger - 触发器元素
     * @returns {void}
     * @throws {Error} content为空时抛出错误
     * @private
     */
    _show(content, isHtml, trigger) {
        if (!content) {
            throw new Error('TooltipService._show: content is required');
        }

        const clone = this.template.content.cloneNode(true);
        const container = clone.querySelector('.tooltip-container');
        if (!container) {
            throw new Error('TooltipService._show: .tooltip-container not found in template');
        }

        const contentElement = container.querySelector('.tooltip-content');
        if (!contentElement) {
            throw new Error('TooltipService._show: .tooltip-content not found in template');
        }

        if (isHtml) {
            contentElement.innerHTML = content;
        } else {
            contentElement.textContent = content;
        }

        const preset = this._getRandomPreset();
        container.style.background = preset.background;
        container.style.color = preset.textColor;
        
        // 设置递增的 z-index，确保内层 tooltip 在外层之上
        const zIndex = TooltipService.BASE_Z_INDEX + this.tooltipStack.length;
        container.style.zIndex = zIndex;
        
        // 先添加动画类，让浏览器渲染初始状态
        container.classList.add(`tooltip-anim-${preset.animation}`);

        document.body.appendChild(container);
        
        // 同步读取transition-duration（此时已有动画类，可以读到正确值）
        const computedStyle = getComputedStyle(container);
        const transitionDuration = computedStyle.transitionDuration;
        
        // transitionDuration可能是多个值（如"0.2s, 0.2s"），取最大值
        const durations = transitionDuration.split(',').map(d => parseFloat(d.trim()));
        const maxDuration = Math.max(...durations) * 1000;
        
        // Fail Fast: 验证时长有效性
        if (isNaN(maxDuration) || maxDuration <= 0) {
            throw new Error('TooltipService._show: Invalid transition-duration on tooltip');
        }
        
        // 压入栈（此时animationDuration已缓存）
        this.tooltipStack.push({
            element: container,
            trigger: trigger,
            animationDuration: maxDuration
        });

        this._positionTooltip(container);

        // 等待一帧后再添加show类，触发动画
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                container.classList.add('show');
            });
        });
    }

    /**
     * 隐藏所有tooltip
     * @returns {void}
     * @private
     */
    _hide() {
        this._hideFrom(0);
    }

    /**
     * 从指定层级开始隐藏所有tooltip（包括该层）
     * @param {number} fromIndex - 起始索引
     * @returns {void}
     * @private
     */
    _hideFrom(fromIndex) {
        if (fromIndex >= this.tooltipStack.length) {
            return;
        }

        // 隐藏该层及其上面的所有层
        const itemsToHide = this.tooltipStack.splice(fromIndex);
        
        itemsToHide.forEach(item => {
            const tooltip = item.element;
            tooltip.classList.remove('show');

            setTimeout(() => {
                if (tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip);
                }
            }, item.animationDuration);
        });
    }

    /**
     * 计算并设置tooltip位置
     * @param {HTMLElement} tooltip - tooltip元素
     * @returns {void}
     * @private
     */
    _positionTooltip(tooltip) {
        if (!tooltip) {
            return;
        }

        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left, top;

        // 优先级1：右侧
        if (this.mouseX + TooltipService.OFFSET_FROM_MOUSE + tooltipRect.width + TooltipService.VIEWPORT_PADDING <= viewportWidth) {
            left = this.mouseX + TooltipService.OFFSET_FROM_MOUSE;
            top = this.mouseY - tooltipRect.height / 2;
        }
        // 优先级2：左侧
        else if (this.mouseX - TooltipService.OFFSET_FROM_MOUSE - tooltipRect.width >= TooltipService.VIEWPORT_PADDING) {
            left = this.mouseX - TooltipService.OFFSET_FROM_MOUSE - tooltipRect.width;
            top = this.mouseY - tooltipRect.height / 2;
        }
        // 优先级3：下方
        else if (this.mouseY + TooltipService.OFFSET_FROM_MOUSE + tooltipRect.height + TooltipService.VIEWPORT_PADDING <= viewportHeight) {
            left = this.mouseX - tooltipRect.width / 2;
            top = this.mouseY + TooltipService.OFFSET_FROM_MOUSE;
        }
        // 优先级4：上方
        else {
            left = this.mouseX - tooltipRect.width / 2;
            top = this.mouseY - TooltipService.OFFSET_FROM_MOUSE - tooltipRect.height;
        }

        // 边界修正
        left = Math.max(TooltipService.VIEWPORT_PADDING, Math.min(left, viewportWidth - tooltipRect.width - TooltipService.VIEWPORT_PADDING));
        top = Math.max(TooltipService.VIEWPORT_PADDING, Math.min(top, viewportHeight - tooltipRect.height - TooltipService.VIEWPORT_PADDING));

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    /**
     * 随机选择样式组合（背景、文字颜色、动画独立随机）
     * @returns {Object} 样式对象 {background, textColor, animation}
     * @private
     */
    _getRandomPreset() {
        // 1. 随机背景（避免连续相同）
        let background;
        do {
            background = TooltipService.BACKGROUNDS[Math.floor(Math.random() * TooltipService.BACKGROUNDS.length)];
        } while (background === this.lastBackground && TooltipService.BACKGROUNDS.length > 1);
        this.lastBackground = background;

        // 2. 判断背景亮度，选择合适的文字颜色池
        const isLightBackground = isLightColor(background, 155);
        const textColorPool = isLightBackground ? TooltipService.DARK_TEXT_COLORS : TooltipService.LIGHT_TEXT_COLORS;
        
        // 随机文字颜色（避免连续相同）
        let textColor;
        do {
            textColor = textColorPool[Math.floor(Math.random() * textColorPool.length)];
        } while (textColor === this.lastTextColor && textColorPool.length > 1);
        this.lastTextColor = textColor;

        // 3. 随机动画（避免连续相同）
        let animation;
        do {
            animation = TooltipService.ANIMATIONS[Math.floor(Math.random() * TooltipService.ANIMATIONS.length)];
        } while (animation === this.lastAnimation && TooltipService.ANIMATIONS.length > 1);
        this.lastAnimation = animation;

        return { background, textColor, animation };
    }

}


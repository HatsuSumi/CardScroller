/**
 * CardPositionInfoPanel - 卡片位置信息面板管理
 * 管理入场动画配置页面中的卡片位置信息面板的显示、更新和动画
 * 
 * 职责说明：
 * - 这是一个辅助类，专门为 EntryAnimationConfigPage 提供卡片位置信息面板功能
 * - 管理空状态和位置列表的显示切换
 * - 处理首次显示的交错入场动画和更新时的数字补间动画
 * - 处理卡片项的添加、更新、删除（带动画效果）
 * 
 * 当前被使用的模块：
 * - EntryAnimationConfigPage (services/ui/EntryAnimationConfigPage.js) - 主配置页面
 * 
 * 当前依赖的模块：
 * - ValidationService (services/system/ValidationService.js) - 验证服务，验证边界线数组 (通过构造器注入)
 * 
 * 架构说明：
 * - DOM 元素通过 init() 方法传入，不在构造函数中初始化（支持动态 DOM）
 * - 使用 CSS 变量控制动画时长，保持样式和逻辑分离
 * - 使用 RAF（requestAnimationFrame）优化动画性能
 * - 遵循组件架构原则：通过 CustomEvent（bubbles: true）与父组件通信，不直接使用 EventBus
 */

export class CardPositionInfoPanel {
    /**
     * 构造函数
     * @param {ValidationService} validationService - 验证服务
     * @throws {Error} 当依赖缺失时立即抛出错误（Fail Fast）
     */
    constructor(validationService) {
        // Fail Fast: 验证依赖
        if (!validationService) {
            throw new Error('CardPositionInfoPanel requires validationService dependency');
        }
        
        this.validationService = validationService;
        
        // DOM 元素引用（通过 init 传入）
        this.elements = null;
        
        // 模板引用
        this.template = null;
        
        // 存储上一次的卡片边界值（用于数字补间动画）
        this.lastCardBoundaries = null;
    }
    
    /**
     * 初始化面板（仅设置DOM引用，不改变显示状态）
     * @param {HTMLElement} container - 父容器元素
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时立即抛出错误（Fail Fast）
     * @description 
     * init() 只负责设置DOM元素引用，不会改变面板的显示状态。
     * 显示/隐藏逻辑由 updateCardPositionInfo() 和 showEmptyState() 负责。
     * 这样设计的原因：
     * 1. 每次 renderConfig() 时 DOM 都是全新克隆的，列表本身就是空的
     * 2. _handleBoundariesChange() 会自动调用 updateCardPositionInfo() 更新显示
     * 3. 职责分离：init() 负责引用，update() 负责显示
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('CardPositionInfoPanel.init: container must be a valid HTMLElement');
        }
        
        // 查找所有需要的DOM元素
        this.elements = {
            cardPositionEmptyState: container.querySelector('#cardPositionEmptyState'),
            cardPositionInfoList: container.querySelector('#cardPositionInfoList'),
            cardPositionRefreshBtn: container.querySelector('#cardPositionRefreshBtn'),
            cardBoundariesArraySection: container.querySelector('#cardBoundariesArraySection'),
            cardBoundariesArrayText: container.querySelector('#cardBoundariesArrayText'),
            cardBoundariesCopyBtn: container.querySelector('#cardBoundariesCopyBtn')
        };
        
        // Fail Fast: 验证所有必需元素
        if (!this.elements.cardPositionEmptyState) {
            throw new Error('CardPositionInfoPanel.init: #cardPositionEmptyState not found in container');
        }
        if (!this.elements.cardPositionInfoList) {
            throw new Error('CardPositionInfoPanel.init: #cardPositionInfoList not found in container');
        }
        if (!this.elements.cardPositionRefreshBtn) {
            throw new Error('CardPositionInfoPanel.init: #cardPositionRefreshBtn not found in container');
        }
        if (!this.elements.cardBoundariesArraySection) {
            throw new Error('CardPositionInfoPanel.init: #cardBoundariesArraySection not found in container');
        }
        if (!this.elements.cardBoundariesArrayText) {
            throw new Error('CardPositionInfoPanel.init: #cardBoundariesArrayText not found in container');
        }
        if (!this.elements.cardBoundariesCopyBtn) {
            throw new Error('CardPositionInfoPanel.init: #cardBoundariesCopyBtn not found in container');
        }
        
        // 查找模板
        this.template = document.querySelector('#cardPositionInfoItemTemplate');
        
        // Fail Fast: 验证模板存在
        if (!this.template) {
            throw new Error('CardPositionInfoPanel.init: #cardPositionInfoItemTemplate not found');
        }
        
        // 绑定复制按钮事件
        this.elements.cardBoundariesCopyBtn.addEventListener('click', () => {
            this._copyBoundariesToClipboard();
        });
    }
    
    /**
     * 显示空状态提示
     * @returns {void}
     */
    showEmptyState() {
        const existingItems = this.elements.cardPositionInfoList.querySelectorAll('.card-position-info-item');
        
        // 如果列表中有卡片，先触发退出动画
        if (existingItems.length > 0) {
            // 读取动画时长（所有item共用）
            const computedStyle = getComputedStyle(existingItems[0]);
            const transitionDuration = computedStyle.transitionDuration;
            const durations = transitionDuration.split(',').map(d => parseFloat(d.trim()));
            const maxDuration = Math.max(...durations) * 1000;
            
            // Fail Fast: 验证时长有效
            if (isNaN(maxDuration) || maxDuration <= 0) {
                throw new Error('CardPositionInfoPanel.showEmptyState: Invalid transition-duration on card-position-info-item');
            }
            
            // 为所有item添加removing类
            existingItems.forEach(item => {
                item.classList.add('removing');
            });
            
            // 等待动画完成后隐藏列表、显示空状态
            setTimeout(() => {
                this.elements.cardPositionInfoList.classList.add('hidden');
                this.elements.cardPositionEmptyState.classList.remove('hidden');
                // 清空列表（动画完成后才清空DOM）
                this.elements.cardPositionInfoList.innerHTML = '';
            }, maxDuration);
        } else {
            // 列表本来就是空的，直接显示空状态
            this.elements.cardPositionInfoList.classList.add('hidden');
            this.elements.cardPositionEmptyState.classList.remove('hidden');
        }
        
        // 隐藏边界线数组区域
        this.elements.cardBoundariesArraySection.classList.add('hidden');
    }
    
    /**
     * 更新卡片位置信息
     * @param {Object} boundaryEditor - 卡片边界编辑器实例
     * @param {boolean} isManualTrigger - 是否为用户手动触发（点击按钮），默认 false
     * @returns {void}
     * @description 
     * 此方法会在两种情况下被调用：
     * 1. 自动调用（如初始加载恢复显示）：静默处理，不弹出验证错误
     * 2. 用户手动点击按钮：执行验证并给出反馈
     */
    updateCardPositionInfo(boundaryEditor, isManualTrigger = false) {
        // Fail Fast: 验证参数
        if (!boundaryEditor) {
            throw new Error('CardPositionInfoPanel.updateCardPositionInfo: boundaryEditor parameter is required');
        }
        
        const boundaries = boundaryEditor.getBoundaries();
        
        // 使用 ValidationService 验证边界线数组
        const validation = this.validationService.validateCardBoundaries(boundaries);
        
        // 验证失败时的处理
        if (!validation.isValid) {
            this.showEmptyState();
            
            // 如果是用户手动点击按钮，给出明确的验证反馈
            if (isManualTrigger) {
                // 格式化错误信息为HTML
                const errorHtml = validation.errors.map(err => `<p>${err}</p>`).join('');
                
                // 通过 CustomEvent 通知父组件验证失败
                const event = new CustomEvent('boundaries-validation-failed', {
                    detail: {
                        message: errorHtml,
                        options: {
                            title: '配置验证失败',
                            shortMessage: `配置验证失败：${validation.errors.length}个错误`
                        }
                    },
                    bubbles: true
                });
                this.elements.cardPositionRefreshBtn.dispatchEvent(event);
            }
            
            return;
        }
        
        // 显示卡片位置信息
        this._showCardPositionInfo(boundaries);
        
        // 显示后，更新按钮文本为"更新卡片位置"
        const btnText = this.elements.cardPositionRefreshBtn.querySelector('.btn-text');
        
        // Fail Fast: 验证必需的 DOM 元素
        if (!btnText) {
            throw new Error('CardPositionInfoPanel.updateCardPositionInfo: .btn-text element not found in refresh button');
        }
        
        if (btnText.textContent !== '更新卡片位置') {
            btnText.textContent = '更新卡片位置';
        }
    }
    
    /**
     * 显示卡片位置信息（首次显示带动画，后续更新时数字补间）
     * @private
     * @param {Array<number>} cardBoundaries - 卡片边界数组 [x1, x2, x3, x4, ...]
     * @returns {void}
     * @throws {Error} 当 CSS 变量未定义或值无效时立即抛出错误
     */
    _showCardPositionInfo(cardBoundaries) {
        // 计算卡片数量
        const cardCount = cardBoundaries.length / 2;
        
        // 隐藏空状态，显示列表
        this.elements.cardPositionEmptyState.classList.add('hidden');
        this.elements.cardPositionInfoList.classList.remove('hidden');
        
        // 基于 DOM 实际状态判断：列表为空则执行首次渲染，否则执行更新
        // 这样不需要维护额外的状态标志，DOM 是真相的唯一来源
        const existingItems = this.elements.cardPositionInfoList.querySelectorAll('.card-position-info-item');
        const isFirstInit = existingItems.length === 0;
        
        if (isFirstInit) {
            // 首次初始化：创建元素并添加动画
            
            // 清空列表
            this.elements.cardPositionInfoList.innerHTML = '';
            
            // 创建每张卡片的位置信息
            for (let i = 0; i < cardCount; i++) {
                const leftBoundary = Math.round(cardBoundaries[i * 2]);
                const rightBoundary = Math.round(cardBoundaries[i * 2 + 1]);
                
                // 使用模板克隆
                const clone = this.template.content.cloneNode(true);
                const item = clone.querySelector('.card-position-info-item');
                
                // 填充数据
                item.querySelector('.card-position-label').textContent = `卡片 ${i + 1}`;
                item.querySelector('.boundary-left').textContent = leftBoundary;
                item.querySelector('.boundary-right').textContent = rightBoundary;
                
                // 添加入场前状态类
                item.classList.add('before-enter');
                
                this.elements.cardPositionInfoList.appendChild(clone);
            }
            
            // 批量触发淡入动画（所有item同时）
            requestAnimationFrame(() => {
                const items = this.elements.cardPositionInfoList.querySelectorAll('.card-position-info-item');
                items.forEach(item => {
                    item.classList.remove('before-enter');
                });
            });
            
            // 保存当前边界值，用于下次补间动画
            this.lastCardBoundaries = cardBoundaries.slice();
        } else {
            // 非首次：直接更新现有元素的文本内容（不触发动画）
            const existingCount = existingItems.length;
            
            // 更新或添加卡片项
            for (let i = 0; i < cardCount; i++) {
                const leftBoundary = Math.round(cardBoundaries[i * 2]);
                const rightBoundary = Math.round(cardBoundaries[i * 2 + 1]);
                
                if (i < existingCount) {
                    // 更新现有元素
                    const item = existingItems[i];
                    const leftElement = item.querySelector('.boundary-left');
                    const rightElement = item.querySelector('.boundary-right');
                    
                    // 更新卡片标签
                    item.querySelector('.card-position-label').textContent = `卡片 ${i + 1}`;
                    
                    // 检查是否有上一次的值，以及值是否发生变化
                    if (this.lastCardBoundaries && this.lastCardBoundaries.length > i * 2 + 1) {
                        const oldLeft = Math.round(this.lastCardBoundaries[i * 2]);
                        const oldRight = Math.round(this.lastCardBoundaries[i * 2 + 1]);
                        
                        // 只在值发生变化时使用补间动画（300ms，UI技术实现细节）
                        if (oldLeft !== leftBoundary) {
                            this._animateNumber(leftElement, oldLeft, leftBoundary, 300);
                        } else {
                            leftElement.textContent = leftBoundary;
                        }
                        
                        if (oldRight !== rightBoundary) {
                            this._animateNumber(rightElement, oldRight, rightBoundary, 300);
                        } else {
                            rightElement.textContent = rightBoundary;
                        }
                    } else {
                        // 没有上一次的值，直接设置
                        leftElement.textContent = leftBoundary;
                        rightElement.textContent = rightBoundary;
                    }
                } else {
                    // 添加新的卡片项（带淡入动画）
                    const clone = this.template.content.cloneNode(true);
                    const item = clone.querySelector('.card-position-info-item');
                    
                    item.querySelector('.card-position-label').textContent = `卡片 ${i + 1}`;
                    item.querySelector('.boundary-left').textContent = leftBoundary;
                    item.querySelector('.boundary-right').textContent = rightBoundary;
                    
                    // 添加入场前状态类
                    item.classList.add('before-enter');
                    
                    this.elements.cardPositionInfoList.appendChild(clone);
                    
                    // 强制reflow，确保浏览器识别初始状态
                    void item.offsetHeight;
                    
                    // 下一帧移除 before-enter 类，触发入场动画
                    requestAnimationFrame(() => {
                        item.classList.remove('before-enter');
                    });
                }
            }
            
            // 删除多余的卡片项（带退出动画）
            if (existingCount > cardCount) {
                for (let i = existingCount - 1; i >= cardCount; i--) {
                    const itemToRemove = existingItems[i];
                    
                    // 添加移除动画类
                    itemToRemove.classList.add('removing');
                    
                    // 读取item应用CSS后的实际过渡时长
                    const computedStyle = getComputedStyle(itemToRemove);
                    const transitionDuration = computedStyle.transitionDuration;
                    
                    // transitionDuration可能是多个值（如"0.3s, 0.3s"），取最大值
                    const durations = transitionDuration.split(',').map(d => parseFloat(d.trim()));
                    const maxDuration = Math.max(...durations) * 1000;
                    
                    // Fail Fast: 验证时长有效性
                    if (isNaN(maxDuration) || maxDuration <= 0) {
                        throw new Error('CardPositionInfoPanel._showCardPositionInfo: Invalid transition-duration on card-position-info-item');
                    }
                    
                    // 等待动画完成后删除元素
                    setTimeout(() => {
                        itemToRemove.remove();
                    }, maxDuration);
                }
            }
            
            // 保存当前边界值，用于下次补间动画
            this.lastCardBoundaries = cardBoundaries.slice();
        }
        
        // 更新边界线数组文本
        this._updateBoundariesArrayText(cardBoundaries);
    }
    
    /**
     * 更新边界线数组文本
     * @private
     * @param {number[]} boundaries - 边界线数组
     * @returns {void}
     */
    _updateBoundariesArrayText(boundaries) {
        // 格式化为 JSON 数组字符串
        const arrayText = JSON.stringify(boundaries);
        this.elements.cardBoundariesArrayText.textContent = arrayText;
        
        // 显示数组区域
        this.elements.cardBoundariesArraySection.classList.remove('hidden');
    }
    
    /**
     * 复制边界线数组到剪贴板
     * @private
     * @returns {void}
     */
    _copyBoundariesToClipboard() {
        const arrayText = this.elements.cardBoundariesArrayText.textContent;
        
        // 检查浏览器是否支持 Clipboard API
        if (!navigator.clipboard) {
            const event = new CustomEvent('boundaries-copy-failed', {
                detail: {
                    message: `<p style="margin: 0 0 12px 0;"><strong>您的浏览器不支持剪贴板功能。</strong></p><p style="margin: 0;">请手动复制边界线数组：<br>${arrayText}</p>`,
                    options: {
                        title: '浏览器不支持',
                        shortMessage: '浏览器不支持剪贴板功能！'
                    }
                },
                bubbles: true
            });
            this.elements.cardBoundariesCopyBtn.dispatchEvent(event);
            return;
        }
        
        navigator.clipboard.writeText(arrayText).then(() => {
            // 按钮临时变更为"已复制"状态
            const originalHTML = this.elements.cardBoundariesCopyBtn.innerHTML;
            this.elements.cardBoundariesCopyBtn.innerHTML = '✓';
            this.elements.cardBoundariesCopyBtn.disabled = true;
            
            setTimeout(() => {
                this.elements.cardBoundariesCopyBtn.innerHTML = originalHTML;
                this.elements.cardBoundariesCopyBtn.disabled = false;
            }, 2000);
            
            // 通过 CustomEvent 通知父组件复制成功
            const event = new CustomEvent('boundaries-copy-success', {
                detail: { text: arrayText },
                bubbles: true
            });
            this.elements.cardBoundariesCopyBtn.dispatchEvent(event);
        }).catch((error) => {
            // 通过 CustomEvent 通知父组件复制失败
            const event = new CustomEvent('boundaries-copy-failed', {
                detail: {
                    message: `复制失败：${error.message}`,
                    options: {
                        title: '复制失败',
                        shortMessage: '复制失败。'
                    }
                },
                bubbles: true
            });
            this.elements.cardBoundariesCopyBtn.dispatchEvent(event);
        });
    }
    
    /**
     * 数字补间动画
     * @private
     * @param {HTMLElement} element - 要更新的 DOM 元素
     * @param {number} startValue - 起始值
     * @param {number} endValue - 结束值
     * @param {number} duration - 动画时长（毫秒）
     * @returns {void}
     */
    _animateNumber(element, startValue, endValue, duration) {
        const startTime = performance.now();
        const diff = endValue - startValue;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // 使用 easeOutCubic 缓动函数
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            const currentValue = Math.round(startValue + diff * easeProgress);
            element.textContent = currentValue;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * 清理资源
     * @returns {void}
     */
    destroy() {
        this.elements = null;
        this.template = null;
        this.initialized = false;
        this.lastCardBoundaries = null;
    }
}


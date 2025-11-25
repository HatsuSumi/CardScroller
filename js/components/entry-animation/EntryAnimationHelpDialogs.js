/**
 * EntryAnimationHelpDialogs - 入场动画帮助对话框管理
 * 管理入场动画配置页面中的帮助对话框显示和动态内容更新
 * 
 * 职责说明：
 * - 这是一个辅助类，专门为 EntryAnimationConfigPage 提供帮助对话框功能
 * - 管理边界线帮助对话框和图片规格帮助对话框的显示
 * - 处理图片规格对话框的 resize 监听和动态内容更新
 * 
 * 当前被使用的模块：
 * - EntryAnimationConfigPage (services/ui/EntryAnimationConfigPage.js) - 主配置页面
 * 
 * 当前依赖的模块：
 * - StateManager (core/StateManager.js) - 状态管理器，读取图片元数据 (通过构造器注入)
 * - EventBus (core/EventBus.js) - 事件总线，发射对话框显示事件 (通过构造器注入)
 * - ViewportCalculatorService (services/utils/ViewportCalculatorService.js) - 视口计算服务，计算可视区域宽度 (通过构造器注入)
 * - debounce (helpers/debounce.js) - 防抖函数，用于优化 resize 事件处理
 * 
 * 架构说明：
 * - 为什么直接监听 window.resize：图片规格对话框需要实时显示当前窗口尺寸对应的可视区域宽度
 * - 使用 debounce 优化性能，避免频繁计算和 DOM 更新
 * - 在对话框关闭时自动清理 resize 监听器，防止内存泄漏
 */

import { debounce } from '../../helpers/debounce.js';

export class EntryAnimationHelpDialogs {
    /**
     * 构造函数
     * @param {StateManager} stateManager - 状态管理器
     * @param {EventBus} eventBus - 事件总线
     * @param {ViewportCalculatorService} viewportCalculatorService - 视口计算服务
     * @throws {Error} 当依赖缺失时立即抛出错误（Fail Fast）
     */
    constructor(stateManager, eventBus, viewportCalculatorService) {
        // Fail Fast: 验证依赖
        if (!stateManager) {
            throw new Error('EntryAnimationHelpDialogs requires stateManager dependency');
        }
        if (!eventBus) {
            throw new Error('EntryAnimationHelpDialogs requires eventBus dependency');
        }
        if (!viewportCalculatorService) {
            throw new Error('EntryAnimationHelpDialogs requires viewportCalculatorService dependency');
        }
        
        this.stateManager = stateManager;
        this.eventBus = eventBus;
        this.viewportCalculatorService = viewportCalculatorService;
        
        // DOM 元素引用
        this.elements = null;
        
        // 图片规格帮助对话框的 resize 处理器
        this.imageSpecDialogResizeHandler = null;
    }
    
    /**
     * 初始化帮助对话框，查找并绑定帮助链接
     * @param {HTMLElement} container - 父容器元素
     * @returns {void}
     * @throws {Error} 当必需的DOM元素不存在时立即抛出错误（Fail Fast）
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('EntryAnimationHelpDialogs.init: container must be a valid HTMLElement');
        }
        
        // 查找所有需要的DOM元素
        this.elements = {
            boundaryHelpLink: container.querySelector('#boundaryHelpLink'),
            imageSpecHelpLink: container.querySelector('#imageSpecHelpLink'),
            verticalBoundaryHelpLink: container.querySelector('#verticalBoundaryHelpLink')
        };
        
        // Fail Fast: 验证所有必需元素
        if (!this.elements.boundaryHelpLink) {
            throw new Error('EntryAnimationHelpDialogs.init: #boundaryHelpLink not found in container');
        }
        if (!this.elements.imageSpecHelpLink) {
            throw new Error('EntryAnimationHelpDialogs.init: #imageSpecHelpLink not found in container');
        }
        if (!this.elements.verticalBoundaryHelpLink) {
            throw new Error('EntryAnimationHelpDialogs.init: #verticalBoundaryHelpLink not found in container');
        }
        
        // 绑定帮助链接点击事件
        this.elements.boundaryHelpLink.addEventListener('click', () => {
            this.showBoundaryHelp();
        });
        
        this.elements.imageSpecHelpLink.addEventListener('click', () => {
            this.showImageSpecHelp();
        });
        
        this.elements.verticalBoundaryHelpLink.addEventListener('click', () => {
            this.showVerticalBoundaryHelp();
        });
    }
    
    /**
     * 显示边界线帮助对话框
     * @returns {void}
     */
    showBoundaryHelp() {
        this.eventBus.emit('ui:show-info-dialog', {
            message: `
                <div style="text-align: left;">
                    <p style="margin: 0 0 12px 0;"><strong>【边界线的作用】</strong></p>
                    <p style="margin: 0 0 16px 0;">边界线用于将一张横向长图划分成多个逻辑卡片，每个卡片可以独立播放入场动画。</p>
                    
                    <p style="margin: 0 0 12px 0;"><strong>【卡片计数规则】</strong></p>
                    <p style="margin: 0 0 16px 0;">每两条相邻的边界线定义一张卡片。以最常见的4张卡片来说，一共需要8条分界线。</p>
                    
                    <p style="margin: 0 0 12px 0;"><strong>【边界线说明】</strong></p>
                    <ul style="margin: 0 0 16px 0; padding-left: 20px; line-height: 1.8; list-style: none;">
                        <li><strong>线1</strong>：代表卡片1的左边界以及到图片左侧的距离。</li>
                        <li><strong>线2</strong>：代表卡片1的右边界。</li>
                        <li><strong>线3</strong>：代表卡片2的左边界（线2到线3的距离为卡片间隙）。</li>
                        <li><strong>线4</strong>：代表卡片2的右边界。</li>
                        <li><strong>线5</strong>：代表卡片3的左边界（线4到线5的距离为卡片间隙）。</li>
                        <li><strong>线6</strong>：代表卡片3的右边界。</li>
                        <li><strong>线7</strong>：代表卡片4的左边界（线6到线7的距离为卡片间隙）。</li>
                        <li><strong>线8</strong>：代表卡片4的右边界以及到图片右侧的距离。</li>
                    </ul>
                    
                    <p style="margin: 0 0 12px 0;"><strong>【示例】</strong></p>
                    <pre style="font-family: 'Consolas', 'Monaco', 'Courier New', monospace; background: #f5f5f5; padding: 12px; border-radius: 4px; margin: 0 0 12px 0; font-size: 13px; line-height: 1.6;">|---卡片1---|  |---卡片2---|  |---卡片3---|  |---卡片4---|
线1       线2  线3       线4  线5       线6  线7       线8</pre>
                    
                    <p style="margin: 0; color: #666;">卡片是否等宽等距都支持，直接标记分界线即可。</p>
                </div>
            `,
            options: {
                title: '什么是边界线？'
            }
        });
    }
    
    /**
     * 显示竖线/横线帮助对话框
     * @returns {void}
     */
    showVerticalBoundaryHelp() {
        this.eventBus.emit('ui:show-info-dialog', {
            message: `
                <div style="text-align: left;">
                    <p style="margin: 0 0 16px 0; line-height: 1.6;">
                        这确实是本工具的设计缺陷，但是一般情况下不会导致穿帮，前提是卡片上下间隙露出的背景色和左右间隙露出的背景色需保持一致。目前所提供的15种入场动画效果<strong>仅有旋转缩放会导致穿帮</strong>。
                    </p>
                    
                    <p style="margin: 0 0 12px 0;"><strong>【为什么不会穿帮？】</strong></p>
                    
                    <p style="margin: 0 0 8px 0; line-height: 1.6;">
                        <strong style="color: #27ae60;">✅ 不会穿帮的情况（推荐）：</strong>
                    </p>
                    <p style="margin: 0 0 16px 0; padding: 10px; background: #e8f5e9; border-left: 4px solid #27ae60; border-radius: 4px; line-height: 1.6;">
                        假设您的图片背景色是<strong>纯白色</strong>，卡片左右间隙和上下留白也都是白色，同时在首页中也设置白色背景<br>
                        <strong>→ 观众看到的是统一的白色背景，非常自然。</strong>
                    </p>
                    
                    <p style="margin: 0 0 8px 0; line-height: 1.6;">
                        <strong style="color: #e74c3c;">❌ 会穿帮的情况（避免）：</strong>
                    </p>
                    <p style="margin: 0 0 16px 0; padding: 10px; background: #ffebee; border-left: 4px solid #e74c3c; border-radius: 4px; line-height: 1.6;">
                        假设您的图片卡片左右间隙是白色，但卡片上下留白是灰色<br>
                        <strong>→ 观众会发现左右是白色、上下是灰色，一眼就看出问题。</strong>
                    </p>
                    
                    <p style="margin: 0; color: #856404; font-size: 13px; background: #fff3cd; padding: 8px; border-radius: 4px; line-height: 1.6;">
                        💡 <strong>最佳实践</strong>：制作图片时，整张图片使用统一的纯色背景（如纯白、纯黑），卡片的上下左右留白都使用这个颜色，然后在首页中选择相同的背景色。
                    </p>
                </div>
            `,
            options: {
                title: '为什么只需要添加竖线不需要添加横线？'
            }
        });
    }
    
    /**
     * 显示图片制作建议对话框
     * @returns {void}
     * @throws {Error} 当图片数据缺失时立即抛出错误（Fail Fast）
     */
    showImageSpecHelp() {
        // 获取图片元数据
        const imageMetadata = this.stateManager.state.content.image.metadata;
        if (!imageMetadata) {
            throw new Error('EntryAnimationHelpDialogs.showImageSpecHelp: content.image.metadata is missing from state');
        }
        if (imageMetadata.width === undefined || imageMetadata.height === undefined) {
            throw new Error('EntryAnimationHelpDialogs.showImageSpecHelp: metadata.width or height is missing');
        }
        
        const imageWidth = imageMetadata.width;
        const imageHeight = imageMetadata.height;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // 获取当前起始位置
        const startPosition = this.stateManager.state.playback.scroll.startPosition;
        
        // 计算可视区域宽度（原图坐标）
        const viewportWidthInImageCoords = this.viewportCalculatorService.calculateViewportWidth(
            startPosition,
            imageWidth,
            imageHeight,
            windowWidth,
            windowHeight
        );
        
        // 移除之前的 resize 监听（如果有）
        this._removeImageSpecDialogResizeListener();
        
        this.eventBus.emit('ui:show-info-dialog', {
            message: `
                <div style="text-align: left;">
                    <p style="margin: 0 0 12px 0;"><strong>【重要说明】</strong></p>
                    <p style="margin: 0 0 16px 0; padding: 10px; background: #ffe6e6; border-left: 4px solid #e74c3c; border-radius: 4px;">
                        <strong>画布比例需要与您的显示器比例一致</strong>，否则卡片可能显示不完整或多露出后面的卡片。<br>
                        <strong>录屏建议使用 16:9</strong>。
                    </p>
                    
                    <p style="margin: 0 0 12px 0;"><strong>【常用尺寸参考（16:9 显示器）】</strong></p>
                    <p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">以下为 16:9 显示器的建议尺寸。如使用其他比例显示器，请按相同比例新建画布：</p>
                    <table style="width: 100%; border-collapse: collapse; margin: 0 0 16px 0; font-size: 14px;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">建议画布尺寸（宽×高）</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">1920 × 1080</td>
                            </tr>
                            <tr style="background: #f9f9f9;">
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">2560 × 1440</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">3840 × 2160</td>
                            </tr>
                            <tr style="background: #f9f9f9;">
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">5333 × 3000</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">8000 × 4500</td>
                            </tr>
                            <tr style="background: #f9f9f9;">
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">10667 × 6000</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <p style="margin: 0 0 12px 0;"><strong>【完整的制作流程】</strong></p>
                    <ol style="margin: 0 0 16px 0; padding-left: 20px; line-height: 1.8;">
                        <li>在图片编辑软件中从上述尺寸任选一个新建画布（或任意与您显示器比例一致的画布），制作第一部分图片，假设第一部分仅包含卡片1-4。
                            <br><span style="color: #e74c3c; font-size: 13px; margin-top: 4px; display: inline-block;">⚠️ 重要：仅第一张用于后续复制粘贴的画布比例需要和显示器比例保持一致。</span></li>
                        <li>制作完后复制画布，继续制作其他部分的卡片，假设第二部分包含卡片5-8。</li>
                        <li>将所有制作好的图片拼接成一整张横图，只改变宽度，高度保持不变。
                            <br><span style="color: #27ae60; font-size: 13px; margin-top: 4px; display: inline-block;">✅ 说明：拼接好的横图不需要特别保持相同比例，只要高度一致即可。</span></li>
                        <li>在本工具导入拼接好的横图，配置滚动参数。</li>
                        <li>最后录屏。</li>
                    </ol>
                    
                    <p style="margin: 0 0 12px 0;"><strong>【当前已上传图片】</strong></p>
                    <ul style="margin: 0 0 16px 0; padding-left: 20px; line-height: 1.8; list-style: none;">
                        <li>图片高度：<strong style="color: #667eea;">${imageHeight}px</strong></li>
                        <li>可视区域宽度：<strong style="color: #e74c3c;" id="dialogRecommendedWidth">${viewportWidthInImageCoords}px</strong></li>
                    </ul>
                    
                    <p style="margin: 0 0 16px 0; color: #856404; font-size: 13px; background: #fff3cd; padding: 8px; border-radius: 4px;">
                        💡 提示：如果图片显示不符合预期，请确保画布比例与您的显示器比例一致。注意：浏览器全屏和非全屏状态下可视区域是不同的！
                    </p>
                    
                    <p style="margin: 0 0 12px 0;"><strong>【为什么会不同？】</strong></p>
                    <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6;">
                        <strong>1. 浏览器UI占用空间</strong><br>
                        非全屏状态下，地址栏、标签栏、书签栏等UI元素会占用垂直空间，导致视口高度减小。<br>
                        全屏（F11）状态下，所有浏览器UI隐藏，视口高度增加。
                    </p>
                    <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6;">
                        <strong>2. 可视区域计算原理</strong><br>
                        图片按<strong>高度自适应</strong>显示（<code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">object-fit: contain</code>）。当视口高度减小（非全屏）时，图片会等比例缩小。<br>
                        图片缩小后，相同的浏览器宽度能容纳<strong>更多图片内容</strong>。<br><br>
                        <strong>计算公式：</strong><br>
                        <code style="background: #f5f5f5; padding: 8px 12px; border-radius: 4px; display: inline-block; margin-top: 4px; font-size: 13px;">
                            可视区域宽度 = windowWidth × imageHeight / windowHeight
                        </code>
                    </p>
                    <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6;">
                        <strong>3. 具体示例（假设1920×1080显示器，图片高度1080px，UI占150px）</strong>
                    </p>
                    <table style="width: 100%; border-collapse: collapse; margin: 0 0 12px 0; font-size: 13px;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">状态</th>
                                <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">视口尺寸</th>
                                <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">可视宽度</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">全屏</td>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">1920×1080</td>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #27ae60;">1920px</td>
                            </tr>
                            <tr style="background: #f9f9f9;">
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">非全屏</td>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">1920×930</td>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #e74c3c;">2229px ⚠️</td>
                            </tr>
                        </tbody>
                    </table>
                    <p style="margin: 0; color: #856404; font-size: 13px; background: #fff3cd; padding: 8px; border-radius: 4px;">
                        ⚠️ 非全屏状态下，可视区域宽度反而<strong>更大</strong>（2229px &gt; 1920px），会导致多露出后面的卡片或卡片显示不完整。<br>
                        建议：制作图片时需要确定好录屏环境（全屏 or 非全屏），并在对应环境下查看"可视区域宽度"进行制作。
                    </p>
                </div>
            `,
            options: {
                title: '为什么上传的图片在页面会多露出后面的卡片或卡片显示不完整？'
            }
        });
        
        // 添加 resize 监听，实时更新对话框内容
        this._setupImageSpecDialogResizeListener();
    }
    
    /**
     * 设置图片规格对话框的 resize 监听
     * @private
     * @returns {void}
     */
    _setupImageSpecDialogResizeListener() {
        // 创建防抖的 resize 处理器（250ms，性能优化技术细节）
        this.imageSpecDialogResizeHandler = debounce(() => {
            this._updateImageSpecDialogContent();
        }, 250);
        
        window.addEventListener('resize', this.imageSpecDialogResizeHandler);
    }
    
    /**
     * 移除图片规格对话框的 resize 监听
     * @private
     * @returns {void}
     */
    _removeImageSpecDialogResizeListener() {
        if (this.imageSpecDialogResizeHandler) {
            window.removeEventListener('resize', this.imageSpecDialogResizeHandler);
            this.imageSpecDialogResizeHandler = null;
        }
    }
    
    /**
     * 更新图片规格对话框的动态内容
     * @private
     * @returns {void}
     */
    _updateImageSpecDialogContent() {
        // 获取对话框中需要更新的元素
        const recommendedWidthElement = document.getElementById('dialogRecommendedWidth');
        
        // 如果元素不存在，说明对话框已关闭，移除监听
        if (!recommendedWidthElement) {
            this._removeImageSpecDialogResizeListener();
            return;
        }
        
        // 重新计算建议宽度
        const imageMetadata = this.stateManager.state.content.image.metadata;
        if (!imageMetadata || imageMetadata.width === undefined || imageMetadata.height === undefined) {
            return;
        }
        
        const imageWidth = imageMetadata.width;
        const imageHeight = imageMetadata.height;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // 获取当前起始位置
        const startPosition = this.stateManager.state.playback.scroll.startPosition;
        
        // 计算可视区域宽度（原图坐标）
        const viewportWidthInImageCoords = this.viewportCalculatorService.calculateViewportWidth(
            startPosition,
            imageWidth,
            imageHeight,
            windowWidth,
            windowHeight
        );
        
        // 更新建议宽度
        recommendedWidthElement.textContent = `${viewportWidthInImageCoords}px`;
    }
    
    /**
     * 清理资源
     * @returns {void}
     */
    destroy() {
        this._removeImageSpecDialogResizeListener();
        
        // 清空DOM元素引用
        this.elements = null;
    }
}


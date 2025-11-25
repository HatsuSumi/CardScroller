/**
 * BubbleMenuService - 气泡菜单服务
 * 管理气泡式"更多功能"菜单的显示、隐藏、配置页面框架和路由逻辑
 * 
 * 职责说明：
 * 1. 管理气泡菜单的显示/隐藏和装饰气泡动画
 * 2. 管理配置页面框架（头部、底部、容器、扩散动画）
 * 3. 路由：根据itemId调用对应的ConfigPage服务渲染配置内容和保存配置
 * 4. 注册配置页面快捷键
 * 
 * 当前被使用的模块：
 * - 无（纯UI服务，通过按钮点击或快捷键触发）
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，发射消息提示 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器，传递给ConfigPage服务保存配置 (通过DI注入)
 * - keyboardService (utils/KeyboardService.js) - 键盘快捷键服务，注册配置页面快捷键 (通过DI注入)
 * 
 * 架构说明：
 * 为什么不继承 BaseUIService？
 * - 与SidebarService类似，只在init()时查询一次DOM元素，之后直接使用实例属性
 * - 不需要频繁查询同一DOM元素，继承BaseUIService会造成双重缓存
 * - 使用原生 document.getElementById() 更清晰、更轻量
 */

export class BubbleMenuService {
    /**
     * 气泡菜单项配置
     * 每个菜单项对应一个需要通过 registerConfigPage() 注册的配置页面服务
     */
    static MENU_ITEMS = [
        {
            id: 'entry-animation',
            title: '卡片入场动画',
            shortcut: 'Ctrl+E'
        },
        {
            id: 'performance-monitor',
            title: '动画性能监控',
            shortcut: 'Ctrl+M'
        },
        {
            id: 'bubble-3',
            title: '我是泡泡'
        },
        {
            id: 'bubble-4',
            title: '我是泡泡'
        },
        {
            id: 'bubble-5',
            title: '我是泡泡'
        }
    ];

    /**
     * 构造函数 - 初始化气泡菜单服务
     * @param {EventBus} eventBus - 事件总线
     * @param {StateManager} stateManager - 状态管理器
     * @param {KeyboardService} keyboardService - 键盘快捷键服务
     * @throws {Error} 当任何依赖缺失时抛出错误
     */
    constructor(eventBus, stateManager, keyboardService) {
        if (!eventBus) {
            throw new Error('BubbleMenuService requires eventBus dependency');
        }
        if (!stateManager) {
            throw new Error('BubbleMenuService requires stateManager dependency');
        }
        if (!keyboardService) {
            throw new Error('BubbleMenuService requires keyboardService dependency');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.keyboardService = keyboardService;
        
        // DOM 元素引用
        this.elements = {};
        
        // 气泡菜单状态
        this.isVisible = false;
        
        // 配置页面注册表：Map<itemId, configPageService>
        // 使用注册表模式，解耦具体配置页面，支持动态扩展
        this.configPages = new Map();
        
        // 当前活动的配置页面服务引用（用于清理）
        this.currentConfigPage = null;
        
        // 当前显示的配置页面ID（用于快捷键判断）
        this.currentPageId = null;
        
        // 使用硬编码的菜单项配置
        this.menuItems = BubbleMenuService.MENU_ITEMS;
    }

    /**
     * 注册配置页面服务
     * @param {string} itemId - 菜单项ID（对应 MENU_ITEMS 中的 id）
     * @param {Object} configPageService - 配置页面服务实例
     * @param {Function} configPageService.renderConfig - 渲染配置UI到容器
     * @param {Function} [configPageService.save] - 保存配置（可选）
     * @param {Function} [configPageService.destroy] - 清理资源（可选）
     * @returns {void}
     * @throws {Error} 当itemId已存在或configPageService无效时抛出错误
     */
    registerConfigPage(itemId, configPageService) {
        // Fail Fast: 验证参数
        if (!itemId || typeof itemId !== 'string') {
            throw new Error('BubbleMenuService.registerConfigPage: itemId must be a non-empty string');
        }
        if (!configPageService) {
            throw new Error('BubbleMenuService.registerConfigPage: configPageService is required');
        }
        if (typeof configPageService.renderConfig !== 'function') {
            throw new Error(`BubbleMenuService.registerConfigPage: configPageService for "${itemId}" must have renderConfig() method`);
        }
        if (this.configPages.has(itemId)) {
            throw new Error(`BubbleMenuService.registerConfigPage: itemId "${itemId}" is already registered`);
        }
        
        this.configPages.set(itemId, configPageService);
    }

    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        this._setupDOMReferences();
        this._bindEvents();
        this._renderBubbles();
        this._registerShortcuts();
    }

    /**
     * 设置DOM元素引用
     * @private
     * @returns {void}
     * @throws {Error} 当关键DOM元素不存在时抛出错误
     */
    _setupDOMReferences() {
        // 气泡菜单元素
        this.elements.bubbleMenu = document.getElementById('bubbleMenu');
        this.elements.bubbleContainer = document.getElementById('bubbleContainer');
        this.elements.canvas = document.getElementById('decorativeBubblesCanvas');
        this.elements.moreFeaturesBtn = document.getElementById('moreFeaturesBtn');
        this.elements.bubbleItemTemplate = document.getElementById('bubbleItemTemplate');
        
        if (!this.elements.bubbleMenu) {
            throw new Error('Critical UI element not found: #bubbleMenu');
        }
        if (!this.elements.bubbleContainer) {
            throw new Error('Critical UI element not found: #bubbleContainer');
        }
        if (!this.elements.canvas) {
            throw new Error('Critical UI element not found: #decorativeBubblesCanvas');
        }
        if (!this.elements.moreFeaturesBtn) {
            throw new Error('Critical UI element not found: #moreFeaturesBtn');
        }
        if (!this.elements.bubbleItemTemplate) {
            throw new Error('Critical UI element not found: #bubbleItemTemplate');
        }
        
        // 获取Canvas 2D上下文
        this.ctx = this.elements.canvas.getContext('2d');
        if (!this.ctx) {
            throw new Error('Failed to get 2D context from canvas');
        }
        
        // Fail Fast: 验证devicePixelRatio
        if (typeof window.devicePixelRatio !== 'number' || !isFinite(window.devicePixelRatio) || window.devicePixelRatio <= 0) {
            throw new Error('BubbleMenuService._initCanvas: Invalid window.devicePixelRatio');
        }
        
        // 设置Canvas尺寸（高DPI适配）
        const dpr = window.devicePixelRatio;
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // 设置Canvas显示尺寸（CSS像素）
        this.elements.canvas.style.width = `${width}px`;
        this.elements.canvas.style.height = `${height}px`;
        
        // 设置Canvas实际像素尺寸（物理像素）
        this.elements.canvas.width = width * dpr;
        this.elements.canvas.height = height * dpr;
        
        // 缩放Canvas上下文以匹配DPR
        this.ctx.scale(dpr, dpr);
        
        // 保存逻辑尺寸供后续使用
        this.canvasLogicalWidth = width;
        this.canvasLogicalHeight = height;
        
        // bubbleOverlay 是必需元素（用于点击关闭菜单）
        this.elements.bubbleOverlay = this.elements.bubbleMenu.querySelector('.bubble-menu-overlay');
        if (!this.elements.bubbleOverlay) {
            throw new Error('Critical UI element not found: .bubble-menu-overlay');
        }
        
        // 功能配置页面元素
        this.elements.featureConfigPage = document.getElementById('featureConfigPage');
        this.elements.configPageTitle = document.getElementById('configPageTitle');
        this.elements.configPageBody = document.getElementById('configPageBody');
        this.elements.configCancelBtn = document.getElementById('configCancelBtn');
        this.elements.configConfirmBtn = document.getElementById('configConfirmBtn');
        this.elements.configPageNav = document.getElementById('configPageNav');
        this.elements.appContainer = document.querySelector('.app-container');
        
        if (!this.elements.featureConfigPage) {
            throw new Error('Critical UI element not found: #featureConfigPage');
        }
        if (!this.elements.configPageNav) {
            throw new Error('Critical UI element not found: #configPageNav');
        }
        if (!this.elements.configPageTitle) {
            throw new Error('Critical UI element not found: #configPageTitle');
        }
        if (!this.elements.configPageBody) {
            throw new Error('Critical UI element not found: #configPageBody');
        }
        if (!this.elements.configCancelBtn) {
            throw new Error('Critical UI element not found: #configCancelBtn');
        }
        if (!this.elements.configConfirmBtn) {
            throw new Error('Critical UI element not found: #configConfirmBtn');
        }
        if (!this.elements.appContainer) {
            throw new Error('Critical UI element not found: .app-container');
        }
        
        // 配置页面子元素（必须在featureConfigPage验证之后）
        this.elements.configTransition = this.elements.featureConfigPage.querySelector('.config-page-transition');
        this.elements.configOverlay = this.elements.featureConfigPage.querySelector('.config-page-overlay');
        this.elements.configPageWrapper = this.elements.featureConfigPage.querySelector('.config-page-wrapper');
        
        if (!this.elements.configTransition) {
            throw new Error('Critical UI element not found: .config-page-transition');
        }
        if (!this.elements.configOverlay) {
            throw new Error('Critical UI element not found: .config-page-overlay');
        }
        if (!this.elements.configPageWrapper) {
            throw new Error('Critical UI element not found: .config-page-wrapper');
        }
        
        // 初始化气泡数据数组和动画状态
        this.bubbles = [];
        this.animationFrameId = null;
        
        // 动画时长缓存（lazy loading）
        this._gravityDropDurationMs = null;
        this._pageFlipDurationMs = null;
        this._featurePageFlipDurationMs = null;
    }

    /**
     * 绑定事件监听器
     * @private
     * @returns {void}
     */
    _bindEvents() {
        // "更多功能"按钮点击事件
        this.elements.moreFeaturesBtn.addEventListener('click', () => {
            this.toggle();
        });
        
        // 覆盖层点击事件（关闭菜单）
        this.elements.bubbleOverlay.addEventListener('click', () => {
            this.hide();
        });
        
        // 配置页面返回首页按钮
        this.elements.configCancelBtn.addEventListener('click', () => {
            this._closeConfigPage();
        });
        
        // 配置页面确认按钮
        this.elements.configConfirmBtn.addEventListener('click', () => {
            this._saveConfig();
        });
        
        // 配置页面右侧导航栏点击事件（事件委托）
        this.elements.configPageNav.addEventListener('click', (event) => {
            const navItem = event.target.closest('.config-nav-item');
            if (navItem) {
                const pageId = navItem.dataset.pageId;
                this._handleNavClick(pageId);
            }
        });
    }

    /**
     * 注册快捷键（配置驱动）
     * 根据 menuItems 配置自动注册快捷键
     * @private
     * @returns {void}
     */
    _registerShortcuts() {
        // 防止快捷键连续触发导致消息堆积
        let lastTriggerTime = 0;
        const THROTTLE_DELAY = 500; // 500ms内只能触发一次
        
        // 遍历菜单项，注册有shortcut配置的项
        this.menuItems.forEach(item => {
            if (!item.shortcut) {
                return; // 跳过没有快捷键配置的项
            }
            
            // 注册快捷键
            // 条件：1. 图片已加载  2. 图片在初始位置（未播放/已重置）  3. 不在配置页面中
            this.keyboardService.register(
                item.shortcut.toLowerCase(), // 统一转小写
                () => {
                    // 节流：防止快速连续触发
                    const now = Date.now();
                    if (now - lastTriggerTime < THROTTLE_DELAY) {
                        return;
                    }
                    lastTriggerTime = now;
                    
                    // 检查是否正在转场动画中（静默处理，遮罩动画本身就是足够的视觉反馈）
                    if (this.stateManager.state.ui.isTransitioning) {
                        return;
                    }
                    
                    // 检查是否在可视化页面
                    const visualizationView = document.getElementById('performance-visualization-view');
                    if (visualizationView && !visualizationView.classList.contains('hidden')) {
                        this.eventBus.emit('ui:show-info-message', {
                            message: '请先返回报告页面。'
                        });
                        return;
                    }
                    
                    const imageLoaded = this.stateManager.state.content.image.isLoaded;
                    const scroll = this.stateManager.state.playback.scroll;
                    // 判断是否在"初始状态"：未播放、未暂停、未完成（即从未播放过，或已重置）
                    const atInitialPosition = !scroll.isPlaying && !scroll.isPaused && !scroll.isCompleted;
                    const pageIsHidden = this.elements.featureConfigPage.classList.contains('hidden');
                    const isTargetPage = this.currentPageId === item.id;
                    
                    // 检查条件并显示对应的提示消息
                    if (!imageLoaded) {
                        this.eventBus.emit('ui:show-warning-message', {
                            message: '请先加载图片。'
                        });
                        return;
                    }
                    
                    if (!atInitialPosition) {
                        this.eventBus.emit('ui:show-warning-message', {
                            message: '请先重置动画。'
                        });
                        return;
                    }
                    
                    // 如果配置页面正在显示，且目标页面就是当前页面
                    if (!pageIsHidden && isTargetPage) {
                        this.eventBus.emit('ui:show-info-message', {
                            message: '已在当前页面中。'
                        });
                        return;
                    }
                    
                    // 所有条件满足，打开配置页面
                    // 如果配置页面正在显示但是不同的页面，允许切换
                    // 通过 itemId 通用打开，支持任何已注册的配置页面
                    this._openConfigPageByItemId(item.id);
                },
                this,
                { preventDefault: true }
            );
        });
    }

    /**
     * 渲染气泡元素
     * @private
     * @returns {void}
     */
    _renderBubbles() {
        // 清空容器
        this.elements.bubbleContainer.innerHTML = '';
        
        // 创建气泡元素
        this.menuItems.forEach((item, index) => {
            const bubbleElement = this._createBubbleElement(item, index);
            this.elements.bubbleContainer.appendChild(bubbleElement);
        });
    }

    /**
     * 创建单个气泡元素
     * @private
     * @param {Object} item - 气泡菜单项数据
     * @param {string} item.id - 气泡项ID
     * @param {string} item.title - 气泡项标题
     * @param {number} index - 气泡索引（用于动画延迟）
     * @returns {HTMLElement} 气泡元素
     */
    _createBubbleElement(item, index) {
        // 克隆模板
        const template = this.elements.bubbleItemTemplate;
        const clone = template.content.cloneNode(true);
        
        // 获取气泡元素
        const bubbleItem = clone.querySelector('.bubble-item');
        const bubbleTitle = clone.querySelector('.bubble-title');
        
        // 设置数据属性
        bubbleItem.dataset.id = item.id;
        bubbleItem.dataset.index = index;
        
        // 设置内容（如果有快捷键，显示快捷键提示）
        if (item.shortcut) {
            bubbleTitle.innerHTML = `${item.title} <span class="bubble-shortcut">(${item.shortcut})</span>`;
        } else {
            bubbleTitle.textContent = item.title;
        }
        
        // 添加点击事件
        bubbleItem.addEventListener('click', (event) => {
            this._handleBubbleClick(item, event.currentTarget);
        });
        
        return clone;
    }

    /**
     * 处理气泡点击事件
     * @private
     * @param {Object} item - 气泡菜单项数据
     * @param {HTMLElement} bubbleElement - 被点击的气泡元素
     * @returns {void}
     */
    _handleBubbleClick(item, bubbleElement) {
        // 检查功能是否已实现
        if (!this._isFeatureImplemented(item.id)) {
            // 未实现的功能：不执行任何操作
            return;
        }
        
        // 打开功能配置页面（带圆形扩散动画和路由）
        this._openConfigPage(item, bubbleElement);
    }
    
    /**
     * 检查功能是否已实现
     * @private
     * @param {string} itemId - 功能项ID
     * @returns {boolean} 已实现返回true，否则返回false
     */
    _isFeatureImplemented(itemId) {
        // 已实现功能列表
        const implementedFeatures = [
            'entry-animation',
            'performance-monitor'
            // 未来添加更多功能时，在此添加itemId
        ];
        
        return implementedFeatures.includes(itemId);
    }

    /**
     * 显示气泡菜单
     * @returns {void}
     */
    show() {
        if (this.isVisible) {
            return;
        }
        
        this.isVisible = true;
        
        // 触发重排以确保动画生效
        this.elements.bubbleMenu.offsetHeight;
        
        this.elements.bubbleMenu.classList.add('show');
        
        // 生成装饰气泡
        this._createDecorativeBubbles();
        
        // 随机顺序显示气泡（添加动画类）
        const bubbles = this.elements.bubbleContainer.querySelectorAll('.bubble-item');
        
        // 清除上次的hiding状态和CSS变量
        bubbles.forEach(bubble => {
            bubble.classList.remove('show', 'hiding', 'fade-out');
            bubble.style.removeProperty('--current-opacity');
            bubble.style.removeProperty('--current-transform');
        });
        
        // 触发重排，确保动画重新触发
        this.elements.bubbleContainer.offsetHeight;
        
        // 生成延迟数组 [0, 100, 200, ...]
        const delays = Array.from({ length: bubbles.length }, (_, i) => i * 100);
        
        // Fisher-Yates洗牌算法，打乱延迟顺序
        for (let i = delays.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [delays[i], delays[j]] = [delays[j], delays[i]];
        }
        
        // 应用随机延迟到每个气泡
        bubbles.forEach((bubble, index) => {
            setTimeout(() => {
                bubble.classList.add('show');
            }, delays[index]);
        });
    }

    /**
     * 隐藏气泡菜单
     * @returns {void}
     */
    hide() {
        if (!this.isVisible) {
            return;
        }
        
        this.isVisible = false;
        
        // 清除装饰气泡
        this._clearDecorativeBubbles();
        
        // 依次隐藏气泡
        const bubbles = this.elements.bubbleContainer.querySelectorAll('.bubble-item');
        
        bubbles.forEach((bubble, index) => {
            setTimeout(() => {
                // 获取animation中的当前动态值
                const currentStyle = getComputedStyle(bubble);
                const currentOpacity = currentStyle.opacity;
                const currentTransform = currentStyle.transform;
                
                // 使用CSS自定义属性传递动态值
                bubble.style.setProperty('--current-opacity', currentOpacity);
                bubble.style.setProperty('--current-transform', currentTransform);
                
                // 添加hiding类（使用CSS类控制动画和过渡）
                bubble.classList.add('hiding');
                
                // 强制重排
                void bubble.offsetHeight;
                
                // 下一帧添加fade-out类，触发transition
                requestAnimationFrame(() => {
                    bubble.classList.add('fade-out');
                });
            }, index * 50);
        });
        
        // 等待所有气泡动画完成后隐藏整个菜单
        setTimeout(() => {
            this.elements.bubbleMenu.classList.remove('show');
        }, bubbles.length * 50 + 100);
    }

    /**
     * 切换气泡菜单显示状态
     * @returns {void}
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * 创建装饰气泡（Canvas版本）
     * 生成多个随机大小、位置、速度的气泡数据，使用Canvas渲染
     * @private
     * @returns {void}
     */
    _createDecorativeBubbles() {
        // 动态计算气泡数量：根据屏幕面积和期望密度
        const screenArea = window.innerWidth * window.innerHeight;
        const bubbleAreaDensity = 6000; // 保守密度，适配大多数电脑
        // 密度参考：3000=高性能, 6000=推荐(兼容性好), 10000=低性能, 15000=极低性能
        const bubbleCount = Math.ceil(screenArea / bubbleAreaDensity);
        
        // 创建气泡数据数组
        this.bubbles = [];
        const canvasHeight = this.canvasLogicalHeight;
        const canvasWidth = this.canvasLogicalWidth;
        
        for (let i = 0; i < bubbleCount; i++) {
            // 随机大小 (10px - 60px)
            const size = Math.random() * 50 + 10;
            
            // 随机水平位置
            const x = Math.random() * canvasWidth;
            
            // 随机起始延迟，影响初始Y位置（缩短到0.8秒内）
            const delay = Math.random() * 0.8;
            
            // 随机速度 (对应0.6-1.5秒完成动画，非常快)
            const speed = (canvasHeight * 1.2) / (Math.random() * 0.9 + 0.6);
            
            // 随机水平漂移速度
            const driftSpeed = (Math.random() - 0.5) * 0.5;
            
            this.bubbles.push({
                x: x,
                y: canvasHeight + size, // 从屏幕底部下方开始
                size: size,
                speed: speed,
                driftSpeed: driftSpeed,
                delay: delay,
                elapsed: -delay, // 负值表示延迟时间
                opacity: 0,
                scale: 1
            });
        }
        
        // 启动Canvas动画循环
        this._startCanvasAnimation();
    }

    /**
     * 启动Canvas动画循环
     * @private
     * @returns {void}
     */
    _startCanvasAnimation() {
        let lastTime = performance.now();
        
        const animate = (currentTime) => {
            // 计算deltaTime（秒）
            const deltaTime = (currentTime - lastTime) / 1000;
            lastTime = currentTime;
            
            // 清空画布
            this.ctx.clearRect(0, 0, this.canvasLogicalWidth, this.canvasLogicalHeight);
            
            // 更新和绘制每个气泡
            for (let bubble of this.bubbles) {
                // 更新延迟计时
                if (bubble.elapsed < 0) {
                    bubble.elapsed += deltaTime;
                    continue; // 延迟期间不显示
                }
                
                // 更新位置
                bubble.y -= bubble.speed * deltaTime;
                bubble.x += bubble.driftSpeed * bubble.speed * deltaTime;
                bubble.elapsed += deltaTime;
                
                // 更新透明度（淡入淡出）- 降低整体透明度，更"背景化"
                const totalDuration = (this.canvasLogicalHeight * 1.2) / bubble.speed;
                const progress = bubble.elapsed / totalDuration;
                
                if (progress < 0.1) {
                    bubble.opacity = progress / 0.1 * 0.35; // 0-10%淡入到0.35（原0.7）
                } else if (progress > 0.9) {
                    bubble.opacity = (1 - progress) / 0.1 * 0.35; // 90-100%淡出到0（原0.7）
                } else {
                    bubble.opacity = 0.35; // 最大透明度降低到0.35
                }
                
                // 气泡飘出屏幕顶部后不再显示（不重置）
                if (bubble.y < -bubble.size) {
                    continue; // 跳过绘制
                }
                
                // 绘制气泡
                this._drawBubble(bubble);
            }
            
            // 继续下一帧
            this.animationFrameId = requestAnimationFrame(animate);
        };
        
        this.animationFrameId = requestAnimationFrame(animate);
    }

    /**
     * 绘制单个气泡
     * @private
     * @param {Object} bubble - 气泡数据对象
     * @returns {void}
     */
    _drawBubble(bubble) {
        const ctx = this.ctx;
        const radius = bubble.size / 2;
        
        ctx.save();
        
        // 设置全局透明度
        ctx.globalAlpha = bubble.opacity;
        
        // 创建径向渐变
        const gradient = ctx.createRadialGradient(
            bubble.x - radius * 0.3, bubble.y - radius * 0.3, 0,
            bubble.x, bubble.y, radius
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.4, 'rgba(173, 216, 230, 0.5)');
        gradient.addColorStop(1, 'rgba(173, 216, 230, 0.1)');
        
        // 绘制气泡主体
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 绘制边框
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // 绘制高光
        const highlightGradient = ctx.createRadialGradient(
            bubble.x - radius * 0.4, bubble.y - radius * 0.4, 0,
            bubble.x - radius * 0.4, bubble.y - radius * 0.4, radius * 0.4
        );
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = highlightGradient;
        ctx.beginPath();
        ctx.arc(bubble.x - radius * 0.3, bubble.y - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    /**
     * 清除装饰气泡
     * @private
     * @returns {void}
     */
    _clearDecorativeBubbles() {
        // 停止动画循环
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // 清空气泡数据
        this.bubbles = [];
        
        // 清空画布
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvasLogicalWidth, this.canvasLogicalHeight);
        }
    }

    /**
     * 立即隐藏气泡菜单（无动画）
     * @private
     * @returns {void}
     */
    _hideBubbleMenuImmediate() {
        this.elements.bubbleMenu.classList.remove('show');
        this.isVisible = false;
        this._clearDecorativeBubbles();
    }

    /**
     * 显示配置页面并触发圆形扩散动画
     * @private
     * @param {number} centerX - 扩散动画中心X坐标（视口坐标）
     * @param {number} centerY - 扩散动画中心Y坐标（视口坐标）
     * @returns {void}
     */
    _showConfigPageWithAnimation(centerX, centerY) {
        // 显示配置页面容器
        this.elements.featureConfigPage.classList.remove('hidden');
        
        // 导航栏淡入初始状态
        this.elements.configPageNav.classList.add('fade-in');
        
        // 直接设置clip-path初始值
        // 注：CSS变量在clip-path中存在浏览器解析时机问题，因此直接用JS设置完整的clip-path值
        this.elements.configTransition.style.clipPath = `circle(0% at ${centerX}px ${centerY}px)`;
        
        // 强制浏览器重新计算样式
        void this.elements.configTransition.offsetWidth;
        
        // 添加显示类
        this.elements.featureConfigPage.classList.add('show');
        
        // 延迟触发扩散动画（修改clip-path，让CSS transition自动生效）
        requestAnimationFrame(() => {
            this.elements.configTransition.style.clipPath = `circle(150% at ${centerX}px ${centerY}px)`;
            
            // 同时触发导航栏淡入
            this.elements.configPageNav.classList.remove('fade-in');
        });
    }

    /**
     * 通过itemId打开配置页面（通用方法）
     * @private
     * @param {string} itemId - 菜单项ID
     * @returns {void}
     */
    _openConfigPageByItemId(itemId) {
        // 从配置中查找对应的菜单项，获取标题
        const item = this.menuItems.find(item => item.id === itemId);
        if (!item) {
            console.warn(`BubbleMenuService: Menu item with id "${itemId}" not found`);
            return;
        }
        
        // 判断配置页面是否已经显示
        const pageIsVisible = !this.elements.featureConfigPage.classList.contains('hidden');
        
        if (pageIsVisible) {
            // 页面已显示，直接切换内容（会触发3D翻页动画）
            this._routeToConfigPage(itemId, item.title);  // ← 传递标题
        } else {
            // 页面未显示，执行完整的打开流程（包括圆形扩散动画 + CSS的滑入/淡入动画）
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            
            this._routeToConfigPage(itemId, item.title);
            this._showConfigPageWithAnimation(centerX, centerY);
            
            // 如果气泡菜单是打开的，关闭它
            if (this.isVisible) {
                this.hide();
            }
        }
    }

    /**
     * 打开功能配置页面（圆形扩散动画 + 路由）
     * @private
     * @param {Object} item - 气泡菜单项数据
     * @param {string} item.id - 功能项ID
     * @param {string} item.title - 功能项标题
     * @param {HTMLElement} bubbleElement - 被点击的气泡元素（点击时因悬停而静止）
     * @returns {void}
     */
    _openConfigPage(item, bubbleElement) {
        // 获取被点击气泡的中心坐标（相对于视口）
        // 因为hover时animation-play-state: paused，气泡是静止的，位置准确
        const rect = bubbleElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // 路由：根据itemId渲染对应的配置页面内容
        this._routeToConfigPage(item.id, item.title);
        
        // 显示配置页面容器并触发扩散动画
        this._showConfigPageWithAnimation(centerX, centerY);
        
        // 隐藏气泡菜单（立即，不等待动画）
        this._hideBubbleMenuImmediate();
    }

    /**
     * 路由：根据itemId渲染对应的配置页面内容
     * @private
     * @param {string} itemId - 功能项ID
     * @param {string} newTitle - 页面标题（必需）
     * @returns {void}
     */
    _routeToConfigPage(itemId, newTitle) {
        // Fail Fast: 验证必需参数
        if (!newTitle || typeof newTitle !== 'string') {
            throw new Error('BubbleMenuService._routeToConfigPage: newTitle is required');
        }
        
        // 判断是否是页面切换（而非首次打开）
        const isPageSwitch = this.currentPageId !== null && this.currentPageId !== itemId;
        
        // 定义渲染内容的函数
        const renderContent = () => {
            // 清理之前的配置页面（如果存在）
            if (this.currentConfigPage) {
                this.currentConfigPage.destroy();
                this.currentConfigPage = null;
            }
            
            // 从注册表中查找对应的配置页面服务
            this.currentConfigPage = this.configPages.get(itemId);
            
            // 更新当前页面ID
            this.currentPageId = itemId;
            
            // 如果找到对应的配置页面服务，渲染配置内容
            if (this.currentConfigPage) {
                // ✨ 更新标题（在翻出动画完成后，内容更新前）
                this.elements.configPageTitle.textContent = newTitle;
                
                // 渲染配置内容
                this.currentConfigPage.renderConfig(this.elements.configPageBody);
                
                // 更新导航栏高亮状态
                this._updateNavActive(itemId);
                
                // 根据页面是否有save()方法，动态显示/隐藏"确认配置"按钮
                if (typeof this.currentConfigPage.save === 'function') {
                    this.elements.configConfirmBtn.classList.remove('hidden');
                } else {
                    this.elements.configConfirmBtn.classList.add('hidden');
                }
            } else {
                // 配置页面未注册，可能是功能尚未实现或注册遗漏
                console.warn(`BubbleMenuService: No config page registered for itemId "${itemId}"`);
            }
        };
        
        // 如果是页面切换，应用3D翻页动画
        if (isPageSwitch) {
            // 1. 翻出当前页面
            this.elements.configPageWrapper.classList.add('page-flip-out');
            
            // Lazy loading: 第一次调用时读取动画时长
            if (this._pageFlipDurationMs === null) {
                const computedStyle = getComputedStyle(this.elements.configPageWrapper);
                const animationDuration = computedStyle.animationDuration;
                this._pageFlipDurationMs = parseFloat(animationDuration) * 1000;
            }
            
            // 2. 等待翻出动画完成后，更新内容并翻入新页面
            setTimeout(() => {
                // 移除翻出类
                this.elements.configPageWrapper.classList.remove('page-flip-out');
                
                // 渲染新内容
                renderContent();
                
                // 添加翻入类
                this.elements.configPageWrapper.classList.add('page-flip-in');
                
                // 3. 等待翻入动画完成后，清理类名
                setTimeout(() => {
                    this.elements.configPageWrapper.classList.remove('page-flip-in');
                }, this._pageFlipDurationMs);
            }, this._pageFlipDurationMs);
        } else {
            // 首次打开，直接渲染内容（无需翻页动画）
            renderContent();
        }
    }
    
    /**
     * 保存配置
     * @private
     * @returns {void}
     */
    _saveConfig() {
        if (!this.currentConfigPage) {
            return;
        }
        
        // 委托给当前配置页面服务保存（如果页面提供了save()方法）
        if (typeof this.currentConfigPage.save === 'function') {
            this.currentConfigPage.save(this.stateManager, this.eventBus);
        }
    }
    
    /**
     * 关闭功能配置页面（简单淡出动画 + 清理）
     * @private
     * @returns {void}
     */
    _closeConfigPage() {
        // 立即清除转场层的clip-path并隐藏（防止挡住内容）
        this.elements.configTransition.style.clipPath = '';
        this.elements.configTransition.classList.add('hidden');
        // 同时隐藏覆盖层（防止黑色背景透过body）
        this.elements.configOverlay.classList.add('hidden');
        
        // 导航栏淡出
        this.elements.configPageNav.classList.add('fade-out');
        
        // 添加hiding类触发重力下坠动画
        this.elements.featureConfigPage.classList.add('hiding');
        
        // Lazy loading: 第一次调用时读取动画时长
        if (this._gravityDropDurationMs === null) {
            const configPageContent = this.elements.featureConfigPage.querySelector('.config-page-content');
            const computedStyle = getComputedStyle(configPageContent);
            const animationDuration = computedStyle.animationDuration;
            this._gravityDropDurationMs = parseFloat(animationDuration) * 1000;
        }
        
        // 等待重力下坠动画完成后完全隐藏
        setTimeout(() => {
            // 先添加 .hidden 类让元素 display:none（此时 .hiding 动画已完成）
            this.elements.featureConfigPage.classList.add('hidden');
            
            // 强制重绘，确保display:none立即生效
            void this.elements.featureConfigPage.offsetHeight;
            
            // 在下一帧清理其他类（此时元素已不可见，移除类不会有视觉影响）
            requestAnimationFrame(() => {
                // 移除 .show 和 .hiding 类（此时元素已不可见，移除类不会有视觉影响）
                this.elements.featureConfigPage.classList.remove('show', 'hiding');
                
                // 清理导航栏动画类
                this.elements.configPageNav.classList.remove('fade-out');
                
                // 🔑 在动画结束后才销毁配置页内容
                if (this.currentConfigPage) {
                    this.currentConfigPage.destroy();
                    this.currentConfigPage = null;
                }
                
                // 重置当前页面ID
                this.currentPageId = null;
                
                // 重置CSS类（移除动画过程中添加的hidden类）
                this.elements.configTransition.classList.remove('hidden');
                this.elements.configOverlay.classList.remove('hidden');
                
                // 关闭气泡菜单
                this.hide();
            });
        }, this._gravityDropDurationMs);
    }
    
    /**
     * 处理右侧导航栏点击事件
     * @private
     * @param {string} pageId - 页面ID（home/entry-animation/performance-monitor）
     * @returns {void}
     * @throws {Error} 当pageId为空时抛出错误（Fail Fast）
     */
    _handleNavClick(pageId) {
        // Fail Fast: pageId不能为空
        if (!pageId) {
            throw new Error('BubbleMenuService._handleNavClick: pageId is required');
        }
        
        // 如果点击的是"首页"，执行3D翻转返回首页
        if (pageId === 'home') {
            this._closeConfigPageWithFlip();
        } else {
            // 如果点击的就是当前页面，无需重复路由
            if (this.currentPageId === pageId) {
                return;
            }
            
            // 否则，路由到对应的配置页面（页面切换，使用3D翻转动画）
            // 从菜单配置中查找对应的标题
            const item = this.menuItems.find(item => item.id === pageId);
            if (!item) {
                throw new Error(`BubbleMenuService._handleNavClick: Menu item with id "${pageId}" not found`);
            }
            this._routeToConfigPage(pageId, item.title);
        }
    }
    
    /**
     * 使用3D翻转动画关闭配置页面并返回首页
     * @private
     * @returns {void}
     */
    _closeConfigPageWithFlip() {
        // 1. 设置首页容器为翻入前的初始状态（rotateY 90°, opacity 0）
        this.elements.appContainer.classList.add('page-flip-in-initial');
        
        // 强制重绘，确保初始状态立即生效
        void this.elements.appContainer.offsetHeight;
        
        // 2. 配置页面开始翻出，导航栏同步淡出
        this.elements.featureConfigPage.classList.add('page-flip-out');
        this.elements.configPageNav.classList.add('fade-out');
        
        // Lazy loading: 第一次调用时读取动画时长
        if (this._featurePageFlipDurationMs === null) {
            const computedStyle = getComputedStyle(this.elements.featureConfigPage);
            const animationDuration = computedStyle.animationDuration;
            this._featurePageFlipDurationMs = parseFloat(animationDuration) * 1000;
        }
        
        // 3. 等待配置页面翻出完成后，首页开始翻入
        setTimeout(() => {
            // 移除初始状态类，添加翻入类（触发翻入动画）
            this.elements.appContainer.classList.remove('page-flip-in-initial');
            this.elements.appContainer.classList.add('page-flip-in');
            
            // 4. 等待首页翻入完成后，清理所有动画类
            setTimeout(() => {
                // 清理首页动画类
                this.elements.appContainer.classList.remove('page-flip-in');
                
                // 清理配置页面动画类和状态
                this.elements.featureConfigPage.classList.remove('page-flip-out', 'show');
                this.elements.featureConfigPage.classList.add('hidden');
                
                // 清理导航栏动画类
                this.elements.configPageNav.classList.remove('fade-out');
                
                // 销毁配置页内容
                if (this.currentConfigPage) {
                    this.currentConfigPage.destroy();
                    this.currentConfigPage = null;
                }
                
                // 重置当前页面ID
                this.currentPageId = null;
                
                // 关闭气泡菜单
                this.hide();
            }, this._featurePageFlipDurationMs);
        }, this._featurePageFlipDurationMs);
    }
    
    /**
     * 更新导航栏的激活状态
     * @private
     * @param {string} pageId - 当前激活的页面ID
     * @returns {void}
     */
    _updateNavActive(pageId) {
        const navItems = this.elements.configPageNav.querySelectorAll('.config-nav-item');
        navItems.forEach(item => {
            if (item.dataset.pageId === pageId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
}


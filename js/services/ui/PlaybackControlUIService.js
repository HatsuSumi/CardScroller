/**
 * PlaybackControlUIService - 播放控制UI服务
 * 处理播放控制相关的UI交互，负责播放、暂停、重置按钮的UI交互，以及播放控制快捷键
 * 
 * 当前被使用的模块：
 * - 无（纯UI服务，通过用户交互触发）
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，用于服务间通信和错误通知 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - scrollService (business/ScrollService.js) - 滚动服务，用于重置滚动状态 (通过DI注入)
 * - validationService (system/ValidationService.js) - 统一验证服务，提供滚动时长验证 (通过DI注入)
 * - keyboardService (utils/KeyboardService.js) - 键盘服务，注册播放控制快捷键 (通过DI注入)
 * 
 * 架构说明：
 * 为什么不继承 BaseUIService？
 * - BaseUIService的设计意图是"频繁访问同一个DOM元素"，即多个方法反复调用 _getElement() 获取同一元素，通过缓存避免重复查询
 * - PlaybackControlUIService只在_setupPlaybackControls方法中一次性获取DOM元素并绑定事件监听器，之后不会再次访问这些元素
 * - 唯一例外是_validateDuration方法中访问duration输入框，但这是验证场景而非频繁访问，不需要缓存
 * - 直接使用原生 document.getElementById() 更清晰、更轻量
 */

export class PlaybackControlUIService {
    /**
     * 构造函数 - 注入所需依赖
     * @param {EventBus} eventBus - 事件总线，用于发送播放控制事件和错误通知
     * @param {StateManager} stateManager - 状态管理器，用于读取播放状态和图片加载状态
     * @param {ScrollService} scrollService - 滚动服务，用于重置滚动状态
     * @param {ValidationService} validationService - 验证服务，用于验证滚动时长
     * @param {KeyboardService} keyboardService - 键盘服务，用于注册播放控制快捷键
     * @throws {Error} 依赖注入失败时抛出错误（Fail Fast）
     */
    constructor(eventBus, stateManager, scrollService, validationService, keyboardService) {
        // Fail Fast 验证
        if (!eventBus) {
            throw new Error('EventBus is required for PlaybackControlUIService');
        }
        if (!stateManager) {
            throw new Error('StateManager is required for PlaybackControlUIService');
        }
        if (!scrollService) {
            throw new Error('ScrollService is required for PlaybackControlUIService');
        }
        if (!validationService) {
            throw new Error('ValidationService is required for PlaybackControlUIService');
        }
        if (!keyboardService) {
            throw new Error('KeyboardService is required for PlaybackControlUIService');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.scrollService = scrollService;
        this.validationService = validationService;
        this.keyboardService = keyboardService;
        
        // 🐛 Bug修复：防抖保护，防止键盘硬件短时间内重复触发空格键
        // 实测发现键盘可能在极短时间（<10ms）内重复触发同一个按键事件
        this.lastTriggerTime = 0;
        this.DEBOUNCE_DELAY = 300; // 300ms 防抖延迟
    }
    
    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        this._setupPlaybackControls();
        this._registerShortcuts();
    }


    /**
     * 设置播放控制相关事件监听器
     * 包括：播放按钮、暂停按钮、重置按钮
     * @private
     * @returns {void}
     * @throws {Error} 当必需的UI元素不存在时抛出错误
     */
    _setupPlaybackControls() {
        // 播放按钮
        const playBtn = document.getElementById('playBtn');
        if (!playBtn) {
            throw new Error('Required UI element not found: playBtn');
        }
        playBtn.addEventListener('click', () => {
            try {
                // 验证滚动时长
                if (!this._validateDuration()) {
                    return; // 验证失败，阻止播放
                }
                
                this.eventBus.emit('scroll:play');
            } catch (error) {
                this._emitOperationError('播放', error);
            }
        });

        // 暂停按钮
        const pauseBtn = document.getElementById('pauseBtn');
        if (!pauseBtn) {
            throw new Error('Required UI element not found: pauseBtn');
        }
        pauseBtn.addEventListener('click', () => {
            try {
                this.eventBus.emit('scroll:pause');
            } catch (error) {
                this._emitOperationError('暂停', error);
            }
        });

        // 重置按钮
        const resetBtn = document.getElementById('resetBtn');
        if (!resetBtn) {
            throw new Error('Required UI element not found: resetBtn');
        }
        resetBtn.addEventListener('click', () => {
            try {
                this.scrollService.reset();
            } catch (error) {
                this._emitOperationError('重置', error);
            }
        });
    }

    /**
     * 发送操作失败错误事件（统一错误处理）
     * @param {string} operation - 操作名称（如"播放"、"暂停"等）
     * @param {Error} error - 错误对象
     * @private
     * @returns {void}
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    _emitOperationError(operation, error) {
        // Fail Fast: 验证参数
        if (!operation || typeof operation !== 'string') {
            throw new Error('_emitOperationError: operation (string) is required');
        }
        if (!error) {
            throw new Error('_emitOperationError: error is required');
        }
        if (!error.message) {
            throw new Error('_emitOperationError: error.message is required');
        }
        
        this.eventBus.emit('ui:show-validation-error', {
            message: `<p style="margin: 0 0 12px 0;"><strong>${operation}失败！</strong></p><p style="margin: 0;">错误详情：<br>${error.message}</p>`,
            options: {
                title: `${operation}失败`,
                shortMessage: `${operation}失败！`
            }
        });
    }

    /**
     * 验证滚动时长输入框的值
     * @returns {boolean} 验证是否通过
     * @private
     * @throws {Error} 当找不到时长输入框或验证服务返回无效结果时抛出错误（Fail Fast）
     */
    _validateDuration() {
        const durationInput = document.getElementById('duration');
        if (!durationInput) {
            throw new Error('Required UI element not found: duration input');
        }

        // 使用统一验证服务进行验证
        const validation = this.validationService.validateDuration(durationInput.value);
        
        // Fail Fast: 验证返回值
        if (!validation) {
            throw new Error('ValidationService.validateDuration returned invalid result');
        }
        
        if (!validation.isValid) {
            // 使用验证错误事件
            this.eventBus.emit('ui:show-validation-error', {
                message: `<p style="margin: 0;">${validation.errorMessage}，请修正后重试！</p>`,
                options: { 
                    title: '滚动时长无效',
                    shortMessage: '滚动时长无效！'
                }
            });
            
            return false; // 验证失败
        }
        
        return true; // 验证通过
    }

    /**
     * 触发播放/暂停切换
     * 根据当前播放状态决定是播放还是暂停
     * 注意：需要同时检查入场动画和滚动动画的播放状态
     * @returns {void}
     * @private
     */
    _triggerPlayPause() {
        try {
            // 🐛 Bug修复：防抖保护，防止键盘硬件重复触发
            const now = Date.now();
            const timeSinceLastTrigger = now - this.lastTriggerTime;
            if (timeSinceLastTrigger < this.DEBOUNCE_DELAY) {
                return;
            }
            this.lastTriggerTime = now;
            
            // 检查是否有图片加载
            if (!this.stateManager.state.content.image.isLoaded) {
                return;
            }

            const scrollState = this.stateManager.state.playback.scroll;
            const isScrollPlaying = scrollState.isPlaying;
            const isCompleted = scrollState.isCompleted;
            
            // 🐛 Bug修复：isScrollPlaying已经反映了所有动画的播放状态（入场+滚动）
            // 不应该再检查currentPhase，因为暂停时phase不会清除，导致暂停后无法恢复播放
            // 根据当前状态直接发送播放或暂停事件
            if (isScrollPlaying) {
                // 正在播放（可能是入场动画或滚动动画），触发暂停
                this.eventBus.emit('scroll:pause');
            } else {
                // 未播放或已完成，触发播放
                // 如果已完成，先重置再播放
                if (isCompleted) {
                    this.scrollService.reset();
                }
                
                // 播放前验证时长
                if (this._validateDuration()) {
                    this.eventBus.emit('scroll:play');
                }
            }
        
        } catch (error) {
            // 快捷键触发播放/暂停时的错误处理
            this._emitOperationError('播放/暂停切换', error);
        }
    }

    /**
     * 注册播放控制快捷键
     * 当前注册：空格键 - 播放/暂停切换（仅在非输入框焦点时生效）
     * @private
     * @returns {void}
     */
    _registerShortcuts() {
        // 注册空格键播放/暂停（条件快捷键：仅在非输入框焦点时）
        this.keyboardService.registerConditional(
            'space',
            () => this._triggerPlayPause(),
            () => !this.keyboardService.isInputFocused(),
            this,
            { preventDefault: true }
        );
    }

}

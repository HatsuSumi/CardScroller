/**
 * ProgressBarService - 进度条管理服务
 * 负责播放进度条的显示/隐藏、进度更新、时间显示、距离显示、循环信息显示，以及根据用户设置和播放状态自动管理进度条可见性
 * 
 * 当前被使用的模块：
 * - 无（通过EventBus事件通信，见init()方法）
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，监听滚动相关事件 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器，读取滚动和进度条状态 (通过DI注入)
 * - stateWatcherService (system/StateWatcherService.js) - 状态监听服务，监听进度条设置变化 (通过DI注入)
 * - formatDuration, formatDurationPrecise, formatMillisecondsToSeconds (helpers/timeFormatters.js) - 时间/时长格式化工具函数
 * 
 * 架构说明：
 * 为什么不继承 BaseUIService？
 * - BaseUIService的设计意图是"频繁访问同一个DOM元素"，即多个方法反复调用 _getElement() 获取同一元素，通过缓存避免重复查询
 * - ProgressBarService只在init()时查询一次DOM元素，之后都直接使用实例属性（this.progressContainer等），不会再次调用 _getElement()
 * - 继承BaseUIService会造成双重缓存：DOM元素既存在BaseUIService.domCache中，又存在this.xxx实例属性中
 * - 直接使用原生 document.getElementById() 更清晰、更轻量
 * 
 */
import { formatDuration, formatDurationPrecise, formatMillisecondsToSeconds } from '../../helpers/timeFormatters.js';

export class ProgressBarService {
    /**
     * 构造函数 - 创建进度条服务实例
     * @param {EventBus} eventBus - 事件总线实例
     * @param {StateManager} stateManager - 状态管理器实例
     * @param {StateWatcherService} stateWatcherService - 状态监听服务实例
     * @throws {Error} 如果必需依赖未提供
     */
    constructor(eventBus, stateManager, stateWatcherService) {
        // Fail Fast: 严格验证依赖注入
        if (!eventBus) {
            throw new Error('ProgressBarService: eventBus is required');
        }
        if (!stateManager) {
            throw new Error('ProgressBarService: stateManager is required');
        }
        if (!stateWatcherService) {
            throw new Error('ProgressBarService: stateWatcherService is required');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.stateWatcherService = stateWatcherService;
        this.progressContainer = null;
        this.progressTime = null;
        this.progressFill = null;
        this.progressDistance = null;
        this.progressCountdown = null;
        this.progressTotalTime = null;
        this.progressLoop = null;
        this.isInitialized = false;
        
        // 技术实现细节：硬编码的UI更新频率阈值
        this.MIN_COUNTDOWN_DISPLAY_INTERVAL = 1000;  // 最小倒计时显示间隔（毫秒）
        
        // 过渡时长（在init中从DOM元素读取）
        this.TRANSITION_DURATION = null;
        
        // 用于清理过渡定时器，避免内存泄漏
        this._transitionTimeoutId = null;
    }


    /**
     * 初始化进度条服务
     * 获取DOM元素并注册事件监听器
     * 
     * 监听事件：
     * - `scroll:play-started` - 滚动开始播放时显示进度条并恢复动画
     * - `playback:progress` - 更新进度条进度、时间、距离等信息（进度条显示当前循环进度，总用时显示所有循环时间）
     * - `scroll:interval-countdown` - 更新循环间隔倒计时显示
     * - `scroll:completed` - 单次滚动完成时根据设置决定是否隐藏进度条
     * - `scroll:paused` - 滚动暂停时根据设置决定进度条显示状态
     * - `scroll:reset` - 滚动重置时隐藏进度条
     * - `scroll:stopped` - 滚动停止时根据设置决定是否隐藏进度条
     * 
     * @returns {void}
     * @throws {Error} 如果服务已初始化则抛出错误（Fail Fast）
     */
    init() {
        if (this.isInitialized) {
            throw new Error('ProgressBarService.init: Service already initialized. init() should only be called once.');
        }

        this._setupProgressBarElements();
        this._readTransitionDuration();
        this._bindEvents();
        this._setupStateWatchers();
        
        // 根据侧边栏初始状态设置进度条位置
        this._updatePosition();
        
        // 确保初始化时进度条是隐藏的
        this.hide();
        
        this.isInitialized = true;
    }

    /**
     * 设置进度条DOM元素引用
     * @private
     * @throws {Error} 当必需的DOM元素不存在时抛出错误（Fail Fast）
     */
    _setupProgressBarElements() {
        // 一次性获取所有DOM元素并缓存到实例属性
        this.progressContainer = document.getElementById('progressContainer');
        this.progressTime = document.getElementById('progressTime');
        this.progressFill = document.getElementById('progressFill');
        this.progressDistance = document.getElementById('progressDistance');
        this.progressCountdown = document.getElementById('progressCountdown');
        this.progressLoop = document.getElementById('progressLoop');
        this.progressTotalTime = document.getElementById('progressTotalTime');
        
        // Fail Fast: 验证关键DOM元素
        if (!this.progressContainer) {
            throw new Error('ProgressBarService: progressContainer element not found');
        }
        if (!this.progressTime) {
            throw new Error('ProgressBarService: progressTime element not found');
        }
        if (!this.progressFill) {
            throw new Error('ProgressBarService: progressFill element not found');
        }
        if (!this.progressDistance) {
            throw new Error('ProgressBarService: progressDistance element not found');
        }
        if (!this.progressCountdown) {
            throw new Error('ProgressBarService: progressCountdown element not found');
        }
        if (!this.progressLoop) {
            throw new Error('ProgressBarService: progressLoop element not found');
        }
        if (!this.progressTotalTime) {
            throw new Error('ProgressBarService: progressTotalTime element not found');
        }
    }

    /**
     * 读取过渡时长
     * @private
     * @throws {Error} 当过渡时长无效时抛出错误（Fail Fast）
     */
    _readTransitionDuration() {
        // 读取progressCountdown元素应用CSS后的实际过渡时长
        const computedStyle = getComputedStyle(this.progressCountdown);
        const transitionDuration = computedStyle.transitionDuration;
        
        // 解析过渡时长（格式如"0.3s"）
        this.TRANSITION_DURATION = parseFloat(transitionDuration) * 1000;
        
        // Fail Fast: 验证过渡时长
        if (isNaN(this.TRANSITION_DURATION) || this.TRANSITION_DURATION < 0) {
            throw new Error('ProgressBarService: Invalid transition-duration on progressCountdown element');
        }
    }

    /**
     * 绑定事件监听器
     * @private
     */
    _bindEvents() {
        // 监听滚动播放事件
        this.eventBus.on('scroll:play-started', (data) => {
            // 🎯 如果是循环继续播放，根据用户设置决定是否显示/隐藏进度条
            if (data && data.isLoopContinuation) {
                if (data.hideProgress) {
                    // 用户设置了"播放时隐藏"，隐藏进度条
                    this.hide();
                    this.resumeAnimation();
                    return;
                }
            }
            
            this.show();
            this.resumeAnimation();
        });
        
        // 监听播放进度事件（由 PlaybackCoordinatorService 统一发送，包含入场动画 + 滚动动画的当前循环进度）
        this.eventBus.on('playback:progress', (data) => {
            // progress-bar 显示当前循环的进度（每次循环结束后重置）
            // progress-time 显示当前循环的时间
            // progress-total-time 显示所有循环的总用时
            this.updateProgress(
                data.progress, 
                data.currentLoopElapsed,  // 当前循环已过时间
                data.position, 
                data.singleLoopDuration   // 单次循环时长
            );
            
            // 如果启用了循环，同时更新"总用时"显示
            // 🎯 重构：直接使用事件数据，避免重复计算
            const isLoopEnabled = this.stateManager.state.playback.loop.enabled;
            if (isLoopEnabled) {
                const { loopCount, currentLoop } = this._getValidatedLoopState();
                this._showLoopElements();
                this._updateLoopCountText(loopCount, currentLoop);
                this._updateTotalTimeDisplay(data.elapsed, data.totalDuration);  // 总已过时间，总时长
            }
        });
        
        // 监听循环间隔倒计时事件
        this.eventBus.on('scroll:interval-countdown', (data) => {
            // 循环间隔倒计时期间仍属于"播放中"状态，不是"播放完毕"
            // 应该根据"播放时隐藏"设置决定是否更新倒计时
            const hideProgress = this.stateManager.state.preferences.progressBar.hide;
            if (hideProgress) {
                // 用户设置了"播放时隐藏"，跳过倒计时更新
                return;
            }
            
            this._updateCountdown(data.remaining, data.total, data.currentLoop, data.loopCount);
            
            // 在间隔期间也更新总用时（包括间隔时间）
            // 🎯 架构重构：直接使用 PlaybackCoordinatorService 预计算的总时长数据
            if (data.totalElapsed !== undefined && data.totalDuration !== undefined) {
                this._updateTotalTimeDisplay(data.totalElapsed, data.totalDuration);
            }
        });
        
        // 监听滚动完成事件
        this.eventBus.on('scroll:completed', (data) => {
            this.pauseAnimation();
            
            // 检查是否还有后续循环
            const isLooping = data && data.isLooping;
            
            if (isLooping) {
                // 单次循环完成，但还有后续循环
                // 此时不处理进度条显示/隐藏，保持当前状态（继续隐藏）
                // 因为整个循环过程（包括循环间隔）都属于"播放中"，不是"播放完毕"
                return;
            }
            
            // 所有循环完成（或非循环播放完成）= 真正的"播放完毕"
            // 根据"播放完毕不隐藏"设置决定显示/隐藏
            const keepProgressOnComplete = this.stateManager.state.preferences.progressBar.keepOnComplete;
            
            if (keepProgressOnComplete) {
                // 用户勾选了"播放完毕不隐藏"，显示进度条
                this._showWithoutReset();
            } else {
                // 用户没勾选"播放完毕不隐藏"，隐藏进度条
                this.hide();
            }
        });
        
        // 监听滚动暂停事件
        this.eventBus.on('scroll:paused', () => {
            this.handlePauseState();
            this.pauseAnimation();
        });
        
        // 监听滚动重置事件
        this.eventBus.on('scroll:reset', () => {
            this.hide();
            this.pauseAnimation();
            // 清除倒计时文本残留
            this._hideCountdown();
        });
        
        // 监听滚动停止事件（非循环播放完毕或循环次数达到限制）
        this.eventBus.on('scroll:stopped', () => {
            this.pauseAnimation();
            
            // 根据"播放完毕不隐藏"设置决定显示/隐藏
            const keepProgressOnComplete = this.stateManager.state.preferences.progressBar.keepOnComplete;
            
            if (keepProgressOnComplete) {
                // 用户勾选了"播放完毕不隐藏"，显示进度条
                this._showWithoutReset();
            } else {
                // 用户没勾选"播放完毕不隐藏"，隐藏进度条
                this.hide();
            }
        });
    }

    /**
     * 显示进度条
     * 根据用户设置和播放状态决定是否显示进度条
     * @returns {void}
     */
    show() {
        // 检查用户设置是否隐藏进度条
        const hideProgress = this.stateManager.state.preferences.progressBar.hide;
        const isPlaying = this.stateManager.state.playback.scroll.isPlaying;
        const isPaused = this.stateManager.state.playback.scroll.isPaused;
        
        if (hideProgress) {
            // 性能优化：classList.add() 是幂等操作，直接添加即可
            this.progressContainer.classList.add('hidden');
            return; // 如果设置为隐藏，直接返回
        }
        
        // 只有在播放或暂停状态时才显示进度条
        if (!isPlaying && !isPaused) {
            return;
        }
        
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        this.progressContainer.classList.remove('hidden');
        // 重置进度条状态
        this.progressFill.style.setProperty('width', '0%');
        this._removeAllColorClasses();
        this.progressFill.classList.add('progress-green');
        // 恢复动画（播放时）
        this.progressFill.classList.remove('paused');
        // 重置距离显示
        this._resetDistanceDisplay();
    }

    /**
     * 隐藏进度条
     * @returns {void}
     */
    hide() {
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        this.progressContainer.classList.add('hidden');
    }

    /**
     * 显示进度条但不重置状态
     * @private
     */
    _showWithoutReset() {
        // 只显示进度条，不重置进度和颜色
        // 注意：不在这里检查hideProgress，因为调用者已经检查过了
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        this.progressContainer.classList.remove('hidden');
    }

    /**
     * 处理暂停时的进度条显示
     * 根据用户设置决定暂停时是否隐藏进度条
     * @returns {void}
     */
    handlePauseState() {
        const hideProgressOnPause = this.stateManager.state.preferences.progressBar.hideOnPause;
        
        if (hideProgressOnPause) {
            this.hide();
        } else {
            // 暂停时不隐藏进度条，应该显示
            // 注意：hideProgress只影响播放时，不影响暂停时
            this._showWithoutReset();
        }
    }

    /**
     * 更新进度条
     * 更新进度条宽度、颜色、时间显示、距离显示
     * 
     * 注意：循环信息（循环次数、总用时）由 playback:progress 事件监听器直接处理，不在此方法中更新
     * 
     * @param {number} progress - 进度 (0-1)
     * @param {number} elapsed - 已播放时间 (秒)
     * @param {number} position - 当前位置 (px)
     * @param {number} totalDuration - 当前循环的总时长 (秒)，必须由调用方提供
     * @returns {void}
     * @throws {Error} 如果任何参数不是number类型或startPosition未初始化
     */
    updateProgress(progress, elapsed, position, totalDuration) {
        // Fail Fast: 严格验证参数
        if (typeof progress !== 'number') {
            throw new Error('ProgressBarService.updateProgress: progress must be a number');
        }
        if (typeof elapsed !== 'number') {
            throw new Error('ProgressBarService.updateProgress: elapsed must be a number');
        }
        if (typeof position !== 'number') {
            throw new Error('ProgressBarService.updateProgress: position must be a number');
        }
        if (typeof totalDuration !== 'number') {
            throw new Error('ProgressBarService.updateProgress: totalDuration must be a number');
        }
        
        // 更新进度条宽度
        const progressPercent = Math.min(progress * 100, 100);
        this.progressFill.style.setProperty('width', `${progressPercent}%`);
        
        // 根据进度更新颜色
        this._updateColor(progress);
        
        // 格式化时间显示
        // 修复浮点数精度问题：确保显示的已播放时间不超过总时长
        const displayElapsed = Math.min(elapsed, totalDuration);
        const currentTime = formatDuration(displayElapsed);
        const totalTime = formatDuration(totalDuration);
        
        // 更新时间显示
        this.progressTime.textContent = `${currentTime} / ${totalTime}`;
        
        // 更新距离显示
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        // Fail Fast: 位置值必须存在
        const startPosition = this.stateManager.state.playback.scroll.startPosition;
        const endPosition = this.stateManager.state.playback.scroll.endPosition;
        const isReverse = this.stateManager.state.playback.scroll.reverseScroll;
        
        if (typeof startPosition !== 'number') {
            throw new Error('ProgressBarService.updateProgress: playback.scroll.startPosition is not initialized');
        }
        if (typeof endPosition !== 'number') {
            throw new Error('ProgressBarService.updateProgress: playback.scroll.endPosition is not initialized');
        }
        
        // 根据滚动方向计算已移动距离
        // 正向滚动：从start到end，已移动 = currentPosition - startPosition
        // 反向滚动：从end到start，已移动 = endPosition - currentPosition
        const movedDistance = isReverse
            ? Math.abs(endPosition - position)
            : Math.abs(position - startPosition);
        
        this.progressDistance.textContent = `当前已移动${Math.round(movedDistance)}px`;
    }

    /**
     * 移除所有进度条颜色类
     * @private
     */
    _removeAllColorClasses() {
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        this.progressFill.classList.remove('progress-green', 'progress-yellow', 'progress-red');
    }

    /**
     * 重置距离显示为初始状态
     * @private
     */
    _resetDistanceDisplay() {
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        this.progressDistance.textContent = '当前已移动0px';
    }

    /**
     * 淡出倒计时显示
     * @private
     */
    _fadeOutCountdown() {
        this.progressCountdown.classList.add('fade-out');
    }

    /**
     * 淡入倒计时显示
     * @private
     */
    _fadeInCountdown() {
        this.progressCountdown.classList.remove('fade-out');
    }

    /**
     * 显示倒计时区域
     * @private
     */
    _showCountdown() {
        this.progressCountdown.classList.remove('hidden');
    }

    /**
     * 隐藏倒计时区域
     * @private
     */
    _hideCountdown() {
        this.progressCountdown.classList.add('hidden');
    }

    /**
     * 设置倒计时文字
     * @param {number} remaining - 剩余毫秒数
     * @param {number} currentLoop - 当前循环索引（从0开始）
     * @param {number} loopCount - 总循环次数（0表示无限循环）
     * @returns {string} 倒计时文字
     * @private
     */
    _getCountdownText(remaining, currentLoop, loopCount) {
        // 🐛 Bug修复：当剩余时间很小时（<150ms），提前显示"等待"状态
        // 原因：formatMillisecondsToSeconds 使用 toFixed(1)，149ms~50ms 都显示"0.1秒"，看起来像卡住
        // 解决：remaining < 150 时提前切换文本，避免长时间显示相同的"0.1秒"
        if (remaining >= 150) {
            return `距离下一次循环还有${formatMillisecondsToSeconds(remaining)}秒`;
        } else {
            // 判断是否是最后一次循环（无限循环loopCount=0时始终显示）
            const isLastLoop = loopCount > 0 && (currentLoop + 1) >= loopCount;
            return isLastLoop ? '已完成全部循环' : '等待下一次循环......';
        }
    }

    /**
     * 获取倒计时当前状态
     * @param {string} currentText - 当前文字内容
     * @returns {Object} 状态对象
     * @private
     */
    _getCountdownState(currentText) {
        return {
            isEmpty: !currentText || currentText === '',
            isHidden: this.progressCountdown.classList.contains('hidden'),
            isCountdownText: currentText.includes('距离下一次循环还有'),
            isWaitingText: currentText === '等待下一次循环......',
            isCompletedText: currentText === '已完成全部循环'
        };
    }

    /**
     * 判断是否需要过渡效果
     * @param {Object} state - 当前状态
     * @param {boolean} newIsCountdown - 新状态是否为倒计时
     * @param {boolean} newIsWaiting - 新状态是否为等待
     * @param {string} newText - 新的文本内容
     * @returns {boolean} 是否需要过渡
     * @private
     */
    _needsTransition(state, newIsCountdown, newIsWaiting, newText) {
        const newIsCompleted = newText === '已完成全部循环';
        
        return state.isHidden || 
               state.isEmpty || 
               (state.isCountdownText && newIsWaiting) || 
               (state.isWaitingText && newIsCountdown) ||
               (state.isCountdownText && newIsCompleted) ||
               (state.isWaitingText && newIsCompleted) ||
               (state.isCompletedText && (newIsCountdown || newIsWaiting));
    }

    /**
     * 首次显示的淡入（从隐藏到显示）
     * @param {string} text - 要显示的文字
     * @private
     */
    _fadeInFromHidden(text) {
        // 1. 设置文字
        this.progressCountdown.textContent = text;
        
        // 2. 添加 fade-out 类（opacity: 0）
        this._fadeOutCountdown();
        
        // 3. 移除 hidden 类（display: block）
        this._showCountdown();
        
        // 4. 强制重排，确保浏览器注册 opacity: 0 的状态
        void this.progressCountdown.offsetHeight;
        
        // 5. 使用 requestAnimationFrame 确保在下一帧移除 fade-out，触发 CSS transition
        requestAnimationFrame(() => {
            this._fadeInCountdown();
        });
    }

    /**
     * 状态切换的淡出-淡入（同步版本）
     * @param {string} text - 要显示的文字
     * @private
     */
    _fadeOutAndInSync(text) {
        // 清除之前的过渡定时器，避免快速切换时产生冲突
        if (this._transitionTimeoutId !== null) {
            clearTimeout(this._transitionTimeoutId);
            this._transitionTimeoutId = null;
        }
        
        // 1. 立即淡出（opacity: 0）
        this._fadeOutCountdown();
        
        // 2. 等待淡出动画完成（使用 TRANSITION_DURATION）
        this._transitionTimeoutId = setTimeout(() => {
            // 3. 更新文字
            this.progressCountdown.textContent = text;
            
            // 4. 立即淡入
            this._fadeInCountdown();
            
            // 5. 清除定时器引用
            this._transitionTimeoutId = null;
        }, this.TRANSITION_DURATION);
    }

    /**
     * 直接更新（无过渡）
     * @param {string} text - 要显示的文字
     * @private
     */
    _updateCountdownDirectly(text) {
        this.progressCountdown.textContent = text;
        this._fadeInCountdown();
    }

    /**
     * 更新循环间隔倒计时显示
     * 只有当总间隔时间 >= minCountdownDisplayInterval 时才显示倒计时，避免短间隔时一闪一闪
     * @param {number} remaining - 剩余毫秒数
     * @param {number} total - 总毫秒数
     * @param {number} currentLoop - 当前循环索引（从0开始）
     * @param {number} loopCount - 总循环次数（0表示无限循环）
     * @private
     */
    _updateCountdown(remaining, total, currentLoop, loopCount) {
        if (total < this.MIN_COUNTDOWN_DISPLAY_INTERVAL) {
            this._hideCountdown();
            return;
        }
        
        const newText = this._getCountdownText(remaining, currentLoop, loopCount);
        
        const currentText = this.progressCountdown.textContent;
        const state = this._getCountdownState(currentText);
        const newIsCountdown = remaining > 0;
        const newIsWaiting = remaining <= 0;
        
        // 确保元素始终显示（除非间隔太短）
        this._showCountdown();
        
        if (this._needsTransition(state, newIsCountdown, newIsWaiting, newText)) {
            if (state.isHidden || state.isEmpty) {
                this._fadeInFromHidden(newText);
            } else {
                // 状态切换使用同步的淡出-淡入效果
                this._fadeOutAndInSync(newText);
            }
        } else {
            this._updateCountdownDirectly(newText);
        }
    }

    /**
     * 根据进度更新进度条颜色
     * @param {number} progress - 进度 (0-1)
     * @private
     */
    _updateColor(progress) {
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        // 移除所有颜色类
        this._removeAllColorClasses();
        
        // 根据进度添加对应的颜色类
        if (progress < 0.33) {
            this.progressFill.classList.add('progress-green');
        } else if (progress < 0.66) {
            this.progressFill.classList.add('progress-yellow');
        } else {
            this.progressFill.classList.add('progress-red');
        }
    }

    /**
     * 暂停进度条动画
     * 给进度条填充元素添加paused类，暂停CSS动画
     * @returns {void}
     */
    pauseAnimation() {
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        this.progressFill.classList.add('paused');
    }

    /**
     * 恢复进度条动画
     * 移除进度条填充元素的paused类，恢复CSS动画
     * @returns {void}
     */
    resumeAnimation() {
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        this.progressFill.classList.remove('paused');
    }

    /**
     * 隐藏循环相关UI元素
     * @returns {void}
     * @private
     */
    _hideLoopElements() {
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        this.progressLoop.classList.add('hidden');
        this.progressTotalTime.classList.add('hidden');
    }

    /**
     * 显示循环相关UI元素
     * @returns {void}
     * @private
     */
    _showLoopElements() {
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        this.progressLoop.classList.remove('hidden');
        this.progressTotalTime.classList.remove('hidden');
    }

    /**
     * 获取并验证循环状态
     * @returns {{loopCount: number, currentLoop: number}} 循环次数和当前循环索引
     * @throws {Error} 如果循环状态未初始化
     * @private
     */
    _getValidatedLoopState() {
        const loopCount = this.stateManager.state.playback.loop.count;
        const currentLoop = this.stateManager.state.playback.loop.currentLoop;
        
        if (typeof loopCount !== 'number') {
            throw new Error('ProgressBarService._getValidatedLoopState: playback.loop.count is not initialized');
        }
        if (typeof currentLoop !== 'number') {
            throw new Error('ProgressBarService._getValidatedLoopState: playback.loop.currentLoop is not initialized');
        }
        
        return { loopCount, currentLoop };
    }

    /**
     * 更新循环次数显示文本
     * @param {number} loopCount - 总循环次数（0表示无限循环）
     * @param {number} currentLoop - 当前循环索引（从0开始）
     * @returns {void}
     * @private
     */
    _updateLoopCountText(loopCount, currentLoop) {
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        if (loopCount === 0) {
            // 无限循环
            this.progressLoop.textContent = `循环次数：${currentLoop + 1}/∞`;
        } else {
            // 有限循环
            this.progressLoop.textContent = `循环次数：${currentLoop + 1}/${loopCount}`;
        }
    }

    /**
     * 更新总用时显示（使用 PlaybackCoordinatorService 预计算的数据）
     * @param {number} totalElapsed - 总已过时间（秒）
     * @param {number} totalDuration - 总时长（秒）
     * @returns {void}
     * @private
     */
    _updateTotalTimeDisplay(totalElapsed, totalDuration) {
        // DOM元素已在init()时通过Fail Fast验证，此处可以安全使用
        // 修复浮点数精度问题：确保显示的已播放时间不超过总时长
        const displayElapsed = totalDuration === Infinity ? totalElapsed : Math.min(totalElapsed, totalDuration);
        
        if (totalDuration === Infinity) {
            // 无限循环
            this.progressTotalTime.textContent = `总用时：${formatDurationPrecise(displayElapsed)}/∞`;
        } else {
            // 有限循环
            this.progressTotalTime.textContent = `总用时：${formatDurationPrecise(displayElapsed)}/${formatDurationPrecise(totalDuration)}`;
        }
    }

    /**
     * 更新进度条位置
     * 根据侧边栏折叠状态调整进度条的 left 属性
     * @private
     */
    _updatePosition() {
        // Fail Fast: 验证DOM元素存在
        if (!this.progressContainer) {
            throw new Error('ProgressBarService._updatePosition: progressContainer not initialized');
        }

        const sidebarCollapsed = this.stateManager.state.ui.layout.sidebarCollapsed;
        if (sidebarCollapsed) {
            this.progressContainer.classList.add('sidebar-collapsed');
        } else {
            this.progressContainer.classList.remove('sidebar-collapsed');
        }
    }

    /**
     * 设置状态监听器
     * @private
     */
    _setupStateWatchers() {
        // 监听侧边栏折叠状态
        this.stateWatcherService.watchState('ui.layout.sidebarCollapsed', () => {
            this._updatePosition();
        });

        // 监听播放状态和进度条可见性设置
        this.stateWatcherService.watchState('preferences.progressBar.hide', (hide) => {
            const isPlaying = this.stateManager.state.playback.scroll.isPlaying;
            const isPaused = this.stateManager.state.playback.scroll.isPaused;
            
            // 只有在实际播放或暂停状态时才响应设置变化
            // 避免在导入配置等非播放场景下误显示进度条
            if (isPlaying || isPaused) {
                if (hide) {
                    this.hide();
                } else {
                    this.show();
                }
            }
        });

        // 监听暂停时隐藏进度条设置变化
        this.stateWatcherService.watchState('preferences.progressBar.hideOnPause', (hideOnPause) => {
            const isPlaying = this.stateManager.state.playback.scroll.isPlaying;
            const isPaused = this.stateManager.state.playback.scroll.isPaused;
            
            // 只有在实际暂停状态时才响应设置变化
            // 避免在导入配置等非暂停场景下误操作进度条
            if (!isPlaying && isPaused) {
                if (hideOnPause) {
                    this.hide();
                } else {
                    this.show();
                }
            }
        });
    }

}

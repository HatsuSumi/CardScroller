/**
 * ScrollService - 滚动服务
 * 滚动配置管理和事件响应协调者，负责事件绑定、配置管理、状态变化响应。
 * 将实际的播放流程逻辑（包括循环管理）委托给 PlaybackCoordinatorService。
 * 
 * 当前被使用的模块：
 * - BusinessOrchestrationService (system/BusinessOrchestrationService.js) - 跨服务协调
 * - ConfigService (business/ConfigService.js) - 配置导入后重置滚动状态
 * - PlaybackControlUIService (ui/PlaybackControlUIService.js) - 播放控制UI
 * 
 * 当前依赖的模块：
 * - eventBus (core/EventBus.js) - 事件总线，监听和发送滚动相关事件 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器，管理滚动状态 (通过DI注入)
 * - playbackCoordinatorService (business/PlaybackCoordinatorService.js) - 播放协调服务，处理完整播放流程 (通过DI注入)
 * - getScrollCanvas, getMainImage (helpers/canvasAccessors.js) - Canvas元素访问工具函数
 */
import { getScrollCanvas, getMainImage } from '../../helpers/canvasAccessors.js';

export class ScrollService {
    /**
     * 构造函数
     * @param {EventBus} eventBus - 事件总线
     * @param {StateManager} stateManager - 状态管理器
     * @param {PlaybackCoordinatorService} playbackCoordinatorService - 播放协调服务
     * @throws {Error} 当必需依赖（eventBus、stateManager、playbackCoordinatorService）未提供时抛出错误
     */
    constructor(eventBus, stateManager, playbackCoordinatorService) {
        // Fail Fast: 检查必需的依赖
        if (!eventBus) {
            throw new Error('EventBus is required for ScrollService');
        }
        if (!stateManager) {
            throw new Error('StateManager is required for ScrollService');
        }
        if (!playbackCoordinatorService) {
            throw new Error('PlaybackCoordinatorService is required for ScrollService');
        }
        
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.playbackCoordinatorService = playbackCoordinatorService;
    }

    /**
     * 初始化服务
     * 绑定EventBus事件监听器
     * @returns {void}
     */
    init() {
        this._bindEvents();
    }

    /**
     * 获取滚动配置（从StateManager读取）
     * @returns {Object} 滚动配置对象
     * @returns {string} returns.defaultStrategy - 默认滚动策略
     * @returns {number} returns.minDuration - 最小时长
     * @returns {number} returns.defaultDuration - 默认时长
     */
    get config() {
        const scrollState = this.stateManager.state.playback.scroll;
        return {
            defaultStrategy: scrollState.animationStrategy,
            minDuration: this.stateManager.state.validation.sequence.minDuration,
            defaultDuration: scrollState.duration
        };
    }


    /**
     * 开始滚动（委托给 PlaybackCoordinatorService）
     * @param {Object} [options={}] - 滚动选项
     * @param {string} [options.strategy] - 滚动策略（可选，默认使用配置中的策略）
     * @returns {void}
     * @throws {Error} 当没有加载图片或DOM元素不存在时抛出错误
     */
    play(options = {}) {
        // 使用统一的Canvas访问工具函数获取DOM元素
        const canvas = getScrollCanvas();
        const image = getMainImage();
        
        this.playbackCoordinatorService.play({
            ...options,
            domElements: { canvas, image }
        });
    }

    /**
     * 暂停滚动（委托给 PlaybackCoordinatorService）
     * @returns {void}
     * @throws {Error} 当暂停操作失败时抛出错误
     */
    pause() {
        this.playbackCoordinatorService.pause();
    }

    /**
     * 重置滚动（委托给 PlaybackCoordinatorService）
     * @returns {void}
     * @throws {Error} 当重置操作失败时抛出错误
     */
    reset() {
        this.playbackCoordinatorService.reset();
    }


    /**
     * 更新滚动配置
     * @param {Object} updates - 配置更新对象，键为配置路径，值为新值
     * @returns {void}
     */
    updateConfig(updates) {
        Object.entries(updates).forEach(([path, value]) => {
            this.stateManager.setValue(path, value, {});
        });
    }

    /**
     * 包装事件处理器，添加统一的错误处理
     * @param {Function} handler - 事件处理函数
     * @param {string} errorType - 错误类型（用于错误事件名称）
     * @returns {Function} 包装后的事件处理函数
     * @private
     */
    _wrapEventHandler(handler, errorType) {
        return (...args) => {
            try {
                handler(...args);
            } catch (error) {
                // 发出业务错误事件，由 System 层（BusinessOrchestrationService）决定如何显示
                this.eventBus.emit(`scroll:${errorType}-error`, {
                    error: error.message,
                    type: errorType
                });
            }
        };
    }

    /**
     * 绑定事件
     * @returns {void}
     * @private
     */
    _bindEvents() {
        this.eventBus.on('scroll:play', this._wrapEventHandler(
            () => this.play(),
            'play'
        ));

        this.eventBus.on('scroll:pause', this._wrapEventHandler(
            () => this.pause(),
            'pause'
        ));

        // 监听滚动参数验证结果（架构分层：从System层接收验证结果）
        this.eventBus.on('validation:scroll-parameter-result', (result) => {
            this._handleParameterValidationResult(result);
        });

        // 监听图片加载状态变化（架构分层：从System层接收状态变化通知）
        this.eventBus.on('state:image-loaded-changed', (data) => {
            this._handleImageLoadedChange(data.isLoaded);
        });

        // 监听起始位置变化（架构分层：从System层接收状态变化通知）
        this.eventBus.on('state:scroll-start-position-changed', () => {
            this._handleStartPositionChange();
        });

        // 监听反向滚动状态变化（架构分层：从System层接收状态变化通知）
        this.eventBus.on('state:scroll-reverse-scroll-changed', () => {
            this._handleReverseScrollChange();
        });

    }

    /**
     * 处理参数验证结果（架构分层：接收System层的验证结果）
     * @param {Object} result - 验证结果 { paramType, newValue, isValid, errors, needsRestore, previousValue }
     * @private
     */
    _handleParameterValidationResult(result) {
        if (!result.isValid && result.needsRestore) {
            // 静默恢复到默认值（不触发验证，避免无限循环）
            this.stateManager.setValue(
                `playback.scroll.${result.paramType}`, 
                result.previousValue,
                { silent: true }
            );
            
            // 发出业务错误事件，由 System 层（BusinessOrchestrationService）决定如何显示
            this.eventBus.emit('scroll:parameter-validation-error', {
                paramType: result.paramType,
                errors: result.errors,
                previousValue: result.previousValue,
                newValue: result.newValue
            });
        }
    }

    /**
     * 处理图片加载状态变化（架构分层：接收System层的状态变化通知）
     * @param {boolean} isLoaded - 图片是否已加载
     * @private
     */
    _handleImageLoadedChange(isLoaded) {
        if (!isLoaded) {
            // 图片卸载时，重置滚动状态
            this.reset();
        }
    }

    /**
     * 处理起始位置变化（架构分层：接收System层的状态变化通知）
     * @private
     */
    _handleStartPositionChange() {
        // 如果正在播放，需要重置到新的起始位置
        const scrollConfig = this.stateManager.state.playback.scroll;
        if (scrollConfig.isPlaying || scrollConfig.isPaused) {
            this.reset();
        }
    }

    /**
     * 处理反向滚动状态变化（架构分层：接收System层的状态变化通知）
     * @private
     */
    _handleReverseScrollChange() {
        // 委托给 PlaybackCoordinatorService 处理
        this.playbackCoordinatorService.handleReverseScrollChange();
    }

}


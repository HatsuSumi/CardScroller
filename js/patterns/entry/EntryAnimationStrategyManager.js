/**
 * EntryAnimationStrategyManager - 入场动画策略管理器
 * 负责入场动画策略的注册、获取和管理，提供策略注册、策略查找、默认策略获取、策略计算调度等功能，作为业务层与策略层之间的桥梁
 * 
 * 当前被使用的模块：
 * - EntryAnimationService (services/business/EntryAnimationService.js) - 入场动画服务，执行入场动画计算（通过DI注入）
 * 
 * 当前依赖的模块：
 * - EntryAnimationStrategy, FadeStrategy, SlideLeftStrategy, SlideRightStrategy, SlideUpStrategy, SlideDownStrategy, ScaleStrategy (patterns/entry/EntryAnimationStrategy.js) - 所有入场动画策略实现
 */
import {
    EntryAnimationStrategy,
    FadeStrategy,
    SlideLeftStrategy,
    SlideRightStrategy,
    SlideUpStrategy,
    SlideDownStrategy,
    ScaleStrategy,
    RotateScaleStrategy,
    ZoomBlurStrategy,
    FlipHorizontalStrategy,
    BounceInStrategy,
    FlipVerticalStrategy,
    SwingStrategy,
    GlitchStrategy,
    WaveRevealStrategy,
    FragmentReassemblyStrategy
} from './EntryAnimationStrategy.js';

/**
 * 入场动画策略管理器类
 */
export class EntryAnimationStrategyManager {
    /**
     * 策略名称常量
     * 所有策略名称的唯一定义源，其他文件应导入此常量而非硬编码字符串
     * 这些名称与 CardAnimationListManager.ANIMATION_TYPES[].value 对应
     */
    static STRATEGY_NAMES = {
        FADE: 'fade',
        SLIDE_LEFT: 'slide-left',
        SLIDE_RIGHT: 'slide-right',
        SLIDE_UP: 'slide-up',
        SLIDE_DOWN: 'slide-down',
        SCALE: 'scale',
        ROTATE_SCALE: 'rotate-scale',
        ZOOM_BLUR: 'zoom-blur',
        FLIP_HORIZONTAL: 'flip-horizontal',
        BOUNCE_IN: 'bounce-in',
        FLIP_VERTICAL: 'flip-vertical',
        SWING: 'swing',
        GLITCH: 'glitch',
        WAVE_REVEAL: 'wave-reveal',
        FRAGMENT_REASSEMBLY: 'fragment-reassembly'
    };

    /**
     * 创建入场动画策略管理器实例
     * 初始化策略存储并注册所有默认入场动画策略（淡入、左滑入、右滑入、上滑入、下滑入、缩放、旋转缩放、模糊缩放、水平翻转、弹跳、垂直翻转、摇摆、故障、波浪揭示、碎片重组）
     */
    constructor() {
        this.strategies = new Map();
        this._registerDefaultStrategies();
    }

    /**
     * 注册入场动画策略
     * @param {string} name - 策略名称
     * @param {EntryAnimationStrategy} strategy - 策略实例
     * @throws {Error} 当 name 不是非空字符串时抛出错误（Fail Fast）
     * @throws {Error} 当 strategy 不是 EntryAnimationStrategy 或其子类的实例时抛出错误（Fail Fast）
     */
    register(name, strategy) {
        // Fail Fast: 验证 name 参数
        if (!name || typeof name !== 'string') {
            throw new Error(`Invalid strategy name: must be a non-empty string, got ${typeof name} (${name})`);
        }
        
        // Fail Fast: 验证 strategy 参数
        if (!(strategy instanceof EntryAnimationStrategy)) {
            throw new Error('Strategy must be an instance of EntryAnimationStrategy or its subclass');
        }
        
        this.strategies.set(name, strategy);
    }

    /**
     * 获取入场动画策略
     * @param {string} name - 策略名称
     * @returns {EntryAnimationStrategy} 策略实例
     * @throws {Error} 当策略不存在时抛出错误，错误消息包含可用策略列表
     */
    getStrategy(name) {
        const strategy = this.strategies.get(name);
        if (!strategy) {
            const availableStrategies = Array.from(this.strategies.keys()).join(', ');
            throw new Error(`Entry animation strategy "${name}" not found. Available strategies: ${availableStrategies}`);
        }
        return strategy;
    }

    /**
     * 执行入场动画变换计算
     * @param {string} strategyName - 策略名称
     * @param {number} progress - 动画进度（0-1）
     * @param {Object} cardInfo - 卡片信息 {x, y, width, height}
     * @param {Object} canvasInfo - Canvas画布信息 {width, height}
     * @returns {Object} 变换参数对象 {x, y, width, height, alpha}
     * @throws {Error} 当策略不存在时抛出错误
     * @throws {Error} 当参数无效时抛出错误（由策略基类验证）
     */
    calculateTransform(strategyName, progress, cardInfo, canvasInfo) {
        const strategy = this.getStrategy(strategyName);
        return strategy.calculateTransform(progress, cardInfo, canvasInfo);
    }

    /**
     * 注册默认入场动画策略
     * @private
     */
    _registerDefaultStrategies() {
        const { 
            FADE, SLIDE_LEFT, SLIDE_RIGHT, SLIDE_UP, SLIDE_DOWN, SCALE,
            ROTATE_SCALE, ZOOM_BLUR, FLIP_HORIZONTAL,
            BOUNCE_IN, FLIP_VERTICAL, SWING,
            GLITCH, WAVE_REVEAL, FRAGMENT_REASSEMBLY
        } = EntryAnimationStrategyManager.STRATEGY_NAMES;
        
        this.register(FADE, new FadeStrategy());
        this.register(SLIDE_LEFT, new SlideLeftStrategy());
        this.register(SLIDE_RIGHT, new SlideRightStrategy());
        this.register(SLIDE_UP, new SlideUpStrategy());
        this.register(SLIDE_DOWN, new SlideDownStrategy());
        this.register(SCALE, new ScaleStrategy());
        this.register(ROTATE_SCALE, new RotateScaleStrategy());
        this.register(ZOOM_BLUR, new ZoomBlurStrategy());
        this.register(FLIP_HORIZONTAL, new FlipHorizontalStrategy());
        this.register(BOUNCE_IN, new BounceInStrategy());
        this.register(FLIP_VERTICAL, new FlipVerticalStrategy());
        this.register(SWING, new SwingStrategy());
        this.register(GLITCH, new GlitchStrategy());
        this.register(WAVE_REVEAL, new WaveRevealStrategy());
        this.register(FRAGMENT_REASSEMBLY, new FragmentReassemblyStrategy());
    }
}


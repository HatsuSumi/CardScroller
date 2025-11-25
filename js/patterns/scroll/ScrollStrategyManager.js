/**
 * ScrollStrategyManager - 滚动策略管理器
 * 负责滚动策略的注册、获取和管理，提供策略注册、策略查找、默认策略获取、策略计算调度等功能，作为业务层与策略层之间的桥梁
 * 
 * 当前被使用的模块：
 * - ScrollAnimationService (services/business/ScrollAnimationService.js) - 滚动动画服务，执行滚动动画计算（通过DI注入）
 * - ValidationService (services/system/ValidationService.js) - 验证服务，验证动画策略名称是否有效（通过DI注入）
 * - ParameterControlUIService (services/ui/ParameterControlUIService.js) - 参数控制UI服务，访问策略名称常量（通过DI注入）
 * 
 * 当前依赖的模块：
 * - ScrollStrategy, LinearScrollStrategy, EaseInScrollStrategy, EaseOutScrollStrategy, EaseInOutScrollStrategy, ElasticScrollStrategy (patterns/scroll/ScrollStrategy.js) - 所有滚动策略实现
 */
import {
    ScrollStrategy,
    LinearScrollStrategy,
    EaseInScrollStrategy,
    EaseOutScrollStrategy,
    EaseInOutScrollStrategy,
    ElasticScrollStrategy
} from './ScrollStrategy.js';

/**
 * 滚动策略管理器类
 */
export class ScrollStrategyManager {
    /**
     * 策略名称常量
     * 所有策略名称的唯一定义源，其他文件应导入此常量而非硬编码字符串
     */
    static STRATEGY_NAMES = {
        LINEAR: 'linear',
        EASE_IN: 'ease-in',
        EASE_OUT: 'ease-out',
        EASE_IN_OUT: 'ease-in-out',
        ELASTIC: 'elastic'
    };

    /**
     * 创建滚动策略管理器实例
     * 初始化策略存储并注册所有默认滚动策略（线性、缓入、缓出、缓入缓出、弹性）
     */
    constructor() {
        this.strategies = new Map();
        this._registerDefaultStrategies();
    }

    /**
     * 注册滚动策略
     * @param {string} name - 策略名称
     * @param {ScrollStrategy} strategy - 策略实例
     * @throws {Error} 当 name 不是非空字符串时抛出错误（Fail Fast）
     * @throws {Error} 当 strategy 不是 ScrollStrategy 或其子类的实例时抛出错误（Fail Fast）
     */
    register(name, strategy) {
        // Fail Fast: 验证 name 参数
        if (!name || typeof name !== 'string') {
            throw new Error(`Invalid strategy name: must be a non-empty string, got ${typeof name} (${name})`);
        }
        
        // Fail Fast: 验证 strategy 参数
        if (!(strategy instanceof ScrollStrategy)) {
            throw new Error('Strategy must be an instance of ScrollStrategy or its subclass');
        }
        
        this.strategies.set(name, strategy);
    }

    /**
     * 获取滚动策略
     * @param {string} name - 策略名称
     * @returns {ScrollStrategy} 策略实例
     * @throws {Error} 当策略不存在时抛出错误，错误消息包含可用策略列表
     */
    getStrategy(name) {
        const strategy = this.strategies.get(name);
        if (!strategy) {
            throw new Error(`Scroll strategy "${name}" not found. Available strategies: ${this.getAvailableStrategies().join(', ')}`);
        }
        return strategy;
    }

    /**
     * 获取所有可用的策略名称
     * @returns {string[]} 策略名称数组
     */
    getAvailableStrategies() {
        return Array.from(this.strategies.keys());
    }

    /**
     * 执行滚动计算
     * @param {string} strategyName - 策略名称
     * @param {number} progress - 进度 (0-1)
     * @param {number} startPos - 起始位置
     * @param {number} endPos - 结束位置
     * @returns {number} 计算后的位置
     * @throws {Error} 当策略不存在时抛出错误
     * @throws {Error} 当参数无效时抛出错误（由策略基类验证）
     */
    calculatePosition(strategyName, progress, startPos, endPos) {
        const strategy = this.getStrategy(strategyName);
        return strategy.calculatePosition(progress, startPos, endPos);
    }

    /**
     * 注册默认滚动策略
     * @private
     */
    _registerDefaultStrategies() {
        const { LINEAR, EASE_IN, EASE_OUT, EASE_IN_OUT, ELASTIC } = ScrollStrategyManager.STRATEGY_NAMES;
        
        this.register(LINEAR, new LinearScrollStrategy());
        this.register(EASE_IN, new EaseInScrollStrategy());
        this.register(EASE_OUT, new EaseOutScrollStrategy());
        this.register(EASE_IN_OUT, new EaseInOutScrollStrategy());
        this.register(ELASTIC, new ElasticScrollStrategy());
    }
}
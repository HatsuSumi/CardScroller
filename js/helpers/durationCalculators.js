/**
 * durationCalculators - 时长计算工具函数
 * 纯函数工具，提供时长相关的计算能力
 * 
 * 当前被使用的模块：
 * - DurationSequenceService (business/DurationSequenceService.js) - 时长序列管理服务
 * - PlaybackCoordinatorService (business/PlaybackCoordinatorService.js) - 播放协调服务
 * - EntryAnimationService (business/EntryAnimationService.js) - 入场动画服务
 * - PerformanceMonitorService (business/PerformanceMonitorService.js) - 性能监控服务
 * - UIStateCoordinator (components/entry-animation/UIStateCoordinator.js) - UI状态协调器
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 */

/**
 * 计算循环的时长（从时长序列中获取）
 * @param {number} loopNumber - 循环次数（从1开始）
 * @param {number} baseDuration - 基础时长（秒）
 * @param {Array<number>} durationSequence - 时长序列数组（可选，默认为空数组）
 * @returns {number} 该次循环的时长（秒）
 * @throws {Error} 当参数无效或循环次数超过序列长度时抛出错误（Fail Fast）
 */
export function calculateLoopDuration(loopNumber, baseDuration, durationSequence = []) {
    // Fail Fast: 验证参数
    if (typeof loopNumber !== 'number' || !Number.isInteger(loopNumber) || loopNumber < 1) {
        throw new Error(`Invalid loopNumber: ${loopNumber}. Must be a positive integer starting from 1.`);
    }
    if (typeof baseDuration !== 'number' || !Number.isFinite(baseDuration) || baseDuration <= 0) {
        throw new Error(`Invalid baseDuration: ${baseDuration}. Must be a positive finite number.`);
    }
    if (!Array.isArray(durationSequence)) {
        throw new Error(`Invalid durationSequence: must be an array.`);
    }
    
    // 如果没有时长序列，使用基础时长
    if (durationSequence.length === 0) {
        return baseDuration;
    }
    
    // 循环次数从1开始，数组索引从0开始
    const index = loopNumber - 1;
    
    // 使用序列中对应的时长
    return durationSequence[index];
}

/**
 * 解析时长序列值（严格验证，Fail Fast）
 * @param {string} value - 输入值（字符串）
 * @param {number} min - 最小有效值（秒）
 * @returns {number} 解析后的值（秒）
 * @throws {Error} 当参数无效或解析失败时抛出错误（Fail Fast）
 */
export function parseDuration(value, min) {
    // Fail Fast: 验证参数
    if (value === null || value === undefined) {
        throw new Error('Invalid value: value cannot be null or undefined');
    }
    if (typeof min !== 'number' || !Number.isFinite(min) || min <= 0) {
        throw new Error(`Invalid min: ${min}. Must be a positive finite number.`);
    }
    
    // Fail Fast: 标准化并验证value
    const strValue = typeof value === 'string' ? value.trim() : String(value);
    
    // Fail Fast: 空值立即抛出错误（与ValidationService保持一致）
    if (strValue === '') {
        throw new Error('Invalid value: value cannot be empty');
    }
    
    const parsed = parseFloat(strValue);
    
    // Fail Fast: 如果解析失败（NaN），立即抛出错误
    if (isNaN(parsed)) {
        throw new Error(`Invalid value: cannot parse "${value}" as a number`);
    }
    
    // Fail Fast: 如果值小于最小值，立即抛出错误
    if (parsed < min) {
        throw new Error(`Invalid value: ${parsed} is less than minimum ${min}`);
    }
    
    return parsed;
}

/**
 * 计算固定开销（入场动画时长 + 入场和滚动之间的间隔）
 * 
 * 用途：从单次循环总时长中减去滚动时长，得到固定开销部分
 * 注意：调用点负责传入当前循环的实际滚动时长
 * 
 * @param {number} singleLoopDuration - 单次循环总时长（包括入场+间隔+滚动）
 * @param {number} scrollDuration - 当前循环的滚动动画时长（秒）
 * @returns {number} 固定开销时长（秒）
 * @throws {Error} 当参数无效时立即抛出错误（Fail Fast）
 */
export function calculateFixedOverhead(singleLoopDuration, scrollDuration) {
    // Fail Fast: 严格验证参数
    if (typeof singleLoopDuration !== 'number' || !Number.isFinite(singleLoopDuration)) {
        throw new Error('calculateFixedOverhead: singleLoopDuration must be a finite number');
    }
    if (typeof scrollDuration !== 'number' || !Number.isFinite(scrollDuration)) {
        throw new Error('calculateFixedOverhead: scrollDuration must be a finite number');
    }
    
    // 计算固定开销（入场动画 + intervalBeforeScroll）
    // 公式：固定开销 = 单次循环总时长 - 滚动时长
    return singleLoopDuration - scrollDuration;
}

/**
 * 计算总已播放时间和总时长
 * 根据是否启用变长时长模式，使用不同的计算策略
 * 
 * @param {number} elapsed - 当前已播放时间 (秒)
 * @param {number} loopCount - 总循环次数（0表示无限循环）
 * @param {number} currentLoop - 当前循环索引（从0开始）
 * @param {boolean} isVariableDuration - 是否启用变长时长模式
 * @param {number[]} durationSequence - 时长序列
 * @param {number} singleDuration - 单次滚动时长（固定模式使用）
 * @param {number} intervalTime - 循环间隔时间（毫秒），用于计算包括间隔的总时长
 * @param {number} fixedOverhead - 每次循环的固定开销（入场动画+intervalBeforeScroll），变长模式使用
 * @returns {{totalElapsed: number, totalDuration: number}} 总已播放时间和总时长（包括间隔）
 * @throws {Error} 如果参数无效或durationSequence不是数组
 */
export function calculateTotalTime(elapsed, loopCount, currentLoop, isVariableDuration, durationSequence, singleDuration, intervalTime, fixedOverhead, completedIntervalsCount) {
    // Fail Fast: 严格验证参数
    if (typeof elapsed !== 'number') {
        throw new Error('calculateTotalTime: elapsed must be a number');
    }
    if (typeof loopCount !== 'number') {
        throw new Error('calculateTotalTime: loopCount must be a number');
    }
    if (typeof currentLoop !== 'number') {
        throw new Error('calculateTotalTime: currentLoop must be a number');
    }
    if (!Array.isArray(durationSequence)) {
        throw new Error('calculateTotalTime: durationSequence must be an array');
    }
    if (typeof singleDuration !== 'number') {
        throw new Error('calculateTotalTime: singleDuration must be a number');
    }
    if (typeof intervalTime !== 'number') {
        throw new Error('calculateTotalTime: intervalTime must be a number');
    }
    if (typeof fixedOverhead !== 'number') {
        throw new Error('calculateTotalTime: fixedOverhead must be a number');
    }
    if (typeof completedIntervalsCount !== 'number') {
        throw new Error('calculateTotalTime: completedIntervalsCount must be a number');
    }
    
    // 策略选择
    if (isVariableDuration && durationSequence.length > 0) {
        return _calculateVariableDurationTime(elapsed, loopCount, currentLoop, durationSequence, fixedOverhead, intervalTime, completedIntervalsCount);
    } else {
        return _calculateFixedDurationTime(elapsed, loopCount, currentLoop, singleDuration, intervalTime, completedIntervalsCount);
    }
}

/**
 * 计算变长时长模式下的总时间
 * @param {number} elapsed - 当前已播放时间 (秒)
 * @param {number} loopCount - 总循环次数（0表示无限循环）
 * @param {number} currentLoop - 当前循环索引（从0开始）
 * @param {number[]} durationSequence - 时长序列（只包含滚动动画时长）
 * @param {number} fixedOverhead - 每次循环的固定开销（入场动画+intervalBeforeScroll），单位：秒
 * @param {number} intervalTime - 循环间隔时间（毫秒）
 * @returns {{totalElapsed: number, totalDuration: number}} 总已播放时间和总时长（包括间隔）
 * @private
 */
function _calculateVariableDurationTime(elapsed, loopCount, currentLoop, durationSequence, fixedOverhead, intervalTime, completedIntervalsCount) {
    // Fail Fast: 验证 durationSequence
    if (durationSequence.length === 0) {
        throw new Error('_calculateVariableDurationTime: durationSequence must not be empty');
    }
    
    // 计算已过总时间：累加之前完成循环的实际时长 + 当前循环已过时间
    let completedLoopsTime = 0;
    for (let i = 0; i < currentLoop; i++) {
        // 每次循环时长 = 固定开销（入场动画+intervalBeforeScroll） + 该循环的滚动时长
        const loopScrollDuration = durationSequence[Math.min(i, durationSequence.length - 1)];
        completedLoopsTime += fixedOverhead + loopScrollDuration;
    }
    // 🐛 Bug修复：使用调用者传入的已完成间隔数，而不是根据currentLoop猜测
    const completedIntervalsTime = completedIntervalsCount * (intervalTime / 1000);
    const totalElapsed = completedLoopsTime + completedIntervalsTime + elapsed;
    
    // 计算总时长
    let totalDuration;
    if (loopCount === 0) {
        // 无限循环：无法计算总时长
        totalDuration = Infinity;
    } else {
        // 有限循环：累加所有序列时长（固定开销 + 滚动时长）
        totalDuration = 0;
        for (let i = 0; i < loopCount; i++) {
            const loopScrollDuration = durationSequence[Math.min(i, durationSequence.length - 1)];
            totalDuration += fixedOverhead + loopScrollDuration;
        }
        
        // 加上所有间隔时间（N次循环有N-1个间隔）
        if (loopCount > 1) {
            totalDuration += (loopCount - 1) * (intervalTime / 1000);
        }
    }
    
    return { totalElapsed, totalDuration };
}

/**
 * 计算固定时长模式下的总时间
 * @param {number} elapsed - 当前已播放时间 (秒)
 * @param {number} loopCount - 总循环次数（0表示无限循环）
 * @param {number} currentLoop - 当前循环索引（从0开始）
 * @param {number} singleDuration - 单次滚动时长
 * @param {number} intervalTime - 循环间隔时间（毫秒）
 * @returns {{totalElapsed: number, totalDuration: number}} 总已播放时间和总时长（包括间隔）
 * @private
 */
function _calculateFixedDurationTime(elapsed, loopCount, currentLoop, singleDuration, intervalTime, completedIntervalsCount) {
    const completedLoopsTime = currentLoop * singleDuration;
    // 🐛 Bug修复：使用调用者传入的已完成间隔数，而不是根据currentLoop猜测
    const completedIntervalsTime = completedIntervalsCount * (intervalTime / 1000);
    const totalElapsed = completedLoopsTime + completedIntervalsTime + elapsed;
    
    
    let totalDuration;
    if (loopCount === 0) {
        totalDuration = Infinity;
    } else {
        totalDuration = loopCount * singleDuration;
        // 加上所有间隔时间（N次循环有N-1个间隔）
        if (loopCount > 1) {
            totalDuration += (loopCount - 1) * (intervalTime / 1000);
        }
    }
    
    return { totalElapsed, totalDuration };
}

/**
 * 计算入场动画总时长
 * 
 * 计算公式（顺序执行）：
 * 总时长 = 所有卡片动画时长 + 所有间隔延迟时长
 * 总时长 = (卡片数 × 单张时长) + ((卡片数 - 1) × 间隔延迟)
 * 
 * @param {number} cardCount - 卡片数量
 * @param {number} duration - 单张卡片动画时长（毫秒）
 * @param {number} staggerDelay - 卡片间隔延迟（毫秒）
 * @returns {number} 入场动画总时长（毫秒）
 * @throws {Error} 当参数无效时立即抛出错误（Fail Fast）
 */
export function calculateEntryAnimationTotalDuration(cardCount, duration, staggerDelay) {
    // Fail Fast: 严格验证参数
    if (typeof cardCount !== 'number' || !Number.isInteger(cardCount) || cardCount < 0) {
        throw new Error(`calculateEntryAnimationTotalDuration: Invalid cardCount "${cardCount}". Must be a non-negative integer.`);
    }
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
        throw new Error(`calculateEntryAnimationTotalDuration: Invalid duration "${duration}". Must be a non-negative finite number.`);
    }
    if (typeof staggerDelay !== 'number' || !Number.isFinite(staggerDelay) || staggerDelay < 0) {
        throw new Error(`calculateEntryAnimationTotalDuration: Invalid staggerDelay "${staggerDelay}". Must be a non-negative finite number.`);
    }
    
    // 如果没有卡片，返回0
    if (cardCount === 0) {
        return 0;
    }
    
    // 计算总时长（顺序执行）：
    // 所有卡片动画时长 + 卡片间的等待时长
    // 动画时长 = cardCount × duration
    // 等待时长 = (cardCount - 1) × staggerDelay
    return (cardCount * duration) + ((cardCount - 1) * staggerDelay);
}

/**
 * 计算单次循环的总时长（包括滚动动画、入场动画、入场和滚动之间的间隔）
 * 
 * 用途：为进度条等UI组件提供单次循环的总时长，包含所有阶段
 * 注意：调用点负责传入当前循环的实际滚动时长（变长模式下已动态计算）
 * 
 * @param {number} scrollDuration - 当前循环的滚动动画时长（秒）
 * @param {Object} entryAnimationConfig - 入场动画配置对象
 * @param {boolean} entryAnimationConfig.enabled - 是否启用入场动画
 * @param {Array<number>} entryAnimationConfig.cardBoundaries - 卡片边界数组
 * @param {number} entryAnimationConfig.duration - 单张卡片动画时长（毫秒）
 * @param {number} entryAnimationConfig.staggerDelay - 卡片间隔延迟（毫秒）
 * @param {number} entryAnimationConfig.intervalBeforeScroll - 入场动画和滚动动画之间的间隔（毫秒）
 * @returns {number} 单次循环总时长（秒）
 * @throws {Error} 当参数无效时立即抛出错误（Fail Fast）
 */
export function calculateSingleLoopDuration(scrollDuration, entryAnimationConfig) {
    // Fail Fast: 严格验证参数
    if (typeof scrollDuration !== 'number' || !Number.isFinite(scrollDuration) || scrollDuration < 0) {
        throw new Error(`calculateSingleLoopDuration: scrollDuration must be a non-negative finite number, got ${scrollDuration}`);
    }
    if (!entryAnimationConfig || typeof entryAnimationConfig !== 'object') {
        throw new Error('calculateSingleLoopDuration: entryAnimationConfig must be an object');
    }
    
    // 直接使用传入的滚动时长（调用点已处理变长模式的动态时长）
    let singleLoopDuration = scrollDuration;
    
    // 如果启用了入场动画，加上入场动画时长和间隔
    if (entryAnimationConfig.enabled) {
        // Fail Fast: 验证入场动画配置
        if (!Array.isArray(entryAnimationConfig.cardBoundaries)) {
            throw new Error('calculateSingleLoopDuration: entryAnimationConfig.cardBoundaries must be an array');
        }
        if (typeof entryAnimationConfig.duration !== 'number') {
            throw new Error('calculateSingleLoopDuration: entryAnimationConfig.duration must be a number');
        }
        if (typeof entryAnimationConfig.staggerDelay !== 'number') {
            throw new Error('calculateSingleLoopDuration: entryAnimationConfig.staggerDelay must be a number');
        }
        if (typeof entryAnimationConfig.intervalBeforeScroll !== 'number') {
            throw new Error('calculateSingleLoopDuration: entryAnimationConfig.intervalBeforeScroll must be a number');
        }
        
        const cardCount = entryAnimationConfig.cardBoundaries.length / 2;
        const entryDuration = calculateEntryAnimationTotalDuration(
            cardCount,
            entryAnimationConfig.duration,
            entryAnimationConfig.staggerDelay
        );
        
        // 加上入场动画时长（转换为秒）
        singleLoopDuration += entryDuration / 1000;
        
        // 加上入场和滚动之间的间隔（转换为秒）
        singleLoopDuration += entryAnimationConfig.intervalBeforeScroll / 1000;
    }
    
    return singleLoopDuration;
}

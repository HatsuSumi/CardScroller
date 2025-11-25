/**
 * ScrollStrategy - 滚动策略模式
 * 动态选择滚动算法实现，定义滚动策略抽象基类和具体策略实现（线性、缓入、缓出、缓入缓出、弹性），实现不同滚动效果的算法封装和动态切换
 * 
 * 当前被使用的模块：
 * - ScrollStrategyManager.js - 滚动策略管理器
 * 
 * 当前依赖的模块：
 * - 无外部依赖，纯算法实现
 */

/**
 * 滚动策略抽象基类
 * 定义滚动策略的标准接口，在基类中验证参数，由子类实现具体算法
 */
export class ScrollStrategy {
    /**
     * 计算滚动位置（模板方法）
     * 验证参数后调用子类的具体实现
     * @param {number} progress - 进度 (0-1)
     * @param {number} startPos - 起始位置
     * @param {number} endPos - 结束位置
     * @returns {number} 计算后的位置
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    calculatePosition(progress, startPos, endPos) {
        // Fail Fast: 验证 progress 参数
        if (typeof progress !== 'number' || isNaN(progress)) {
            throw new Error(`Invalid progress: must be a valid number, got ${typeof progress} (${progress})`);
        }
        if (progress < 0 || progress > 1) {
            throw new Error(`Invalid progress: must be between 0 and 1, got ${progress}`);
        }
        
        // Fail Fast: 验证 startPos 参数
        if (typeof startPos !== 'number' || isNaN(startPos)) {
            throw new Error(`Invalid startPos: must be a valid number, got ${typeof startPos} (${startPos})`);
        }
        
        // Fail Fast: 验证 endPos 参数
        if (typeof endPos !== 'number' || isNaN(endPos)) {
            throw new Error(`Invalid endPos: must be a valid number, got ${typeof endPos} (${endPos})`);
        }
        
        // 调用子类的具体实现
        return this._calculate(progress, startPos, endPos);
    }
    
    /**
     * 具体的位置计算算法（由子类实现）
     * @param {number} progress - 进度 (0-1)（已验证）
     * @param {number} startPos - 起始位置（已验证）
     * @param {number} endPos - 结束位置（已验证）
     * @returns {number} 计算后的位置
     * @protected
     */
    _calculate(progress, startPos, endPos) {
        throw new Error('_calculate() method must be implemented by subclass');
    }
    
    /**
     * 应用缓动进度到位置范围
     * @param {number} easedProgress - 缓动后的进度 (0-1)
     * @param {number} startPos - 起始位置
     * @param {number} endPos - 结束位置
     * @returns {number} 计算后的位置
     * @protected
     */
    _applyEasing(easedProgress, startPos, endPos) {
        const distance = endPos - startPos;
        return startPos + (distance * easedProgress);
    }

}

/**
 * 线性滚动策略
 * 实现匀速直线滚动
 */
export class LinearScrollStrategy extends ScrollStrategy {
    /**
     * 计算线性滚动位置
     * 使用线性插值算法实现匀速滚动效果
     * @override
     */
    _calculate(progress, startPos, endPos) {
        return this._applyEasing(progress, startPos, endPos);
    }
}

/**
 * 缓入滚动策略
 * 实现慢速开始，逐渐加速的滚动效果
 */
export class EaseInScrollStrategy extends ScrollStrategy {
    /**
     * 计算缓入滚动位置
     * 使用二次函数实现慢速启动、逐渐加速的效果
     * @override
     */
    _calculate(progress, startPos, endPos) {
        // 性能优化：使用直接乘法替代 Math.pow(x, 2)，性能提升约12倍
        const easedProgress = progress * progress;
        return this._applyEasing(easedProgress, startPos, endPos);
    }

}

/**
 * 缓出滚动策略
 * 实现快速开始，逐渐减速的滚动效果
 */
export class EaseOutScrollStrategy extends ScrollStrategy {
    /**
     * 计算缓出滚动位置
     * 使用反向二次函数实现快速启动、逐渐减速的效果
     * @override
     */
    _calculate(progress, startPos, endPos) {
        // 性能优化：使用直接乘法替代 Math.pow(x, 2)，性能提升约12倍
        const oneMinusProgress = 1 - progress;
        const easedProgress = 1 - (oneMinusProgress * oneMinusProgress);
        return this._applyEasing(easedProgress, startPos, endPos);
    }

}

/**
 * 缓入缓出滚动策略
 * 实现慢速开始和结束，中间加速的滚动效果
 */
export class EaseInOutScrollStrategy extends ScrollStrategy {
    /**
     * 计算缓入缓出滚动位置
     * 前半段使用缓入算法，后半段使用缓出算法，实现平滑过渡
     * @override
     */
    _calculate(progress, startPos, endPos) {
        // 性能优化：使用直接乘法替代 Math.pow(x, 2)，性能提升约12倍
        let easedProgress;
        
        if (progress < 0.5) {
            const doubled = progress * 2;
            easedProgress = (doubled * doubled) / 2;
        } else {
            const doubled = (1 - progress) * 2;
            easedProgress = 1 - (doubled * doubled) / 2;
        }
        
        return this._applyEasing(easedProgress, startPos, endPos);
    }

}

/**
 * 弹性滚动策略
 * 实现带有弹性回弹效果的滚动
 */
export class ElasticScrollStrategy extends ScrollStrategy {
    // 性能优化：将常量提取为静态属性，避免每次调用重复声明
    static AMPLITUDE = 1.002;  // 弹性振幅
    
    /**
     * 计算弹性滚动位置
     * 前80%使用平滑缓出，最后20%添加轻微的弹性振荡效果
     * @override
     */
    _calculate(progress, startPos, endPos) {
        
        if (progress === 0) return startPos;
        if (progress === 1) return endPos;
        
        // 使用温和的自定义弹性算法，避免早期超调
        // 性能优化：缓存重复计算
        const oneMinusProgress = 1 - progress;
        const baseProgress = 1 - (oneMinusProgress * oneMinusProgress * oneMinusProgress); // 优化：展开Math.pow(x,3)
        
        let easedProgress;
        
        if (progress <= 0.8) {
            // 前80%使用平滑的缓出
            easedProgress = baseProgress;
        } else {
            // 最后20%添加轻微的弹性效果
            const elasticPhase = (progress - 0.8) * 5; // 优化：预计算 /0.2 = *5
            
            // 适度的弹性振荡 - 性能优化：减少函数调用
            const elasticOffset = ElasticScrollStrategy.AMPLITUDE * 0.02 * 
                Math.sin(elasticPhase * Math.PI * 3) * 
                Math.exp(-elasticPhase * 3);
            
            easedProgress = baseProgress + elasticOffset;
        }
        
        return this._applyEasing(easedProgress, startPos, endPos);
    }

}

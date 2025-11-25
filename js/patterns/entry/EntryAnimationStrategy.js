/**
 * EntryAnimationStrategy - 入场动画策略模式
 * 动态选择入场动画算法实现，定义入场动画策略抽象基类和具体策略实现（淡入、滑入、缩放等），实现不同入场效果的算法封装和动态切换
 * 
 * 当前被使用的模块：
 * - EntryAnimationStrategyManager.js - 入场动画策略管理器
 * 
 * 当前依赖的模块：
 * - 无外部依赖，纯算法实现
 */

/**
 * 入场动画策略抽象基类
 * 定义入场动画策略的标准接口，在基类中验证参数，由子类实现具体算法
 */
export class EntryAnimationStrategy {
    /**
     * 计算卡片的变换参数（模板方法）
     * 验证参数后调用子类的具体实现
     * 
     * @param {number} progress - 动画进度（0-1），0表示动画开始，1表示动画结束
     * @param {Object} cardInfo - 卡片信息
     * @param {number} cardInfo.x - 卡片目标X坐标（像素）
     * @param {number} cardInfo.y - 卡片目标Y坐标（像素）
     * @param {number} cardInfo.width - 卡片宽度（像素）
     * @param {number} cardInfo.height - 卡片高度（像素）
     * @param {Object} canvasInfo - Canvas画布信息
     * @param {number} canvasInfo.width - Canvas宽度（像素）
     * @param {number} canvasInfo.height - Canvas高度（像素）
     * @returns {Object} 变换参数对象
     * @returns {number} .x - 当前绘制X坐标（像素）
     * @returns {number} .y - 当前绘制Y坐标（像素）
     * @returns {number} .width - 当前绘制宽度（像素）
     * @returns {number} .height - 当前绘制高度（像素）
     * @returns {number} .alpha - 当前透明度（0-1）
     * @throws {Error} 当参数无效时抛出错误（Fail Fast）
     */
    calculateTransform(progress, cardInfo, canvasInfo) {
        // Fail Fast: 验证 progress 参数
        if (typeof progress !== 'number' || isNaN(progress)) {
            throw new Error(`Invalid progress: must be a valid number, got ${typeof progress} (${progress})`);
        }
        if (progress < 0 || progress > 1) {
            throw new Error(`Invalid progress: must be between 0 and 1, got ${progress}`);
        }
        
        // Fail Fast: 验证 cardInfo 参数
        if (!cardInfo || typeof cardInfo !== 'object') {
            throw new Error(`Invalid cardInfo: must be an object, got ${typeof cardInfo}`);
        }
        if (typeof cardInfo.x !== 'number' || isNaN(cardInfo.x)) {
            throw new Error(`Invalid cardInfo.x: must be a valid number, got ${typeof cardInfo.x} (${cardInfo.x})`);
        }
        if (typeof cardInfo.y !== 'number' || isNaN(cardInfo.y)) {
            throw new Error(`Invalid cardInfo.y: must be a valid number, got ${typeof cardInfo.y} (${cardInfo.y})`);
        }
        if (typeof cardInfo.width !== 'number' || isNaN(cardInfo.width) || cardInfo.width <= 0) {
            throw new Error(`Invalid cardInfo.width: must be a positive number, got ${typeof cardInfo.width} (${cardInfo.width})`);
        }
        if (typeof cardInfo.height !== 'number' || isNaN(cardInfo.height) || cardInfo.height <= 0) {
            throw new Error(`Invalid cardInfo.height: must be a positive number, got ${typeof cardInfo.height} (${cardInfo.height})`);
        }
        
        // Fail Fast: 验证 canvasInfo 参数
        if (!canvasInfo || typeof canvasInfo !== 'object') {
            throw new Error(`Invalid canvasInfo: must be an object, got ${typeof canvasInfo}`);
        }
        if (typeof canvasInfo.width !== 'number' || isNaN(canvasInfo.width) || canvasInfo.width <= 0) {
            throw new Error(`Invalid canvasInfo.width: must be a positive number, got ${typeof canvasInfo.width} (${canvasInfo.width})`);
        }
        if (typeof canvasInfo.height !== 'number' || isNaN(canvasInfo.height) || canvasInfo.height <= 0) {
            throw new Error(`Invalid canvasInfo.height: must be a positive number, got ${typeof canvasInfo.height} (${canvasInfo.height})`);
        }
        
        // 调用子类的具体实现
        return this._calculate(progress, cardInfo, canvasInfo);
    }
    
    /**
     * 具体的变换参数计算算法（由子类实现）
     * @param {number} progress - 动画进度（0-1）（已验证）
     * @param {Object} cardInfo - 卡片信息（已验证）
     * @param {Object} canvasInfo - Canvas画布信息（已验证）
     * @returns {Object} 变换参数对象 {x, y, width, height, alpha}
     * @protected
     */
    _calculate(progress, cardInfo, canvasInfo) {
        throw new Error('_calculate() method must be implemented by subclass');
    }
}

/**
 * 淡入动画策略
 * 实现卡片从透明到不透明的淡入效果，位置和尺寸保持不变
 */
export class FadeStrategy extends EntryAnimationStrategy {
    /**
     * 计算淡入动画变换参数
     * 透明度从0到1线性变化，位置和尺寸保持目标值不变
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        return {
            x: cardInfo.x,
            y: cardInfo.y,
            width: cardInfo.width,
            height: cardInfo.height,
            alpha: progress,  // 0 → 1
            renderMode: 'standard'  // 渲染模式标记
        };
    }
}

/**
 * 左滑入动画策略
 * 实现卡片从Canvas左侧外滑入到目标位置的效果
 */
export class SlideLeftStrategy extends EntryAnimationStrategy {
    /**
     * 计算左滑入动画变换参数
     * 卡片从Canvas左侧外（x = -cardWidth）滑入到目标X坐标
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 起始位置：Canvas左侧外
        const startX = -cardInfo.width;
        // 结束位置：目标X坐标
        const endX = cardInfo.x;
        // 当前X坐标：线性插值
        const currentX = startX + (endX - startX) * progress;
        
        return {
            x: currentX,
            y: cardInfo.y,
            width: cardInfo.width,
            height: cardInfo.height,
            alpha: 1,
            renderMode: 'standard'
        };
    }
}

/**
 * 右滑入动画策略
 * 实现卡片从Canvas右侧外滑入到目标位置的效果
 */
export class SlideRightStrategy extends EntryAnimationStrategy {
    /**
     * 计算右滑入动画变换参数
     * 卡片从Canvas右侧外（x = canvasWidth）滑入到目标X坐标
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 起始位置：Canvas右侧外
        const startX = canvasInfo.width;
        // 结束位置：目标X坐标
        const endX = cardInfo.x;
        // 当前X坐标：线性插值
        const currentX = startX + (endX - startX) * progress;
        
        return {
            x: currentX,
            y: cardInfo.y,
            width: cardInfo.width,
            height: cardInfo.height,
            alpha: 1,
            renderMode: 'standard'
        };
    }
}

/**
 * 上滑入动画策略
 * 实现卡片从Canvas上方滑入到目标位置的效果
 */
export class SlideUpStrategy extends EntryAnimationStrategy {
    /**
     * 计算上滑入动画变换参数
     * 卡片从Canvas上方（y = -cardHeight）滑入到目标Y坐标
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 起始位置：Canvas上方
        const startY = -cardInfo.height;
        // 结束位置：目标Y坐标
        const endY = cardInfo.y;
        // 当前Y坐标：线性插值
        const currentY = startY + (endY - startY) * progress;
        
        return {
            x: cardInfo.x,
            y: currentY,
            width: cardInfo.width,
            height: cardInfo.height,
            alpha: 1,
            renderMode: 'standard'
        };
    }
}

/**
 * 下滑入动画策略
 * 实现卡片从Canvas下方滑入到目标位置的效果
 */
export class SlideDownStrategy extends EntryAnimationStrategy {
    /**
     * 计算下滑入动画变换参数
     * 卡片从Canvas下方（y = canvasHeight）滑入到目标Y坐标
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 起始位置：Canvas下方
        const startY = canvasInfo.height;
        // 结束位置：目标Y坐标
        const endY = cardInfo.y;
        // 当前Y坐标：线性插值
        const currentY = startY + (endY - startY) * progress;
        
        return {
            x: cardInfo.x,
            y: currentY,
            width: cardInfo.width,
            height: cardInfo.height,
            alpha: 1,
            renderMode: 'standard'
        };
    }
}

/**
 * 缩放动画策略
 * 实现卡片从0缩放到100%的效果，同时从透明到不透明
 */
export class ScaleStrategy extends EntryAnimationStrategy {
    /**
     * 计算缩放动画变换参数
     * 尺寸从0到目标尺寸线性变化，透明度从0到1线性变化
     * 位置保持在卡片中心点不变（通过调整x, y坐标）
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 当前缩放比例（最小1%，避免0尺寸导致渲染错误）
        const currentScale = Math.max(0.01, progress);
        
        // 当前尺寸
        const currentWidth = cardInfo.width * currentScale;
        const currentHeight = cardInfo.height * currentScale;
        
        // 调整位置使卡片中心点保持不变
        // 目标中心点：(cardInfo.x + cardInfo.width / 2, cardInfo.y + cardInfo.height / 2)
        // 当前左上角 = 中心点 - 当前尺寸的一半
        const currentX = cardInfo.x + (cardInfo.width - currentWidth) / 2;
        const currentY = cardInfo.y + (cardInfo.height - currentHeight) / 2;
        
        return {
            x: currentX,
            y: currentY,
            width: currentWidth,
            height: currentHeight,
            alpha: progress,  // 0 → 1
            renderMode: 'standard'
        };
    }
}

/**
 * 旋转缩放动画策略
 * 实现卡片从0缩放到100%同时旋转360度的效果，非常炫酷
 */
export class RotateScaleStrategy extends EntryAnimationStrategy {
    /**
     * 计算旋转缩放动画变换参数
     * 旋转从360度到0度，尺寸从0到目标尺寸，透明度从0到1
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 当前缩放比例（最小1%，避免0尺寸导致渲染错误）
        const currentScale = Math.max(0.01, progress);
        
        // 旋转角度（从360度旋转到0度）
        const rotation = (1 - progress) * 360;
        
        // 当前尺寸
        const currentWidth = cardInfo.width * currentScale;
        const currentHeight = cardInfo.height * currentScale;
        
        // 调整位置使卡片中心点保持不变
        const currentX = cardInfo.x + (cardInfo.width - currentWidth) / 2;
        const currentY = cardInfo.y + (cardInfo.height - currentHeight) / 2;
        
        return {
            x: currentX,
            y: currentY,
            width: currentWidth,
            height: currentHeight,
            alpha: progress,  // 0 → 1
            rotation: rotation,  // 360 → 0
            renderMode: 'standard'
        };
    }
}

/**
 * 模糊缩放动画策略
 * 实现卡片从小且模糊到大且清晰的效果，像镜头聚焦一样
 */
export class ZoomBlurStrategy extends EntryAnimationStrategy {
    /**
     * 计算模糊缩放动画变换参数
     * 从50%尺寸+模糊放大到100%尺寸+清晰
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 缩放从0.5到1（从50%到100%）
        const currentScale = 0.5 + (0.5 * progress);
        
        // 模糊从20px到0px
        const blur = (1 - progress) * 20;
        
        // 当前尺寸
        const currentWidth = cardInfo.width * currentScale;
        const currentHeight = cardInfo.height * currentScale;
        
        // 调整位置使卡片中心点保持不变
        const currentX = cardInfo.x + (cardInfo.width - currentWidth) / 2;
        const currentY = cardInfo.y + (cardInfo.height - currentHeight) / 2;
        
        return {
            x: currentX,
            y: currentY,
            width: currentWidth,
            height: currentHeight,
            alpha: progress,  // 0 → 1
            blur: blur,  // 20 → 0
            renderMode: 'standard'
        };
    }
}

/**
 * 水平翻转动画策略
 * 实现3D翻转效果，卡片沿Y轴从180度翻转到0度
 */
export class FlipHorizontalStrategy extends EntryAnimationStrategy {
    /**
     * 计算水平翻转动画变换参数
     * 通过调整宽度模拟3D翻转效果
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 翻转角度（从180度翻到0度）
        const angle = (1 - progress) * 180;
        
        // 使用cos函数计算宽度缩放（模拟3D透视）
        const scaleX = Math.abs(Math.cos(angle * Math.PI / 180));
        
        // 当前宽度
        const currentWidth = cardInfo.width * scaleX;
        
        // 调整X位置使卡片水平居中
        const currentX = cardInfo.x + (cardInfo.width - currentWidth) / 2;
        
        return {
            x: currentX,
            y: cardInfo.y,
            width: currentWidth,
            height: cardInfo.height,
            alpha: progress,  // 0 → 1
            renderMode: 'standard'
        };
    }
}

/**
 * 弹跳入场动画策略
 * 实现卡片从上方弹跳落下的效果，有真实的回弹物理感
 */
export class BounceInStrategy extends EntryAnimationStrategy {
    /**
     * 计算弹跳入场动画变换参数
     * 使用 easeOutBounce 缓动函数模拟真实的弹跳效果
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 应用 easeOutBounce 缓动函数
        const bounceProgress = this._easeOutBounce(progress);
        
        // 从Canvas上方落下（距离为Canvas高度）
        const offsetY = (1 - bounceProgress) * -canvasInfo.height;
        
        return {
            x: cardInfo.x,
            y: cardInfo.y + offsetY,
            width: cardInfo.width,
            height: cardInfo.height,
            alpha: 1,  // 不透明，只有位移
            renderMode: 'standard'
        };
    }
    
    /**
     * easeOutBounce 缓动函数
     * 模拟真实的弹跳物理效果（回弹逐渐衰减）
     * @param {number} t - 进度（0-1）
     * @returns {number} 缓动后的进度
     * @private
     */
    _easeOutBounce(t) {
        if (t < 1 / 2.75) {
            return 7.5625 * t * t;
        } else if (t < 2 / 2.75) {
            return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        } else if (t < 2.5 / 2.75) {
            return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        } else {
            return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
        }
    }
}

/**
 * 垂直翻转动画策略
 * 实现3D翻转效果，卡片沿X轴从上往下翻转
 */
export class FlipVerticalStrategy extends EntryAnimationStrategy {
    /**
     * 计算垂直翻转动画变换参数
     * 通过调整高度模拟3D翻转效果
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 翻转角度（从180度翻到0度）
        const angle = (1 - progress) * 180;
        
        // 使用cos函数计算高度缩放（模拟3D透视）
        const scaleY = Math.abs(Math.cos(angle * Math.PI / 180));
        
        // 当前高度
        const currentHeight = cardInfo.height * scaleY;
        
        // 调整Y位置使卡片垂直居中
        const currentY = cardInfo.y + (cardInfo.height - currentHeight) / 2;
        
        return {
            x: cardInfo.x,
            y: currentY,
            width: cardInfo.width,
            height: currentHeight,
            alpha: progress,  // 0 → 1
            renderMode: 'standard'
        };
    }
}

/**
 * 摇摆入场动画策略
 * 实现卡片像钟摆一样摇摆进入的效果
 */
export class SwingStrategy extends EntryAnimationStrategy {
    /**
     * 计算摇摆入场动画变换参数
     * 旋转角度按正弦波衰减（-15° → +15° → -10° → +10° → 0°）
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 摇摆次数（2次完整摇摆）
        const swingCount = 2;
        
        // 正弦波摇摆，振幅随进度衰减
        const angle = Math.sin(progress * Math.PI * swingCount) * 15 * (1 - progress);
        
        return {
            x: cardInfo.x,
            y: cardInfo.y,
            width: cardInfo.width,
            height: cardInfo.height,
            alpha: progress,  // 0 → 1
            rotation: angle,  // 摇摆角度
            renderMode: 'standard'
        };
    }
}

/**
 * 故障效果入场动画策略
 * 实现数字故障风格，RGB通道分离 + 随机切片错位
 */
export class GlitchStrategy extends EntryAnimationStrategy {
    /**
     * 计算故障效果入场动画变换参数
     * 故障强度随进度递减，最终恢复正常
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 故障强度（从1递减到0）
        const glitchIntensity = 1 - progress;
        
        return {
            x: cardInfo.x,
            y: cardInfo.y,
            width: cardInfo.width,
            height: cardInfo.height,
            alpha: 1,  // 完全不透明
            renderMode: 'glitch',  // 故障渲染模式
            renderParams: {
                intensity: glitchIntensity  // 传递给 CanvasRenderService._drawImageGlitch
            }
        };
    }
}

/**
 * 波浪揭示入场动画策略
 * 实现像窗帘一样从左侧波浪式展开的效果
 */
export class WaveRevealStrategy extends EntryAnimationStrategy {
    /**
     * 计算波浪揭示入场动画变换参数
     * 使用裁剪路径逐渐揭示卡片，方向根据滚动方向决定
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // Fail Fast: 验证 reverseScroll 参数
        if (typeof canvasInfo.reverseScroll !== 'boolean') {
            throw new Error(`WaveRevealStrategy: canvasInfo.reverseScroll must be a boolean, got ${typeof canvasInfo.reverseScroll}`);
        }
        
        return {
            x: cardInfo.x,
            y: cardInfo.y,
            width: cardInfo.width,
            height: cardInfo.height,
            alpha: 1,  // 完全不透明
            renderMode: 'wave-clip',  // 波浪裁剪渲染模式
            renderParams: {
                progress: progress,  // 揭示进度（0 → 1）
                amplitude: 20,  // 波浪振幅（px）
                frequency: 3,  // 波浪频率（周期数）
                reverseDirection: canvasInfo.reverseScroll  // 反向滚动时从右到左揭示
            }
        };
    }
}

/**
 * 碎片重组入场动画策略
 * 实现卡片分割成多个碎片，从视口右侧飞入重组的真实碎片效果
 */
export class FragmentReassemblyStrategy extends EntryAnimationStrategy {
    /**
     * 计算碎片重组入场动画变换参数
     * 返回动画逻辑参数，渲染实现由 CanvasRenderService 负责
     * @override
     */
    _calculate(progress, cardInfo, canvasInfo) {
        // 🎯 动画完成后，直接切换到标准渲染（绘制完整卡片，避免碎片拼接的精度问题）
        if (progress >= 1) {
            return {
                x: cardInfo.x,
                y: cardInfo.y,
                width: cardInfo.width,
                height: cardInfo.height,
                alpha: 1,
                renderMode: 'standard'  // 标准渲染，无碎片
            };
        }
        
        // Fail Fast: 验证 reverseScroll 参数
        if (typeof canvasInfo.reverseScroll !== 'boolean') {
            throw new Error(`FragmentReassemblyStrategy: canvasInfo.reverseScroll must be a boolean, got ${typeof canvasInfo.reverseScroll}`);
        }
        
        return {
            x: cardInfo.x,
            y: cardInfo.y,
            width: cardInfo.width,
            height: cardInfo.height,
            alpha: 1,
            renderMode: 'fragments',  // 碎片渲染模式
            renderParams: {
                progress: progress,  // 动画进度（0 → 1）
                gridRows: 6,  // 碎片网格行数
                gridCols: 8,  // 碎片网格列数
                reverseScroll: canvasInfo.reverseScroll,  // 滚动方向
                canvasWidth: canvasInfo.width  // Canvas宽度（用于计算飞入起点）
            }
        };
    }
}


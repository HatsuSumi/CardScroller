/**
 * colorAnalyzer - 颜色分析工具函数
 * 纯函数工具，提供颜色亮度计算、对比度判断等分析能力
 * 
 * 当前被使用的模块：
 * - TooltipService (services/system/TooltipService.js) - 判断背景亮度以选择合适的文字颜色
 * 
 * 当前依赖的模块：
 * - hexToRgb (helpers/colorConverter.js) - Hex转RGB工具函数
 */

import { hexToRgb } from './colorConverter.js';

/**
 * 判断颜色是否为浅色（使用YIQ亮度算法）
 * 支持单个十六进制颜色或CSS渐变字符串（提取第一个颜色）
 * 
 * @param {string} color - 颜色字符串，可以是 "#RRGGBB" 或 "linear-gradient(...)"
 * @param {number} threshold - 亮度阈值 (0-255)，默认155。亮度超过此值认为是浅色
 * @returns {boolean} true表示浅色，false表示深色
 * @throws {Error} 当无法解析颜色时抛出错误（Fail Fast）
 * 
 * @example
 * isLightColor("#FFFFFF") // 返回 true (白色是浅色)
 * isLightColor("#000000") // 返回 false (黑色是深色)
 * isLightColor("linear-gradient(135deg, #ffc107 0%, #ff6f00 100%)") // 返回 true (提取#ffc107判断)
 * isLightColor("#808080", 128) // 使用自定义阈值判断灰色
 */
export function isLightColor(color, threshold = 155) {
    // Fail Fast: 验证参数类型
    if (typeof color !== 'string') {
        throw new Error('isLightColor: color must be a string');
    }
    if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
        throw new Error('isLightColor: threshold must be a finite number');
    }
    if (threshold < 0 || threshold > 255) {
        throw new Error('isLightColor: threshold must be in range [0, 255]');
    }

    // 提取颜色字符串中的第一个十六进制颜色（支持渐变）
    const match = color.match(/#([0-9a-fA-F]{6})/);
    if (!match) {
        throw new Error(`isLightColor: cannot parse color from "${color}"`);
    }

    // 使用统一的颜色转换工具函数
    const { r, g, b } = hexToRgb('#' + match[1]);

    // 计算相对亮度（YIQ算法）
    // YIQ是美国电视标准使用的颜色空间，其中Y代表亮度
    // 公式：Y = 0.299*R + 0.587*G + 0.114*B
    // 这个权重反映了人眼对不同颜色的敏感度（绿色>红色>蓝色）
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    return brightness > threshold;
}


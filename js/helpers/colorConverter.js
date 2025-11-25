/**
 * colorConverter - 颜色转换工具函数
 * 纯函数工具，提供HSV、RGB、Hex之间的颜色转换能力
 * 
 * 当前被使用的模块：
 * - ColorPicker (components/ColorPicker.js) - 颜色选择器组件
 * - colorAnalyzer (helpers/colorAnalyzer.js) - 颜色分析工具，使用hexToRgb转换颜色
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 */

/**
 * HSV转RGB
 * 
 * @param {number} h - 色相 (0-360)
 * @param {number} s - 饱和度 (0-100)
 * @param {number} v - 明度 (0-100)
 * @returns {{r: number, g: number, b: number}} RGB对象，每个值范围0-255
 * @throws {Error} 当参数不是有效数字或超出范围时抛出错误（Fail Fast）
 * 
 * @example
 * hsvToRgb(0, 100, 100) // 返回 {r: 255, g: 0, b: 0} (红色)
 * hsvToRgb(120, 100, 100) // 返回 {r: 0, g: 255, b: 0} (绿色)
 */
export function hsvToRgb(h, s, v) {
    // Fail Fast: 验证参数类型
    if (typeof h !== 'number' || typeof s !== 'number' || typeof v !== 'number') {
        throw new Error('hsvToRgb: h, s, v must be numbers');
    }
    if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(v)) {
        throw new Error('hsvToRgb: h, s, v must be finite numbers');
    }
    
    // Fail Fast: 验证参数范围
    if (h < 0 || h > 360) {
        throw new Error('hsvToRgb: h must be in range [0, 360]');
    }
    if (s < 0 || s > 100) {
        throw new Error('hsvToRgb: s must be in range [0, 100]');
    }
    if (v < 0 || v > 100) {
        throw new Error('hsvToRgb: v must be in range [0, 100]');
    }
    
    // 转换为0-1范围
    s = s / 100;
    v = v / 100;
    
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    
    let r = 0, g = 0, b = 0;
    
    if (h >= 0 && h < 60) {
        r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
        r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
        r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
        r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
        r = x; g = 0; b = c;
    } else if (h >= 300 && h <= 360) {
        r = c; g = 0; b = x;
    }
    
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

/**
 * RGB转Hex
 * 
 * @param {number} r - 红色 (0-255)
 * @param {number} g - 绿色 (0-255)
 * @param {number} b - 蓝色 (0-255)
 * @returns {string} Hex颜色字符串，格式为 #RRGGBB（大写）
 * @throws {Error} 当参数不是有效数字或超出范围时抛出错误（Fail Fast）
 * 
 * @example
 * rgbToHex(255, 0, 0) // 返回 "#FF0000"
 * rgbToHex(0, 255, 0) // 返回 "#00FF00"
 */
export function rgbToHex(r, g, b) {
    // Fail Fast: 验证参数类型
    if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') {
        throw new Error('rgbToHex: r, g, b must be numbers');
    }
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        throw new Error('rgbToHex: r, g, b must be finite numbers');
    }
    
    // Fail Fast: 验证参数范围
    if (r < 0 || r > 255) {
        throw new Error('rgbToHex: r must be in range [0, 255]');
    }
    if (g < 0 || g > 255) {
        throw new Error('rgbToHex: g must be in range [0, 255]');
    }
    if (b < 0 || b > 255) {
        throw new Error('rgbToHex: b must be in range [0, 255]');
    }
    
    const toHex = (value) => {
        const hex = Math.round(value).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Hex转RGB
 * 
 * @param {string} hex - Hex颜色字符串，格式为 #RGB 或 #RRGGBB
 * @returns {{r: number, g: number, b: number}} RGB对象，每个值范围0-255
 * @throws {Error} 当参数不是有效的Hex格式时抛出错误（Fail Fast）
 * 
 * @example
 * hexToRgb("#FF0000") // 返回 {r: 255, g: 0, b: 0}
 * hexToRgb("#0F0") // 返回 {r: 0, g: 255, b: 0}
 */
export function hexToRgb(hex) {
    // Fail Fast: 验证参数类型
    if (typeof hex !== 'string') {
        throw new Error('hexToRgb: hex must be a string');
    }
    
    // 移除开头的 #
    hex = hex.replace(/^#/, '');
    
    // Fail Fast: 验证格式
    if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex)) {
        throw new Error('hexToRgb: hex must be in format #RGB or #RRGGBB');
    }
    
    // 处理3位格式（如 #F00 -> #FF0000）
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return { r, g, b };
}

/**
 * RGB转HSV
 * 
 * @param {number} r - 红色 (0-255)
 * @param {number} g - 绿色 (0-255)
 * @param {number} b - 蓝色 (0-255)
 * @returns {{h: number, s: number, v: number}} HSV对象，h范围0-360，s和v范围0-100
 * @throws {Error} 当参数不是有效数字或超出范围时抛出错误（Fail Fast）
 * 
 * @example
 * rgbToHsv(255, 0, 0) // 返回 {h: 0, s: 100, v: 100} (红色)
 */
export function rgbToHsv(r, g, b) {
    // Fail Fast: 验证参数类型
    if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') {
        throw new Error('rgbToHsv: r, g, b must be numbers');
    }
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        throw new Error('rgbToHsv: r, g, b must be finite numbers');
    }
    
    // Fail Fast: 验证参数范围
    if (r < 0 || r > 255) {
        throw new Error('rgbToHsv: r must be in range [0, 255]');
    }
    if (g < 0 || g > 255) {
        throw new Error('rgbToHsv: g must be in range [0, 255]');
    }
    if (b < 0 || b > 255) {
        throw new Error('rgbToHsv: b must be in range [0, 255]');
    }
    
    // 转换为0-1范围
    r = r / 255;
    g = g / 255;
    b = b / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    let h = 0;
    let s = max === 0 ? 0 : delta / max;
    let v = max;
    
    if (delta !== 0) {
        if (max === r) {
            h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        } else if (max === g) {
            h = ((b - r) / delta + 2) / 6;
        } else {
            h = ((r - g) / delta + 4) / 6;
        }
    }
    
    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        v: Math.round(v * 100)
    };
}

/**
 * Hex转HSV
 * 
 * @param {string} hex - Hex颜色字符串，格式为 #RGB 或 #RRGGBB
 * @returns {{h: number, s: number, v: number}} HSV对象，h范围0-360，s和v范围0-100
 * @throws {Error} 当参数不是有效的Hex格式时抛出错误（Fail Fast）
 * 
 * @example
 * hexToHsv("#FF0000") // 返回 {h: 0, s: 100, v: 100}
 */
export function hexToHsv(hex) {
    const rgb = hexToRgb(hex);
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
}


/**
 * timeFormatters - 时间/时长格式化工具函数
 * 纯函数工具，提供时间相关的格式化能力
 * 
 * 当前被使用的模块：
 * - ProgressBarService (ui/ProgressBarService.js) - 格式化进度条显示的播放时长
 * - PerformanceReportRenderer (components/performance/PerformanceReportRenderer.js) - 格式化性能报告中的毫秒时长
 * - UIStateCoordinator (components/entry-animation/UIStateCoordinator.js) - 格式化入场动画总时长显示
 * - PerformanceMonitorService (business/PerformanceMonitorService.js) - 生成性能报告时间戳
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 */

/**
 * 格式化时长（秒）为 mm:ss.SS 格式（2位小数）
 * 用于播放进度显示
 * 
 * @param {number} seconds - 时长（秒）
 * @returns {string} 格式化的时间字符串 (mm:ss.SS)，例如 "02:30.50" 表示2分30.5秒
 * @throws {Error} 当参数不是有效数字时抛出错误（Fail Fast）
 * 
 * @example
 * formatDuration(150.5) // 返回 "02:30.50"
 * formatDuration(65.123)  // 返回 "01:05.12"
 * formatDuration(0)   // 返回 "00:00.00"
 */
export function formatDuration(seconds) {
    // Fail Fast: 验证参数
    if (typeof seconds !== 'number') {
        throw new Error('formatDuration: seconds must be a number');
    }
    if (!Number.isFinite(seconds)) {
        throw new Error('formatDuration: seconds must be a finite number');
    }
    if (seconds < 0) {
        throw new Error('formatDuration: seconds must be non-negative');
    }
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const centisecs = Math.floor((seconds % 1) * 100); // 2位小数
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centisecs.toString().padStart(2, '0')}`;
}

/**
 * 格式化时长（秒）为 mm:ss.sss 格式（高精度）
 * 用于总时长显示（包括循环间隔）
 * 
 * @param {number} seconds - 时长（秒）
 * @returns {string} 格式化的时间字符串 (mm:ss.sss)，例如 "02:30.500" 表示2分30.5秒
 * @throws {Error} 当参数不是有效数字时抛出错误（Fail Fast）
 * 
 * @example
 * formatDurationPrecise(150.5) // 返回 "02:30.500"
 * formatDurationPrecise(65.123)  // 返回 "01:05.123"
 * formatDurationPrecise(0)   // 返回 "00:00.000"
 */
export function formatDurationPrecise(seconds) {
    // Fail Fast: 验证参数
    if (typeof seconds !== 'number') {
        throw new Error('formatDurationPrecise: seconds must be a number');
    }
    if (!Number.isFinite(seconds)) {
        throw new Error('formatDurationPrecise: seconds must be a finite number');
    }
    if (seconds < 0) {
        throw new Error('formatDurationPrecise: seconds must be non-negative');
    }
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const millisecs = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millisecs.toString().padStart(3, '0')}`;
}

/**
 * 格式化毫秒为秒（1位小数）
 * 用于循环间隔倒计时显示
 * 
 * @param {number} milliseconds - 毫秒数
 * @returns {string} 格式化的秒数字符串（1位小数），例如 "3.5"
 * @throws {Error} 当参数不是有效数字时抛出错误（Fail Fast）
 * 
 * @example
 * formatMillisecondsToSeconds(3500) // 返回 "3.5"
 * formatMillisecondsToSeconds(1200) // 返回 "1.2"
 * formatMillisecondsToSeconds(800)  // 返回 "0.8"
 */
export function formatMillisecondsToSeconds(milliseconds) {
    // Fail Fast: 验证参数
    if (typeof milliseconds !== 'number') {
        throw new Error('formatMillisecondsToSeconds: milliseconds must be a number');
    }
    if (!Number.isFinite(milliseconds)) {
        throw new Error('formatMillisecondsToSeconds: milliseconds must be a finite number');
    }
    if (milliseconds < 0) {
        throw new Error('formatMillisecondsToSeconds: milliseconds must be non-negative');
    }
    
    return (milliseconds / 1000).toFixed(1);
}

/**
 * 格式化毫秒为友好的时长字符串
 * 根据时长自动选择合适的单位（毫秒或秒）
 * 
 * @param {number} milliseconds - 毫秒数
 * @returns {string} 格式化的时长字符串，例如 "1.50 秒" 或 "500 毫秒"
 * @throws {Error} 当参数不是有效数字时抛出错误（Fail Fast）
 * 
 * @example
 * formatMilliseconds(1500) // 返回 "1.50 秒"
 * formatMilliseconds(500)  // 返回 "500 毫秒"
 * formatMilliseconds(0)    // 返回 "0 毫秒"
 */
export function formatMilliseconds(milliseconds) {
    // Fail Fast: 验证参数
    if (typeof milliseconds !== 'number') {
        throw new Error('formatMilliseconds: milliseconds must be a number');
    }
    if (!Number.isFinite(milliseconds)) {
        throw new Error('formatMilliseconds: milliseconds must be a finite number');
    }
    if (milliseconds < 0) {
        throw new Error('formatMilliseconds: milliseconds must be non-negative');
    }
    
    // 如果 >= 1000ms，显示为秒（保留2位小数）
    if (milliseconds >= 1000) {
        const seconds = (milliseconds / 1000).toFixed(2);
        return `${seconds} 秒`;
    } else {
        // 否则显示为毫秒（保留2位小数，避免浮点精度问题）
        return `${milliseconds.toFixed(2)} 毫秒`;
    }
}

/**
 * 生成当前时间戳字符串
 * 格式：YYYY-MM-DD HH:MM:SS
 * 用于性能报告、日志记录等需要记录时间点的场景
 * 
 * @returns {string} 格式化的时间戳字符串
 * @throws {Error} 无异常（Date构造函数总是成功）
 * 
 * @example
 * generateTimestamp(); // "2025-01-24 15:30:45"
 */
export function generateTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
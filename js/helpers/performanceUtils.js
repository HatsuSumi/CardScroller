/**
 * performanceUtils - 性能监控工具函数
 * 提供性能监控相关的专用工具函数，包括刷新率估算、FPS计算、性能等级评估、设备信息获取等
 * 
 * 当前被使用的模块：
 * - PerformanceMonitorService (business/PerformanceMonitorService.js) - 使用理论FPS、实际FPS计算
 * - ScrollAnimationService (business/ScrollAnimationService.js) - 使用理论FPS、实际FPS计算（实时FPS刷新率钳制）
 * - EntryAnimationService (business/EntryAnimationService.js) - 使用理论FPS、实际FPS计算（实时FPS刷新率钳制）
 * - PerformanceReportPage (ui/PerformanceReportPage.js) - 使用刷新率估算
 * - DeviceInfoPanel (components/performance/DeviceInfoPanel.js) - 使用设备信息获取
 * - PerformanceReportRenderer (components/performance/PerformanceReportRenderer.js) - 使用FPS格式化、性能等级评估
 * - RealtimeFPSMonitor (components/performance/RealtimeFPSMonitor.js) - 使用FPS格式化和性能等级评估
 * - PerformanceVisualizationPanel (components/performance/PerformanceVisualizationPanel.js) - 使用稳定性评级
 * 
 * 当前依赖的模块：
 * - 无（纯函数，无外部依赖）
 */

/**
 * 估算屏幕刷新率（Hz）
 * 使用 requestAnimationFrame 测量帧间隔来估算刷新率，然后映射到最接近的常见刷新率值
 * 
 * @returns {Promise<number>} 估算的刷新率（Hz），常见值为 60/120/144/240 等
 * @throws {Error} 当RAF不可用时抛出错误（Fail Fast）
 * 
 * @example
 * const refreshRate = await estimateRefreshRate(); // 60
 */
export function estimateRefreshRate() {
    // Fail Fast: 检查RAF是否可用
    if (typeof requestAnimationFrame !== 'function') {
        throw new Error('performanceUtils.estimateRefreshRate: requestAnimationFrame is not supported');
    }
    
    return new Promise((resolve) => {
        const samples = [];
        const sampleCount = 60; // 采样60帧
        let lastTimestamp = null;

        function measure(timestamp) {
            if (lastTimestamp !== null) {
                const delta = timestamp - lastTimestamp;
                samples.push(delta);
            }
            lastTimestamp = timestamp;

            if (samples.length < sampleCount) {
                requestAnimationFrame(measure);
            } else {
                // 计算平均帧间隔（毫秒）
                const avgDelta = samples.reduce((sum, val) => sum + val, 0) / samples.length;
                
                // 转换为刷新率（Hz）
                const estimatedRate = 1000 / avgDelta;
                
                // 四舍五入到最接近的常见刷新率
                const commonRates = [30, 60, 75, 90, 120, 144, 165, 240, 360];
                const closestRate = commonRates.reduce((prev, curr) => {
                    return Math.abs(curr - estimatedRate) < Math.abs(prev - estimatedRate) ? curr : prev;
                });

                resolve(closestRate);
            }
        }

        requestAnimationFrame(measure);
    });
}

/**
 * 计算理论FPS（基于帧耗时）
 * 理论FPS = 1000ms / 帧耗时（ms），不受屏幕刷新率限制
 * 
 * @param {number} frameTime - 单帧耗时（毫秒）
 * @returns {number} 理论FPS
 * @throws {Error} 当frameTime不是有效数字时抛出错误（Fail Fast）
 * 
 * @example
 * calculateTheoreticalFPS(16.67); // ~60 FPS
 * calculateTheoreticalFPS(0); // Infinity
 */
export function calculateTheoreticalFPS(frameTime) {
    // Fail Fast: 验证参数
    if (typeof frameTime !== 'number' || !Number.isFinite(frameTime) || frameTime < 0) {
        throw new Error(`performanceUtils.calculateTheoreticalFPS: frameTime must be a non-negative finite number, got ${frameTime}`);
    }
    
    if (frameTime === 0) {
        return Infinity;
    }
    return 1000 / frameTime;
}

/**
 * 计算实际FPS（受刷新率限制）
 * 实际FPS = min(理论FPS, 刷新率)，因为浏览器无法超过屏幕刷新率
 * 
 * @param {number} theoreticalFPS - 理论FPS
 * @param {number} refreshRate - 屏幕刷新率（Hz）
 * @returns {number} 实际FPS
 * @throws {Error} 当参数不是有效数字时抛出错误（Fail Fast）
 * 
 * @example
 * calculateActualFPS(200, 60); // 60 (受刷新率限制)
 * calculateActualFPS(30, 60); // 30 (未达到刷新率)
 */
export function calculateActualFPS(theoreticalFPS, refreshRate) {
    // Fail Fast: 验证参数
    if (typeof theoreticalFPS !== 'number' || !Number.isFinite(theoreticalFPS) || theoreticalFPS < 0) {
        throw new Error(`performanceUtils.calculateActualFPS: theoreticalFPS must be a non-negative finite number, got ${theoreticalFPS}`);
    }
    if (typeof refreshRate !== 'number' || !Number.isFinite(refreshRate) || refreshRate <= 0) {
        throw new Error(`performanceUtils.calculateActualFPS: refreshRate must be a positive finite number, got ${refreshRate}`);
    }
    
    return Math.min(theoreticalFPS, refreshRate);
}

/**
 * 格式化FPS值（保留1位小数）
 * 
 * @param {number} fps - FPS值
 * @returns {string} 格式化后的FPS字符串
 * @throws {Error} 当fps不是数字时抛出错误（Fail Fast）
 * 
 * @example
 * formatFPS(59.987654); // "60.0"
 * formatFPS(Infinity); // "∞"
 */
export function formatFPS(fps) {
    // Fail Fast: 验证参数类型
    if (typeof fps !== 'number') {
        throw new Error(`performanceUtils.formatFPS: fps must be a number, got ${typeof fps}`);
    }
    
    // Fail Fast: NaN 是编程错误，不是正常情况
    if (Number.isNaN(fps)) {
        throw new Error(`performanceUtils.formatFPS: fps is NaN, this indicates a calculation error`);
    }
    
    // Infinity 是正常情况（帧耗时接近0）
    if (!isFinite(fps)) {
        return '∞';
    }
    return fps.toFixed(1);
}

/**
 * 计算性能等级（基于FPS与刷新率的比值）
 * 根据实际FPS占刷新率的百分比评估性能表现
 * 
 * @param {number} fps - 实际FPS
 * @param {number} refreshRate - 屏幕刷新率（Hz）
 * @returns {{level: string, description: string}} 性能等级信息
 * @throws {Error} 当参数不是有效数字时抛出错误（Fail Fast）
 * 
 * @example
 * getPerformanceLevel(58, 60); // {level: "优秀", description: "接近刷新率上限，性能表现优秀"}
 */
export function getPerformanceLevel(fps, refreshRate) {
    // Fail Fast: 验证参数
    if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 0) {
        throw new Error(`performanceUtils.getPerformanceLevel: fps must be a non-negative finite number, got ${fps}`);
    }
    if (typeof refreshRate !== 'number' || !Number.isFinite(refreshRate) || refreshRate <= 0) {
        throw new Error(`performanceUtils.getPerformanceLevel: refreshRate must be a positive finite number, got ${refreshRate}`);
    }
    
    const ratio = fps / refreshRate;
    
    if (ratio >= 0.95) {
        return {
            level: '优秀',
            description: '接近刷新率上限，性能表现优秀'
        };
    } else if (ratio >= 0.8) {
        return {
            level: '良好',
            description: '性能表现良好，偶有卡顿'
        };
    } else if (ratio >= 0.6) {
        return {
            level: '一般',
            description: '性能一般，存在明显卡顿'
        };
    } else if (ratio >= 0.4) {
        return {
            level: '较差',
            description: '性能较差，卡顿严重'
        };
    } else {
        return {
            level: '极差',
            description: '性能极差，几乎无法流畅播放'
        };
    }
}

/**
 * 应用性能等级颜色CSS类
 * 根据性能等级文本（优秀/良好/一般/较差/极差）动态地给元素应用对应的颜色CSS类
 * 
 * @param {HTMLElement} element - 要应用颜色的元素
 * @param {string} perfLevel - 性能等级（优秀/良好/一般/较差/极差）
 * @returns {void}
 * @throws {Error} 当element不是HTMLElement或perfLevel不是字符串时抛出错误（Fail Fast）
 * 
 * @example
 * const perfLevel = getPerformanceLevel(58, 60);
 * applyPerformanceColor(element, perfLevel.level); // 添加 .perf-color-excellent 类
 */
export function applyPerformanceColor(element, perfLevel) {
    // Fail Fast: 验证参数
    if (!(element instanceof HTMLElement)) {
        throw new Error(`performanceUtils.applyPerformanceColor: element must be an HTMLElement, got ${typeof element}`);
    }
    if (typeof perfLevel !== 'string') {
        throw new Error(`performanceUtils.applyPerformanceColor: perfLevel must be a string, got ${typeof perfLevel}`);
    }
    
    // 移除所有性能颜色类
    element.classList.remove('perf-color-excellent', 'perf-color-good', 'perf-color-fair', 'perf-color-poor', 'perf-color-verypoor');
    
    // 性能等级文本 → CSS类名映射
    const colorClassMap = {
        '优秀': 'perf-color-excellent',
        '良好': 'perf-color-good',
        '一般': 'perf-color-fair',
        '较差': 'perf-color-poor',
        '极差': 'perf-color-verypoor'
    };
    
    // 添加对应的CSS类
    const colorClass = colorClassMap[perfLevel];
    if (colorClass) {
        element.classList.add(colorClass);
    }
}

/**
 * 根据帧耗时标准差获取稳定性评级
 * 标准差越小表示帧耗时越稳定
 * 
 * @param {number} stdDev - 帧耗时标准差（单位：ms）
 * @returns {{level: string, stars: string, color: string, description: string}} 稳定性评级信息
 * @throws {Error} 当参数不是有效数字时抛出错误（Fail Fast）
 * 
 * @example
 * getStabilityRating(0.3); // {level: "优秀", stars: "⭐⭐⭐⭐⭐", color: "#4caf50", description: "..."}
 */
export function getStabilityRating(stdDev) {
    // Fail Fast: 验证参数
    if (typeof stdDev !== 'number' || !Number.isFinite(stdDev) || stdDev < 0) {
        throw new Error(`performanceUtils.getStabilityRating: stdDev must be a non-negative finite number, got ${stdDev}`);
    }
    
    if (stdDev < 0.5) {
        return {
            level: '优秀',
            stars: '⭐⭐⭐⭐⭐',
            color: '#4caf50',
            description: '帧耗时非常稳定，几乎无波动'
        };
    } else if (stdDev < 1.0) {
        return {
            level: '良好',
            stars: '⭐⭐⭐⭐',
            color: '#8bc34a',
            description: '帧耗时较稳定，波动很小'
        };
    } else if (stdDev < 2.0) {
        return {
            level: '一般',
            stars: '⭐⭐⭐',
            color: '#ffc107',
            description: '帧耗时稳定性一般，存在波动'
        };
    } else if (stdDev < 3.0) {
        return {
            level: '较差',
            stars: '⭐⭐',
            color: '#ff9800',
            description: '帧耗时不稳定，波动明显'
        };
    } else {
        return {
            level: '极差',
            stars: '⭐',
            color: '#f44336',
            description: '帧耗时极不稳定，波动剧烈'
        };
    }
}

/**
 * 获取设备基本信息
 * 包括屏幕尺寸、DPR、浏览器、操作系统、CPU核心数、内存等
 * 
 * @returns {object} 设备信息对象
 * 
 * @example
 * const info = getDeviceInfo();
 * // {screenWidth: 1920, browser: "Chrome", os: "Windows", ...}
 */
export function getDeviceInfo() {
    const ua = navigator.userAgent;
    
    // 简单的浏览器检测
    let browser = '未知浏览器';
    if (ua.includes('Chrome') && !ua.includes('Edge')) {
        browser = 'Chrome';
    } else if (ua.includes('Firefox')) {
        browser = 'Firefox';
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
        browser = 'Safari';
    } else if (ua.includes('Edge')) {
        browser = 'Edge';
    }
    
    // 操作系统检测
    let os = '未知系统';
    if (ua.includes('Windows')) {
        os = 'Windows';
    } else if (ua.includes('Mac')) {
        os = 'macOS';
    } else if (ua.includes('Linux')) {
        os = 'Linux';
    } else if (ua.includes('Android')) {
        os = 'Android';
    } else if (ua.includes('iOS')) {
        os = 'iOS';
    }
    
    return {
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        browser,
        os,
        hardwareConcurrency: navigator.hardwareConcurrency || '浏览器不支持检测',
        deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : '浏览器不支持检测（Firefox/Safari常见）'
    };
}

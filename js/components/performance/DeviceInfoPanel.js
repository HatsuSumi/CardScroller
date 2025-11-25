/**
 * DeviceInfoPanel - 设备信息面板组件
 * 负责显示用户设备的详细信息，包括屏幕尺寸、DPR、浏览器、操作系统、硬件配置等
 * 
 * 职责说明：
 * - 这是一个纯UI渲染组件，专门为 PerformanceReportPage 提供设备信息展示功能
 * - 获取设备信息并格式化显示
 * - 支持刷新率的手动修正（通过事件通知父组件）
 * - 提供实时窗口尺寸更新（可选）
 * 
 * 当前被使用的模块：
 * - PerformanceReportPage (services/ui/PerformanceReportPage.js) - 性能监控主页面
 * 
 * 当前依赖的模块：
 * - getDeviceInfo (helpers/performanceUtils.js) - 获取设备信息
 * 
 * 架构说明：
 * - DOM 元素通过 init() 方法传入，不在构造函数中初始化（支持动态 DOM）
 * - 使用 Fail Fast 原则验证所有关键参数
 * - 所有业务逻辑委托给 helpers，本组件只负责 UI 更新
 * - 通过 CustomEvent 与父组件通信，不直接使用 EventBus
 */

import { getDeviceInfo } from '../../helpers/performanceUtils.js';

export class DeviceInfoPanel {
    /**
     * 构造函数
     * 创建设备信息面板实例
     */
    constructor() {
        
        // DOM 元素引用（通过 init 传入）
        this.elements = null;
        
        // 当前设备信息
        this.deviceInfo = null;
        
        // 当前刷新率（Hz）
        this.currentRefreshRate = null;
        
        // 窗口大小变化监听器
        this.resizeHandler = null;
    }
    
    /**
     * 初始化面板（接收容器，自己查找元素并绑定事件）
     * @param {HTMLElement} container - 面板容器元素
     * @returns {void}
     * @throws {Error} 当容器无效或关键元素缺失时立即抛出错误（Fail Fast）
     */
    init(container) {
        // Fail Fast: 验证容器
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('DeviceInfoPanel.init: container must be a valid HTMLElement');
        }
        
        // 子组件自己查找需要的元素（封装）
        this.elements = {
            screenResolution: container.querySelector('#screenResolution'),
            viewportSize: container.querySelector('#viewportSize'),
            devicePixelRatio: container.querySelector('#devicePixelRatio'),
            refreshRate: container.querySelector('#refreshRate'),
            refreshRateInput: container.querySelector('#refreshRateInput'),
            refreshRateConfirmBtn: container.querySelector('#refreshRateConfirmBtn'),
            browser: container.querySelector('#browser'),
            operatingSystem: container.querySelector('#operatingSystem'),
            cpuCores: container.querySelector('#cpuCores'),
            deviceMemory: container.querySelector('#deviceMemory'),
            commandCopyBtns: container.querySelectorAll('.command-copy-btn')
        };
        
        // Fail Fast: 验证必需元素
        if (!this.elements.screenResolution) {
            throw new Error('DeviceInfoPanel.init: #screenResolution not found in container');
        }
        if (!this.elements.viewportSize) {
            throw new Error('DeviceInfoPanel.init: #viewportSize not found in container');
        }
        if (!this.elements.devicePixelRatio) {
            throw new Error('DeviceInfoPanel.init: #devicePixelRatio not found in container');
        }
        if (!this.elements.refreshRate) {
            throw new Error('DeviceInfoPanel.init: #refreshRate not found in container');
        }
        if (!this.elements.refreshRateInput) {
            throw new Error('DeviceInfoPanel.init: #refreshRateInput not found in container');
        }
        if (!this.elements.refreshRateConfirmBtn) {
            throw new Error('DeviceInfoPanel.init: #refreshRateConfirmBtn not found in container');
        }
        if (!this.elements.browser) {
            throw new Error('DeviceInfoPanel.init: #browser not found in container');
        }
        if (!this.elements.operatingSystem) {
            throw new Error('DeviceInfoPanel.init: #operatingSystem not found in container');
        }
        if (!this.elements.cpuCores) {
            throw new Error('DeviceInfoPanel.init: #cpuCores not found in container');
        }
        if (!this.elements.deviceMemory) {
            throw new Error('DeviceInfoPanel.init: #deviceMemory not found in container');
        }
        
        // 绑定刷新率修正事件
        this._bindRefreshRateEvents();
        
        // 绑定命令复制按钮事件
        this._bindCommandCopyEvent();
    }
    
    /**
     * 渲染设备信息
     * @param {number|null} estimatedRefreshRate - 估算的刷新率（Hz），null表示未估算
     * @param {number|null} userRefreshRate - 用户手动设置的刷新率，null表示用户未设置
     * @returns {void}
     * @throws {Error} 当参数缺失或无效时立即抛出错误（Fail Fast）
     */
    render(estimatedRefreshRate, userRefreshRate) {
        // Fail Fast: 验证是否已初始化
        if (!this.elements) {
            throw new Error('DeviceInfoPanel.render: panel not initialized, call init() first');
        }
        
        // Fail Fast: 验证参数存在性（必须明确传递，即使是null）
        if (arguments.length < 2) {
            throw new Error('DeviceInfoPanel.render: both estimatedRefreshRate and userRefreshRate are required (can be null)');
        }
        // Fail Fast: 验证参数
        if (estimatedRefreshRate !== null && (typeof estimatedRefreshRate !== 'number' || estimatedRefreshRate <= 0)) {
            throw new Error(`DeviceInfoPanel.render: estimatedRefreshRate must be null or a positive number, got ${estimatedRefreshRate}`);
        }
        if (userRefreshRate !== null && (typeof userRefreshRate !== 'number' || userRefreshRate <= 0)) {
            throw new Error(`DeviceInfoPanel.render: userRefreshRate must be null or a positive number, got ${userRefreshRate}`);
        }
        
        // 获取设备信息
        this.deviceInfo = getDeviceInfo();
        
        // 确定使用哪个刷新率
        this.currentRefreshRate = userRefreshRate || estimatedRefreshRate || null;
        
        // 更新所有显示元素
        this._updateScreenResolution();
        this._updateViewportSize();
        this._updateDevicePixelRatio();
        this._updateRefreshRate(estimatedRefreshRate, userRefreshRate);
        this._updateBrowser();
        this._updateOperatingSystem();
        this._updateCPUCores();
        this._updateDeviceMemory();
    }
    
    /**
     * 启用实时窗口尺寸更新（监听窗口resize事件）
     * @returns {void}
     */
    enableRealtimeViewportUpdate() {
        if (this.resizeHandler) {
            return; // 已经启用
        }
        
        this.resizeHandler = () => {
            // 更新设备信息中的viewport数据
            this.deviceInfo = getDeviceInfo();
            this._updateViewportSize();
        };
        
        window.addEventListener('resize', this.resizeHandler);
    }
    
    /**
     * 禁用实时窗口尺寸更新
     * @returns {void}
     */
    disableRealtimeViewportUpdate() {
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
    }
    
    /**
     * 绑定刷新率修正相关事件
     * @returns {void}
     * @private
     */
    _bindRefreshRateEvents() {
        const { refreshRateInput, refreshRateConfirmBtn } = this.elements;
        
        // 确认按钮点击事件
        refreshRateConfirmBtn.addEventListener('click', () => {
            this._handleRefreshRateChange();
        });
        
        // 输入框回车事件
        refreshRateInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this._handleRefreshRateChange();
            }
        });
    }
    
    /**
     * 绑定命令复制按钮事件
     * @returns {void}
     * @private
     */
    _bindCommandCopyEvent() {
        const { commandCopyBtns } = this.elements;
        
        // 如果复制按钮不存在，跳过（可选元素）
        if (!commandCopyBtns || commandCopyBtns.length === 0) {
            return;
        }
        
        // 为每个复制按钮绑定事件
        commandCopyBtns.forEach(commandCopyBtn => {
            commandCopyBtn.addEventListener('click', () => {
                const targetId = commandCopyBtn.getAttribute('data-target');
                const targetElement = document.getElementById(targetId);
                
                if (!targetElement) {
                    // 通过 CustomEvent 通知父组件复制失败
                    const event = new CustomEvent('command-copy-failed', {
                        detail: { error: '目标元素未找到' },
                        bubbles: true
                    });
                    commandCopyBtn.dispatchEvent(event);
                    return;
                }
                
                // 复制文本到剪贴板
                const textToCopy = targetElement.textContent;
                
                // 检查浏览器是否支持 Clipboard API
                if (!navigator.clipboard) {
                    const event = new CustomEvent('command-copy-failed', {
                        detail: {
                            error: `<p style="margin: 0 0 12px 0;"><strong>您的浏览器不支持剪贴板功能。</strong></p><p style="margin: 0;">请手动复制命令：<br>${textToCopy}</p>`
                        },
                        bubbles: true
                    });
                    commandCopyBtn.dispatchEvent(event);
                    return;
                }
                
                navigator.clipboard.writeText(textToCopy).then(() => {
                    // 按钮临时变更为"已复制"状态
                    const originalHTML = commandCopyBtn.innerHTML;
                    commandCopyBtn.innerHTML = '✓';
                    commandCopyBtn.disabled = true;
                    
                    setTimeout(() => {
                        commandCopyBtn.innerHTML = originalHTML;
                        commandCopyBtn.disabled = false;
                    }, 2000);
                    
                    // 通过 CustomEvent 通知父组件复制成功
                    const event = new CustomEvent('command-copy-success', {
                        detail: { 
                            text: textToCopy,
                            targetId: targetId
                        },
                        bubbles: true
                    });
                    commandCopyBtn.dispatchEvent(event);
                }).catch((error) => {
                    // 通过 CustomEvent 通知父组件复制失败
                    const event = new CustomEvent('command-copy-failed', {
                        detail: { error: error.message },
                        bubbles: true
                    });
                    commandCopyBtn.dispatchEvent(event);
                });
            });
        });
    }
    
    /**
     * 处理刷新率修正
     * 
     * 职责：不做任何验证，只负责传递用户输入值给父组件
     * 验证逻辑由父组件通过 ValidationService 统一处理
     * 
     * @returns {void}
     * @private
     */
    _handleRefreshRateChange() {
        const input = this.elements.refreshRateInput;
        const value = input.value.trim();
        
        // 触发事件，通知父组件用户输入了刷新率（不做验证）
        const event = new CustomEvent('refreshrate-change', {
            detail: { refreshRate: value },
            bubbles: true
        });
        this.elements.refreshRateInput.dispatchEvent(event);
        
        // 清空输入框
        input.value = '';
    }
    
    /**
     * 更新屏幕分辨率显示
     * @returns {void}
     * @private
     */
    _updateScreenResolution() {
        const { screenWidth, screenHeight } = this.deviceInfo;
        this.elements.screenResolution.textContent = `${screenWidth} × ${screenHeight} 像素`;
    }
    
    /**
     * 更新视口尺寸显示
     * @returns {void}
     * @private
     */
    _updateViewportSize() {
        const { viewportWidth, viewportHeight } = this.deviceInfo;
        this.elements.viewportSize.textContent = `${viewportWidth} × ${viewportHeight} 像素`;
    }
    
    /**
     * 更新设备像素比显示
     * @returns {void}
     * @private
     */
    _updateDevicePixelRatio() {
        const { devicePixelRatio } = this.deviceInfo;
        this.elements.devicePixelRatio.textContent = devicePixelRatio;
    }
    
    /**
     * 更新刷新率显示（含估算值和用户设置值的说明）
     * @param {number|null} estimatedRefreshRate - 估算的刷新率，null表示未估算
     * @param {number|null} userRefreshRate - 用户设置的刷新率
     * @returns {void}
     * @private
     */
    _updateRefreshRate(estimatedRefreshRate, userRefreshRate) {
        let displayText;
        
        if (userRefreshRate) {
            // 用户手动设置了刷新率
            if (estimatedRefreshRate) {
                displayText = `${userRefreshRate} Hz (用户设置，估算值: ${estimatedRefreshRate} Hz)`;
            } else {
                displayText = `${userRefreshRate} Hz (用户设置)`;
            }
        } else if (estimatedRefreshRate) {
            // 只有估算值
            displayText = `${estimatedRefreshRate} Hz (估算值)`;
        } else {
            // 未估算
            displayText = '待估算（首次播放动画时自动估算），您也可以手动设置。';
        }
        
        this.elements.refreshRate.textContent = displayText;
    }
    
    /**
     * 更新浏览器显示
     * @returns {void}
     * @private
     */
    _updateBrowser() {
        const { browser } = this.deviceInfo;
        this.elements.browser.textContent = browser;
    }
    
    /**
     * 更新操作系统显示
     * @returns {void}
     * @private
     */
    _updateOperatingSystem() {
        const { os } = this.deviceInfo;
        this.elements.operatingSystem.textContent = os;
    }
    
    /**
     * 更新CPU核心数显示
     * @returns {void}
     * @private
     */
    _updateCPUCores() {
        const { hardwareConcurrency } = this.deviceInfo;
        this.elements.cpuCores.textContent = hardwareConcurrency;
    }
    
    /**
     * 更新设备内存显示
     * @returns {void}
     * @private
     */
    _updateDeviceMemory() {
        const { deviceMemory } = this.deviceInfo;
        this.elements.deviceMemory.textContent = deviceMemory;
    }
    
    /**
     * 销毁组件（清理事件监听器和引用）
     * @returns {void}
     */
    destroy() {
        // 移除窗口大小变化监听器
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
        
        // 清空引用
        this.elements = null;
        this.deviceInfo = null;
        this.currentRefreshRate = null;
    }
}


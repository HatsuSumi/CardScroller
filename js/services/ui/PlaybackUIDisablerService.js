/**
 * PlaybackUIDisablerService - 全局UI协调服务
 * 协调播放状态下的UI控件禁用/启用，负责监听播放、暂停、完成状态，自动禁用/启用相关UI控件（如位置选择、参数控制等）
 * 
 * 当前被使用的模块：
 * - 无（纯UI服务，通过StateWatcher被动响应状态变化）
 * 
 * 当前依赖的模块：
 * - BaseUIService (base/BaseUIService.js) - UI服务基类，提供DOM缓存和操作工具
 * - stateManager (core/StateManager.js) - 状态管理器，获取播放和暂停状态
 * - stateWatcherService (system/StateWatcherService.js) - 状态监听服务，监听播放状态变化
 */
import { BaseUIService } from '../base/BaseUIService.js';

export class PlaybackUIDisablerService extends BaseUIService {
    /**
     * 创建全局UI协调服务实例
     * @param {StateManager} stateManager - 状态管理器
     * @param {StateWatcherService} stateWatcherService - 状态监听服务
     * @throws {Error} 当必需的依赖项缺失时抛出错误
     */
    constructor(stateManager, stateWatcherService) {
        super(); // 调用基类构造函数
        
        // Fail Fast: 检查必需的依赖项
        if (!stateManager) {
            throw new Error('PlaybackUIDisablerService requires stateManager');
        }
        if (!stateWatcherService) {
            throw new Error('PlaybackUIDisablerService requires stateWatcherService');
        }
        
        this.stateManager = stateManager;
        this.stateWatcherService = stateWatcherService;
        
        // UI功能逻辑：播放时需要禁用的元素ID列表
        // 这是代码逻辑的一部分，反映HTML结构，不是可配置的参数
        this.playingDisabledElements = [
            // 位置控制按钮
            'selectStartPos',
            'restoreStartPos',
            'selectEndPos',
            'restoreEndPos',
            // 滚动参数控制
            'duration',
            'animationStrategySelect',
            'reverseScroll',
            // 显示控制
            'colorPickerTriggerBtn',
            // 循环控制
            'loopPlay',
            'loopInterval',
            'resetLoopInterval',
            'advancedLoopBtn',
            // 进度条控制
            'hideProgress',
            'hideProgressOnPause',
            'keepProgressOnComplete',
            // 自动隐藏侧边栏控制
            'autoHideSidebar',
            'autoHideDelay',
            // 自动重置控制
            'autoResetAfterComplete',
            // 图片操作
            'replaceImageBtn',
            // 配置导出
            'exportConfigBtn',
            // 更多功能
            'moreFeaturesBtn'
        ];
        
        // Fail Fast: 预检查所有必需的DOM元素
        // 确保HTML结构完整，问题在初始化阶段立即暴露
        this.playingDisabledElements.forEach(elementId => {
            this._requireElement(elementId);
        });
    }

    /**
     * 初始化服务
     * @returns {void}
     */
    init() {
        this._setupPlaybackStateListener();
    }

    /**
     * 设置播放状态监听器 
     * @private
     * @returns {void}
     */
    _setupPlaybackStateListener() {

        const handler = () => this._updateUIPlaybackState();
        
        // 监听播放、暂停、完成状态，统一处理UI更新
        this.stateWatcherService.watchState('playback.scroll.isPlaying', handler);
        this.stateWatcherService.watchState('playback.scroll.isPaused', handler);
        this.stateWatcherService.watchState('playback.scroll.isCompleted', handler);
    }

    /**
     * 更新UI播放状态（禁用/启用相关控件）
     * 根据播放、暂停、完成状态决定是否禁用UI控件
     * @private
     * @returns {void}
     */
    _updateUIPlaybackState() {
        // 从状态管理器统一读取所有状态
        const isPlaying = this.stateManager.state.playback.scroll.isPlaying;
        const isPaused = this.stateManager.state.playback.scroll.isPaused;
        const isCompleted = this.stateManager.state.playback.scroll.isCompleted;
        const shouldDisable = isPlaying || isPaused || isCompleted;
        
        // 批量设置元素的禁用状态
        // 所有元素已在构造函数中通过Fail Fast检查，此处可以安全使用
        this.playingDisabledElements.forEach(elementId => {
            const element = this._getElement(elementId);
            
            // 检查是否是需要特殊处理的元素（自定义下拉菜单）
            const isCustomElement = element.classList.contains('custom-select');
            
            // 普通表单元素需要设置disabled属性
            if (!isCustomElement) {
                element.disabled = shouldDisable;
            }
            
            // 所有元素都添加/移除视觉样式类
            if (shouldDisable) {
                element.classList.add('playing-disabled');
            } else {
                element.classList.remove('playing-disabled');
            }
        });
    }
}

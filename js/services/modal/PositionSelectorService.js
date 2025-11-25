import { BaseModalService } from '../base/BaseModalService.js';
import { debounce } from '../../helpers/debounce.js';
import { convertScrollDistanceToPixelPosition, convertPixelPositionToScrollDistance } from '../../helpers/positionCalculators.js';

/**
 * PositionSelectorService - 位置选择器服务
 * 处理滚动起始和结束位置的选择，纯UI协调者，负责位置选择模态框的显示和用户交互，所有业务逻辑委托给专门的服务。功能包括：起始/结束位置选择、实时预览、位置验证、恢复默认值。继承自BaseModalService。
 * 
 * 当前被使用的模块：
 * - 无（通过 KeyboardService 快捷键机制和按钮点击事件自动触发打开）
 * 
 * 当前依赖的模块：
 * - BaseModalService (base/BaseModalService.js) - 模态框基类
 *   ↳ BaseUIService (base/BaseUIService.js) - UI服务基类，提供DOM缓存和事件管理功能
 * - eventBus (core/EventBus.js) - 事件总线 (通过DI注入)
 * - validationService (system/ValidationService.js) - 验证服务 (通过DI注入)
 * - keyboardService (utils/KeyboardService.js) - 键盘快捷键管理服务 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - convertScrollDistanceToPixelPosition (helpers/positionCalculators.js) - 位置转换工具函数
 * - positionPreviewService (ui/PositionPreviewService.js) - 位置选择预览显示服务 (通过DI注入)
 * - positionSliderService (ui/PositionSliderService.js) - 位置滑块控制服务 (通过DI注入)
 * - stateWatcherService (system/StateWatcherService.js) - 状态监听服务 (通过DI注入)
 * - debounce (helpers/debounce.js) - 防抖工具函数 (直接导入)
 */
export class PositionSelectorService extends BaseModalService {
    /**
     * 创建位置选择器服务实例
     * @param {EventBus} eventBus - 事件总线 (通过DI注入)
     * @param {ValidationService} validationService - 验证服务 (通过DI注入)
     * @param {KeyboardService} keyboardService - 键盘快捷键管理服务 (通过DI注入)
     * @param {StateManager} stateManager - 状态管理器 (通过DI注入)
     * @param {PositionPreviewService} positionPreviewService - 位置选择预览显示服务 (通过DI注入)
     * @param {PositionSliderService} positionSliderService - 位置滑块控制服务 (通过DI注入)
     * @param {StateWatcherService} stateWatcherService - 状态监听服务 (通过DI注入)
     * @throws {Error} 当核心依赖（eventBus/validationService/positionPreviewService/positionSliderService/stateWatcherService）缺失时抛出错误（Fail Fast）
     */
    constructor(eventBus, validationService, keyboardService, stateManager, positionPreviewService, positionSliderService, stateWatcherService) {
        super(keyboardService); // 传入键盘服务以支持ESC快捷键
        
        // Fail Fast: 检查核心依赖
        if (!eventBus) {
            throw new Error('PositionSelectorService requires eventBus');
        }
        if (!validationService) {
            throw new Error('PositionSelectorService requires validationService');
        }
        if (!stateManager) {
            throw new Error('PositionSelectorService requires stateManager');
        }
        if (!positionPreviewService) {
            throw new Error('PositionSelectorService requires positionPreviewService');
        }
        if (!positionSliderService) {
            throw new Error('PositionSelectorService requires positionSliderService');
        }
        if (!stateWatcherService) {
            throw new Error('PositionSelectorService requires stateWatcherService');
        }
        
        this.eventBus = eventBus;
        this.validationService = validationService;
        this.stateManager = stateManager;
        this.positionPreviewService = positionPreviewService;
        this.positionSliderService = positionSliderService;
        this.stateWatcherService = stateWatcherService;
        
        // 位置选择器状态
        this.currentSelecting = null; // 'start' 或 'end'
        this.tempPosition = 0;
        
        // resize 监听器
        this.resizeHandler = null;
    }

    /**
     * 初始化服务
     * 调用基类初始化（设置DOM引用和事件监听器），然后设置业务相关事件监听器和状态监听器
     * @returns {void}
     */
    init() {
        super.init(); // 调用基类初始化
        this._setupBusinessEventListeners();
        this._setupStateWatchers();
    }


    /**
     * 获取模态框配置
     * @returns {Object} 模态框配置对象
     * @protected
     */
    _getModalConfig() {
        return {
            name: '位置选择模态框',
            elements: {
                modal: '#positionModal',
                closeBtn: '#closeModal',
                additionalCloseBtns: ['#cancelPosition'],
                modalBackdrop: '.position-backdrop'
            },
            openTrigger: false, // 不使用单一的打开按钮
            closeOnOverlayClick: true,
            escToClose: true // ESC键关闭模态框
        };
    }

    /**
     * 设置DOM引用 - 重写以添加额外的元素引用
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @protected
     */
    _setupDOMReferences(config) {
        super._setupDOMReferences(config);
        
        // 添加业务相关的DOM元素引用 - 使用继承的缓存方法
        Object.assign(this.elements, {
            selectStartPosBtn: this._getElement('selectStartPos'),
            selectEndPosBtn: this._getElement('selectEndPos'),
            restoreStartPosBtn: this._getElement('restoreStartPos'),
            restoreEndPosBtn: this._getElement('restoreEndPos'),
            modalTitle: this._getElement('modalTitle'),
            modalImage: this._getElement('modalImage'),
            positionSlider: this._getElement('positionSlider'),
            currentPosition: this._getElement('currentPosition'),
            confirmPosition: this._getElement('confirmPosition'),
            lockToImageEndCheckbox: this._getElement('lockToImageEndCheckbox'),
            positionLockOption: this._querySelector('.position-lock-option')
        });
        
        // Fail Fast: 验证所有必需的DOM元素
        const requiredElements = [
            'selectStartPosBtn',
            'selectEndPosBtn',
            'restoreStartPosBtn',
            'restoreEndPosBtn',
            'modalTitle',
            'positionSlider',
            'confirmPosition',
            'lockToImageEndCheckbox',
            'positionLockOption'
        ];
        
        for (const elementKey of requiredElements) {
            if (!this.elements[elementKey]) {
                throw new Error(`PositionSelectorService: Required DOM element "${elementKey}" not found`);
            }
        }
    }

    /**
     * 设置事件监听器 - 重写以添加位置选择按钮
     * @param {Object} config - 模态框配置对象
     * @returns {void}
     * @protected
     */
    _setupEventListeners(config) {
        super._setupEventListeners(config); // 调用基类的事件监听器设置
        
        const { 
            selectStartPosBtn, 
            selectEndPosBtn, 
            restoreStartPosBtn, 
            restoreEndPosBtn,
            confirmPosition,
            modalTitle,
            lockToImageEndCheckbox
        } = this.elements;

        // 打开起始位置选择
        selectStartPosBtn.addEventListener('click', () => {
            this.currentSelecting = 'start';
            modalTitle.textContent = '选择起始位置';
            this.openModal(); // 使用基类的openModal方法
        });

        // 打开结束位置选择
        selectEndPosBtn.addEventListener('click', () => {
            this.currentSelecting = 'end';
            modalTitle.textContent = '选择结束位置';
            this.openModal(); // 使用基类的openModal方法
        });

        // 恢复起始位置默认值
        restoreStartPosBtn.addEventListener('click', () => {
            this._restoreDefaultStartPosition();
        });

        // 恢复结束位置默认值
        restoreEndPosBtn.addEventListener('click', () => {
            this._restoreDefaultEndPosition();
        });

        // "锁定到图片末尾"复选框实时更新状态
        lockToImageEndCheckbox.addEventListener('change', () => {
            this.stateManager.state.playback.scroll.lockToImageEnd = lockToImageEndCheckbox.checked;
        });

        // 确认位置选择
        confirmPosition.addEventListener('click', () => {
            if (this.currentSelecting) {
                this._validateAndUpdatePosition(this.currentSelecting, this.tempPosition);
            }
            this.closeModal(); // 使用基类的closeModal方法
        });
    }

    /**
     * 设置业务相关事件监听器
     * @returns {void}
     * @private
     */
    _setupBusinessEventListeners() {
        const { positionSlider } = this.elements;

        // 位置滑块变化 - 使用防抖
        const debouncedSliderUpdate = debounce((value) => {
            this._updatePositionDisplay();
            this._updateModalPreview(value);
        }, 16); // 技术实现：滑块节流延迟（毫秒，约60FPS）
        
        positionSlider.addEventListener('input', (e) => {
            this.tempPosition = parseInt(e.target.value);
            debouncedSliderUpdate(this.tempPosition);
        });
    }

    /**
     * 设置状态监听器
     * @returns {void}
     * @private
     */
    _setupStateWatchers() {
        // 监听起始位置变化，发送事件通知（UI更新由ParameterControlUIService负责）
        this.stateWatcherService.watchState('playback.scroll.startPosition', (value) => {
            this.eventBus.emit('position:start-changed', value);
        });

        this.stateWatcherService.watchState('playback.scroll.endPosition', (value) => {
            this.eventBus.emit('position:end-changed', value);
        });
    }

    /**
     * 模态框打开后钩子 - 设置图片和滑块
     * @returns {void}
     * @protected
     */
    _onAfterOpen() {
        this._setupModalImage();
        this._setupPositionSlider();
        this._setupLockToImageEndOption();
        
        // 延迟刷新图片尺寸（等待DOM渲染完成）
        const refreshDelay = 50;  // 技术实现：DOM渲染等待延迟（毫秒）
        setTimeout(() => {
            this._refreshModalImageSize();
        }, refreshDelay);
        
        // 监听窗口 resize 事件，并更新预览和滑块
        this.resizeHandler = () => {
            // ⚠️ 重要：立即保存 resize 前的缩放比例（因为 DisplayCoordinatorService 也在监听 resize 并会更新它）
            const imageWidth = this.stateManager.state.content.image.metadata.width;
            const oldScalingRatio = this.stateManager.state.content.image.scaling.ratio;
            const oldMainImageWidth = imageWidth * oldScalingRatio;
            
            // 判断是否需要使用"自动计算"的位置
            // 锁定到图片末尾时，结束位置由主页自动计算，选择器应该同步
            const lockToImageEnd = this.stateManager.state.playback.scroll.lockToImageEnd;
            const shouldSyncStatePosition = (
                this.currentSelecting === 'end' && lockToImageEnd
            );
            
            let currentPixelPosition;
            
            if (shouldSyncStatePosition) {
                // 锁定到图片末尾 + 结束位置：直接使用 state 中的值（主页会自动更新）
                currentPixelPosition = this.stateManager.state.playback.scroll.endPosition;
            } else {
                // 其他情况：使用用户选择的位置（基于 tempPosition 计算）
                currentPixelPosition = convertScrollDistanceToPixelPosition(
                    this.tempPosition,
                    imageWidth,
                    oldMainImageWidth
                );
            }
            
            // 等待 DisplayCoordinatorService 更新 scalingRatio（它使用 250ms 防抖）
            // 使用 300ms 延迟确保主显示的缩放已更新
            setTimeout(() => {
                // 如果需要同步，再次读取最新的 state（因为主页可能已经更新了）
                const finalPixelPosition = shouldSyncStatePosition
                    ? this.stateManager.state.playback.scroll.endPosition
                    : currentPixelPosition;
                
                const { positionSlider, currentPosition } = this.elements;
                
                // 重新设置滑块
                this.tempPosition = this.positionSliderService.setupPositionSlider(
                    positionSlider, 
                    currentPosition, 
                    this.currentSelecting,
                    finalPixelPosition
                );
                
                // 更新预览图片尺寸和指示器位置
                this._refreshModalImageSize();
            }, 300);
        };
        window.addEventListener('resize', this.resizeHandler);
        
        // 注册箭头键快捷键（用于微调位置）
        this._registerArrowKeyShortcuts();
    }

    /**
     * 模态框关闭后钩子 - 清理状态
     * @returns {void}
     * @protected
     */
    _onAfterClose() {
        this.currentSelecting = null;
        
        // 移除 resize 监听器
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
        
        // 注销快捷键
        this.keyboardService.unregister('left', this);
        this.keyboardService.unregister('shift+left', this);
        this.keyboardService.unregister('right', this);
        this.keyboardService.unregister('shift+right', this);
    }

    /**
     * 设置模态框图片
     * @returns {void}
     * @private
     */
    _setupModalImage() {
        const { modalImage } = this.elements;
        this.positionPreviewService.setupModalImage(modalImage);
    }

    /**
     * 设置位置滑块
     * @returns {void}
     * @private
     */
    _setupPositionSlider() {
        const { positionSlider, currentPosition } = this.elements;
        this.tempPosition = this.positionSliderService.setupPositionSlider(positionSlider, currentPosition, this.currentSelecting);
        this._updateModalPreview(this.tempPosition);
    }

    /**
     * 设置"锁定到图片末尾"选项
     * 在选择结束位置时显示该选项，并根据当前状态设置复选框的勾选状态
     * 此功能适用于正向滚动和反向滚动两种模式
     * @returns {void}
     * @private
     */
    _setupLockToImageEndOption() {
        const { lockToImageEndCheckbox, positionLockOption } = this.elements;
        
        // 只在选择结束位置时显示"锁定到图片末尾"选项
        if (this.currentSelecting === 'end') {
            positionLockOption.classList.remove('hidden');
            
            // 设置复选框的初始状态
            const currentLockState = this.stateManager.state.playback.scroll.lockToImageEnd;
            lockToImageEndCheckbox.checked = currentLockState;
        } else {
            positionLockOption.classList.add('hidden');
        }
    }

    /**
     * 刷新模态框图片尺寸（在DOM渲染完成后调用）
     * @returns {void}
     * @private
     */
    _refreshModalImageSize() {
        const { modalImage } = this.elements;
        this.positionPreviewService.refreshModalImageSize(modalImage, this.tempPosition);
    }

    /**
     * 更新位置显示
     * @returns {void}
     * @private
     */
    _updatePositionDisplay() {
        const { currentPosition } = this.elements;
        const { imageWidth, mainImageWidth } = this._getImageScalingParams();
        this.positionSliderService.updatePositionDisplay(currentPosition, this.tempPosition, imageWidth, mainImageWidth);
    }

    /**
     * 更新模态框预览
     * @param {number} scrollDistance - 滚动距离
     * @returns {void}
     * @private
     */
    _updateModalPreview(scrollDistance) {
        const { modalImage } = this.elements;
        this.positionPreviewService.updateModalPreview(modalImage, scrollDistance);
    }

    /**
     * 检查并警告用户卡片边界可能失效
     * @param {string} type - 位置类型，'start' 或 'end'
     * @returns {void}
     * @private
     */
    _checkAndWarnCardBoundaries(type) {
        const entryAnimation = this.stateManager.state.playback.entryAnimation;
        const hasEntryAnimation = entryAnimation.enabled;
        const hasMarkedCards = entryAnimation.cardBoundaries && entryAnimation.cardBoundaries.length > 0;
        
        if (!hasEntryAnimation || !hasMarkedCards) {
            return;
        }
        
        const reverseScroll = this.stateManager.state.playback.scroll.reverseScroll;
        
        // 判断当前修改的位置是否影响编辑器视口：
        // 正向滚动时：startPosition 影响视口
        // 反向滚动时：endPosition 影响视口
        const affectsViewport = (type === 'start' && !reverseScroll) || (type === 'end' && reverseScroll);
        
        if (!affectsViewport) {
            return;
        }
        
        // 获取标记卡片时的位置
        const markedAtStartPosition = entryAnimation.markedAtStartPosition;
        const markedAtEndPosition = entryAnimation.markedAtEndPosition;
        
        // 获取当前位置
        const currentStartPosition = this.stateManager.state.playback.scroll.startPosition;
        const currentEndPosition = this.stateManager.state.playback.scroll.endPosition;
        
        // 比较位置是否与标记时一致
        // 正向滚动：比较 startPosition
        // 反向滚动：比较 endPosition
        const positionChanged = reverseScroll 
            ? (currentEndPosition !== markedAtEndPosition)
            : (currentStartPosition !== markedAtStartPosition);
        
        if (positionChanged) {
            // 立即修复无效状态：清空配置并禁用
            this.stateManager.state.playback.entryAnimation.enabled = false;
            this.stateManager.state.playback.entryAnimation.cardBoundaries = [];
            this.stateManager.state.playback.entryAnimation.cardAnimations = [];
            this.stateManager.state.playback.entryAnimation.markedAtStartPosition = null;
            this.stateManager.state.playback.entryAnimation.markedAtEndPosition = null;
            
            // 通知用户
            this.eventBus.emit('ui:show-warning-message', {
                message: '位置设置已改变，入场动画配置已重置。'
            });
        }
    }

    /**
     * 恢复起始位置默认值
     * 从配置文件读取默认起始位置并更新状态
     * @returns {void}
     * @private
     */
    _restoreDefaultStartPosition() {
        const currentStartPosition = this.stateManager.state.playback.scroll.startPosition;
        const defaultStartPosition = this.stateManager.getDefaultValue('playback.scroll.startPosition');
        
        // 如果位置没有改变，直接返回，不提示
        if (currentStartPosition === defaultStartPosition) {
            return;
        }
        
        // 触发状态更新，让UI自动响应
        this.stateManager.state.playback.scroll.startPosition = defaultStartPosition;
        
        // 检查是否需要提示用户重新标记卡片
        this._checkAndWarnCardBoundaries('start');
    }

    /**
     * 恢复结束位置默认值
     * 基于图片尺寸和线性映射计算默认结束位置
     * 🎯 目标：图片右边缘贴合视口右边缘时对应的像素位置
     * 🎯 性能优化：使用 _getImageScalingParams() 减少重复的深层对象属性查找
     * @returns {void}
     * @private
     */
    _restoreDefaultEndPosition() {
        const { imageWidth, mainImageWidth, theoreticalMainEndPos } = this._getImageScalingParams();
        
        if (!imageWidth) {
            this.eventBus.emit('ui:show-validation-error', {
                message: '<p style="margin: 0 0 12px 0;"><strong>图片尺寸信息不可用！</strong></p><p style="margin: 0;">无法获取图片尺寸信息，请重新上传图片。</p>',
                options: {
                    title: '图片信息错误',
                    shortMessage: '图片尺寸信息不可用！'
                }
            });
            return;
        }

        // 🎯 使用 PositionCalculatorService 统一转换逻辑
        // 将理论结束滚动距离转换为像素位置
        const defaultEndPosition = Math.max(
            convertScrollDistanceToPixelPosition(
                theoreticalMainEndPos,
                imageWidth,
                mainImageWidth
            ),
            0
        );
        
        const currentEndPosition = this.stateManager.state.playback.scroll.endPosition;
        
        // 如果位置没有改变，直接返回，不提示
        if (currentEndPosition === defaultEndPosition) {
            return;
        }
        
        // 触发状态更新，让UI自动响应
        this.stateManager.state.playback.scroll.endPosition = defaultEndPosition;
        
        // 恢复默认结束位置后，自动启用"锁定到图片末尾"（因为默认值就是图片末尾）
        this.stateManager.state.playback.scroll.lockToImageEnd = true;
        
        // 检查是否需要提示用户重新标记卡片
        this._checkAndWarnCardBoundaries('end');
    }

    /**
     * 验证并更新位置
     * 协调位置更新流程：计算像素位置 → 构建配置 → 验证 → 更新状态
     * @param {string} type - 位置类型，'start' 或 'end'
     * @param {number} scrollDistance - 滚动距离
     * @returns {void}
     * @private
     */
    _validateAndUpdatePosition(type, scrollDistance) {
        // 1. 计算像素位置
        const pixelPosition = this._calculatePixelPosition(scrollDistance);
        
        // 2. 构建新配置
        const newConfig = this._buildScrollConfig(type, pixelPosition);
        
        // 3. 验证新配置
        const validation = this.validationService.validateScrollConfig(newConfig);

        // 4. 如果验证失败，显示错误并返回
        if (!validation.isValid) {
            this._handleValidationError(validation);
            return;
        }

        // 5. 更新位置状态
        this._updatePositionState(type, pixelPosition);
    }

    /**
     * 获取图片缩放计算参数
     * 🎯 性能优化：缓存状态引用，减少重复的深层对象属性查找
     * @returns {Object} 包含 imageWidth, mainScalingRatio, mainImageWidth, theoreticalMainEndPos 的对象
     * @private
     */
    _getImageScalingParams() {
        // 缓存状态引用，避免重复的深层对象属性查找
        const imageState = this.stateManager.state.content.image;
        const imageWidth = imageState.metadata.width;
        const mainScalingRatio = imageState.scaling.ratio;
        const windowWidth = window.innerWidth;
        const mainImageWidth = imageWidth * mainScalingRatio;
        const theoreticalMainEndPos = mainImageWidth - windowWidth;
        
        return {
            imageWidth,
            mainScalingRatio,
            mainImageWidth,
            theoreticalMainEndPos
        };
    }

    /**
     * 计算像素位置
     * 将滚动距离转换为原始图片像素坐标
     * @param {number} scrollDistance - 滚动距离
     * @returns {number} 像素位置
     * @private
     */
    _calculatePixelPosition(scrollDistance) {
        const { imageWidth, mainImageWidth } = this._getImageScalingParams();
        
        return convertScrollDistanceToPixelPosition(
            scrollDistance, 
            imageWidth, 
            mainImageWidth
        );
    }

    /**
     * 构建滚动配置对象
     * @param {string} type - 位置类型，'start' 或 'end'
     * @param {number} pixelPosition - 像素位置
     * @returns {Object} 滚动配置对象
     * @private
     */
    _buildScrollConfig(type, pixelPosition) {
        // 获取当前完整的滚动配置
        // 使用 ?? 空值合并运算符而非 ||，避免 0 值被误判为 falsy
        const currentConfig = {
            startPosition: this.stateManager.state.playback.scroll.startPosition ?? 0,
            endPosition: this.stateManager.state.playback.scroll.endPosition ?? 0,
            duration: this.stateManager.state.playback.scroll.duration ?? this.stateManager.getDefaultValue('playback.scroll.duration')
        };
        
        // 更新要修改的位置（使用转换后的像素位置）
        const newConfig = { ...currentConfig };
        if (type === 'start') {
            newConfig.startPosition = pixelPosition;
        } else if (type === 'end') {
            newConfig.endPosition = pixelPosition;
        }
        
        return newConfig;
    }

    /**
     * 处理验证错误
     * 使用统一的双重反馈显示错误信息并阻止更新
     * @param {Object} validation - 验证结果对象
     * @returns {void}
     * @private
     */
    _handleValidationError(validation) {
        const errorMessage = `<p style="margin: 0;">${validation.errors.join('<br>')}</p>`;
        
        this.eventBus.emit('ui:show-validation-error', {
            message: errorMessage,
            options: {
                title: '位置设置错误',
                shortMessage: validation.errors[0] // 右上角显示第一个错误
            }
        });
    }

    /**
     * 注册箭头键快捷键
     * 用于在模态框打开时微调滑块位置
     * @returns {void}
     * @private
     */
    _registerArrowKeyShortcuts() {
        // 条件：仅当模态框打开（有 show 类）时有效
        const condition = () => {
            return this.elements.modal && this.elements.modal.classList.contains('show');
        };
        
        // 注册左箭头：向左移动滑块（1px）
        this.keyboardService.registerConditional(
            'left',
            () => this._moveSlider(-1, false),
            condition,
            this,
            { preventDefault: true }
        );
        
        // 注册 Shift+左箭头：向左移动滑块（10px）
        this.keyboardService.registerConditional(
            'shift+left',
            () => this._moveSlider(-1, true),
            condition,
            this,
            { preventDefault: true }
        );
        
        // 注册右箭头：向右移动滑块（1px）
        this.keyboardService.registerConditional(
            'right',
            () => this._moveSlider(1, false),
            condition,
            this,
            { preventDefault: true }
        );
        
        // 注册 Shift+右箭头：向右移动滑块（10px）
        this.keyboardService.registerConditional(
            'shift+right',
            () => this._moveSlider(1, true),
            condition,
            this,
            { preventDefault: true }
        );
    }
    
    /**
     * 移动滑块位置（响应箭头键）
     * @param {number} direction - 移动方向（-1向左，1向右）
     * @param {boolean} isShift - 是否按住Shift键
     * @returns {void}
     * @private
     */
    _moveSlider(direction, isShift) {
        // 计算像素步长（按住Shift键时步长为10px，否则为1px）
        const pixelStep = isShift ? 10 : 1;
        
        // 获取图片尺寸参数，用于坐标系转换
        const { imageWidth, mainImageWidth } = this._getImageScalingParams();
        
        // 将当前滚动距离转换为像素位置
        const currentPixelPosition = convertScrollDistanceToPixelPosition(
            this.tempPosition,
            imageWidth,
            mainImageWidth
        );
        
        // 在像素位置上加减步长
        let newPixelPosition = currentPixelPosition + (direction * pixelStep);
        
        // 限制在有效范围内（0 ~ imageWidth）
        newPixelPosition = Math.max(0, Math.min(imageWidth, newPixelPosition));
        
        // 转换回滚动距离
        const newScrollDistance = convertPixelPositionToScrollDistance(
            newPixelPosition,
            imageWidth,
            mainImageWidth
        );
        
        // 更新临时位置和滑块值
        this.tempPosition = newScrollDistance;
        const { positionSlider } = this.elements;
        positionSlider.value = newScrollDistance;
        
        // 更新位置显示和预览（复用现有方法）
        this._updatePositionDisplay();
        this._updateModalPreview(newScrollDistance);
    }

    /**
     * 更新位置状态
     * @param {string} type - 位置类型，'start' 或 'end'
     * @param {number} pixelPosition - 像素位置
     * @returns {void}
     * @private
     */
    _updatePositionState(type, pixelPosition) {
        // 检查位置是否真的改变了
        const currentPosition = type === 'start' 
            ? this.stateManager.state.playback.scroll.startPosition 
            : this.stateManager.state.playback.scroll.endPosition;
        
        // 如果位置没有改变，直接返回，不提示
        if (currentPosition === pixelPosition) {
            return;
        }
        
        // 更新位置
        if (type === 'start') {
            this.stateManager.state.playback.scroll.startPosition = pixelPosition;
        } else if (type === 'end') {
            this.stateManager.state.playback.scroll.endPosition = pixelPosition;
        }
        
        // 检查是否需要提示用户重新标记卡片
        this._checkAndWarnCardBoundaries(type);
    }
}
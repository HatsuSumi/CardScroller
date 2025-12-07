import { extractFileExtension, EXTENSION_TO_MIME_MAP, calculateBase64FileSize } from '../../helpers/fileUtils.js';
import { loadImageFromDataURL } from '../../helpers/imageLoader.js';
import { formatFileSize } from '../../helpers/fileFormatters.js';
import { formatMP } from '../../helpers/numberFormatters.js';

/**
 * ValidationService - 验证服务
 * 集中管理所有验证规则（纯验证逻辑 + UI验证逻辑），确保验证逻辑的一致性和复用性。本服务负责业务验证（文件大小限制、图片尺寸要求等）
 * 
 * 参数验证 vs 业务验证的判断标准请参考：DESIGN_STANDARDS.md
 * 
 * 当前被使用的模块：
 * - BusinessOrchestrationService (services/system/BusinessOrchestrationService.js) - 业务编排服务，直接调用各验证方法，并作为EventBus中介响应Business层的验证请求
 * - PlaybackControlUIService (services/ui/PlaybackControlUIService.js) - 播放控制UI服务，用于滚动时长验证
 * - PositionSelectorService (services/modal/PositionSelectorService.js) - 位置选择服务，用于滚动配置验证
 * - EntryAnimationConfigPage (services/ui/EntryAnimationConfigPage.js) - 入场动画配置页面，用于入场动画配置验证
 * - PerformanceReportPage (services/ui/PerformanceReportPage.js) - 性能报告页面，用于刷新率验证
 * - EntryAnimationService (services/business/EntryAnimationService.js) - 入场动画服务，用于入场动画配置验证
 * - CardPositionInfoPanel (components/entry-animation/CardPositionInfoPanel.js) - 卡片位置信息面板，用于边界线数组验证
 * - BoundaryEditorManager (components/entry-animation/BoundaryEditorManager.js) - 边界编辑器管理器，用于边界线数组验证
 * - ColorPicker (components/ColorPicker.js) - 颜色选择器组件，用于Hex颜色、RGB/HSV通道值和预设数量验证
 * - ColorPickerModalService (services/modal/ColorPickerModalService.js) - 颜色选择器模态框服务，传递给ColorPickerFactory
 * 
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理器，用于访问验证配置和约束，以及获取默认值
 * - formatFileSize (helpers/fileFormatters.js) - 文件大小格式化工具函数
 * - formatMP (helpers/numberFormatters.js) - 百万像素格式化工具函数
 * - fileProcessStrategyManager (patterns/file/FileProcessStrategyManager.js) - 文件处理策略管理器，用于检查文件类型支持 (通过DI注入)
 * - scrollStrategyManager (patterns/scroll/ScrollStrategyManager.js) - 滚动策略管理器，用于验证动画策略 (通过DI注入)
 * - loadImageFromDataURL (helpers/imageLoader.js) - 图片加载工具函数，用于从base64加载图片 (静态import)
 * - extractFileExtension, calculateBase64FileSize, EXTENSION_TO_MIME_MAP (helpers/fileUtils.js) - 文件工具函数，用于提取文件扩展名、MIME类型映射、Base64文件大小计算
 */

export class ValidationService {
    /**
     * 正方形图片判定阈值（宽高比与1.0的差值小于此值视为正方形）
     */
    static SQUARE_IMAGE_THRESHOLD = 0.1;

    /**
     * 构造函数 - 初始化验证服务
     * @param {StateManager} stateManager - 状态管理器，用于访问验证配置和约束
     * @param {FileProcessStrategyManager} fileProcessStrategyManager - 文件处理策略管理器，用于文件类型检查
     * @param {ScrollStrategyManager} scrollStrategyManager - 滚动策略管理器，用于动画策略验证
     * @throws {Error} 当任何依赖缺失时抛出错误
     */
    constructor(stateManager, fileProcessStrategyManager, scrollStrategyManager) {
        this.stateManager = stateManager;
        this.fileProcessStrategyManager = fileProcessStrategyManager;
        this.scrollStrategyManager = scrollStrategyManager;
        
        // Fail Fast原则 - 验证依赖
        if (!stateManager) {
            throw new Error('ValidationService requires stateManager dependency');
        }
        if (!fileProcessStrategyManager) {
            throw new Error('ValidationService requires fileProcessStrategyManager dependency');
        }
        if (!scrollStrategyManager) {
            throw new Error('ValidationService requires scrollStrategyManager dependency');
        }
        
        // 🎯 性能优化：缓存支持的格式列表（避免在每次validateFile时重复生成）
        this._cachedSupportedFormats = [...new Set(Object.values(EXTENSION_TO_MIME_MAP))].join('\n');
    }


    /**
     * 验证文件
     * @param {File} file - 要验证的文件
     * @param {string} [expectedType] - 期望的文件类型 ('image' | 'config')，不传则接受所有支持的类型
     * @returns {Object} 验证结果 { isValid: boolean, errors: string[], warnings: string[] }
     */
    validateFile(file, expectedType) {
        const errors = [];
        const warnings = [];

        if (!file) {
            errors.push('未提供文件');
            return { isValid: false, errors, warnings };
        }

        // 文件类型验证 - 使用统一的文件类型检查入口
        if (!this.fileProcessStrategyManager.supportsFile(file)) {
            // 🎯 性能优化：使用构造函数中缓存的格式列表
            errors.push(`不支持的文件类型: ${file.type}。\n\n支持的格式:\n${this._cachedSupportedFormats}`);
        } else if (expectedType) {
            // 验证文件是否符合期望的类型
            const strategy = this.fileProcessStrategyManager.findStrategyForFile(file);
            const strategyName = strategy ? strategy.getName() : null;
            
            if (expectedType === 'image' && strategyName !== 'image') {
                errors.push(`不支持的文件类型: ${file.type || '未知'}。\n\n支持格式：\n图片：JPG、PNG、GIF、WebP等`);
            } else if (expectedType === 'config' && strategyName !== 'config') {
                errors.push(`不支持的文件类型: ${file.type || '未知'}。\n\n支持格式：\n配置：JSON文件`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * 验证图片尺寸（采用详细的结构化格式）
     * @param {Object} imageData - 图片数据 { width, height }
     * @param {number} viewportWidth - 视口宽度（由调用方提供，避免直接依赖window对象）
     * @param {number} viewportHeight - 视口高度（由调用方提供，避免直接依赖window对象）
     * @param {File} file - 文件对象，用于验证文件大小
     * @returns {Array} 验证结果数组，每个元素包含 { type, level, message, description, suggestion }
     * @throws {Error} 当参数无效时抛出错误
     */
    validateImageDimensions(imageData, viewportWidth, viewportHeight, file) {
        // Fail Fast: 验证参数（只验证类型和存在性，不验证值范围）
        // 值范围已由上游保证：ImageFileStrategy 保证 width/height > 0，浏览器API保证 viewport > 0
        if (!imageData || typeof imageData !== 'object') {
            throw new Error('imageData parameter is required and must be an object');
        }
        if (typeof imageData.width !== 'number' || typeof imageData.height !== 'number') {
            throw new Error('imageData must contain valid width and height numbers');
        }
        if (typeof viewportWidth !== 'number' || typeof viewportHeight !== 'number') {
            throw new Error('viewportWidth and viewportHeight parameters are required and must be numbers');
        }
        if (!file || !(file instanceof File)) {
            throw new Error('file parameter is required and must be a File object');
        }
        
        const warnings = [];
        const { width, height } = imageData;
        const aspectRatio = width / height;
        
        // 判断是否经过降采样（通过 originalWidth 是否存在且不同于当前 width）
        const isDownsampled = imageData.originalWidth && imageData.originalWidth !== width;
        const downsampledNote = isDownsampled ? '降采样后图片仍不符合要求。' : '';
        
        // 🎯 性能优化：统一在方法开头获取所有需要的配置
        const imageConfig = this.stateManager.state.validation.image;
        
        // Fail Fast: 验证配置对象存在
        if (!imageConfig || typeof imageConfig !== 'object') {
            throw new Error('ValidationService: validation.image configuration is missing or invalid');
        }
        
        const IDEAL_MIN_ASPECT_RATIO = imageConfig.idealMinAspectRatio;
        
        // 1. 检查是否为正方形或接近正方形
        if (Math.abs(aspectRatio - 1.0) <= ValidationService.SQUARE_IMAGE_THRESHOLD) {
            warnings.push({
                type: 'square',
                level: 'warning',
                message: '检测到正方形图片。',
                description: `正方形图片不适合制作滚动视频，建议使用宽度远大于高度的长图。${downsampledNote}`,
                suggestion: '推荐使用宽高比大于2:1的横向长图以获得更好的滚动效果。'
            });
        }
        
        // 2. 检查是否为竖向图片（高度大于宽度）
        else if (aspectRatio < 1.0) {
            warnings.push({
                type: 'portrait',
                level: 'error',
                message: '检测到竖向图片。',
                description: `竖向图片（高度大于宽度）不适合制作水平滚动视频。${downsampledNote}`,
                suggestion: '请使用横向图片，或将图片旋转90度后再上传。推荐宽高比大于2:1的横向长图。'
            });
        }
        
        // 3. 检查宽高比是否过小（不够"长"）
        else if (aspectRatio < IDEAL_MIN_ASPECT_RATIO) {
            warnings.push({
                type: 'aspect-ratio',
                level: 'warning',
                message: '图片宽高比较小。',
                description: `当前宽高比为 ${aspectRatio.toFixed(2)}:1，可能滚动效果不够明显。${downsampledNote}`,
                suggestion: `建议使用宽高比大于 ${IDEAL_MIN_ASPECT_RATIO}:1 的长图以获得更佳的滚动体验。`
            });
        }
        
        // 4. 检查图片宽度是否小于视图宽度（无法滚动）
        if (width <= viewportWidth) {
            warnings.push({
                type: 'width-insufficient',
                level: 'error',
                message: '图片宽度不足以滚动。',
                description: `图片宽度 ${width}px 小于或等于当前浏览器窗口宽度 ${viewportWidth}px，无法进行滚动。${downsampledNote}`,
                suggestion: `建议使用 Photoshop 等图像处理软件将图片宽度调整至 ${Math.round(viewportWidth * imageConfig.viewportMultiplier)}px 以上，然后重新导入。`
            });
        }
        
        // 5. 检查图片尺寸是否过小
        if (width < imageConfig.minRecommendedWidth || height < imageConfig.minRecommendedHeight) {
            warnings.push({
                type: 'resolution',
                level: 'warning',
                message: '图片分辨率较低。',
                description: `当前尺寸为 ${width}×${height}px，可能在高分辨率显示器上效果不佳。${downsampledNote}`,
                suggestion: `建议使用 Photoshop 等软件将图片调整至宽度至少${imageConfig.minRecommendedWidth}px，高度至少${imageConfig.minRecommendedHeight}px，然后重新导入以确保清晰度。`
            });
        }
        
        // 6. 检查图片像素尺寸是否过大（可能影响渲染性能）
        const totalPixels = width * height;
        
        if (width > imageConfig.maxSafeWidth || height > imageConfig.maxSafeHeight || totalPixels > imageConfig.maxSafePixels) {
            warnings.push({
                type: 'oversized-pixels',
                level: 'info',
                message: '图片像素尺寸较大。',
                description: `图片尺寸 ${width}×${height}px（${formatMP(totalPixels)}）较大，可能影响渲染性能。`,
                suggestion: '如果遇到性能问题，可以考虑使用 Photoshop 等软件适当降低分辨率。如果您发现图片在滚动期间保持流畅，则可忽略建议。'
            });
        }
        
        // 7. 检查文件大小是否过大（可能影响加载速度）
        // 使用 imageData.fileSize（降采样后的实际大小）而不是 file.size（原始文件大小）
        // 因为实际加载的是降采样后的 base64 数据
        // Fail Fast: imageData.fileSize 必须存在
        if (typeof imageData.fileSize !== 'number') {
            throw new Error('imageData.fileSize is required and must be a number');
        }
        
        if (imageData.fileSize > imageConfig.maxFileSize) {
            warnings.push({
                type: 'oversized-file',
                level: 'info',
                message: '图片文件较大。',
                description: `文件大小 ${formatFileSize(imageData.fileSize)} 较大，可能影响加载速度。`,
                suggestion: '如果遇到加载缓慢问题，可以考虑使用 Photoshop 等软件压缩图片质量。如果您发现图片在滚动期间保持流畅，则可忽略建议。'
            });
        }
        
        // 8. 检查图片高度是否过高（可能在缩放后仍超出视口）
        const scaledHeight = height * (viewportWidth / width);
        if (scaledHeight > viewportHeight * imageConfig.viewportMultiplier) {
            warnings.push({
                type: 'height-excessive',
                level: 'info',
                message: '图片高度较高。',
                description: `图片按比例缩放后高度约为 ${Math.round(scaledHeight)}px，可能超出屏幕显示范围。`,
                suggestion: '虽然不影响滚动功能，但建议适当裁剪图片高度以获得更好的视觉效果。'
            });
        }
        
        // 理想情况不显示任何提示，保持静默
        
        return warnings;
    }

    /**
     * 验证滚动位置配置
     * 
     * 职责：验证起始位置和结束位置的关系，确保位置配置有效
     * 注意：本方法只验证位置关系，不验证duration（duration由validateDuration单独验证）
     * 
     * @param {Object} config - 滚动配置对象（只使用startPosition和endPosition）
     * @param {number} config.startPosition - 起始位置（像素）
     * @param {number} config.endPosition - 结束位置（像素）
     * @returns {Object} 验证结果 { isValid: boolean, errors: string[] }
     * @throws {Error} 当参数无效时抛出错误
     */
    validateScrollConfig(config) {
        // Fail Fast: 验证参数
        if (!config || typeof config !== 'object') {
            throw new Error('config parameter is required and must be an object');
        }
        if (typeof config.startPosition !== 'number') {
            throw new Error('config.startPosition must be a number');
        }
        if (typeof config.endPosition !== 'number') {
            throw new Error('config.endPosition must be a number');
        }
        
        const { startPosition, endPosition } = config;
        const errors = [];

        // 位置验证（HTML滑块已确保位置 >= 0，所以不需要验证负数）
        if (startPosition === endPosition) {
            errors.push('起始位置和结束位置不能相同');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * 验证配置文件
     * @param {File} file - 配置文件
     * @throws {Error} 验证失败时抛出错误
     */
    validateConfigFile(file) {
        // Fail Fast: 验证文件对象
        if (!file) {
            throw new Error('请选择一个文件');
        }
        
        // Fail Fast: 严格验证文件类型，空字符串表示无法识别（可能是恶意文件）
        if (!file.type) {
            throw new Error(`无法识别文件类型，请确认文件是否有效！\n这可能是恶意文件或损坏的文件，已阻止上传。`);
        }
        
        // 🎯 更严格的文件类型验证
        const isJsonByType = file.type === 'application/json' || file.type.includes('json');
        const isJsonByName = file.name.toLowerCase().endsWith('.json');
        
        if (!isJsonByName && !isJsonByType) {
            throw new Error(`请选择JSON配置文件！\n文件类型：${file.type}\n只支持.json格式的配置文件`);
        }
        
        // 注意：按照用户原始设计，配置文件导入不限制文件大小
    }

    /**
     * 验证配置数据
     * @param {Object} data - 配置数据
     * @param {Array} supportedVersions - 支持的版本列表
     * @returns {Object} 验证结果 { isValid, errors, warnings }
     * @throws {Error} 当必需参数无效时抛出错误
     */
    validateConfigData(data, supportedVersions) {
        // Fail Fast: 验证必需参数
        if (!Array.isArray(supportedVersions) || supportedVersions.length === 0) {
            throw new Error('supportedVersions parameter is required and must be a non-empty array');
        }
        
        const errors = [];
        
        // 检查基本结构
        if (!data || typeof data !== 'object') {
            errors.push('无效的配置格式');
            return { isValid: false, errors };
        }
        
        if (!data.version) {
            errors.push('检测到配置文件缺少version字段');
        } else if (!supportedVersions.includes(data.version)) {
            errors.push(`不支持的版本: ${data.version}`);
        }
        
        if (!data.timestamp) {
            errors.push('检测到配置文件缺少timestamp字段');
        } else if (typeof data.timestamp !== 'string') {
            errors.push('timestamp字段必须是字符串类型');
        }
        
        if (!data.config || typeof data.config !== 'object') {
            errors.push('检测到配置文件缺少config部分');
            return { isValid: false, errors };
        }
        
        // 🎯 性能优化：统一缓存所有需要的配置对象，减少深层属性访问
        const config = data.config;
        const validationState = this.stateManager.state.validation;
        const loopConstraints = validationState.loop;
        const sequenceConstraints = validationState.sequence;
        const uiConstraints = validationState.ui;
        const validAnimationStrategies = this.scrollStrategyManager.getAvailableStrategies();
        
        // 验证滚动配置（必需字段）
        if (!config.scroll) {
            errors.push('检测到配置文件缺少scroll配置');
        } else if (typeof config.scroll !== 'object') {
            errors.push('scroll配置必须是对象类型');
        } else {
            if (typeof config.scroll.startPosition !== 'number' ||
                typeof config.scroll.endPosition !== 'number' ||
                typeof config.scroll.duration !== 'number') {
                errors.push('无效的滚动配置');
            }
            
            // 验证时长范围（使用 validation.sequence.minDuration）
            if ('duration' in config.scroll && 
                config.scroll.duration < sequenceConstraints.minDuration) {
                errors.push(`无效的滚动时长: 必须 >= ${sequenceConstraints.minDuration}秒`);
            }
            
            // 验证位置范围
            if ('startPosition' in config.scroll && config.scroll.startPosition < 0) {
                errors.push('无效的起始位置: 必须 >= 0');
            }
            if ('endPosition' in config.scroll && config.scroll.endPosition < 0) {
                errors.push('无效的结束位置: 必须 >= 0');
            }
            
            // 验证起始位置和结束位置的关系（复用 validateScrollConfig）
            if ('startPosition' in config.scroll && 'endPosition' in config.scroll) {
                try {
                    const positionValidation = this.validateScrollConfig({
                        startPosition: config.scroll.startPosition,
                        endPosition: config.scroll.endPosition
                    });
                    if (!positionValidation.isValid) {
                        errors.push(...positionValidation.errors);
                    }
                } catch (error) {
                    // validateScrollConfig 的 Fail Fast 参数验证已在上面的类型检查中完成
                    // 这里不应该抛出错误，如果抛出则说明有架构问题
                    throw new Error(`validateScrollConfig failed unexpectedly: ${error.message}`);
                }
            }
            
            // 注意：滚动位置是否超过图片实际宽度的验证需要异步进行（解析base64）
            // 此验证在 validateConfigImageDimensions() 方法中处理
            
            // 验证反向滚动字段
            if ('reverseScroll' in config.scroll && typeof config.scroll.reverseScroll !== 'boolean') {
                errors.push('无效的反向滚动设置: 必须是布尔值');
            }
            
            // 验证动画策略字段（使用已缓存的 validAnimationStrategies）
            // 移除对 animationStrategy 的验证，因为它现在是全局偏好
        }
        
        
        // 验证播放配置（必需字段）
        if (!config.playback) {
            errors.push('检测到配置文件缺少playback配置');
        } else if (typeof config.playback !== 'object') {
            errors.push('playback配置必须是对象类型');
        } else {
            // Fail Fast：验证配置文件格式规范
            // scroll 字段必须在顶层，不能在 playback 下
            if ('scroll' in config.playback) {
                errors.push(
                    '配置文件格式错误：scroll 字段应该在顶层，不应该在 playback 下。\n' +
                    '正确格式：{ "scroll": {...}, "playback": {...} }\n' +
                    '错误格式：{ "playback": { "scroll": {...} } }'
                );
            }
            
            // 验证boolean字段
            const booleanFields = ['loop', 'autoResetAfterComplete', 'variableDuration'];
            booleanFields.forEach(field => {
                if (field in config.playback && typeof config.playback[field] !== 'boolean') {
                    errors.push(`无效的播放设置 ${field}: 必须是布尔值`);
                }
            });
            
            // 验证数值字段
            const numberFields = ['loopCount', 'intervalTime'];
            numberFields.forEach(field => {
                if (field in config.playback && typeof config.playback[field] !== 'number') {
                    errors.push(`无效的播放设置 ${field}: 必须是数字`);
                }
            });
            
            // 验证数组字段
            if ('durationSequence' in config.playback && !Array.isArray(config.playback.durationSequence)) {
                errors.push('无效的时长序列: 必须是数组');
            }
            
            // 验证循环间隔范围（无论循环是否开启，都验证参数有效性）
            if ('intervalTime' in config.playback) {
                if (config.playback.intervalTime < 0) {
                    errors.push('无效的循环间隔: 必须 >= 0毫秒');
                }
            }
            
            // 验证循环次数范围（无论循环是否开启，都验证参数有效性）
            // 注意：0 是特殊值，表示"无限循环"，是合法的（使用已缓存的 loopConstraints）
            if ('loopCount' in config.playback) {
                const loopCount = config.playback.loopCount;
                // 允许 0（无限循环）或在有效范围内的值
                if (loopCount !== 0 && (loopCount < loopConstraints.minCount || loopCount > loopConstraints.maxCount)) {
                    errors.push(`无效的循环次数: 必须为0（无限循环）或在${loopConstraints.minCount}到${loopConstraints.maxCount}之间`);
                }
            }
            
            // 验证时长序列中每个值的范围（无论变长时长是否开启，都验证数组内容有效性）
            // 使用已缓存的 sequenceConstraints
            if ('durationSequence' in config.playback && Array.isArray(config.playback.durationSequence)) {
                config.playback.durationSequence.forEach((duration, index) => {
                    if (typeof duration !== 'number' || duration < sequenceConstraints.minDuration) {
                        errors.push(`无效的时长序列第${index + 1}项: 必须 >= ${sequenceConstraints.minDuration}秒`);
                    }
                });
            }
            
            // ========== 验证入场动画配置 ==========
            // 1️⃣ 类型验证（严格，针对配置文件导入）
            if ('entryAnimationEnabled' in config.playback) {
                if (typeof config.playback.entryAnimationEnabled !== 'boolean') {
                    errors.push('无效的入场动画启用设置: 必须是布尔值');
                }
            }
            
            // 验证数值字段类型
            const entryAnimationNumberFields = {
                'entryAnimationDuration': '单张卡片动画时长',
                'entryAnimationStaggerDelay': '卡片间隔延迟',
                'entryAnimationIntervalBeforeScroll': '入场动画和滚动动画的间隔时长'
            };
            Object.entries(entryAnimationNumberFields).forEach(([field, label]) => {
                if (field in config.playback && typeof config.playback[field] !== 'number') {
                    errors.push(`无效的${label}: 必须是数字`);
                }
            });
            
            // 验证数组字段类型
            if ('entryAnimationCardBoundaries' in config.playback && !Array.isArray(config.playback.entryAnimationCardBoundaries)) {
                errors.push('无效的卡片边界数据: 必须是数组');
            }
            
            if ('entryAnimationCardAnimations' in config.playback && !Array.isArray(config.playback.entryAnimationCardAnimations)) {
                errors.push('无效的卡片动画类型数据: 必须是数组');
            }
            
            // 2️⃣ 验证数组元素类型
            if ('entryAnimationCardAnimations' in config.playback && Array.isArray(config.playback.entryAnimationCardAnimations)) {
                config.playback.entryAnimationCardAnimations.forEach((animation, index) => {
                    if (typeof animation !== 'string') {
                        errors.push(`无效的卡片动画类型第${index + 1}项: 必须是字符串`);
                    }
                });
            }
            
            // 3️⃣ 复用 validateEntryAnimationConfig 验证值范围和业务规则（无论是否启用，都验证参数有效性）
            if ('entryAnimationEnabled' in config.playback) {
                try {
                    // 构造验证上下文（用于视口范围验证）
                    let validationContext = null;
                    if (config.image && config.scroll && 
                        typeof config.image.width === 'number' &&
                        typeof config.scroll.startPosition === 'number' &&
                        typeof config.scroll.endPosition === 'number' &&
                        typeof config.scroll.reverseScroll === 'boolean') {
                        validationContext = {
                            imageWidth: config.image.width,
                            startPosition: config.scroll.startPosition,
                            endPosition: config.scroll.endPosition,
                            reverseScroll: config.scroll.reverseScroll
                        };
                    }
                    
                    const entryAnimationValidation = this.validateEntryAnimationConfig({
                        enabled: config.playback.entryAnimationEnabled,
                        cardBoundaries: config.playback.entryAnimationCardBoundaries,
                        cardAnimations: config.playback.entryAnimationCardAnimations,
                        duration: config.playback.entryAnimationDuration,
                        staggerDelay: config.playback.entryAnimationStaggerDelay,
                        intervalBeforeScroll: config.playback.entryAnimationIntervalBeforeScroll
                    }, { 
                        skipEnabledCheck: true,  // 强制验证，无论是否启用
                        context: validationContext  // 传递上下文用于视口范围验证
                    });
                    if (!entryAnimationValidation.isValid) {
                        errors.push(...entryAnimationValidation.errors);
                    }
                } catch (error) {
                    // validateEntryAnimationConfig 可能因为类型错误抛出异常
                    // 但类型验证已在上面完成，这里不应该抛出
                    throw new Error(`validateEntryAnimationConfig failed unexpectedly: ${error.message}`);
                }
            }
            
            // 4️⃣ 额外的配置文件特有验证：cardAnimations 数量必须匹配 cardBoundaries
            if ('entryAnimationCardBoundaries' in config.playback && 
                'entryAnimationCardAnimations' in config.playback &&
                Array.isArray(config.playback.entryAnimationCardBoundaries) &&
                Array.isArray(config.playback.entryAnimationCardAnimations)) {
                const cardCount = config.playback.entryAnimationCardBoundaries.length / 2;
                if (config.playback.entryAnimationCardAnimations.length !== cardCount) {
                    errors.push(`卡片动画数量不匹配: 定义了${cardCount}张卡片，但提供了${config.playback.entryAnimationCardAnimations.length}个动画类型`);
                }
            }
        }
        
        // 验证UI配置（必需字段）
        if (!config.ui) {
            errors.push('检测到配置文件缺少ui配置');
        } else if (typeof config.ui !== 'object') {
            errors.push('ui配置必须是对象类型');
        } else {
            // 验证boolean字段
            // 移除了 autoHideSidebar 的验证
            
            // 验证数值字段
            const uiNumberFields = ['sidebarOpacity'];
            uiNumberFields.forEach(field => {
                if (field in config.ui && typeof config.ui[field] !== 'number') {
                    errors.push(`无效的UI设置 ${field}: 必须是数字`);
                }
            });
            
            // 验证透明度范围（使用已缓存的 uiConstraints）
            if ('sidebarOpacity' in config.ui) {
                if (config.ui.sidebarOpacity < uiConstraints.minSidebarOpacity || config.ui.sidebarOpacity > uiConstraints.maxSidebarOpacity) {
                    errors.push(`无效的侧边栏透明度: 必须在${uiConstraints.minSidebarOpacity}到${uiConstraints.maxSidebarOpacity}之间`);
                }
            }
            
            // 验证延迟时间范围（无论自动隐藏是否开启，都验证参数有效性）
            // 移除了 autoHideDelay 的验证
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings: []
        };
    }

    /**
     * 验证滚动时长值（纯验证方法，不操作DOM）
     * @param {string|number} inputValue - 输入值
     * @returns {Object} 验证结果 { isValid, errorType, errorMessage }
     */
    validateDuration(inputValue) {
        const minDuration = this.stateManager.state.validation.sequence.minDuration;
        return this._validateDurationValue(inputValue, minDuration, '滚动时长');
    }

    /**
     * 验证时长序列值（纯验证方法，不操作DOM）
     * @param {string|number} inputValue - 输入值
     * @returns {Object} 验证结果 { isValid, errorType, errorMessage }
     */
    validateSequenceValue(inputValue) {
        const minDuration = this.stateManager.state.validation.sequence.minDuration;
        return this._validateDurationValue(inputValue, minDuration, '时长');
    }

    /**
     * 验证时长值的通用方法
     * @param {string|number} inputValue - 输入值
     * @param {number} minDuration - 最小时长
     * @param {string} fieldName - 字段名称（用于错误消息）
     * @returns {Object} 验证结果 { isValid, errorType, errorMessage }
     * @private
     */
    _validateDurationValue(inputValue, minDuration, fieldName) {
        // 标准化输入值
        const strValue = typeof inputValue === 'string' ? inputValue.trim() : String(inputValue);
        const value = parseFloat(strValue);
        
        // 检查空值（strValue已经是字符串，只需检查空字符串）
        if (strValue === '') {
            return {
                isValid: false,
                errorType: 'empty',
                errorMessage: `请输入有效的${fieldName}（不支持算术表达式）`
            };
        }
        
        if (isNaN(value) || value < minDuration) {
            return {
                isValid: false,
                errorType: 'min',
                errorMessage: `${fieldName}必须大于等于${fieldName === '时长' ? ' ' : ''}${minDuration}秒`
            };
        }
        
        return {
            isValid: true,
            errorType: null,
            errorMessage: null
        };
    }

    /**
     * 检查时长序列数组是否有验证错误（纯验证方法）
     * @param {Array} durationValues - 时长值数组
     * @returns {boolean} 是否有错误
     */
    hasSequenceValidationErrors(durationValues) {
        if (!Array.isArray(durationValues)) {
            return true; // 如果不是数组，视为有错误
        }
        
        return durationValues.some(value => {
            const validation = this.validateSequenceValue(value);
            return !validation.isValid;
        });
    }


    /**
     * 验证滚动参数变化（从ScrollService迁移）
     * 
     * 根据参数类型选择正确的验证方法：
     * - duration: 使用 validateDuration 验证时长有效性
     * - startPosition/endPosition: 使用 validateScrollConfig 验证位置关系
     * 
     * @param {string} paramType - 参数类型：'duration', 'startPosition', 'endPosition'
     * @param {*} newValue - 新值
     * @param {Object} currentScrollConfig - 当前滚动配置 { startPosition, endPosition, duration }
     * @returns {Object} 验证结果 { isValid, errors, needsRestore, previousValue, paramType }
     * @throws {Error} 当参数无效时抛出错误
     */
    validateScrollParameterChange(paramType, newValue, currentScrollConfig) {
        // Fail Fast: 验证参数
        if (!paramType || typeof paramType !== 'string') {
            throw new Error('paramType parameter is required and must be a string');
        }
        const validParamTypes = ['duration', 'startPosition', 'endPosition'];
        if (!validParamTypes.includes(paramType)) {
            throw new Error(`paramType must be one of: ${validParamTypes.join(', ')}`);
        }
        if (newValue === null || newValue === undefined) {
            throw new Error('newValue parameter is required');
        }
        if (!currentScrollConfig || typeof currentScrollConfig !== 'object') {
            throw new Error('currentScrollConfig parameter is required and must be an object');
        }
        
        let validation;
        
        // 根据参数类型选择正确的验证方法
        if (paramType === 'duration') {
            // 验证时长（使用专门的 validateDuration 方法）
            const durationValidation = this.validateDuration(newValue);
            
            // 统一返回格式：将 errorMessage 转换为 errors 数组
            validation = {
                isValid: durationValidation.isValid,
                errors: durationValidation.isValid ? [] : [durationValidation.errorMessage]
            };
        } else {
            // 验证位置（startPosition 或 endPosition）
            // 创建包含新值的配置副本
            const testConfig = { ...currentScrollConfig };
            testConfig[paramType] = newValue;
            
            // 使用 validateScrollConfig 验证位置关系
            validation = this.validateScrollConfig(testConfig);
        }

        // 🎯 性能优化：只在验证失败时获取对应的默认值，避免创建不必要的对象
        let previousValue;
        if (!validation.isValid) {
            previousValue = this.stateManager.getDefaultValue(`playback.scroll.${paramType}`);
        }

        return {
            isValid: validation.isValid,
            errors: validation.errors,
            needsRestore: !validation.isValid,
            previousValue,
            paramType
        };
    }

    /**
     * 验证循环次数
     * @param {number|string} loopCount - 循环次数值
     * @returns {Object} 验证结果 { isValid: boolean, error: string|null }
     * @throws {Error} 当参数无效时抛出错误
     */
    validateLoopCount(loopCount) {
        // Fail Fast: 验证必需参数
        if (loopCount === null || loopCount === undefined) {
            throw new Error('loopCount parameter is required');
        }
        
        const loopConstraints = this.stateManager.state.validation.loop;
        const minCount = loopConstraints.minCount;
        const maxCount = loopConstraints.maxCount;

        // 解析为整数
        const value = parseInt(loopCount, 10);

        // 验证是否为有效数字
        if (isNaN(value)) {
            return {
                isValid: false,
                error: `无效的循环次数: "${loopCount}" 不是有效数字`
            };
        }

        // 验证范围（允许 0 作为"无限循环"的特殊值）
        if (value !== 0 && (value < minCount || value > maxCount)) {
            return {
                isValid: false,
                error: `无效的循环次数: ${value}. 必须为0（无限循环）或在 ${minCount} 到 ${maxCount} 之间`
            };
        }

        // 验证通过
        return {
            isValid: true,
            error: null
        };
    }

    /**
     * 验证配置中的图片元数据格式和类型
     * @param {Object} imageConfig - 图片配置对象
     * @returns {Array} 错误数组
     * @throws {Error} 当参数无效时抛出错误
     */
    validateImageMetadataFormat(imageConfig) {
        // Fail Fast: 验证参数
        if (!imageConfig || typeof imageConfig !== 'object') {
            throw new Error('imageConfig parameter is required and must be an object');
        }
        
        const errors = [];
        
        // 🎯 性能优化：在方法开头统一获取配置，避免在验证过程中重复访问
        const ppiConstraints = this.stateManager.state.validation.ppi;

        // 验证必需字段是否存在
        if (!imageConfig.fileName) {
            errors.push('检测到配置文件缺少fileName字段');
        } else if (typeof imageConfig.fileName !== 'string') {
            errors.push('fileName字段必须是字符串类型');
        } else {
            // 检查文件名是否有合法的图片扩展名
            // 使用 fileUtils 的 EXTENSION_TO_MIME_MAP
            const extension = extractFileExtension(imageConfig.fileName, { throwOnMissing: false });
            if (!extension) {
                errors.push('fileName必须包含文件扩展名');
            } else if (!(extension in EXTENSION_TO_MIME_MAP)) {
                errors.push(`fileName包含不支持的文件扩展名: .${extension}`);
            }
        }

        // 验证 width（必需字段）
        if (imageConfig.width === null || imageConfig.width === undefined) {
            errors.push('检测到配置文件缺少width字段');
        } else if (typeof imageConfig.width !== 'number' || imageConfig.width <= 0) {
            errors.push('width字段必须是正数');
        }

        // 验证 height（必需字段）
        if (imageConfig.height === null || imageConfig.height === undefined) {
            errors.push('检测到配置文件缺少height字段');
        } else if (typeof imageConfig.height !== 'number' || imageConfig.height <= 0) {
            errors.push('height字段必须是正数');
        }

        // 验证 fileSize（必需字段）
        if (imageConfig.fileSize === null || imageConfig.fileSize === undefined) {
            errors.push('检测到配置文件缺少fileSize字段');
        } else if (typeof imageConfig.fileSize !== 'number' || imageConfig.fileSize < 0) {
            errors.push('fileSize字段必须是非负数');
        }

        // 验证 dataUrl（必需字段）
        if (!imageConfig.dataUrl) {
            errors.push('检测到配置文件缺少dataUrl字段');
        } else if (typeof imageConfig.dataUrl !== 'string') {
            errors.push('dataUrl字段必须是字符串类型');
        } else if (!imageConfig.dataUrl.startsWith('data:image/')) {
            errors.push('dataUrl必须是有效的图片Base64数据格式');
        }

        // 验证PPI值格式和范围（使用已缓存的 ppiConstraints）
        ['ppiX', 'ppiY'].forEach(field => {
            if (imageConfig[field] !== null && imageConfig[field] !== undefined) {
                if (typeof imageConfig[field] !== 'number' || imageConfig[field] <= ppiConstraints.minValue || imageConfig[field] > ppiConstraints.maxValue) {
                    errors.push(`${field}字段必须是${ppiConstraints.minValue + 1}-${ppiConstraints.maxValue}之间的正数`);
                }
            }
        });

        // 验证lastModified时间戳格式 - 必需字段（Fail Fast）
        if (imageConfig.lastModified === null || imageConfig.lastModified === undefined) {
            errors.push('检测到配置文件缺少lastModified字段');
        } else if (typeof imageConfig.lastModified !== 'number' || imageConfig.lastModified < 0) {
            errors.push('lastModified字段必须是非负数的时间戳');
        } else {
            // 检查是否是合理的时间范围（1970-2100年）
            const minTimestamp = 0; // 1970-01-01
            const maxTimestamp = 4102444800000; // 2100-01-01
            if (imageConfig.lastModified < minTimestamp || imageConfig.lastModified > maxTimestamp) {
                errors.push('lastModified时间戳超出合理范围(1970-2100年)');
            }
        }

        return errors;
    }

    /**
     * 验证配置中的图片数据（异步）- 从base64解析真实图片尺寸和文件大小验证滚动位置
     * @param {Object} config - 配置数据
     * @param {Object} config.image - 图片配置对象（必需）
     * @param {string} config.image.dataUrl - 图片Base64数据（必需）
     * @param {Object} config.scroll - 滚动配置对象（必需）
     * @returns {Promise<Object>} 验证结果 { isValid, errors }
     * @throws {Error} 当参数无效时抛出错误
     */
    async validateConfigImageDimensions(config) {
        // Fail Fast: 验证参数
        if (!config || typeof config !== 'object') {
            throw new Error('config parameter is required and must be an object');
        }
        
        // Fail Fast: 配置文件必须包含图片数据（导出时没有"不包含图片"选项）
        if (!config.image || typeof config.image !== 'object') {
            throw new Error('config.image is required and must be an object');
        }
        if (!config.image.dataUrl || typeof config.image.dataUrl !== 'string') {
            throw new Error('config.image.dataUrl is required and must be a string');
        }
        if (!config.scroll || typeof config.scroll !== 'object') {
            throw new Error('config.scroll is required and must be an object');
        }
        
        const errors = [];

        try {
            // 从base64解析真实图片尺寸和文件大小（直接使用工具函数）
            const img = await loadImageFromDataURL(config.image.dataUrl);
            const realWidth = img.naturalWidth;
            const realHeight = img.naturalHeight;
            const realFileSize = calculateBase64FileSize(config.image.dataUrl);
            
            // 验证滚动位置是否超过真实图片宽度
            if ('startPosition' in config.scroll && config.scroll.startPosition > realWidth) {
                errors.push(`起始位置超出图片实际范围: ${config.scroll.startPosition}px > ${realWidth}px (配置中记录宽度: ${config.image.width}px)`);
            }
            if ('endPosition' in config.scroll && config.scroll.endPosition > realWidth) {
                errors.push(`结束位置超出图片实际范围: ${config.scroll.endPosition}px > ${realWidth}px (配置中记录宽度: ${config.image.width}px)`);
            }
            
            // 检查配置中的尺寸和文件大小信息是否被篡改
            // Fail Fast: 使用明确的 null/undefined 检查，不使用 && 运算符
            if (config.image.width !== null && config.image.width !== undefined) {
                if (config.image.width !== realWidth) {
                    errors.push(`配置文件中的图片宽度信息不准确: 记录${config.image.width}px，实际${realWidth}px`);
                }
            }
            if (config.image.height !== null && config.image.height !== undefined) {
                if (config.image.height !== realHeight) {
                    errors.push(`配置文件中的图片高度信息不准确: 记录${config.image.height}px，实际${realHeight}px`);
                }
            }
            // 允许5%的误差（因为不同编码方式可能有细微差异）
            const tolerance = realFileSize * 0.05;
            if (config.image.fileSize !== null && config.image.fileSize !== undefined) {
                if (Math.abs(config.image.fileSize - realFileSize) > tolerance) {
                    errors.push(`配置文件中的文件大小信息不准确: 记录${config.image.fileSize}字节，实际${realFileSize}字节`);
                }
            }
            
        } catch (error) {
            errors.push(`无法解析图片尺寸: ${error.message}`);
        }

        return { isValid: errors.length === 0, errors };
    }

    /**
     * 验证卡片边界线数组
     * 
     * 验证用户输入或配置文件中的边界线数组是否符合业务规则。
     * 此方法被 validateEntryAnimationConfig 和 EntryAnimationConfigPage._restoreBoundaries 复用。
     * 
     * @param {any} boundaries - 待验证的边界线数据（可能是任何类型，因为可能来自用户输入）
     * @param {Object} [context] - 可选的上下文信息，用于视口范围验证
     * @param {number} [context.imageWidth] - 图片宽度（用于范围验证）
     * @param {number} [context.startPosition] - 滚动起点
     * @param {number} [context.endPosition] - 滚动终点
     * @param {boolean} [context.reverseScroll] - 是否反向滚动
     * @returns {Object} 验证结果 { isValid: boolean, errors: string[] }
     */
    validateCardBoundaries(boundaries, context = null) {
        const errors = [];
        
        // 1️⃣ 基础格式验证
        // 验证是数组
        if (!Array.isArray(boundaries)) {
            errors.push('边界线数据必须是一个数组');
            return { isValid: false, errors }; // 不是数组就不用继续验证了
        }
        
        // 验证所有元素都是数字
        const allNumbers = boundaries.every(b => typeof b === 'number' && !isNaN(b) && isFinite(b));
        if (!allNumbers) {
            errors.push('边界线数组中所有元素必须是有效的数字');
        }
        
        // 验证至少2个元素（至少一张卡片）
        if (boundaries.length < 2) {
            errors.push('至少需要 2 个边界线位置（定义 1 张卡片）');
        }
        
        // 验证长度是偶数（每张卡片由2条边界线定义）
        if (boundaries.length % 2 !== 0) {
            errors.push(`边界线数量必须是偶数（当前${boundaries.length}条）。每张卡片需要2条边界线（左边界和右边界）`);
        }
        
        // 2️⃣ 视口范围验证（如果提供了上下文）
        if (context && boundaries.length >= 2 && allNumbers) {
            const { imageWidth, startPosition, endPosition, reverseScroll } = context;
            
            // Fail Fast: 验证上下文参数完整性
            if (typeof imageWidth !== 'number' || typeof startPosition !== 'number' || 
                typeof endPosition !== 'number' || typeof reverseScroll !== 'boolean') {
                throw new Error('ValidationService.validateCardBoundaries: context must contain imageWidth, startPosition, endPosition, and reverseScroll');
            }
            
            // 计算实际的视口起点（考虑反向滚动）
            const viewportStart = reverseScroll ? endPosition : startPosition;
            const viewportEnd = reverseScroll ? startPosition : endPosition;
            
            // 检查每条边界线是否在视口范围内
            const outOfRangeBoundaries = [];
            boundaries.forEach((b, i) => {
                if (b < viewportStart || b > viewportEnd) {
                    outOfRangeBoundaries.push({ index: i + 1, value: b });
                }
            });
            
            if (outOfRangeBoundaries.length > 0) {
                const boundaryList = outOfRangeBoundaries.map(b => `第${b.index}条边界线 (${b.value}px)`).join('、');
                errors.push(`${boundaryList} 超出当前视口范围 [${viewportStart}, ${viewportEnd}]。这可能是因为边界线是在不同的滚动设置下标记的（如${reverseScroll ? '正向' : '反向'}滚动模式、不同的起始/结束位置）`);
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * 验证刷新率值（用于性能监控页面的用户输入）
     * @param {number|string} refreshRate - 刷新率值（Hz）
     * @returns {Object} 验证结果 { isValid: boolean, errors: string[] }
     */
    validateRefreshRate(refreshRate) {
        const errors = [];
        
        // 解析为整数
        const value = parseInt(refreshRate, 10);
        
        // 从 defaultState 获取刷新率约束
        const minRefreshRate = this.stateManager.state.validation.performance.minRefreshRate;
        const maxRefreshRate = this.stateManager.state.validation.performance.maxRefreshRate;
        
        // 验证是否为有效数字
        if (isNaN(value)) {
            errors.push(`刷新率必须是有效的数字`);
            return { isValid: false, errors };
        }
        
        // 验证范围
        if (value < minRefreshRate || value > maxRefreshRate) {
            errors.push(`刷新率必须在 ${minRefreshRate}-${maxRefreshRate} Hz 范围内`);
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * 验证入场动画配置
     * 
     * 统一的入场动画配置验证逻辑，确保配置的完整性和有效性
     * 
     * @param {Object} config - 入场动画配置对象
     * @param {boolean} config.enabled - 是否启用入场动画
     * @param {number[]} config.cardBoundaries - 卡片边界数组（扁平格式：[x1, x2, x3, x4, ...]）
     * @param {string[]} config.cardAnimations - 每张卡片的动画类型数组
     * @param {number} config.duration - 单张卡片动画时长（毫秒）
     * @param {number} config.staggerDelay - 卡片间隔延迟（毫秒）
     * @param {Object} [options] - 验证选项
     * @param {boolean} [options.skipEnabledCheck=false] - 是否跳过enabled检查，强制验证所有字段（用于配置文件导入）
     * @param {Object} [options.context] - 可选的上下文信息，用于视口范围验证（配置文件导入时传入）
     * @param {number} [options.context.imageWidth] - 图片宽度
     * @param {number} [options.context.startPosition] - 滚动起点
     * @param {number} [options.context.endPosition] - 滚动终点
     * @param {boolean} [options.context.reverseScroll] - 是否反向滚动
     * @returns {Object} 验证结果 { isValid: boolean, errors: string[] }
     * @throws {Error} 当config参数无效时抛出错误（Fail Fast）
     */
    validateEntryAnimationConfig(config, options = {}) {
        // Fail Fast: 验证config参数
        if (!config || typeof config !== 'object') {
            throw new Error('ValidationService.validateEntryAnimationConfig: config must be an object');
        }

        const errors = [];
        
        // 如果未启用且未跳过enabled检查，不需要验证内容（保存时允许禁用状态）
        // 但配置文件导入时需要强制验证（无论是否启用，都要确保参数有效性）
        if (config.enabled === false && !options.skipEnabledCheck) {
            return { isValid: true, errors: [] };
        }
        
        // 复用边界线验证（传递可选的上下文用于视口范围验证）
        const boundaryValidation = this.validateCardBoundaries(config.cardBoundaries, options.context);
        if (!boundaryValidation.isValid) {
            errors.push(...boundaryValidation.errors);
        }
        
        // 验证单张卡片动画时长
        if (typeof config.duration !== 'number' || isNaN(config.duration) || config.duration <= 0) {
            errors.push('单张卡片动画时长必须是大于0的数字');
        }
        
        // 验证卡片间隔延迟
        if (typeof config.staggerDelay !== 'number' || isNaN(config.staggerDelay) || config.staggerDelay < 0) {
            errors.push('卡片间隔延迟必须是大于等于0的数字');
        }
        
        // 验证入场动画和滚动动画的间隔时长
        if (config.intervalBeforeScroll !== undefined) {
            if (typeof config.intervalBeforeScroll !== 'number' || isNaN(config.intervalBeforeScroll) || config.intervalBeforeScroll < 0) {
                errors.push('入场动画和滚动动画的间隔时长必须是大于等于0的数字');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * 验证数值通道的通用方法（私有）
     * 
     * 提取RGB和HSV通道验证的公共逻辑
     * 
     * @param {number|string} value - 通道值
     * @param {string} channelName - 通道名称（用于错误消息）
     * @param {number} min - 最小值
     * @param {number} max - 最大值
     * @param {string} rangeText - 范围描述文本
     * @returns {Object} 验证结果 { isValid: boolean, error: string|null, value: number|null }
     * @private
     */
    _validateNumericChannel(value, channelName, min, max, rangeText) {
        // 验证参数类型
        if (typeof value !== 'number' && typeof value !== 'string') {
            return {
                isValid: false,
                error: `${channelName}值类型错误`,
                value: null
            };
        }
        
        // 转换为数字
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        
        // 验证是否为有效数字
        if (isNaN(numValue) || !isFinite(numValue)) {
            return {
                isValid: false,
                error: `${channelName}值必须是有效数字`,
                value: null
            };
        }
        
        // 验证是否为整数
        if (!Number.isInteger(numValue)) {
            return {
                isValid: false,
                error: `${channelName}值必须是整数`,
                value: null
            };
        }
        
        // 验证范围
        if (numValue < min || numValue > max) {
            return {
                isValid: false,
                error: `${channelName}值必须在 ${rangeText} 范围内`,
                value: null
            };
        }
        
        return {
            isValid: true,
            error: null,
            value: numValue
        };
    }

    /**
     * 验证Hex颜色格式
     * 
     * 用于验证用户在颜色选择器中输入的Hex颜色字符串是否有效
     * 
     * @param {string} hex - Hex颜色字符串
     * @returns {Object} 验证结果 { isValid: boolean, error: string|null }
     */
    validateHexColor(hex) {
        // 验证参数类型
        if (typeof hex !== 'string') {
            return {
                isValid: false,
                error: '颜色格式必须是字符串'
            };
        }
        
        // 移除开头的 #
        const cleanHex = hex.replace(/^#/, '');
        
        // 验证格式：3位或6位十六进制字符
        if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
            return {
                isValid: false,
                error: '颜色格式无效，请使用 #RGB 或 #RRGGBB 格式（例如：#FF0000 或 #F00）'
            };
        }
        
        return {
            isValid: true,
            error: null
        };
    }

    /**
     * 验证RGB单个通道值
     * 
     * 用于验证用户在颜色选择器RGB输入框中输入的单个通道值（R/G/B）
     * 
     * @param {number|string} value - RGB通道值
     * @param {string} channelName - 通道名称（'R'/'G'/'B'），用于错误消息
     * @returns {Object} 验证结果 { isValid: boolean, error: string|null, value: number|null }
     */
    validateRgbChannel(value, channelName = 'RGB') {
        return this._validateNumericChannel(value, channelName, 0, 255, '0-255');
    }

    /**
     * 验证HSV单个通道值
     * 
     * 用于验证用户在颜色选择器HSV输入框中输入的单个通道值（H/S/V）
     * 
     * @param {number|string} value - HSV通道值
     * @param {string} channel - 通道类型：'H'(0-359)/'S'(0-100)/'V'(0-100)
     * @returns {Object} 验证结果 { isValid: boolean, error: string|null, value: number|null }
     */
    validateHsvChannel(value, channel) {
        // 根据通道类型确定验证范围
        let min, max, rangeText;
        
        if (channel === 'H') {
            min = 0;
            max = 359;
            rangeText = '0-359';
        } else if (channel === 'S' || channel === 'V') {
            min = 0;
            max = 100;
            rangeText = '0-100';
        } else {
            return {
                isValid: false,
                error: `未知的HSV通道类型: ${channel}`,
                value: null
            };
        }
        
        // 复用通用验证逻辑
        return this._validateNumericChannel(value, channel, min, max, rangeText);
    }

    /**
     * 验证自定义预设颜色数量是否超过上限
     * 
     * 用于验证用户添加自定义预设颜色时是否已达到数量上限
     * 
     * @param {number} currentCount - 当前预设数量
     * @param {number} [maxCount=10] - 最大允许数量（默认10个）
     * @returns {Object} 验证结果 { isValid: boolean, error: string|null }
     * @throws {Error} 当参数类型无效时抛出错误（Fail Fast）
     */
    validateColorPresetLimit(currentCount, maxCount = 10) {
        // Fail Fast: 验证参数类型
        if (typeof currentCount !== 'number') {
            throw new Error('ValidationService.validateColorPresetLimit: currentCount must be a number');
        }
        if (typeof maxCount !== 'number') {
            throw new Error('ValidationService.validateColorPresetLimit: maxCount must be a number');
        }
        if (!Number.isFinite(currentCount) || !Number.isFinite(maxCount)) {
            throw new Error('ValidationService.validateColorPresetLimit: currentCount and maxCount must be finite numbers');
        }
        if (currentCount < 0 || maxCount < 0) {
            throw new Error('ValidationService.validateColorPresetLimit: currentCount and maxCount must be non-negative');
        }
        
        // 业务验证
        if (currentCount >= maxCount) {
            return {
                isValid: false,
                error: `最多保存 ${maxCount} 个预设颜色`
            };
        }
        
        return {
            isValid: true,
            error: null
        };
    }
}


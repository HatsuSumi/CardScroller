/**
 * FileProcessStrategyManager - 文件处理策略管理器
 * 管理文件处理策略的注册、查找和执行，根据文件类型自动选择合适的处理策略（图片/配置），提供统一的文件处理入口
 * 
 * 当前被使用的模块：
 * - ImageService (services/business/ImageService.js) - 图片业务服务，通过DI注入
 * - ConfigService (services/business/ConfigService.js) - 配置服务，通过DI注入，用于读取和解析配置文件
 * - ValidationService (services/system/ValidationService.js) - 验证服务，通过DI注入，用于文件类型验证
 * - FileOperationUIService (services/ui/FileOperationUIService.js) - 文件操作UI服务，通过DI注入，用于统一文件类型判断
 * 
 * 当前依赖的模块：
 * - FileProcessStrategy, ImageFileStrategy, ConfigFileStrategy (patterns/file/FileProcessStrategy.js) - 所有文件处理策略实现
 */
import {
    FileProcessStrategy,
    ImageFileStrategy,
    ConfigFileStrategy
} from './FileProcessStrategy.js';

/**
 * 文件处理策略管理器
 * 负责文件处理策略的注册、获取和管理
 */
export class FileProcessStrategyManager {
    /**
     * 创建文件处理策略管理器实例
     * 无需外部依赖，策略本身只做纯技术处理
     */
    constructor() {
        this.strategies = new Map();
        // 注册默认策略
        this.strategies.set('image', new ImageFileStrategy());
        this.strategies.set('config', new ConfigFileStrategy());
    }

    /**
     * 获取所有可用的策略名称
     * @returns {string[]} 策略名称数组
     */
    getAvailableStrategies() {
        return Array.from(this.strategies.keys());
    }

    /**
     * 根据文件查找支持的策略
     * @param {File} file - 文件对象
     * @returns {FileProcessStrategy|null} 支持该文件的策略，如果没有则返回null
     * @throws {Error} 如果file参数无效
     */
    findStrategyForFile(file) {
        // Fail Fast: 验证必需参数
        if (!file) {
            throw new Error('File parameter is required for findStrategyForFile');
        }
        for (const strategy of this.strategies.values()) {
            if (strategy.supports(file)) {
                return strategy;
            }
        }
        return null;
    }

    /**
     * 检查是否支持该文件
     * 组合方法：封装 findStrategyForFile 的结果判断，提供统一的文件类型检查入口
     * 
     * 设计目的：
     * - 提供简单的 boolean 返回值，避免外部需要判断 null
     * - 统一文件类型判断的入口，避免 UI 层和验证层重复实现
     * 
     * @param {File} file - 文件对象
     * @returns {boolean} 是否支持该文件类型
     */
    supportsFile(file) {
        if (!file) {
            return false;
        }
        return this.findStrategyForFile(file) !== null;
    }

    /**
     * 处理文件
     * @param {File} file - 文件对象
     * @returns {Promise<Object>} 处理结果
     * @throws {Error} 当file参数无效或没有找到支持的策略时抛出错误
     */
    async processFile(file) {
        // Fail Fast: 验证必需参数
        if (!file) {
            throw new Error('File parameter is required for processFile');
        }
        
        const strategy = this.findStrategyForFile(file);
        if (!strategy) {
            throw new Error(`No strategy found for file type: ${file.type}. Supported strategies: ${this.getAvailableStrategies().join(', ')}`);
        }
        return await strategy.process(file);
    }
}

/**
 * TransitionFragmentPool - 过渡动画碎片对象池
 * 
 * 为页面切换动画提供DOM元素复用机制，避免频繁创建/销毁元素。
 * 支持网格遮罩转场动画（64个方块，8x8网格）。
 * 
 * 当前依赖的模块：
 * - 无外部依赖，仅使用原生DOM API
 * 
 * 当前被使用的模块：
 * - PerformanceReportPage (ui/PerformanceReportPage.js) - 在过渡动画中借用/归还元素
 */
export class TransitionFragmentPool {
    constructor() {
        /**
         * 对象池存储
         * @type {Object.<string, HTMLElement[]>}
         */
        this.pools = {};

        /**
         * 模板元素缓存
         * @type {Object.<string, HTMLElement>}
         */
        this.templates = {};

        /**
         * 对象池容器元素
         * @type {HTMLElement|null}
         */
        this.container = null;

        /**
         * 初始化状态标记
         * @type {boolean}
         */
        this.isInitialized = false;
    }

    /**
     * 初始化对象池
     * 
     * 从DOM中读取模板元素并创建对象池。
     * 
     * @param {Object.<string, number>} poolSizes - 各类型元素的池大小配置
     * @returns {void}
     * @throws {Error} 当容器元素不存在时
     */
    initialize(poolSizes) {
        if (this.isInitialized) return;

        // Fail Fast: 容器必须存在
        this.container = document.getElementById('transition-fragment-pool-container');
        if (!this.container) {
            throw new Error('TransitionFragmentPool: Container element #transition-fragment-pool-container not found');
        }

        // 从容器中提取模板元素
        const templateElements = this.container.querySelectorAll('[data-pool-type]');
        templateElements.forEach(templateEl => {
            const type = templateEl.dataset.poolType;
            
            // 保存模板副本
            this.templates[type] = templateEl.cloneNode(true);
            
            // 从DOM中移除原始模板
            templateEl.remove();

            // 创建对象池
            const size = poolSizes[type] || 0;
            this.pools[type] = [];

            for (let i = 0; i < size; i++) {
                const element = this.templates[type].cloneNode(true);
                element.removeAttribute('data-pool-type');
                this.pools[type].push(element);
            }
        });

        this.isInitialized = true;
    }

    /**
     * 借用指定类型的所有元素
     * 
     * 返回该类型池中的所有元素，并清空池。
     * 
     * @param {string} type - 元素类型（mask-container|mask-tile）
     * @returns {HTMLElement[]} 借用的元素数组
     */
    borrow(type) {
        if (!this.pools[type]) {
            console.warn(`TransitionFragmentPool: Pool type '${type}' does not exist`);
            return [];
        }

        if (this.pools[type].length === 0) {
            console.warn(`TransitionFragmentPool: Pool '${type}' is empty`);
            return [];
        }
        
        // 取出所有元素并清空池
        const borrowedElements = [...this.pools[type]];
        this.pools[type] = [];
        
        return borrowedElements;
    }

    /**
     * 归还元素到对象池
     * 
     * 重置元素状态并放回池中。
     * 
     * @param {string} type - 元素类型
     * @param {HTMLElement[]} elements - 要归还的元素数组
     * @returns {void}
     * @throws {Error} 当池类型不存在时
     */
    return(type, elements) {
        // Fail Fast: 池类型必须存在
        if (!this.pools[type]) {
            throw new Error(`TransitionFragmentPool: Cannot return elements to non-existent pool type '${type}'`);
        }

        const template = this.templates[type];

        elements.forEach(element => {
            // 重置元素状态（清理动态定位例外下设置的内联样式）
            element.style.left = '';
            element.style.top = '';
            element.style.width = '';
            element.style.height = '';
            element.style.removeProperty('--animation-delay');
            element.className = template.className;
            
            // 清空内容（针对容器类型）
            if (type.includes('container')) {
                element.innerHTML = '';
            }
            
            // 放回DOM和池
            this.container.appendChild(element);
            this.pools[type].push(element);
        });
    }
}


# CardScroller 项目架构分层文档

基于依赖关系、复用性、稳定性的分层分析。

**重要说明**：
- ✅ 本文档按照**架构层级**分层（依赖关系、复用性、稳定性为第一优先级）
- 🔗 文件目录结构**大部分反映**了架构层级（`helpers/`、`utils/`、`patterns/`、`modal/` 等目录与层级完全对应）
- ⚠️ 部分目录（如 `business/`、`core/`）跨越多个架构层级，因为它们按**功能域**分组
- 📁 完整的目录分类和服务列表请参考 `ServiceRegistry.js` 的注册分组
- 🎯 **核心原则**：当目录分组和架构层级冲突时，以**依赖关系**为准

**重要参考：**
- 📦 **`helpers/` vs `utils/` 目录区别与判断标准** → 详见 [DESIGN_STANDARDS.md - 二.1](DESIGN_STANDARDS.md#1-helpers-vs-utils-目录区别与判断标准)
- 🎯 **直接调用 vs EventBus 判断标准** → 详见 [DESIGN_STANDARDS.md - 三.1](DESIGN_STANDARDS.md#1-直接调用-vs-eventbus)

---

## ⚫ 第0层：浏览器原生API层（最底层，非项目代码）

**特征**：操作系统和浏览器提供的底层能力

### 主要API类别：

- **DOM API**：`document.querySelector`, `element.classList`, `addEventListener`, `removeEventListener`, `getComputedStyle`
- **SVG API**：`document.createElementNS` (创建SVG元素，用于边框跑马灯动画)
- **Canvas API**：`getContext('2d')`, `drawImage`
- **File API**：`FileReader`, `Blob`, `ArrayBuffer`, `File`
- **定时器API**：`setTimeout`, `clearTimeout`, `requestAnimationFrame`, `cancelAnimationFrame`
- **Event API**：`CustomEvent`, `dispatchEvent`, `Event`
- **Math API**：`Math.pow`, `Math.abs`, `Math.round`, `Math.sin`, `Math.exp`, `Math.log`
- **Date API**：`Date.now()`, `new Date()`, `toLocaleString`
- **数据结构API**：`Map`, `WeakMap`, `Set`, `Proxy`, `Promise`
- **模块加载API**：`import()` (动态import，用于按需加载模块)
- **字符串/数组API**：`split`, `join`, `slice`, `filter`, `map`, `reduce`
- **类型检查API**：`typeof`, `instanceof`, `Number.isFinite`, `Number.isInteger`, `isNaN`
- **正则表达式API**：`RegExp`, `match`, `test`, `replace`
- **二进制数据API**：`DataView`, `Uint8Array`, `TextDecoder`
- **Window API**：`window.innerWidth`, `window.innerHeight`, `window.devicePixelRatio`, `window.screen`
- **Navigator API**：`navigator.userAgent`, `navigator.hardwareConcurrency`, `navigator.deviceMemory`, `navigator.clipboard`
- **Performance API**：`performance.now()` (高精度时间戳，用于性能监控)
- **URL API**：`URL.createObjectURL`, `URL.revokeObjectURL` (对象URL管理，用于文件下载)
- **Fetch API**：`fetch()` (网络请求，用于加载配置文件)
- **Console API**：`console.log`, `console.error`, `console.warn` (调试和日志输出)
- **文件系统API**：`showSaveFilePicker`, `showOpenFilePicker` (File System Access API)
- **JSON API**：`JSON.parse`, `JSON.stringify`
- **剪贴板API**：`navigator.clipboard.writeText` (Clipboard API，用于复制文本到剪贴板)
- **颜色拾取API**：`EyeDropper` (EyeDropper API，用于从页面吸取颜色)

---

## 🟣 第1层：应用配置层（配置定义，1个文件）

**特征**：应用的默认状态和配置定义，被所有服务读取，Single Source of Truth

| 文件 | 职责 | 格式 |
|------|------|------|
| `config/defaultState.json` | 默认状态配置（UI、播放、循环、验证、性能等所有默认值） | JSON |

**重要性**：⭐⭐⭐⭐⭐（所有服务的配置源）  
**稳定性**：⭐⭐⭐⭐（配置变更影响全局）  
**依赖数**：0（被ApplicationBootstrap通过fetch读取1次，通过StateManager被所有服务间接访问）

---

## 🔵 第2层：核心基础设施层（项目最底层，3个JS文件）

**特征**：直接封装浏览器API，零项目依赖，整个系统的根基

| 文件 | 职责 | 直接使用的浏览器API |
|------|------|---------------------|
| `DIContainer.js` | 依赖注入容器，管理服务实例 | `Map` |
| `EventBus.js` | 事件总线系统，解耦服务通信 | `Map`, `Set` |
| `StateManager.js` | 响应式状态管理器 | `Proxy`, `WeakMap`, `Map`, `Date.now()` |

**稳定性**：⭐⭐⭐⭐⭐（最稳定）  
**复用性**：⭐⭐⭐⭐⭐（最高复用）  
**依赖数**：0-1（StateManager仅依赖EventBus）

---

## 🔵 第3层：算法策略层（底层，7个文件）

**特征**：纯算法实现，依赖极少，高复用，Strategy Pattern 和 Object Pool Pattern

| 文件 | 职责 | 直接使用的浏览器API |
|------|------|---------------------|
| `ScrollStrategy.js` | 滚动动画缓动算法（线性、缓入、缓出、弹性） | `Math.pow`, `Math.sin`, `Math.exp` |
| `ScrollStrategyManager.js` | 滚动策略注册和管理 | `Map.set`, `Map.get`, `Map.values` |
| `EntryAnimationStrategy.js` | 入场动画算法（淡入、滑入、缩放、旋转缩放、模糊缩放、翻转、弹跳、摇摆、故障、波浪揭示等14种效果） | 无（纯数学计算） |
| `EntryAnimationStrategyManager.js` | 入场动画策略注册和管理 | `Map.set`, `Map.get`, `Map.values`, `Array.from` |
| `FileProcessStrategy.js` | 文件处理策略（图片文件），使用 Blob URL 处理超大图片，捕获浏览器解码限制 | `Promise`, `URL.createObjectURL`, 正则表达式 |
| `FileProcessStrategyManager.js` | 文件策略注册和管理 | `Map.values()` |
| `TransitionFragmentPool.js` | 过渡动画碎片对象池（网格遮罩转场DOM元素复用） | `querySelector`, `cloneNode`, `Map` |

**稳定性**：⭐⭐⭐⭐⭐（极高）  
**复用性**：⭐⭐⭐⭐⭐（算法可复用）  
**依赖数**：0-1

---

## 🟢 第4层：纯函数工具层（底层，13个文件）

**特征**：纯函数实现，零依赖，最高复用性，位于 `js/helpers/` 目录

| 文件 | 职责 | 直接使用的浏览器API |
|------|------|---------------------|
| `debounce.js` | 防抖函数（限制高频事件触发频率） | `setTimeout`, `clearTimeout` |
| `fileUtils.js` | 文件工具函数（文件扩展名提取、MIME类型查询、Base64大小计算） | `String.lastIndexOf`, `String.slice`, `Math.ceil` |
| `imageLoader.js` | 图片加载工具函数（统一的base64图片加载模式） | `Image`, `Promise` |
| `canvasAccessors.js` | Canvas元素访问工具函数（获取核心Canvas和Image元素） | `document.getElementById` |
| `timeFormatters.js` | 时间/时长格式化工具函数（秒转mm:ss、毫秒格式化、时间戳生成） | `Math.floor`, `String.padStart`, `toFixed`, `Date` |
| `fileFormatters.js` | 文件格式化工具函数（文件大小、日期、像素数、文件名生成） | `Math.log`, `Math.pow`, `toLocaleString`, `Date` |
| `numberFormatters.js` | 通用数字格式化工具函数（百分比格式化、百万像素格式化） | `toFixed`, `Number.isFinite` |
| `durationCalculators.js` | 时长计算工具函数（循环时长、总时长、入场动画时长） | `parseFloat`, `Number.isInteger`, `Number.isFinite` |
| `positionCalculators.js` | 位置计算工具函数（像素↔滚动距离转换、默认位置） | `Math.min`, `isFinite` |
| `imageDimensions.js` | 图片尺寸计算工具函数（缩放比例、宽高比、尺寸格式化） | `Math.floor`, `Math.abs`, `toFixed` |
| `performanceUtils.js` | 性能监控工具函数（设备信息收集、刷新率估算、FPS计算） | `navigator`, `screen`, `performance`, `requestAnimationFrame` |
| `colorConverter.js` | 颜色转换工具函数（HSV↔RGB↔Hex颜色空间转换） | `Math.floor`, `Math.round` |
| `colorAnalyzer.js` | 颜色分析工具函数（亮度判断、YIQ算法） | `String.match`, `parseInt` |

**稳定性**：⭐⭐⭐⭐⭐（极高）  
**复用性**：⭐⭐⭐⭐⭐（纯函数，高复用）  
**依赖数**：0（零依赖）

---

## 🟢 第5层：纯工具服务层（底层/中层，3个文件）

**特征**：专业技术服务，提供特定领域的工具功能，零依赖或极少依赖

| 文件 | 职责 | 直接使用的浏览器API |
|------|------|---------------------|
| `CanvasRenderService.js` | Canvas底层渲染工具（清空、绘制图片、变换） | `Canvas API` (`getContext`, `drawImage`, `clearRect`, `save`, `restore`, `translate`, `scale`) |
| `ViewportCalculatorService.js` | 视口计算工具（可视区域计算、Canvas尺寸设置、图片裁剪） | `Canvas API` (`drawImage`), `window.innerWidth/Height`, `HTMLCanvasElement`, `HTMLImageElement` |
| `PPIExtractorService.js` | 提取图片PPI元数据（JPEG/PNG） | `FileReader`, `DataView`, `Uint8Array`, `TextDecoder`, `Promise` |

**稳定性**：⭐⭐⭐⭐⭐（极高）  
**复用性**：⭐⭐⭐⭐（技术工具，高复用）  
**依赖数**：0

---

## 🟢 第6层：技术工具服务层（中层，5个文件）

**特征**：技术性基础设施，为上层提供通用能力，不涉及业务，单例模式

| 文件 | 职责 | 直接使用的浏览器API |
|------|------|---------------------|
| `KeyboardService.js` | 键盘快捷键注册和管理 | `addEventListener('keydown')`, `document.activeElement` |
| `FileSaveService.js` | 文件保存服务（支持File System Access API和传统下载） | `Blob`, `URL.createObjectURL`, `showSaveFilePicker`, `getElementById`, `appendChild`, `removeChild` |
| `MessageService.js` | 消息提示显示（右上角） | `document.createElement`, `appendChild`, `classList`, `setTimeout`, `requestAnimationFrame` |
| `LoadingService.js` | 加载状态管理 | `querySelector`, `textContent`, `classList` |
| `PositionSliderService.js` | 位置滑块控制 | `input.value`, `input.max`, `input.step`, `textContent` |
| `PreferenceService.js` | 全局偏好服务（统一管理LocalStorage） | `localStorage.getItem`, `localStorage.setItem`, `localStorage.removeItem`, `localStorage.clear` |

**稳定性**：⭐⭐⭐⭐（高）  
**复用性**：⭐⭐⭐⭐（高）  
**依赖数**：0-2

---

## 🟢 第7层：UI组件层（中层，22个文件）

**特征**：多实例UI组件及其工厂，面向特定DOM元素，组件不通过DI容器管理，工厂通过DI管理

### 通用组件（4个）：

| 文件 | 职责 | 直接使用的浏览器API | 实例模式 |
|------|------|---------------------|----------|
| `CustomSelect.js` | 自定义下拉菜单组件 | `querySelector`, `addEventListener`, `classList`, `setAttribute`, `getBoundingClientRect` | 多实例（每个下拉菜单一个实例） |
| `CustomSelectFactory.js` | 自定义下拉菜单组件工厂 | 无（通过DI注入依赖） | 单例工厂（通过DI容器管理） |
| `ColorPicker.js` | 颜色选择器组件（HSV色彩空间可视化、Canvas绘制、预设颜色管理） | `Canvas API`, `querySelector`, `addEventListener`, `document.createDocumentFragment`, `cloneNode` | 多实例（每个颜色选择器一个实例） |
| `ColorPickerFactory.js` | 颜色选择器组件工厂 | 无（通过DI注入依赖） | 单例工厂（通过DI容器管理） |

### 卡片边界编辑器（2个）：

| 文件 | 职责 | 直接使用的浏览器API | 实例模式 |
|------|------|---------------------|----------|
| `CardBoundaryEditorService.js` | 卡片边界编辑器服务 | `Canvas API`, `addEventListener`, `querySelector`, `getBoundingClientRect` | 多实例（每次创建新实例） |
| `CardBoundaryEditorFactory.js` | 卡片边界编辑器工厂 | 无（通过DI注入依赖） | 单例工厂（通过DI容器管理） |

### 入场动画专用组件（9个）：

| 文件 | 职责 | 直接使用的浏览器API | 实例模式 |
|------|------|---------------------|----------|
| `PreviewManager.js` | 预览功能管理（加载图片、播放预览、调整坐标到视口） | `querySelector`, `import()`, `window.devicePixelRatio` | 单实例（通过PreviewManagerFactory创建） |
| `BoundaryEditorManager.js` | 边界编辑器管理（创建编辑器、监听变化、恢复边界） | `querySelector`, `addEventListener`, `JSON.parse` | 单实例（通过BoundaryEditorManagerFactory创建） |
| `BoundaryEditorManagerFactory.js` | 边界编辑器管理器工厂（隔离cardBoundaryEditorFactory依赖） | 无（通过DI注入依赖） | 单例工厂（通过DI容器管理） |
| `ConfigDataManager.js` | 配置数据管理（加载配置、收集配置、保存） | `querySelector`, `parseInt` | 单实例（仅被EntryAnimationConfigPage创建） |
| `UIStateCoordinator.js` | UI状态协调（字段显示隐藏、总时长计算、折叠功能） | `querySelector`, `classList`, `setTimeout`, `getComputedStyle`, `requestAnimationFrame` | 单实例（仅被EntryAnimationConfigPage创建） |
| `EntryAnimationHelpDialogs.js` | 入场动画帮助对话框管理（边界线帮助、图片规格帮助） | `window.innerWidth/Height`, `addEventListener('resize')`, `getElementById` | 单实例（通过EntryAnimationHelpDialogsFactory创建） |
| `EntryAnimationHelpDialogsFactory.js` | 帮助对话框工厂（隔离viewportCalculatorService依赖） | 无（通过DI注入依赖） | 单例工厂（通过DI容器管理） |
| `CardPositionInfoPanel.js` | 卡片位置信息面板管理（交错入场动画、数字补间） | `querySelector`, `classList`, `setTimeout`, `requestAnimationFrame`, `getComputedStyle` | 单实例（仅被EntryAnimationConfigPage创建） |
| `CardAnimationListManager.js` | 卡片动画列表管理（动态创建选择器、收集配置） | `querySelector`, `classList`, `setTimeout`, `requestAnimationFrame`, `getComputedStyle` | 单实例（仅被EntryAnimationConfigPage创建） |

### 性能监控专用组件（7个）：

| 文件 | 职责 | 直接使用的浏览器API | 实例模式 |
|------|------|---------------------|----------|
| `DeviceInfoPanel.js` | 设备信息面板（显示屏幕分辨率、DPR、浏览器、CPU等） | `querySelector` | 单实例（仅被PerformanceReportPage创建） |
| `ImageInfoPanel.js` | 图片信息面板（显示图片文件名、大小、格式、尺寸、像素数等） | `querySelector` | 单实例（仅被PerformanceReportPage创建） |
| `CanvasInfoPanel.js` | Canvas信息面板（显示入场Canvas和滚动Canvas的逻辑与物理尺寸） | `querySelector`, `getElementById` | 单实例（仅被PerformanceReportPage创建） |
| `PerformanceReportRenderer.js` | 性能报告渲染器（显示FPS分析、帧时间、Canvas操作统计） | `querySelector` | 单实例（仅被PerformanceReportPage创建） |
| `MonitorControlPanel.js` | 监控控制面板（开关监控、刷新率设置、实时FPS显示） | `querySelector`, `addEventListener` | 单实例（仅被PerformanceReportPage创建） |
| `RealtimeFPSMonitor.js` | 实时FPS监视器（动画播放时浮动显示当前FPS） | `querySelector`, `classList` | 单实例（全局共享） |
| `PerformanceVisualizationPanel.js` | 性能数据可视化面板（ECharts图表渲染、FPS分布、帧时间趋势、稳定性雷达、帧掉落分析） | `getElementById`, `echarts.init` (外部库) | 单实例（仅被PerformanceReportPage创建） |

**稳定性**：⭐⭐⭐⭐（高）  
**复用性**：⭐⭐⭐⭐（通用组件高，专用组件中）  
**依赖数**：1-3（通用组件2-3个依赖，专用组件1-2个依赖）

**设计说明**：
- 通用组件（CustomSelect、ColorPicker）：多服务共享，高复用性
- 专用组件（入场动画、性能监控相关）：单一服务专用，遵循SRP原则，降低主文件复杂度

---

## 🟡 第8层：基础UI服务层（中层，2个文件）

**特征**：UI服务基类，提供通用DOM和事件管理能力

| 文件 | 职责 | 直接使用的浏览器API | 继承自 |
|------|------|---------------------|--------|
| `BaseUIService.js` | UI服务基类：DOM缓存、事件管理、CSS操作 | `querySelector`, `getElementById`, `classList`, `addEventListener`, `removeEventListener` | 无 |
| `BaseModalService.js` | 模态框基类：开关、动画、快捷键 | 继承自BaseUIService，额外使用`setTimeout` | BaseUIService |

**稳定性**：⭐⭐⭐⭐（高）  
**复用性**：⭐⭐⭐⭐⭐（被11个子类继承）  
**依赖数**：2-4

---

## 🟡 第9层：系统服务层（中上层，5个文件）

**特征**：系统级技术服务，横切关注点（验证、监听、错误显示、对话框、提示框）

| 文件 | 职责 | 直接使用的浏览器API | 继承自 |
|------|------|---------------------|--------|
| `ValidationService.js` | 统一验证服务（文件、配置、参数） | 正则表达式, `Number.isFinite`, `parseInt`, `parseFloat` | 无 |
| `StateWatcherService.js` | 状态监听服务（watcher注册、UI同步） | `Map`, `classList` | 无 |
| `ErrorDisplayService.js` | 统一错误显示服务（对话框、消息框、双重反馈） | 无（通过DI调用DialogService和MessageService） | 无 |
| `DialogService.js` | 自定义对话框服务（警告、错误、信息对话框） | `getElementById`, `querySelector`, `textContent`, `classList`, `addEventListener`, `setTimeout` | 无 |
| `TooltipService.js` | 统一提示框管理服务（hover触发、智能定位、随机样式） | `getElementById`, `document.body.appendChild`, `getBoundingClientRect`, `window.innerWidth/Height`, `requestAnimationFrame`, `setTimeout`, `cloneNode`, `classList`, `style` (动态定位、动态颜色) | 无 |

**稳定性**：⭐⭐⭐⭐（高）  
**复用性**：⭐⭐⭐⭐（系统级复用）  
**依赖数**：0-6

---

## 🟠 第10层：业务逻辑服务层（中上层，8个文件）

**特征**：业务逻辑实现，依赖技术服务，不涉及跨服务协调

**架构说明**：本层包含 `PreviewManagerFactory.js`（工厂层级 = 其持有的最高依赖层级）

| 文件 | 职责 | 直接使用的浏览器API | 继承自 |
|------|------|---------------------|--------|
| `ImageProcessingService.js` | 图片业务处理（文件读取、配置处理） | `Promise`, `FileReader` | 无 |
| `ScrollAnimationService.js` | 滚动动画执行（RAF循环、位置更新） | `requestAnimationFrame`, `cancelAnimationFrame`, `Date.now()` | BaseUIService |
| `EntryAnimationService.js` | 入场动画执行（RAF循环、多卡片错峰入场、Canvas渲染） | `requestAnimationFrame`, `cancelAnimationFrame`, `getElementById` | 无 |
| `PerformanceMonitorService.js` | 性能监控服务（数据收集、FPS分析、报告生成） | `performance.now()` | 无 |
| `DurationSequenceService.js` | 时长序列计算（变长循环） | 无（纯业务逻辑） | 无 |
| `LoopConfigurationService.js` | 循环配置管理 | 无（纯业务逻辑） | 无 |
| `PositionPreviewService.js` | 位置预览服务（模态框图片预览、缩放计算） | `style.setProperty`, `classList`, `querySelector`, `appendChild` | BaseUIService |
| `PreviewManagerFactory.js` | 预览管理器工厂（隔离entryAnimationService和viewportCalculatorService依赖） | 无（通过DI注入依赖） | 无 |

**稳定性**：⭐⭐⭐（中）  
**复用性**：⭐⭐⭐（业务级复用）  
**依赖数**：1-8

---

## 🔴 第11层：业务协调层（上层，5个文件）

**特征**：跨服务业务流程协调，编排多个服务完成复杂流程

| 文件 | 职责 | 依赖的主要服务 |
|------|------|----------------|
| `ImageService.js` | 图片业务协调者（上传、替换、拖拽） | EventBus, StateManager, FileProcessStrategyManager, ImageProcessingService |
| `PlaybackCoordinatorService.js` | 播放协调者（协调入场动画和滚动动画的串行执行、循环播放、循环间隔倒计时） | EventBus, StateManager, EntryAnimationService, ScrollAnimationService, DurationSequenceService |
| `ScrollService.js` | 滚动配置管理和事件响应协调者（事件绑定、配置管理、状态变化响应） | EventBus, StateManager, PlaybackCoordinatorService |
| `ConfigService.js` | 配置业务流程协调者（配置文件导入/导出、验证、应用） | EventBus, StateManager, ImageService, ScrollService, FileSaveService, PPIExtractorService, FileProcessStrategyManager, generateFileName (helper) |
| `BusinessOrchestrationService.js` | 系统级业务编排（错误处理、配置管理） | EventBus, StateManager, ImageService, ScrollService, ValidationService, formatFileSize, formatMP, calculateDefaultEndPosition (helpers) |

**稳定性**：⭐⭐⭐（中）  
**复用性**：⭐⭐（业务特定）  
**依赖数**：4-9

---

## 🔴 第12层：UI控制层（上层，15个文件）

**特征**：用户交互控制，依赖最多，业务最复杂

### 模态框服务（5个）：

| 文件 | 职责 | 继承自 |
|------|------|--------|
| `AboutModalService.js` | 关于模态框 | BaseModalService |
| `AdvancedLoopService.js` | 高级循环配置模态框 | BaseModalService |
| `ImageInfoModalService.js` | 图片详细信息模态框 | BaseModalService |
| `ColorPickerModalService.js` | 颜色选择器模态框 | BaseModalService |
| `PositionSelectorService.js` | 位置选择器模态框 | BaseModalService |

### UI控制服务（10个）：

| 文件 | 职责 | 继承自 |
|------|------|--------|
| `FileOperationUIService.js` | 文件操作UI控制（图片上传/替换、配置导入/导出、拖拽） | 无 |
| `ParameterControlUIService.js` | 参数控制UI（时长、策略、循环） | BaseUIService |
| `PlaybackControlUIService.js` | 播放控制UI（播放、暂停、重置） | 无 |
| `ProgressBarService.js` | 进度条UI控制（显示/隐藏、进度更新、总时长、循环信息、循环间隔倒计时） | 无 |
| `SidebarService.js` | 侧边栏控制（折叠、透明度、自动隐藏） | 无 |
| `DisplayCoordinatorService.js` | 显示协调（侧边栏信息、主显示区位置） | BaseUIService |
| `PlaybackUIDisablerService.js` | 全局UI协调（播放时禁用控件） | BaseUIService |
| `BubbleMenuService.js` | 气泡菜单控制（更多功能入口、气泡动画、配置页面框架和路由） | 无 |
| `EntryAnimationConfigPage.js` | 卡片入场动画配置页面（Page层，管理配置页面内容渲染） | 无 |
| `PerformanceReportPage.js` | 动画性能监控报告页面（Page层，管理性能监控页面内容渲染） | 无 |

**稳定性**：⭐⭐⭐（中低）  
**复用性**：⭐⭐（UI特定）

**命名规范**：
- `XxxService`: 功能服务，提供业务逻辑和数据处理
- `XxxPage`: 页面服务，管理独立页面的渲染和交互（也是单例服务）
- `XxxComponent`: UI组件，多实例可复用组件  
**依赖数**：5-13

---

## ⚫第13层：应用启动层（最上层，6个文件）

**特征**：应用入口和引导，依赖所有服务

### JavaScript启动文件（4个）：

| 文件 | 职责 | 依赖 |
|------|------|------|
| `ServiceImports.js` | 统一导入所有服务类 | 所有服务文件 |
| `ServiceRegistry.js` | DI容器配置（依赖关系声明） | DIContainer, 所有服务类 |
| `ApplicationBootstrap.js` | 应用启动器（服务初始化、分组启动） | DIContainer, ServiceRegistry |
| `CardScrollerApp.js` | 主应用容器（入口点） | ApplicationBootstrap |

### HTML/CSS视图文件（2个）：

| 文件 | 职责 | 依赖 |
|------|------|------|
| `index.html` | 应用入口HTML（DOM结构、模态框、侧边栏、控制面板） | CardScrollerApp.js, style.css, defaultState.json |
| `css/style.css` | 应用样式（布局、主题、动画、响应式） | HTML元素 |

**稳定性**：⭐⭐（低，频繁修改）  
**复用性**：⭐（应用特定）  
**依赖数**：39+（几乎所有服务）

---

## 📈 分层统计表

| 层级 | 层名 | 文件数 | 文件类型 | 稳定性 | 复用性 | 平均依赖数 |
|------|------|--------|----------|--------|--------|-----------|
| **第0层** | 浏览器API | - | 浏览器原生 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 0 |
| **第1层** | 应用配置 | 1 | JSON | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 0 (被读取1次) |
| **第2层** | 核心基础设施 | 3 | JS | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 0-1 |
| **第3层** | 算法策略 | 7 | JS | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 0-1 |
| **第4层** | 纯函数工具 | 13 | JS | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 0 |
| **第5层** | 纯工具服务 | 3 | JS | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 0 |
| **第6层** | 技术工具服务 | 6 | JS | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 0-2 |
| **第7层** | UI组件 | 22 | JS | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 1-3 |
| **第8层** | 基础UI服务 | 2 | JS | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 2-4 |
| **第9层** | 系统服务 | 5 | JS | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 1-6 |
| **第10层** | 业务逻辑服务 | 8 | JS | ⭐⭐⭐ | ⭐⭐⭐ | 1-8 |
| **第11层** | 业务协调 | 5 | JS | ⭐⭐⭐ | ⭐⭐ | 4-9 |
| **第12层** | UI控制 | 15 | JS | ⭐⭐⭐ | ⭐⭐ | 5-13 |
| **第13层** | 应用启动 | 6 | JS + HTML + CSS | ⭐⭐ | ⭐ | 40+ |
| **总计** | - | **105** | **93 JS + 1 JSON + 1 HTML + 1 CSS + 3 MD + 4 Python + 1 Batch + 1 LICENSE** | - | - | - |

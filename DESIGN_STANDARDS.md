# CardScroller 设计标准与判断准则

本文档说明项目中各种设计决策的判断标准：何时通过DI注入，何时直接import，何时用工厂模式，配置放哪里，验证逻辑放哪里等。

---

## 一、依赖管理与组件创建

### 1. 依赖注入 (DI) vs 直接 import

#### 快速判断标准

| 特征 | DI 注入 | 直接 Import |
|------|---------|------------|
| 注册位置 | `ServiceRegistry.js` | 无需注册 |
| 使用范围 | 全局/多处使用 | 局部/单处使用 |
| 实例模式 | 单例 | 可单例可多例 |
| 目录位置 | `services/`（通常） | `components/`, `helpers/`（通常） |
| 依赖层级 | 高层服务/基础设施 | 低层组件/工具 |

#### 使用 DI 注入

✅ **适用场景：**
- 服务层（`services/`）的所有服务类
- Page 层（如 `EntryAnimationConfigPage`）
- 工厂类（如 `CustomSelectFactory`）
- 策略管理器（如 `ScrollStrategyManager`）
- 核心基础设施（`DIContainer`, `EventBus`, `StateManager`）
- 全局单例服务

> **核心原则：**需要在多个地方使用的单例服务，通过 DI 注入。

#### 使用直接 import

✅ **适用场景：**
- UI 组件（`components/`）
- 辅助函数（`helpers/`）
- 策略实现类（如 `LinearScrollStrategy`）
- 子组件（只被父组件使用）
- 基类（如 `BaseUIService`）

> **核心原则：**只被特定父类直接创建的类，直接 import。

---

### 2. 工厂模式 (Factory Pattern)

#### 使用工厂的判断标准

✅ **使用工厂的 3 个场景：**

1. **子组件需要的依赖，父组件不需要**
   - 避免父组件为了传递而引入不必要的依赖
   - 符合接口隔离原则（ISP）

2. **需要多实例创建**
   - 同一个类需要在不同地方创建多个实例

3. **创建逻辑复杂**
   - 需要统一管理创建过程

> **核心原则：**当子组件需要的依赖父组件本身不需要（只是为了传递），就使用工厂模式隔离依赖。

#### 项目中的工厂实例

项目中的所有工厂：`CustomSelectFactory`, `CardBoundaryEditorFactory`, `PreviewManagerFactory`, `BoundaryEditorManagerFactory`, `EntryAnimationHelpDialogsFactory`, `ColorPickerFactory`

**典型示例：**

| 工厂类 | 创建的类 | 隔离的依赖 | 原因 |
|--------|---------|-----------|------|
| `CustomSelectFactory` | `CustomSelect` | `keyboardService` | 父组件不需要 `keyboardService` |
| `CardBoundaryEditorFactory` | `CardBoundaryEditorService` | `keyboardService` | 父组件不需要 `keyboardService` |
| `PreviewManagerFactory` | `PreviewManager` | `entryAnimationService`, `viewportCalculatorService` | 父组件不需要这些低层服务 |
| `ColorPickerFactory` | `ColorPicker` | `stateManager`, `keyboardService`, `eventBus` | 父组件只需要传容器和回调 |

#### 不使用工厂

❌ **不使用工厂的场景：**
- 父组件本身也需要这些依赖 → 直接传递
- 只创建一次且依赖简单 → 直接创建
- 所有依赖父组件都有 → 直接传递

---

### 3. 子组件创建模式

#### 子组件的定义

**子组件 vs 服务：**

| 特征 | 子组件 | 服务 |
|------|--------|------|
| 使用范围 | 局部（1-2个父组件） | 全局（多个地方） |
| DI 注册 | ❌ 否 | ✅ 是 |
| 创建方式 | 父组件内部 `new` | DI 容器注入 |
| 生命周期 | 随父组件 | 应用启动时 |
| 目录 | `components/` | `services/` |

#### 子组件创建位置

**在父组件构造函数中创建：**
```javascript
export class EntryAnimationConfigPage {
    constructor(stateManager, customSelectFactory, ...) {
        // 存储服务依赖
        this.stateManager = stateManager;
        this.customSelectFactory = customSelectFactory;
        
        // 直接创建子组件（不通过 DI）
        this.previewManager = new PreviewManager(stateManager, entryAnimationService, viewportCalculatorService);
        this.boundaryEditorManager = new BoundaryEditorManager(stateManager, cardBoundaryEditorFactory, eventBus, validationService);
        this.configDataManager = new ConfigDataManager(stateManager, eventBus);
    }
}
```

#### 子组件初始化接口

**统一的 `init(container)` 模式：**
```javascript
// 父组件传递容器
renderConfig(container) {
    this.previewManager.init(container);
    this.boundaryEditorManager.init(container);
    this.configDataManager.init(container);
}

// 子组件自己查找元素
export class PreviewManager {
    init(container) {
        this.elements = {
            previewCanvas: container.querySelector('#entryAnimationPreviewCanvas'),
            previewBtn: container.querySelector('#entryAnimationPreviewBtn')
        };
        // Fail Fast 验证
        if (!this.elements.previewCanvas) {
            throw new Error('PreviewManager.init: #entryAnimationPreviewCanvas not found');
        }
    }
}
```

**优势：**父传容器，子自查找 → 低耦合，易测试。

---

### 4. 项目实例对比

| 类名 | 创建方式 | 原因 |
|------|----------|------|
| `CustomSelect` | 工厂 | 父组件不需要 `keyboardService` |
| `CardBoundaryEditorService` | 工厂 | 父组件不需要 `keyboardService` |
| `PreviewManager` | 直接创建 | 所有依赖父组件都有 |
| `ConfigDataManager` | 直接创建 | 所有依赖父组件都有 |
| `UIStateCoordinator` | 直接创建 | 无需外部依赖 |
| `EntryAnimationHelpDialogs` | 直接创建 | 所有依赖父组件都有 |
| `CardAnimationListManager` | 直接创建 | 工厂作为依赖传入（父组件已有） |

---

### 5. 决策口诀

```
服务用 DI，组件用 import；
子组件依赖父不需，工厂来隔离；
父传容器子自查，低耦合好测试。
```

---

## 二、代码组织与职责划分

### 1. `helpers/` vs `utils/` 目录区别与判断标准

#### 核心区别

| 方面 | `helpers/`（第4层） | `utils/`（第5层） |
|-----|---------------------|------------------|
| **本质** | 纯函数工具箱 | 工具服务类 |
| **编程范式** | 函数式编程（FP） | 面向对象编程（OOP） |
| **代码形式** | `export function xxx()` | `export class XxxService` |
| **状态管理** | ❌ 无状态（无 `this`） | ✅ 有状态（`this.xxx` 属性） |
| **纯函数** | ✅ 是（相同输入→相同输出） | ❌ 否（可能有副作用） |
| **依赖注入** | ❌ 不需要 DI | ✅ 需要在 `ServiceRegistry.js` 注册 |
| **使用方式** | `import { fn } from 'helpers/xxx'` | 通过 DI 容器获取实例 |
| **资源管理** | ❌ 不管理（不操作DOM、不监听事件） | ✅ 可能管理（事件监听、Canvas上下文等） |
| **单元测试** | 只需传参数 | 需要 mock 依赖 |

#### 快速判断流程

```
你要创建一个新工具 → 问以下问题：

Q1: 需要保存状态吗？（如：配置、缓存、标记位）
    ├─ ✅ 是 → utils/（服务类）
    └─ ❌ 否 → 继续

Q2: 需要访问其他服务吗？（如：StateManager、EventBus）
    ├─ ✅ 是 → utils/（服务类）
    └─ ❌ 否 → 继续

Q3: 需要管理全局资源吗？（如：事件监听、定时器、Canvas）
    ├─ ✅ 是 → utils/（服务类）
    └─ ❌ 否 → 继续

Q4: 是纯计算/格式化函数吗？
    ├─ ✅ 是 → helpers/（纯函数）✅
    └─ ❌ 否 → 可能不属于工具层，考虑其他目录
```

#### 代码示例对比

**helpers/ 示例：**
```javascript
// helpers/timeFormatters.js
export function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${minutes.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
}
// ✅ 纯函数：无状态、无副作用、可直接调用
```

**utils/ 示例：**
```javascript
// utils/KeyboardService.js
export class KeyboardService {
    constructor() {
        this.shortcuts = new Map();     // 有状态
        this.initialized = false;       // 有状态
    }
    
    init() {
        document.addEventListener('keydown', ...);  // 管理全局资源
    }
    
    registerShortcut(key, callback) {
        this.shortcuts.set(key, callback);  // 修改状态
    }
}
// ✅ 服务类：有状态、管理资源、需要实例化
```

#### 经验法则（Rule of Thumb）

| 如果你的代码... | 放哪里 |
|---------------|-------|
| 只是一个 `function` | `helpers/` |
| 是一个 `class` | `utils/` |
| 没有 `this` | `helpers/` |
| 有 `this.xxx` 属性 | `utils/` |
| 可以写成 `const result = xxx(input)` | `helpers/` |
| 需要先 `new Xxx()` 或通过DI获取 | `utils/` |

---

### 2. 配置管理判断标准

#### 配置放 JSON vs 硬编码

**核心原则：**区分"做什么"（业务规则）和"怎么做"（技术实现）

**判断标准：**

1. **这个值定义的是功能行为还是实现方式？**
   - 功能行为（如：文件大小限制、循环次数范围）→ JSON
   - 实现方式（如：动画曲线、防抖算法、渲染优化）→ 硬编码

2. **修改这个值需要改代码吗？**
   - 需要（如：添加新策略、新菜单项必须写对应的类/服务）→ 硬编码
   - 不需要（纯配置调整即可生效）→ JSON

3. **这个值会随着需求变化而调整吗？**
   - 会（如：支持的最大图片尺寸、默认导出选项）→ JSON
   - 不会（如：浮点数比较精度、UI交互手感参数）→ 硬编码

**简单判断法：**
- 如果它定义"功能的边界和规则" → JSON
- 如果它是"实现功能的技术细节" → 硬编码

---

### 3. 文件命名规范判断标准

#### 文件后缀选择的核心原则

**判断标准：使用范围 + 职责**

```
第一步：确定使用范围
├─ 全局使用（多处依赖，应用级单例） → Service / Factory / Page / StrategyManager
│   └─ 结果：需要在 ServiceRegistry.js 中注册
│
└─ 局部使用（只被1-2个父组件使用） → Manager / Coordinator / Panel / Renderer / Monitor / 无后缀
    └─ 结果：不在 ServiceRegistry.js 中注册，由父组件创建

第二步：根据具体职责选择后缀（见下文详细说明）
```

**记忆要点：**
- "是否在 ServiceRegistry.js 中注册"是**结果**，不是判断依据
- 判断依据是：**使用范围**（全局/局部）+ **职责**（协调/管理/展示等）

---

#### 分类一：服务类（在 DI 容器中注册）

这些类在 `ServiceRegistry.js` 中注册，通过 DI 注入，全局单例。

**1. Service 后缀**

特征：
- ✅ 在 `ServiceRegistry.js` 中以 `.singleton()` 注册
- ✅ 构造函数接收依赖（通过DI注入）
- ✅ 全局单例，管理某个领域的业务逻辑或系统功能

判断问题：
- "这个类是否在 `ServiceRegistry.js` 中注册？" → 是
- "这个类是否被其他服务通过 DI 注入？" → 是

**2. Factory 后缀**

特征：
- ✅ 在 `ServiceRegistry.js` 中注册
- ✅ 有 `create()` 方法创建其他类的实例
- ✅ 持有低层依赖（StateManager, KeyboardService等），通过create()传递

判断问题：
- "这个类的主要职责是创建其他对象吗？" → 是
- "这个类是否有 `create()` 方法返回新实例？" → 是

项目中的所有 Factory：`CustomSelectFactory`, `CardBoundaryEditorFactory`, `PreviewManagerFactory`, `BoundaryEditorManagerFactory`, `EntryAnimationHelpDialogsFactory`, `ColorPickerFactory`

**3. Page 后缀**

特征：
- ✅ 在 `ServiceRegistry.js` 中注册
- ✅ 管理完整配置页面（通过气泡菜单打开）
- ✅ 提供 `renderConfig()` / `getConfig()` / `save()` / `destroy()` 标准接口

判断问题：
- "这个类是否管理一个完整的配置页面？" → 是
- "这个类是否被 BubbleMenuService 调用？" → 是

项目中的所有 Page：`EntryAnimationConfigPage`, `PerformanceReportPage`

**4. StrategyManager 后缀**

特征：
- ✅ 在 `ServiceRegistry.js` 中注册为核心服务
- ✅ 管理策略模式的策略实例

项目中的所有 StrategyManager：`ScrollStrategyManager`, `FileProcessStrategyManager`, `EntryAnimationStrategyManager`

---

#### 分类二：子组件（不在 DI 容器中注册）

这些类不在 `ServiceRegistry.js` 中注册，由父组件（Page/Service）直接创建，遵循"父传容器，子自查找"模式。

**共同特征：**
- ❌ **不在** `ServiceRegistry.js` 中注册
- ✅ 有 `init()` 或 `init(container)` 方法
- ✅ 由父组件通过工厂或直接 `new` 创建
- ✅ 生命周期跟随父组件

**5. Manager 后缀（非 StrategyManager）**

职责：管理一组子功能或子组件

特征：
- ✅ 有 `init(container)` 方法接收容器
- ✅ 管理多个子模块的状态和交互
- ✅ 作为父组件和底层功能之间的中间层

判断问题：
- "这个类是否管理多个子组件/子功能？" → 是
- "这个类是否作为中间层协调子模块？" → 是

示例：`PreviewManager`, `BoundaryEditorManager`, `CardAnimationListManager`

**6. Coordinator 后缀**

职责：协调UI状态或多个模块的交互流程

特征：
- ✅ 有 `init(container)` 方法
- ✅ 协调UI状态变化，不直接操作业务数据
- ✅ 通常无参构造函数，不依赖业务服务

判断问题：
- "这个类的主要职责是协调UI状态吗？" → 是
- "这个类是否编排流程而非直接执行？" → 是

示例：`UIStateCoordinator`

**7. Panel 后缀**

职责：展示信息面板

特征：
- ✅ 有 `init(container)` 方法
- ✅ 专注于信息展示（纯UI显示）
- ✅ 无参构造函数

判断问题：
- "这个类是否只负责某个面板的信息显示？" → 是
- "这个类的主要职责是数据展示吗？" → 是

示例：`DeviceInfoPanel`, `ImageInfoPanel`, `CanvasInfoPanel`, `CardPositionInfoPanel`

**8. Renderer 后缀**

职责：渲染复杂内容

特征：
- ✅ 有 `init(container)` 方法
- ✅ 专注于渲染/绘制逻辑
- ✅ 将数据转换为DOM/Canvas
- ✅ 无参构造函数

判断问题：
- "这个类的主要职责是渲染/绘制吗？" → 是
- "这个类是否处理复杂的渲染逻辑？" → 是

示例：`PerformanceReportRenderer`

**9. Monitor 后缀**

职责：实时监控某个指标

特征：
- ✅ 有 `init()` 方法（可能接收参数而非容器）
- ✅ 实时监控某个指标或状态
- ✅ 持续收集和更新数据
- ✅ 无参构造函数

判断问题：
- "这个类是否实时监控某个指标？" → 是
- "这个类是否持续收集数据？" → 是

示例：`RealtimeFPSMonitor`

---

#### 分类三：纯UI组件（通过工厂创建）

这些类也不在 `ServiceRegistry.js` 中注册，但与子组件不同，它们通过工厂创建，可以在多个地方复用。

**10. 无后缀 - 纯UI组件**

特征：
- ❌ **不在** `ServiceRegistry.js` 中注册
- ✅ 通过工厂 (`Factory`) 创建
- ✅ 纯UI组件，职责单一
- ✅ 可在多个地方创建多个实例

判断问题：
- "这个类是否是可复用的UI组件？" → 是
- "这个类是否通过工厂创建多个实例？" → 是

示例：`ColorPicker`, `CustomSelect`

---

#### 决策流程图

```
新建一个类文件，应该用什么后缀？
    ↓
Q1: 这个类会在哪些地方使用？
    ├─ 全局使用（多个服务/页面依赖）→ 继续 Q2
    │   ├─ 专门创建其他类的实例（有 create() 方法）？ → Factory
    │   ├─ 管理完整配置页面（被 BubbleMenuService 调用）？ → Page
    │   ├─ 管理策略模式的策略？ → StrategyManager
    │   └─ 其他业务/系统/工具服务 → Service
    │   
    │   └─ 结果：在 ServiceRegistry.js 中注册
    │
    └─ 局部使用（只被1-2个父组件使用）→ 继续 Q3
        ├─ 通过工厂创建的可复用UI组件？ → 无后缀（如 ColorPicker）
        ├─ 管理一组子功能/子组件？ → Manager
        ├─ 协调UI状态/多个模块的交互流程？ → Coordinator
        ├─ 专注于信息面板展示？ → Panel
        ├─ 专注于复杂内容渲染？ → Renderer
        └─ 实时监控某个指标？ → Monitor
        
        └─ 结果：不在 ServiceRegistry.js 中注册，由父组件创建
```

---

#### 关键记忆点

1. **先判断使用范围，再选后缀**
   - 全局多处使用 → Service/Factory/Page/StrategyManager（会在 ServiceRegistry.js 注册）
   - 局部1-2处使用 → Manager/Coordinator/Panel/Renderer/Monitor/无后缀（由父组件创建）

2. **后缀是强制规范，名称遵循语义清晰度原则**
   - **后缀**（强制）：必须根据架构定位选择（Service/Coordinator等）
   - **名称**（语义清晰度）：根据名词是否自带明确的业务上下文来决定
   
   **命名规则：**
   
   **规则A：业务领域名词（自带上下文）→ 直接命名**
   ```javascript
   ImageService           // ✅ 图片 = 明确的业务领域
   ConfigService          // ✅ 配置 = 明确的业务领域
   ScrollService          // ✅ 滚动 = 明确的功能范围
   KeyboardService        // ✅ 键盘 = 明确的功能范围
   ValidationService      // ✅ 验证 = 明确的功能范围
   ```
   
   **规则B：通用动作/职责（需要上下文）→ 加描述词**
   ```javascript
   DisplayCoordinatorService       // ✅ Display 太泛，需要说明是"协调显示"
   PlaybackCoordinatorService      // ✅ Playback 太泛，需要说明是"协调播放"
   BusinessOrchestrationService    // ✅ Business 太泛，需要说明是"业务编排"
   
   // ❌ 反例：
   DisplayService         // ❌ 显示什么？哪个部分的显示？不清楚！
   PlaybackService        // ❌ 播放什么？不够清晰！
   BusinessService        // ❌ 什么业务？太泛了！
   ```
   
   **判断标准：**
   - 问自己："**在本项目上下文中**，这个名词是否有唯一明确的指向？"
   - 项目上下文包括：项目名称（CardScroller）、核心功能（滚动展示图片）、业务领域
   - 是 → 直接用名词（如 ScrollService - 项目核心就是滚动）
   - 否 → 加描述词（如 DisplayCoordinatorService - 显示什么不清楚）
   
   **示例：**
   ```javascript
   // 在 CardScroller 项目中：
   ScrollService  // ✅ 项目名就叫 CardScroller，滚动是核心，清楚！
   DisplayService // ❌ 显示什么？卡片？配置？状态？不清楚！
   
   // 如果项目叫 DataAnalyzer：
   ScrollService  // ❌ 滚动什么？不是核心功能，不清楚！
   ```
   
   **注意：**
   - 后缀 `Service` vs `Coordinator` 取决于是否全局使用（架构定位）
   - 名称中是否包含 `Coordinator`/`Orchestration` 等描述词取决于语义清晰度

3. **识别特征**
   - 有 `init(container)` 方法 → 局部子组件（Manager、Coordinator、Panel、Renderer）
   - 有 `init()` 但不是容器 → Monitor（可能接收其他参数如刷新率）
   - 通过工厂创建 → 无后缀（ColorPicker、CustomSelect）

4. **当不确定时**
   - 问自己："这个类会被多少个地方使用？"
   - 多处 → Service
   - 1-2处 → 根据职责选择其他后缀

---

### 4. 验证逻辑判断标准

#### 参数验证 vs 业务验证

**核心判断法：**这个错误是谁的责任？
- 开发者的责任（代码调用错误）→ 参数验证（Fail Fast）
- 用户的责任（输入错误）→ 业务验证（ValidationService）

**实用判断法：**用户能否通过操作导致验证失败？
- 能（用户输入、上传、点击等）→ 业务验证（ValidationService）
- 不能（程序内部状态、服务间调用）→ 参数验证（Fail Fast）

---

#### 🔴 参数验证（Fail Fast，留在方法内部）

**定义：**验证方法调用契约，确保代码被正确调用

**判断标准：**
- ✅ 验证的是依赖注入参数（如 `if (!stateManager)`）
- ✅ 验证的是方法必需参数，错误表示代码调用错误（开发者的bug）
- ✅ 使用 `throw new Error()` 直接抛出，让应用崩溃
- ✅ 错误信息格式：`ClassName.methodName: paramName is required`（给开发者看）

**典型例子：**
```javascript
constructor(stateManager) {
    if (!stateManager) {
        throw new Error('ValidationService requires stateManager dependency');
    }
}
```

---

#### 🟢 业务验证（统一在ValidationService）

**定义：**验证数据是否符合业务规则，处理用户输入或外部数据

**判断标准：**
- ✅ 验证的是用户输入、配置文件数据、外部数据源
- ✅ 错误表示用户操作错误或数据不合规（不是代码bug）
- ✅ 返回 `{ isValid: boolean, errors: string[] }` 结构，由调用者决定如何显示
- ✅ 错误信息格式：用户友好的中文提示（给用户看）

**典型例子：**
```javascript
validateFile(file) {
    const errors = [];
    if (file.size > maxSize) {
        errors.push(`文件过大...`);
    }
    return { isValid: errors.length === 0, errors };
}
```

---

## 三、架构通信方式

### 1. 直接调用 vs EventBus

#### 核心原则

**何时用直接调用 vs EventBus** — 判断逻辑（3个问题）

**Q1: 是否已通过DI注入？**
- ✅ 是 → 继续 Q2
- ❌ 否 → 使用 EventBus

**Q2: 是否符合架构分层向下调用（上层→下层）？**
- ✅ 是 → **直接调用** ✅
- ❌ 否 → 继续 Q3

**Q3: 是否存在循环依赖风险？**
- ✅ 是 → 使用 EventBus
- ❌ 否 → 直接调用（但需要添加DI依赖）

**❌ 不允许反向直接调用（下层→上层），必须通过 EventBus**

#### 架构分层依赖方向

```
第13层: 应用启动层 (ServiceImports, ServiceRegistry, ApplicationBootstrap, CardScrollerApp)
    ↓ 可直接调用
第12层: UI控制层
    Modal层 (AboutModalService, AdvancedLoopService, ImageInfoModalService, 
             PositionSelectorService, ColorPickerModalService)
    Page层 (EntryAnimationConfigPage, PerformanceReportPage)
    UI控制 (FileOperationUIService, ParameterControlUIService, PlaybackControlUIService,
            ProgressBarService, SidebarService, DisplayCoordinatorService, 
            PlaybackUIDisablerService, BubbleMenuService)
    ↓ 可直接调用
第11层: 业务协调层 (ImageService, PlaybackCoordinatorService, ScrollService, 
                    ConfigService, BusinessOrchestrationService)
    ↓ 可直接调用
第10层: 业务逻辑服务层 (ImageProcessingService, ScrollAnimationService, EntryAnimationService,
                      DurationSequenceService, LoopConfigurationService, PositionPreviewService, 
                      PerformanceMonitorService, PreviewManagerFactory)
    ↓ 可直接调用
第9层: 系统服务层 (ValidationService, StateWatcherService, ErrorDisplayService, 
                   DialogService, TooltipService)
    ↓ 可直接调用
第8层: 基础UI服务层 (BaseUIService, BaseModalService)
    ↓ 可直接调用
第7层: UI组件层
    通用组件 (CustomSelect, CustomSelectFactory, ColorPicker, ColorPickerFactory)
    卡片编辑器 (CardBoundaryEditorService, CardBoundaryEditorFactory)
    入场动画组件 (PreviewManager, BoundaryEditorManager, BoundaryEditorManagerFactory,
                ConfigDataManager, UIStateCoordinator, EntryAnimationHelpDialogs, 
                EntryAnimationHelpDialogsFactory, CardPositionInfoPanel, CardAnimationListManager)
    性能监控组件 (DeviceInfoPanel, ImageInfoPanel, CanvasInfoPanel, PerformanceReportRenderer,
                MonitorControlPanel, RealtimeFPSMonitor, PerformanceVisualizationPanel)
    ↓ 可直接调用
第6层: 技术工具服务层 (KeyboardService, FileSaveService, MessageService, LoadingService, 
                       PositionSliderService, PreferenceService)
    ↓ 可直接调用
第5层: 纯工具服务层 (CanvasRenderService, ViewportCalculatorService, PPIExtractorService)
    ↓ 可直接调用
第4层: 纯函数工具层 (debounce, fileUtils, imageLoader, timeFormatters, fileFormatters, 
                      numberFormatters, durationCalculators, positionCalculators, 
                      imageDimensions, performanceUtils, colorConverter, colorAnalyzer, 
                      canvasAccessors)
    ↓ 可直接调用
第3层: 算法策略层 (ScrollStrategy, ScrollStrategyManager, EntryAnimationStrategy, 
                   EntryAnimationStrategyManager, FileProcessStrategy, FileProcessStrategyManager,
                   TransitionFragmentPool)
    ↓ 可直接调用
第2层: 核心基础设施层 (DIContainer, EventBus, StateManager)
    ↓ 可直接调用
第0层: 浏览器原生API层
```

**说明：**完整的层级详情和服务列表，请参考 [ARCHITECTURE_LAYERS.md](ARCHITECTURE_LAYERS.md)。

---

## 四、文档规范（Documentation Standards）

### 1. JSDoc文件头部注释标准格式

#### 标准模板

每个类文件（Service、Factory、Page、Manager、Coordinator、Panel、Renderer、Monitor、纯组件等）开头必须包含完整的JSDoc注释：

```javascript
/**
 * 英文类名 - 中文职责简述
 * 详细功能说明
 * 
 * 职责说明（可选，用于复杂服务需要额外说明职责边界或接口规范）：
 * - 职责要点1
 * - 职责要点2
 * 
 * 当前被使用的模块（不需要列出注册启动模块（ServiceImports, ServiceRegistry, ApplicationBootstrap）和间接使用的服务）：
 * - ModuleName (path/ModuleName.js) - 使用说明
 * 
 * 当前依赖的模块：
 * - DependencyName (path/DependencyName.js) - 依赖说明
 * 
 * 架构说明（可选，用于解释特殊架构决策，如为什么不继承某个基类）：
 * - 架构决策说明
 */
```

#### 各部分说明

**第一行：类名和职责简述**
- 格式：`英文类名 - 中文职责简述`
- 示例：`DisplayCoordinatorService - 显示协调服务`

**第二行：详细功能说明**
- 一句话说明服务的核心功能
- 示例：`协调各种UI显示更新，负责侧边栏信息显示和主显示区图片位置更新`

**职责说明（可选）**
- 用于复杂服务，明确职责边界
- 列举核心职责要点
- 说明接口规范或使用约束

**当前被使用的模块**
- 列出哪些模块在使用当前模块
- 不列出注册启动模块（ServiceImports、ServiceRegistry、ApplicationBootstrap）
- 不列出间接使用的服务（只列出直接调用者）

**当前依赖的模块**
- 列出当前模块依赖的所有模块
- 命名规范详见下一节

**架构说明（可选）**
- 解释特殊的架构决策
- 说明为什么采用某种设计
- 例如：为什么不继承BaseUIService、为什么不通过DI注入等

---

### 2. JSDoc方法注释标准格式

#### 标准模板

每个方法必须包含完整的JSDoc注释：

```javascript
/**
 * 方法功能简述（一句话）
 * 
 * 详细说明（可选）：
 * - 设计意图
 * - 使用场景
 * - 重要约束
 * 
 * @param {Type} paramName - 参数说明（必需参数）
 * @param {Type} [optionalParam=defaultValue] - 可选参数说明
 * @returns {ReturnType} 返回值说明（所有方法必须包含，即使返回void）
 * @throws {ErrorType} 可能抛出的错误说明（Fail Fast场景必须注明）
 * @private/@protected/@public - 访问级别标记（私有方法必须标记@private）
 * 
 * @example
 * // 使用示例（复杂方法建议添加）
 * this.methodName('example');
 */
```

#### 必需的JSDoc标签

1. **`@param {Type} name - 说明`**
   - 所有参数必须注明类型和说明
   - 可选参数使用 `[name=default]` 格式
   - 示例：`@param {string} fileName - 文件名`
   - 示例：`@param {boolean} [validate=true] - 是否验证`

2. **`@returns {Type} 说明`**
   - 所有方法必须注明返回类型，包括 `void`
   - 示例：`@returns {void}`
   - 示例：`@returns {Promise<Image>} 加载的图片对象`

3. **`@throws {Error} 说明`**
   - 所有Fail Fast场景必须注明可能抛出的错误
   - 示例：`@throws {Error} 当文件格式不支持时抛出错误`

4. **`@private`**
   - 所有私有方法（以 `_` 开头）必须标记访问级别
   - 示例：`@private`

#### 方法注释示例

```javascript
/**
 * 加载图片并返回Image对象
 * 
 * 设计说明：
 * - 使用Promise封装图片加载过程
 * - 自动处理加载失败的情况
 * - 支持超时控制
 * 
 * @param {string} src - 图片URL或DataURL
 * @param {number} [timeout=30000] - 超时时间（毫秒），默认30秒
 * @returns {Promise<HTMLImageElement>} 加载完成的图片对象
 * @throws {Error} 当图片加载失败或超时时抛出错误
 * 
 * @example
 * const img = await this.loadImage('path/to/image.jpg', 5000);
 * console.log('图片尺寸：', img.width, img.height);
 */
async loadImage(src, timeout = 30000) {
    // 方法实现...
}
```

---

### 3. JSDoc "当前被使用的模块" 和 "当前依赖的模块" 命名规范

#### 核心原则

**注释应该反映代码中实际使用的名称，便于验证和查找**

---

#### "当前被使用的模块" 命名规范

**规则：使用类名（PascalCase）**

**原因：**
- 描述的是"哪个类/模块在使用当前模块"
- 这是类型层面的静态关系
- 便于快速识别调用者

**示例：**
```javascript
/**
 * 当前被使用的模块：
 * - ErrorDisplayService (system/ErrorDisplayService.js) - 统一错误显示服务
 * - ColorPickerFactory (components/ColorPickerFactory.js) - 通过工厂创建实例
 * - EntryAnimationConfigPage (ui/EntryAnimationConfigPage.js) - 初始化和调用预览功能
 */
```

---

#### "当前依赖的模块" 命名规范

**规则：使用代码中实际使用的名称**

##### 1. DI注入的服务

- **使用实例名（camelCase）** + 标注 `(通过DI注入)`
- **原因：**代码中通过 `this.serviceName` 访问

```javascript
/**
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - eventBus (core/EventBus.js) - 事件总线 (通过DI注入)
 * - scrollService (business/ScrollService.js) - 滚动服务 (通过DI注入)
 */
```

##### 2. 静态import的函数/常量

- **使用函数名/常量名** - 代码中实际调用的名称
- 多个导出用逗号分隔

```javascript
/**
 * 当前依赖的模块：
 * - formatFileSize, getFileFormat (helpers/fileFormatters.js) - 文件格式化工具函数
 * - calculateScaling, calculateAspectRatio (helpers/imageDimensions.js) - 图片尺寸计算
 * - EXTENSION_TO_MIME_MAP (helpers/fileUtils.js) - 文件扩展名到MIME类型映射常量
 */
```

##### 3. 静态import的类

- **使用类名（PascalCase）** + 标注 `(直接导入)`
- **原因：**代码中用于实例化

```javascript
/**
 * 当前依赖的模块：
 * - CustomSelect (components/CustomSelect.js) - 自定义下拉菜单组件类 (直接导入)
 * - PreviewManager (components/entry-animation/PreviewManager.js) - 预览管理器 (直接导入)
 */
```

##### 4. 动态import

- **使用函数名/类名** + 标注 `(动态import)`
- **说明使用场景**

```javascript
/**
 * 当前依赖的模块：
 * - loadImageFromDataURL (helpers/imageLoader.js) - 图片加载工具函数 (动态import)
 */
```

##### 5. 继承的基类

- **使用类名（PascalCase）** + 标注 `(通过继承)`

```javascript
/**
 * 当前依赖的模块：
 * - BaseUIService (base/BaseUIService.js) - UI服务基类 (通过继承)
 * - BaseModalService (base/BaseModalService.js) - 模态框基类 (通过继承)
 */
```

##### 6. 工厂注入的服务

- **使用实例名（camelCase）** + 标注 `(通过工厂注入)`

```javascript
/**
 * 当前依赖的模块：
 * - stateManager (core/StateManager.js) - 状态管理器 (通过工厂注入)
 * - keyboardService (utils/KeyboardService.js) - 键盘服务 (通过工厂注入)
 */
```

##### 7. 策略模式的多个策略类

- **列出所有实际导入的类名**

```javascript
/**
 * 当前依赖的模块：
 * - EntryAnimationStrategy, FadeStrategy, SlideLeftStrategy, SlideRightStrategy, SlideUpStrategy, SlideDownStrategy, ScaleStrategy (patterns/entry/EntryAnimationStrategy.js) - 入场动画策略实现
 * - ScrollStrategy, LinearScrollStrategy, EaseInScrollStrategy, EaseOutScrollStrategy, EaseInOutScrollStrategy, ElasticScrollStrategy (patterns/scroll/ScrollStrategy.js) - 滚动策略实现
 */
```

---

#### 特殊情况处理

##### 不列入依赖的情况：

1. **DOM元素参数**
   - `container`, `element`, `selector` 等DOM元素参数
   - **原因：**这些是运行时传入的参数，不是模块依赖

2. **配置对象参数**
   - 简单的配置对象参数
   - **原因：**不是模块依赖，是数据传递

3. **未实际使用的import**
   - 只是import但从未使用的模块
   - **原因：**应该被清理的死代码

---

#### 验证规则

**自动化验证脚本应该遵循的规则：**

1. ✅ **忽略大小写比较**
   - 因为DI注入使用 camelCase，类名使用 PascalCase
   - 验证时将 `StateManager` 和 `stateManager` 视为相同

2. ✅ **检查JSDoc中声明的依赖是否在代码中实际使用**
   - 避免过时的注释
   - 识别死代码引用

3. ✅ **检查代码中使用的依赖是否在JSDoc中声明**
   - 确保注释完整性
   - 帮助开发者理解依赖关系

4. ✅ **支持动态import识别**
   - 识别 `import('path/to/module.js').then(...)` 模式
   - 提取动态导入的模块名

5. ✅ **支持逗号分隔的多个导出**
   - 正确解析 `formatFileSize, getFileFormat` 这样的声明
   - 分别验证每个导出的使用情况

---

#### 完整示例

```javascript
/**
 * DisplayCoordinatorService - 显示协调服务
 * 协调各种UI显示更新，负责侧边栏信息显示和主显示区图片位置更新
 * 
 * 当前被使用的模块：
 * - AdvancedLoopService (modal/AdvancedLoopService.js) - 使用循环提示更新功能
 * 
 * 当前依赖的模块：
 * - BaseUIService (base/BaseUIService.js) - UI服务基类 (通过继承)
 * - eventBus (core/EventBus.js) - 事件总线 (通过DI注入)
 * - stateManager (core/StateManager.js) - 状态管理器 (通过DI注入)
 * - stateWatcherService (system/StateWatcherService.js) - 状态监听服务 (通过DI注入)
 * - canvasRenderService (utils/CanvasRenderService.js) - Canvas渲染服务 (通过DI注入)
 * - formatFileSize, getFileFormat (helpers/fileFormatters.js) - 文件格式化工具函数
 * - calculateScaling, calculateAspectRatio (helpers/imageDimensions.js) - 图片尺寸计算
 * - debounce (helpers/debounce.js) - 防抖函数
 * 
 * 架构说明：
 * - 继承BaseUIService以利用DOM缓存机制，提高频繁访问固定元素的性能
 * - 主要被动响应状态变化事件，不主动修改状态
 */
import { BaseUIService } from '../base/BaseUIService.js';
import { debounce } from '../../helpers/debounce.js';
import { formatFileSize, getFileFormat } from '../../helpers/fileFormatters.js';
import { calculateScaling, calculateAspectRatio } from '../../helpers/imageDimensions.js';

export class DisplayCoordinatorService extends BaseUIService {
    constructor(eventBus, stateManager, stateWatcherService, canvasRenderService) {
        super();
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.stateWatcherService = stateWatcherService;
        this.canvasRenderService = canvasRenderService;
    }
    // ... 方法实现
}
```

---

#### 快速检查清单

在编写或审查JSDoc注释时，使用此清单：

- [ ] "当前被使用的模块"使用类名（PascalCase）
- [ ] DI注入的服务使用实例名（camelCase）+ 标注
- [ ] 静态import的函数使用实际函数名
- [ ] 静态import的类使用类名 + 标注
- [ ] 动态import添加了 `(动态import)` 标注
- [ ] 继承的基类添加了 `(通过继承)` 标注
- [ ] 没有列出DOM元素参数或配置对象
- [ ] 所有列出的依赖在代码中都有实际使用
- [ ] 代码中使用的所有依赖都已在JSDoc中声明

---

## 五、UI文本规范（UI Text Standards）

### 1. 文本末尾标点符号判断标准

#### 核心原则

**区分"完整句子"与"标题/标签/短语"**

---

#### 快速判断表

| 文本类型 | 是否加句号 | 典型场景 |
|---------|-----------|---------|
| 完整句子（叙述性） | ✅ 加句号（。） | message内容、tooltip、说明文本 |
| 标题/标签/按钮 | ❌ 不加 | title、shortMessage、按钮、标签 |
| 成功/错误消息 | ✅ 保留感叹号（！） | 操作反馈 |

---

#### 判断流程

```
Q1: 是标题/标签/按钮吗？
    ├─ 是 → ❌ 不加标点
    └─ 否 → 继续Q2

Q2: 是完整句子吗？（有主谓结构，能独立表达完整意思）
    ├─ 是 → 继续Q3
    └─ 否（短语） → ❌ 不加标点

Q3: 表达强烈情感吗？（成功/失败/警告）
    ├─ 是 → ✅ 保留感叹号（！）
    └─ 否 → ✅ 加句号（。）
```

---

#### 常见场景示例

**✅ 必须加句号：**
```javascript
// message内容（完整句子）
message: '位置设置已改变，入场动画配置已重置。'

// tooltip（完整句子）
data-tooltip="每张卡片的入场时机按顺序错开，形成波浪般的连续入场效果。"

// 多行说明（每行都是完整句子）
const text = `理论平均FPS：基于业务代码执行耗时计算。
代表"如果没有刷新率限制，代码理论上能达到的帧率"。`;

// ValidationService的warning（三个字段都加）
message: '检测到正方形图片。',
description: '正方形图片不适合制作滚动视频。',
suggestion: '推荐使用宽高比大于2:1的横向长图。'
```

**❌ 不加标点：**
```javascript
// 标题（仅title字段）
title: '图片验证失败'

// 按钮/标签
button.textContent = '确定'
label.textContent = '文件大小:'
```

**✅ shortMessage要加句号（是消息内容，不是标题）：**
```javascript
// shortMessage显示在消息框里，是主要内容
shortMessage: '图片不符合滚动视频要求，请重新选择符合条件的图片。'
shortMessage: '刷新率验证失败。'
shortMessage: '复制失败。'
```

**✅ 保留感叹号：**
```javascript
// 成功消息
message: '图片上传成功！'

// 错误消息的shortMessage（保留感叹号）
shortMessage: '滚动参数无效！'
```

---

#### 特殊情况

1. **包含变量的文本**：不修改 `${error.message}` 等不确定内容
2. **列表项**：短语不加句号，完整句子加句号
3. **确定的部分**：`已恢复为默认值：${previousValue}。` ← 确定部分加句号

---

#### 判断口诀

```
标题标签不加点，
完整句子必须点，
成功失败保留叹，
变量内容不乱改。
```
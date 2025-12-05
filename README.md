# CardScroller - 滚动视频制作工具

一个简单易用的滚动视频制作工具，帮助用户快速制作水平滚动类视频。

## 🎯 使用场景

- **视频制作**：常见的盘点类、排行类、对比类、时间线类和产品展示类的卡片滚动类视频
- **适合人群**：不会使用PPT、剪映、PR或者Flourish等工具制作的人群

## ✨ 功能特点

### 图片处理与上传
- **多格式支持**：支持 JPEG、PNG、WebP、GIF、BMP
- **智能验证系统**：自动检测图片尺寸、宽高比、文件完整性，提供建议
- **拖拽上传**：支持拖拽上传或点击选择，实时显示加载状态
- **智能图片适配**：自动计算最佳显示尺寸和缩放比例，超大图片（>100MP）自动降采样优化以确保性能和稳定性
- **文件信息展示**：自动显示文件大小、图片尺寸、格式、宽高比等详细信息
- **详细图片信息**：点击"查看全部"查看完整图片信息，包括原图尺寸、实际显示尺寸、PPI信息、MP值等，支持窗口缩放实时更新
- **Base64配置导入**：支持从配置文件导入Base64格式图片，自动处理元数据丢失情况

### 显示与交互
- **真全屏显示**：图片占据整个屏幕，侧边栏浮动覆盖，最大化视觉效果
- **可视化位置选择**：通过模态框直观选择滚动起始和结束位置，实时预览效果
- **精确坐标系统**：显示原始图片像素坐标，支持超大型长图
- **智能位置滑块**：拖拽式位置控制，实时坐标计算和位置预览
- **侧边栏控制**：支持折叠/展开（Ctrl+H），透明度调节，完全不遮挡图片

### 滚动控制
- **时长控制**：自定义滚动总时长，精确到秒
- **智能输入验证**：实时验证滚动时长、循环次数等参数，防止无效输入
- **动画策略**：5种滚动动画效果（线性、缓入、缓出、缓入缓出、弹性），提供丰富的视觉体验
- **循环播放**：支持循环播放模式，可设置循环次数和间隔时间
- **高级循环**：支持变长时长模式，每次循环可使用不同的滚动时长
- **智能循环提示**：循环模式下提供实时的循环状态和进度提示
- **智能进度条**：显示当前循环进度、总时长和循环计数，支持自动隐藏设置和播放完毕保持显示
- **重置功能**：一键重置到播放前状态
- **实时预览**：所见即所得的滚动效果预览

### 配置管理
- **完整导入/导出**：包含图片数据和所有设置的 JSON 配置文件
- **文件夹选择导出**：支持选择自定义文件夹保存配置文件（现代浏览器）
- **配置验证**：导入时自动验证配置文件完整性和版本兼容性

### 高级功能
- **气泡菜单**：点击"更多功能"呼出动态气泡菜单，优雅的入场/退出动画，支持渐进式功能扩展
- **卡片入场动画配置**：Canvas可视化编辑器标记卡片边界，支持多种入场动画效果（淡入、滑入、缩放等），集成放大镜和键盘微调辅助精确定位，提供实时预览和帮助对话框
- **动画性能监控**：实时收集入场动画和滚动动画的性能数据，提供详细的性能报告（FPS分析、帧时间分解、Canvas操作统计），支持设备信息、图片信息、刷新率估算和手动修正，可选实时FPS显示，数据可视化图表（帧率分布直方图、帧时间趋势折线图、稳定性雷达图、帧掉落饼图），支持"查看更多"按钮切换到全屏可视化视图，配备转场动画效果

### 用户体验
- **智能UI状态管理**：播放时自动禁用相关控件，防止状态冲突
- **自动隐藏侧边栏**：播放时可自动隐藏侧边栏，支持延迟设置，获得更好观看体验
- **优雅加载**：精美的加载动画和状态提示
- **三层错误处理**：单对话框、双重反馈、轻量消息三种错误反馈策略，确保用户及时了解操作状态
- **自定义对话框**：美观的验证提示和错误信息显示。浏览器原生的alert/confirm？不存在的，我选择重造轮子！
- **自定义下拉菜单**：智能定位的下拉选择器，支持键盘导航和无障碍访问。浏览器原生的select？不存在的，我选择重造轮子！
- **自定义颜色选择器**：可视化颜色选择器，支持固定预设色和自定义预设色（本地保存，最多10个），提供Hex/RGB/HSV多种输入方式和实时验证反馈，支持从页面吸取颜色，包含淡入淡出动画和重复检测。浏览器原生的`<input type="color">`？不存在的，我选择重造轮子！
- **自定义提示框**：统一的Tooltip管理服务，鼠标悬停显示提示信息，智能4方向定位（自动避让边缘），25种随机渐变背景配色和6种随机动画效果，支持提示框内嵌套提示框（点击提示框内的帮助图标可查看更详细的说明）。浏览器原生的title属性？不存在的，我选择重造轮子！
- **自定义进度条**：智能循环进度显示系统，实时显示当前循环进度、总时长和循环计数，支持自动隐藏设置（播放中自动隐藏、暂停时隐藏、播放完毕保持显示），平滑动画效果和微光装饰。浏览器原生的`<progress>`？不存在的，我选择重造轮子！
- **右上角消息框**：操作成功/失败的实时消息通知，支持多种类型和自动消失
- **拖拽视觉反馈**：拖拽时的动态效果和视觉提示
- **键盘快捷键**：Ctrl+H 折叠侧边栏，Ctrl+E 打开入场动画配置，Ctrl+M 打开性能监控，空格播放/暂停，ESC关闭模态框/对话框

## 🚀 使用方法

> ⚠️ **设备要求**：本项目仅支持桌面浏览器，不支持移动端设备。

### 在线使用
1. 访问在线版本：https://hatsusumi.github.io/CardScroller/
2. 上传你的长图片
3. 调整滚动参数
4. 点击播放预览效果
5. 使用录屏工具录制滚动视频

### 本地部署

> 📦 **项目大小**：
> - ZIP下载：约96MB（包含源码和示例图片，不含版本历史）
> - Git克隆：约103MB（含完整版本历史）

**第一步：获取项目文件**
1. 访问 GitHub 仓库：https://github.com/HatsuSumi/CardScroller
2. 点击绿色的 **Code** 按钮
3. 选择 **Download ZIP**
4. 解压下载的文件（文件夹会命名为 CardScroller-main，可重命名为 CardScroller）

**第二步：选择启动方式**

#### 方法1：使用启动脚本（最简单，推荐）
**Windows用户：**
1. 双击项目根目录的 `start.bat` 文件
2. 脚本会自动检测Python环境、启动服务器并打开浏览器

#### 方法2：使用VS Code Live Server扩展
1. 用VS Code打开项目文件夹
2. 安装Live Server扩展
3. 右键index.html选择"Open with Live Server"

#### 方法3：Python服务器
1. 启动本地服务器：

   **Windows用户：**
   ```powershell
   # 打开PowerShell，导航到项目目录
   cd F:\CardScroller
   
   # 启动Python服务器
   python -m http.server 8000
   
   # 如果python命令不可用，尝试：
   py -m http.server 8000
   ```

   **其他方法：**
   ```bash
   # 使用Node.js
   npx http-server -p 8000
   ```

3. 打开浏览器访问 `http://localhost:8000`

#### 方法4：Git克隆（开发者推荐）
```bash
# 克隆项目到本地
git clone https://github.com/HatsuSumi/CardScroller.git
cd CardScroller

# 或者使用SSH
git clone git@github.com:HatsuSumi/CardScroller.git
cd CardScroller

# 然后使用上述任意方法启动服务器
```

#### 常见问题
- **端口被占用**：改用其他端口 `python -m http.server 8001`
- **Python未安装**：从 [python.org](https://python.org) 下载安装
- **停止服务器**：按 `Ctrl + C`

---

**📖 以下内容为技术实现细节（面向开发者）**

## 📁 项目结构

```
CardScroller/
├── index.html                    # 主页面
├── start.bat                     # Windows快速启动脚本
├── LICENSE                       # MIT 开源许可证
├── README.md                     # 项目说明文档
├── ARCHITECTURE_LAYERS.md        # 架构分层文档
├── DESIGN_STANDARDS.md           # 设计标准与判断准则文档
├── remove_dataurl.py             # 配置文件清理工具（删除Base64图片数据）
├── check_layer_violations.py    # 架构分层检查工具（检查反向依赖违规）
├── count_project_files.py        # 项目文件统计工具（自动计算服务和文件数量）
├── count_all_animations.py       # 动画数量统计工具（统计所有动画效果及分类）
├── config/                       # 配置文件目录
│   └── defaultState.json        # 默认状态配置
├── css/
│   └── style.css                # 主样式文件
├── js/
│   ├── CardScrollerApp.js       # 主应用入口
│   ├── bootstrap/               # 应用启动引导模块
│   │   ├── ApplicationBootstrap.js       # 应用启动协调器
│   │   ├── ServiceRegistry.js             # 服务注册配置
│   │   └── ServiceImports.js              # 服务导入集中管理
│   ├── core/                    # 核心架构
│   │   ├── EventBus.js         # 事件总线
│   │   ├── StateManager.js     # 状态管理器
│   │   └── DIContainer.js      # 依赖注入容器
│   ├── patterns/                # 设计模式
│   │   ├── scroll/              # 滚动策略模式（5种策略实现）
│   │   │   ├── ScrollStrategy.js          # 滚动策略基类+具体实现
│   │   │   └── ScrollStrategyManager.js   # 滚动策略专用管理器
│   │   ├── entry/               # 入场动画策略模式（15种策略实现）
│   │   │   ├── EntryAnimationStrategy.js  # 入场动画策略基类+具体实现
│   │   │   └── EntryAnimationStrategyManager.js # 入场动画策略专用管理器
│   │   ├── file/                # 文件处理策略模式（图片处理）
│   │   │   ├── FileProcessStrategy.js     # 文件处理策略基类+实现
│   │   │   └── FileProcessStrategyManager.js # 文件处理策略专用管理器
│   │   └── transition/          # 过渡动画对象池
│   │       └── TransitionFragmentPool.js  # 过渡动画碎片对象池
│   ├── helpers/                 # 纯函数工具库（13个）
│   │   ├── debounce.js         # 防抖函数
│   │   ├── fileUtils.js        # 文件工具函数
│   │   ├── imageLoader.js      # 图片加载工具函数
│   │   ├── canvasAccessors.js  # Canvas元素访问工具函数
│   │   ├── timeFormatters.js   # 时间/时长格式化工具函数
│   │   ├── fileFormatters.js   # 文件格式化工具函数
│   │   ├── numberFormatters.js # 通用数字格式化工具函数
│   │   ├── durationCalculators.js # 时长计算工具函数
│   │   ├── positionCalculators.js # 位置计算工具函数
│   │   ├── imageDimensions.js  # 图片尺寸计算工具函数
│   │   ├── performanceUtils.js # 性能监控工具函数
│   │   ├── colorConverter.js   # 颜色转换工具函数
│   │   └── colorAnalyzer.js    # 颜色分析工具函数
│   ├── components/              # UI组件层（多实例/辅助类）
│   │   ├── CustomSelect.js     # 自定义下拉菜单组件
│   │   ├── CustomSelectFactory.js # 自定义下拉菜单组件工厂
│   │   ├── ColorPicker.js      # 颜色选择器组件
│   │   ├── ColorPickerFactory.js # 颜色选择器组件工厂
│   │   ├── entry-animation/    # 入场动画专用组件
│   │   │   ├── PreviewManager.js # 预览功能管理
│   │   │   ├── PreviewManagerFactory.js # 预览管理器工厂
│   │   │   ├── BoundaryEditorManager.js # 边界编辑器管理
│   │   │   ├── BoundaryEditorManagerFactory.js # 边界编辑器管理器工厂
│   │   │   ├── ConfigDataManager.js # 配置数据管理
│   │   │   ├── UIStateCoordinator.js # UI状态协调
│   │   │   ├── EntryAnimationHelpDialogs.js # 帮助对话框管理
│   │   │   ├── EntryAnimationHelpDialogsFactory.js # 帮助对话框工厂
│   │   │   ├── CardPositionInfoPanel.js # 卡片位置信息面板管理
│   │   │   └── CardAnimationListManager.js # 卡片动画列表管理
│   │   └── performance/        # 性能监控专用组件
│   │       ├── DeviceInfoPanel.js # 设备信息面板
│   │       ├── ImageInfoPanel.js # 图片信息面板
│   │       ├── CanvasInfoPanel.js # Canvas信息面板
│   │       ├── PerformanceReportRenderer.js # 性能报告渲染器
│   │       ├── PerformanceVisualizationPanel.js # 性能数据可视化面板
│   │       ├── MonitorControlPanel.js # 监控控制面板
│   │       └── RealtimeFPSMonitor.js # 实时FPS监视器
│   └── services/                # 业务服务层（45个服务，按功能域分组）
│       ├── base/                # 基础抽象服务
│       │   ├── BaseUIService.js # UI服务基类（通用事件管理）
│       │   └── BaseModalService.js # 模态框服务基类
│       ├── business/            # 核心业务逻辑
│       │   ├── ImageService.js  # 图片业务流程协调者
│       │   ├── ImageProcessingService.js # 图片处理服务
│       │   ├── PlaybackCoordinatorService.js # 播放协调服务
│       │   ├── ScrollService.js # 滚动配置管理和事件响应协调者
│       │   ├── ScrollAnimationService.js # 滚动动画技术引擎
│       │   ├── EntryAnimationService.js # 入场动画技术引擎
│       │   ├── ConfigService.js # 配置业务流程协调者
│       │   ├── LoopConfigurationService.js # 循环配置管理服务
│       │   ├── DurationSequenceService.js # 时长序列管理服务
│       │   └── PerformanceMonitorService.js # 性能监控数据收集和分析服务
│       ├── ui/                  # 用户界面服务
│       │   ├── FileOperationUIService.js # 文件操作UI服务
│       │   ├── PlaybackControlUIService.js # 播放控制UI服务
│       │   ├── ParameterControlUIService.js # 参数控制UI服务
│       │   ├── PlaybackUIDisablerService.js # 全局UI协调服务
│       │   ├── SidebarService.js # 侧边栏管理服务
│       │   ├── DisplayCoordinatorService.js # 显示协调服务
│       │   ├── ProgressBarService.js # 进度条服务
│       │   ├── PositionPreviewService.js # 位置选择预览显示服务
│       │   ├── PositionSliderService.js # 位置滑块控制服务
│       │   ├── BubbleMenuService.js # 气泡菜单服务
│       │   ├── EntryAnimationConfigPage.js # 卡片入场动画配置页面服务
│       │   ├── PerformanceReportPage.js # 动画性能监控报告页面服务
│       │   ├── CardBoundaryEditorFactory.js # 卡片边界编辑器工厂
│       │   └── CardBoundaryEditorService.js # 卡片边界编辑器服务
│       ├── modal/               # 模态框服务
│       │   ├── AboutModalService.js # 关于页面模态框服务
│       │   ├── ImageInfoModalService.js # 图片详细信息模态框服务
│       │   ├── AdvancedLoopService.js # 高级循环模态框服务
│       │   ├── PositionSelectorService.js # 位置选择模态框服务
│       │   └── ColorPickerModalService.js # 颜色选择器模态框服务
│       ├── utils/               # 工具服务
│       │   ├── CanvasRenderService.js # Canvas底层渲染工具服务
│       │   ├── ViewportCalculatorService.js # 视口计算工具服务
│       │   ├── KeyboardService.js # 键盘快捷键管理服务
│       │   ├── FileSaveService.js # 文件保存服务
│       │   ├── PPIExtractorService.js # PPI信息提取服务
│       │   └── PreferenceService.js # 全局偏好持久化服务
│       └── system/              # 系统级服务
│           ├── ValidationService.js # 统一验证逻辑服务
│           ├── ErrorDisplayService.js # 统一错误显示服务
│           ├── StateWatcherService.js # 统一状态监听服务
│           ├── DialogService.js # 自定义对话框服务
│           ├── MessageService.js # 消息显示服务
│           ├── LoadingService.js # 加载提示服务
│           ├── TooltipService.js # 统一提示框管理服务
│           └── BusinessOrchestrationService.js # 业务流程协调服务
├── images/                      # 图片资源文件夹
└── template/                    # 测试模板和示例文件
```

## 📊 项目规模

### 文件统计

- **总文件数**：105 个
  - JavaScript 文件：93 个
  - HTML 文件：1 个
  - CSS 文件：1 个
  - JSON 配置文件：1 个
  - Markdown 文档：3 个（README、架构层次、设计标准）
  - Python 脚本：4 个（项目统计、动画统计、架构验证、配置清理）
  - 批处理脚本：1 个（start.bat）
  - LICENSE：1 个

### 代码规模

- **代码总行数**：27,586 行（不含空行、注释）
  - JavaScript：18,818 行（68.2%）
  - CSS：6,981 行（25.3%）
  - HTML：1,787 行（6.5%）

- **字符总数**：1,232,577 字符（不含注释）
  - JavaScript：933,241 字符（75.7%）
  - CSS：182,036 字符（14.8%）
  - HTML：117,300 字符（9.5%）

### JavaScript 代码结构

- **类（Classes）**：101 个
  - 服务类（Services）：43 个
  - UI 组件：21 个
  - 策略实现：15 个
  - 其他基础设施：22 个

- **方法/函数（Methods）**：1,072 个
  - 平均每个类约 11 个方法
  - 包含 async 异步方法、static 静态方法、getter/setter 访问器

- **变量（Variables）**：3,055 个
  - 包含 const/let 声明、类属性、静态属性

> 💡 **数据来源**：以上所有项目规模数据均基于 `count_project_files.py` 脚本自动统计生成

### 最棘手的部分

**多重坐标系统转换**

项目中最具技术挑战性的是处理 4 个核心坐标系统之间的精确转换：

1. **原图像素坐标**（`imageWidth`）
   - 用户上传的原始图片尺寸
   - 可能是超大图片（>100MP）

2. **视口相对坐标**（`viewportWidth`）
   - 浏览器窗口可见区域的相对坐标
   - 随窗口 resize 实时变化

3. **Canvas 缩放后坐标**（`mainImageWidth`）
   - 图片按比例缩放后的实际宽度
   - 用于滚动距离计算

4. **Canvas 物理坐标**（`canvas.width` / DPR）
   - 物理像素与CSS逻辑尺寸通过设备像素比（DPR）换算
   - `canvas.width = CSS宽度 × DPR`

**派生坐标系统**：编辑器Canvas坐标、放大镜坐标、预览缩放坐标等，均基于上述核心系统变换而来

**核心难点：**

- 多个坐标系统的双向转换（原图像素 ↔ 滚动距离 ↔ Canvas坐标）
- DPR 处理：物理像素与逻辑尺寸的精确反推，避免不一致
- 不同组件有独立的坐标系统管理（如 `CardBoundaryEditorService`）
- 窗口 resize 时的实时更新和坐标重新计算
- 超大图片的坐标精度保持
- **反向滚动的特殊处理**：正向滚动固定左边界（startPosition），反向滚动固定右边界（imageWidth），需要动态计算左边界和endPosition。全屏/非全屏切换时，反向滚动需要重新计算endPosition确保图片末尾始终可见，涉及多个组件（DisplayCoordinatorService、CardBoundaryEditorService、PositionSelectorService、PositionPreviewService）的协同处理

**涉及的核心文件：**
- `js/helpers/positionCalculators.js` - 原图像素与滚动距离转换
- `js/services/utils/ViewportCalculatorService.js` - 视口计算、坐标转换、DPR处理
- `js/services/utils/CanvasRenderService.js` - Canvas DPR坐标转换（CSS像素↔物理像素）
- `js/services/ui/CardBoundaryEditorService.js` - 独立坐标系统管理、放大镜坐标
- `js/services/ui/PositionPreviewService.js` - 预览缩放转换
- `js/services/business/EntryAnimationService.js` - 入场动画缩放
- `js/services/modal/PositionSelectorService.js` - 位置选择转换
- `js/services/ui/DisplayCoordinatorService.js` - 主显示区缩放
- `js/services/business/ScrollAnimationService.js` - 滚动动画缩放
- `js/helpers/imageDimensions.js` - 图片尺寸缩放计算
- `js/components/entry-animation/PreviewManager.js` - 预览区域坐标转换
- `js/services/system/BusinessOrchestrationService.js` - 默认结束位置计算

> 💡 坐标转换逻辑广泛分布在 12 个文件中，涉及多个组件的协同处理

### 开发耗时最久的部分

**各类动画系统的实现与打磨**

项目开发时间主要集中在三大动画系统及其用户体验优化：

1. **核心滚动动画**
   - 5 种滚动策略实现（线性、缓入、缓出、缓入缓出、弹性）
   - 高性能 Canvas 渲染优化
   - 循环播放逻辑和变长时长支持
   - 实时进度计算和显示

2. **卡片入场动画**
   - 15 种入场动画策略（淡入、滑入、缩放、旋转、翻转、弹跳、摇摆、故障、波浪、碎片重组）
   - 多卡片错峰入场的时间管理（staggerDelay 错峰延迟）
   - Canvas 可视化边界编辑器
     - 边界线拖拽和吸附
     - 实时放大镜系统（独立 Canvas、十字准星、RAF 渲染）
     - 键盘方向键微调（逐像素精确定位）
   - 实时预览和配置管理

3. **UI/UX 动画效果**（33 种 CSS @keyframes 关键帧动画 + 174 个 transition 过渡 + 116 个 :hover 交互 + 5 个 SVG 动画 + 2 个 Canvas 动画 + 1 个 JS 数值动画）
   
   **CSS @keyframes 关键帧动画**（33 种）：
   - **页面载入**：fadeInUp（欢迎界面淡入上移30px）、fadeInUpShort（入场动画字段淡入上移20px）、slideInUp（性能面板上滑入场）、fadeOutDown（配置字段退出）
   - **欢迎界面**：bounce（相机图标 📸 持续弹跳，2s 无限循环）
   - **加载状态**：spin（旋转圈，1s 无限循环）、pulseScale（拖拽提示图标缩放脉冲）、pulseShadow（卡片边界阴影脉冲）、gentlePulse（柔和脉冲）
   - **进度条装饰**：progressShimmer（微光从左向右扫过，2s 无限循环）
   - **赞助区域装饰**：shimmer（顶部微光闪烁，6s 无限循环）、flowingBorder（流动边框，8s 无限循环）
   - **警告提示**：pulse-warning（入场动画配置页面性能提示图标 ⚠️ 缩放脉冲，2s 无限循环）
   - **气泡菜单系统**：
     - bubbleFloat（气泡浮起动画，从底部50vh弹出，2s cubic-bezier缓动）
     - bubbleDrift（气泡漂移动画，左右轻微摇摆，3s 无限循环）
     - gravityDrop（配置页面退出重力下坠，0.5s 向下150vh + 旋转-12°）
   - **对话框**：dialogSlideIn/Out（滑入滑出）、simpleFadeIn/Out（简单淡入淡出）
   - **颜色选择器**：colorPickerFadeIn/Out（淡入淡出）、presetFadeInScale/OutScale（预设色缩放）
   - **卡片系统**：cardPositionItemSlideIn（卡片位置项交错入场）、cardItemFadeIn（卡片淡入）、sequenceItemEnter（序列项进入）
   - **空状态提示**：emptyStateFadeIn/Out（空状态淡入淡出）
   - **提示框**：25 种随机渐变背景（5个色系×5种配色）+ 6 种随机动画效果（scale-fade、slide-up、slide-down、bounce、rotate-fade、blur-fade）
   - **配置页面3D翻转动画**：
     - pageFlipOut/In（页面切换翻转，perspective 2000px，rotateY 90°）
     - 页面切换：config-page-wrapper 容器先翻出后翻入，顺序执行，单向0.5s，总耗时1.0s
     - 返回首页：feature-config-page 翻出 + app-container 翻入，顺序执行，单向0.5s，总耗时1.0s
   - **性能可视化过渡动画**：
     - maskFadeOut / maskFadeIn（网格遮罩转场：8x8纯色网格方块，0.8s ease-in-out，波浪渐变效果）
   
   **CSS transition 过渡**（174 个）：
   - **按钮/控件类**（61 个）：控制面板、折叠按钮、各类功能按钮、复制按钮、刷新按钮等，过渡效果包括 transform、opacity、box-shadow、border-color 等
   - **卡片/列表项类**（23 个）：信息卡片、二维码卡片、序列项、动画项、位置信息项、指标卡片等，效果包括 transform、opacity、box-shadow 等
   - **模态框/对话框类**（20 个）：位置选择、关于页面、图片信息、高级循环、颜色选择器等各类模态框，过渡效果为 opacity + visibility、transform 弹性缓动等
   - **输入控件类**（19 个）：滑块手柄、下拉菜单、复选框、输入框、触发器等，过渡效果包括 border-color、background、transform 等
   - **提示/工具类**（13 个）：拖拽提示、消息通知、工具提示、性能提示、帮助链接等，过渡效果包括 opacity、transform、color 等
   - **布局/面板类**（10 个）：
     - 侧边栏滑入滑出（transform 0.3s）
     - 配置页面圆形扩散转场（clip-path 0.7s cubic-bezier，从点击位置向外扩散）
     - 配置页面背景覆盖层（opacity 0.3s ease）
     - 图片滚动平滑移动（scrollCanvas transform linear）
     - 进度条、Canvas容器、页面切换等
   - **动画元素类**（4 个）：颜色预设框、气泡菜单、可视化视图等
   - **其他**（20 个）：图片预览、进度倒计时、隐藏文本、折叠内容、滚动条等
   
   **CSS :hover 交互动画**（116 个）：
   - **按钮类**（52 个）：各类按钮、关闭按钮、复制按钮等，效果包括颜色变化、阴影增强、缩放、位移（transform translateY）、3D立方体翻转（关于按钮：rotateX 180° + 立方体侧面 + 背景色切换）
   - **卡片类**（10 个）：
     - 信息卡片（上移 translateY(-5px) + 阴影增强 + 顶部渐变条显示 via ::before）
     - 二维码卡片（卡片上移 translateY(-4px) + 内部图片放大 scale 1.05）
     - 卡片编辑器、动画项、位置信息项等
   - **输入控件类**（14 个）：
     - 下拉菜单选项高亮（渐变背景 + 文字颜色变化）
     - 滑块拖动手柄、复选框、输入框边框
     - 颜色选择器预设色（transform scale 1.15 + 边框高亮 + 阴影增强）
   - **滚动条类**（12 个）：面板、对话框、下拉菜单、列表等滚动条悬停变色
   - **链接/导航类**（10 个）：帮助链接、导航项、气泡菜单项、视频教程链接（颜色变化 + 下划线展开动画）等
   - **面板/容器类**（9 个）：拖拽提示、配置区块、性能提示框、预览容器等
   - **图标/SVG/箭头类**（3 个）：折叠箭头旋转、帮助图标缩放等
   - **其他**（6 个）：隐藏文本、颜色预览、序列项、指标项、可折叠标题等
   
   **SVG/图标动画**（5 处）：
   - 下拉菜单箭头旋转（select-arrow，active 状态时旋转 180°）
   - 性能提示折叠箭头（performance-hint-toggle-arrow，展开时旋转 180°，hover 时缩放 1.2）
   - 刷新按钮表情符号旋转（🔄 Emoji，hover 时旋转 180°）
   - 配置页面导航项悬停左移效果（固定定位右侧，蓝紫色渐变激活态，transform translateX(-4px)）
   - 性能报告页面 SVG 边框跑马灯（通过 JS 动态创建 SVG `<animate>` 元素，实现 stroke-dashoffset 位移 + 6 色渐变循环，10s 无限循环）
   
   **Canvas 动画系统**（2 个）：
   - **气泡菜单装饰背景**：装饰气泡物理引擎（RAF 循环、deltaTime 物理计算、透明度淡入淡出、位置更新、漂移效果、气泡飘出屏幕外自动停止绘制）
   - **边界编辑器放大镜**：实时 Canvas 渲染、十字准星绘制、显示/隐藏动画、鼠标跟随、缩放预览
   
   **JavaScript 数值动画**（1 个）：
   - 卡片位置面板数字补间（requestAnimationFrame + easeOutCubic 缓动函数实现平滑数值过渡）

> 💡 **数据来源**：以上所有动画统计数据均基于 `count_all_animations.py` 脚本自动统计生成

**核心工作量：**
- requestAnimationFrame 的精确时间控制
- 各种缓动函数的数学实现
- Canvas 渲染性能优化（减少重绘）
- 动画流畅性调试（60fps 目标）
- 边缘情况处理（窗口 resize、快速切换、中断恢复）

## 🛠️ 技术栈

- **应用架构**：纯前端单页面应用(SPA)
- **前端框架**：HTML5 + CSS3 + 原生JavaScript ES6+

### 为什么不用现代前端框架和工具链？

- **打开即用，无需安装任何环境**  
  不使用React/Vue/Angular等前端框架，不使用TypeScript/Sass/Less等编译工具，不使用Webpack/Vite等构建工具，无需安装Node.js和npm，下载后直接用浏览器打开就能用。

- **更快的响应速度**  
  没有框架的额外加载和运行开销，所有性能优化都专门针对"图片滚动"这一场景定制。

- **完全的数据隐私**  
  代码简单透明，你可以直接查看源代码，确认没有任何数据上传到服务器的行为。

- **永久可用**  
  不依赖npm包管理，仅通过CDN引入少量外部库（Prism.js用于代码高亮、ECharts用于性能数据可视化，均为非核心功能），不会因为npm生态问题影响主要功能的稳定性。

- **代码可读性高**  
  使用原生JavaScript编写，无框架抽象层，方便阅读和理解代码逻辑，也便于学习Web开发技术。

### 为什么本站是静态网站而非动态网站？

- **完全免费，无服务器费用**  
  可以部署到GitHub Pages等免费平台，或直接在本地使用，不产生任何服务器费用。

- **你的图片永远不会离开你的电脑**  
  所有图片处理、视频录制都在你的浏览器本地完成，不会上传到任何服务器，100%保护隐私。

- **下载后可离线使用**  
  将项目文件夹下载到本地后，即使断开网络也能正常使用（需要Python环境启动本地服务）。

- **打开即用，无需注册登录**  
  不需要创建账号、记住密码、验证邮箱，打开网页就能直接使用。

- **更快的启动和运行速度**  
  没有服务器通信延迟，所有操作都是本地计算，修改参数后立即看到效果。

- **架构模式**：
  - **事件总线（Event Bus）** - 基于发布-订阅模式的解耦组件通信
  - **模块化状态管理器（State Manager）** - 支持动态模块注册，响应式状态更新，批量更新优化
  - **依赖注入（DI Container）** - 统一依赖管理，所有服务采用依赖注入模式，提高可测试性
  - **策略模式（Strategy Pattern）** - 按职责分离的入场动画策略（15种）、滚动算法策略和文件处理策略，通过统一接口实现可扩展的算法族
  - **状态机模式（State Machine Pattern）** - PlaybackCoordinatorService 使用轻量级状态机管理播放阶段（entry/interval-before-scroll/scroll/loop-interval），通过状态枚举和 switch 语句实现基于状态的行为分派，确保播放流程的清晰和可控
  - **工厂模式（Factory Pattern）** - 多实例组件通过工厂管理依赖注入，统一创建流程
  - **路由模式（Router Pattern）** - 气泡菜单根据itemId路由到对应配置页面，实现页面切换和内容管理
  - **注册表模式（Registry Pattern）** - 气泡菜单采用注册表模式管理配置页面，支持动态扩展新功能
  - **单例模式（Singleton Pattern）** - 所有服务通过DI容器注册为单例，确保全局唯一一实例
  - **代理模式（Proxy Pattern）** - StateManager使用JavaScript Proxy API实现响应式状态全程监听和自动通知
  - **观察者模式（Observer Pattern）** - StateWatcherService监听StateManager状态变化，实现自动UI更新
  - **备忘录模式（Memento Pattern）** - StateManager保存初始状态快照，支持配置重置和状态恢复
  - **服务化架构（Service-Oriented Architecture）** - 业务逻辑模块化，单例服务 + 多实例组件分层设计
  - **模板方法模式（Template Method）** - 基础服务类提供扩展钩子
  - **协调者模式（Coordinator Pattern）** - 跨服务业务流程编排
  - **对象池模式（Object Pool Pattern）** - TransitionFragmentPool管理过渡动画DOM元素复用，避免频繁创建/销毁，支持网格遮罩转场（64个方块，8x8网格）
  - **配置外部化（Configuration Externalization）** - 状态配置与代码分离
- **核心技术（完整浏览器原生API列表请参考 [ARCHITECTURE_LAYERS.md](ARCHITECTURE_LAYERS.md) 第0层(ARCHITECTURE_LAYERS.md#- 第0层浏览器原生api层最底层非项目代码))）**：
  - **ES6 Modules** - 模块化架构基础和依赖管理，动态import()实现按需加载
  - **异步编程模式** - async/await和Promise处理异步任务
  - **高性能数据结构** - WeakMap、Map、Set优化缓存和事件管理
  - **JavaScript Proxy API** - 实现响应式状态管理和自动数据绑定
  - **纯函数工具库** - 防抖（debounce）等无副作用的函数式工具
  - **HTML Template** - DOM模板复用提升性能
  - **现代CSS技术** - Transform、Animation、Flexbox/Grid、CSS Variables等
  - **Canvas 2D高级应用** - 入场动画渲染、交互式可视化编辑器（卡片边界标记、放大镜）、颜色选择器（HSV色彩空间）、高DPI适配、离屏Canvas优化
  - **SVG + SMIL动画** - 性能监控页面的动态边框跑马灯效果，使用SVG Path、stroke-dasharray/dashoffset、SMIL `<animate>`元素和SVG滤镜实现霓虹发光
  - **图片元数据提取** - PPI信息提取（JPEG/PNG格式）、二进制数据解析（ArrayBuffer、DataView）
  - **颜色处理技术** - HSV色彩空间、RGB/Hex颜色转换、Canvas渲染色彩选择器、EyeDropper API吸取页面颜色
  - **文件保存技术** - File System Access API支持选择保存位置（现代浏览器），传统下载方式优雅降级
  - **自定义Tooltip系统** - 事件委托、智能4方向定位算法、25种随机渐变背景、6种随机CSS动画效果、单例模式
  - **RequestAnimationFrame优化** - 与浏览器刷新率同步的动画引擎，deltaTime物理计算、性能监控
  - **外部库集成** - 通过CDN引入
    - Prism.js：代码高亮库，用于性能监控页面的技术说明区域
    - ECharts：数据可视化库，用于性能报告的图表渲染（帧率分布、帧时间趋势、稳定性雷达、帧掉落分析）
  - **Fail Fast机制** - 依赖注入失败立即报错，确保架构问题早期发现
  - **多层性能优化** - DOM缓存、Proxy缓存、路径解析缓存、批量状态更新（batch）、离屏Canvas优化、RAF节流渲染、对象池复用
- **开发者自评**：从该项目的规模和用途来看，确实是过度设计的

## 🎯 十二大统一服务架构

本项目采用**十二大统一服务**确保代码一致性和架构规范，每个统一服务从不同维度解决架构一致性问题：

### 1. DIContainer - 统一依赖注入容器
- **位置**：`js/core/DIContainer.js`
- **作用**：统一管理所有服务的依赖关系和实例创建，确保依赖注入的一致性，支持单例模式和循环依赖检测

### 2. EventBus - 统一事件通信
- **位置**：`js/core/EventBus.js`
- **作用**：集中管理所有服务间的事件通信，实现发布-订阅模式，确保松耦合的架构设计

### 3. StateManager - 统一状态存储
- **位置**：`js/core/StateManager.js`
- **作用**：集中存储所有应用状态，提供模块化响应式状态管理、状态变化通知和默认值获取，是整个架构的状态存储基础设施

### 4. PreferenceService - 统一全局偏好持久化
- **位置**：`js/services/utils/PreferenceService.js`
- **作用**：统一管理所有 LocalStorage 操作，提供一致的数据序列化、异常处理和可用性检测，确保用户偏好持久化的安全性和可靠性

### 5. BaseUIService - 统一DOM元素缓存
- **位置**：`js/services/base/BaseUIService.js`
- **作用**：为需要频繁访问相同DOM元素的服务提供DOM缓存机制，避免重复的getElementById/querySelector查询，提升性能。继承此类的服务使用原生DOM API进行元素操作和事件监听。10个服务继承此基类（5个服务直接继承、5个Modal服务通过BaseModalService间接继承）

### 6. BaseModalService - 统一模态框管理
- **位置**：`js/services/base/BaseModalService.js`
- **作用**：提供统一的模态框管理功能，采用模板方法模式，统一管理模态框的打开/关闭流程、DOM引用、事件监听、快捷键注册和钩子扩展点，5个模态框服务继承此基类

### 7. ValidationService - 统一验证逻辑
- **位置**：`js/services/system/ValidationService.js`
- **作用**：集中管理所有验证规则，确保验证逻辑的一致性和复用性

### 8. KeyboardService - 统一快捷键管理
- **位置**：`js/services/utils/KeyboardService.js`
- **作用**：集中管理所有键盘快捷键，避免快捷键冲突和分散定义

### 9. ErrorDisplayService - 统一错误显示
- **位置**：`js/services/system/ErrorDisplayService.js`
- **作用**：管理三种错误反馈策略（单对话框、双重反馈、轻量消息），确保错误提示的一致性

### 10. TooltipService - 统一提示框管理
- **位置**：`js/services/system/TooltipService.js`
- **作用**：统一管理所有提示框的显示、隐藏、定位和样式，支持hover触发（data-tooltip属性），提供智能定位算法（4方向自适应）、随机渐变背景（25种预设）和动画效果（6种随机效果），支持嵌套Tooltip（内层自动叠加显示在外层之上，z-index递增，延迟隐藏机制确保鼠标移动流畅），确保同时只显示一个提示框（单例模式），通过事件委托实现高性能

### 11. StateWatcherService - 统一状态监听
- **位置**：`js/services/system/StateWatcherService.js`
- **作用**：集中管理所有状态变化的UI响应逻辑，避免状态监听分散在各个服务中

### 12. BusinessOrchestrationService - 统一业务流程协调
- **位置**：`js/services/system/BusinessOrchestrationService.js`
- **作用**：专注于跨服务业务编排、复杂业务流程协调、数据流转和错误处理，统一管理服务间的事件监听和协调

这十二大统一服务共同构成了项目的**一致性保障体系**，确保从底层架构到用户交互的全方位统一。

## 🏗️ 设计原则遵循

本项目已尽力遵循以下设计原则，在原则间存在冲突时会根据实际情况权衡取舍：

### 通用软件工程原则

这些是业界公认的软件开发最佳实践：

#### SOLID原则
- **单一职责原则(SRP)**：每个服务类只负责一个明确的功能职责
- **开闭原则(OCP)**：通过策略模式和依赖注入支持扩展
- **里氏替换原则(LSP)**：确保子类可以替换父类而不破坏程序功能
- **接口隔离原则(ISP)**：避免臃肿接口，按需依赖
- **依赖倒置原则(DIP)**：高层模块不依赖低层模块，都依赖抽象

#### 其他经典原则
- **YAGNI（You Aren't Gonna Need It）**：不实现当前不需要的功能，专注核心需求，避免过度设计
- **KISS（Keep It Simple, Stupid）**：保持代码简单易懂，优先选择最简单的解决方案
- **DRY（Don't Repeat Yourself）**：避免重复代码，通过抽象和复用减少维护成本
- **LoD 迪米特法则（Law of Demeter）**：一个对象应该对其他对象保持最少的了解，只与直接朋友通信，通过事件总线和接口隔离实现松耦合
- **CRP 合成复用原则（Composition over Inheritance）**：优先使用组合而非继承实现代码复用，通过依赖注入和策略模式组合不同功能组件
- **高内聚低耦合**：服务间通过事件总线和依赖注入通信，减少直接依赖

---

### 本项目架构原则

这些是 CardScroller 项目特定的架构规范：

- **架构分层原则（Architecture Layers Principle）**：项目采用13层架构设计（第1-13层），每层有明确的职责边界和依赖方向，高层模块只能调用同层或低层模块（向下调用），禁止跨层调用或向上调用，确保架构清晰可维护。详细分层规范请参考 [ARCHITECTURE_LAYERS.md](ARCHITECTURE_LAYERS.md)，跨层调用判断标准请参考 [DESIGN_STANDARDS.md - 三.1](DESIGN_STANDARDS.md#1-直接调用-vs-eventbus)

- **十二大统一服务原则（Twelve Unified Services Principle）**：严格遵循项目定义的十二大统一服务架构，任何功能都必须通过对应的统一服务实现，绝不允许绕过或重复实现统一服务的职责，确保整个系统的一致性和可维护性。统一服务的判断标准：
  - **架构基础设施**：整个应用架构的基石（如DIContainer、EventBus、StateManager、BaseUIService、BaseModalService）
  - **全局协调者**：跨越多个业务领域协调多个服务（如BusinessOrchestrationService、StateWatcherService）
  - **强制性横切关注点**：被多个不同领域服务使用，项目强制要求所有相关功能都必须通过它（如ErrorDisplayService、ValidationService、KeyboardService、TooltipService、PreferenceService）

- **组件架构原则（Component Architecture Principle）**：项目中UI组件采用统一的架构模式，确保组件间低耦合和高内聚
  - **统一初始化接口**：所有UI组件（子组件/辅助类）必须提供统一的 `init(container)` 方法，接收父组件传递的容器元素
  - **父传容器，子自查找**：父组件只传递整个页面容器，子组件自己在容器内查找所需的DOM元素，父组件不需要知道子组件内部使用什么元素
  - **事件冒泡通信**：子组件通过冒泡的 CustomEvent（`bubbles: true`）向父组件传递事件，父组件在容器上监听这些事件，避免直接操作子组件内部元素
  - **依赖注入边界**：子组件不在 DI 容器中注册，由父组件直接 `import` 和实例化，只有顶层服务（如 Page、Service）才通过 DI 管理
  - **低耦合封装**：子组件完全控制自己的DOM结构和内部逻辑，父组件只负责传递容器和监听事件，实现松耦合

- **Fail Fast原则（Fail Fast Principle）**：关键条件不满足时立即抛出明确错误，禁止使用降级处理、容错逻辑、包裹在if语句块内、逻辑或运算符、三元运算符、可选链或空值合并运算符隐藏架构问题，让依赖缺失、DOM结构错误、参数无效、配置错误等问题在开发阶段早期暴露，避免在生产环境中出现不可预测的行为

- **单一数据源原则（Single Source of Truth）**：应用配置和默认值统一存储在 `defaultState.json` 中，避免硬编码配置分散在各个服务中，确保数据一致性和可维护性。配置放JSON还是硬编码的判断标准请参考 [DESIGN_STANDARDS.md](DESIGN_STANDARDS.md)。如JS和CSS需要保持一致的动画时长等数值，则应该定义在`:root`中作为CSS变量，JS通过`getComputedStyle`读取

- **CSS类管理原则**：JavaScript只负责添加/移除CSS类名和设置CSS自定义属性，避免直接修改内联样式
  - **例外情况**：以下场景允许使用内联样式（`element.style.xxx`）
    - **Canvas绘制**：Canvas API 必须使用程序化绘制，无法通过CSS类控制
    - **动态颜色**：用户选择的颜色（如背景色预览、颜色选择器的色块）需要动态设置 `backgroundColor`
    - **动态定位**：需要根据运行时计算的像素值动态设置位置（如拖拽、动画）
    - **动态生成的对话框内容**：通过 `eventBus.emit('ui:show-info-dialog')` 等方式动态生成的HTML字符串内容，允许使用内联样式进行布局和装饰
  - **避免使用 `!important`**：优先通过提高CSS选择器优先级来覆盖样式，而非使用 `!important`。`!important` 会增加样式调试的复杂度

- **性能最优化**：减少不必要的DOM操作和事件监听，支持大型图片处理，使用HTML Template + Clone替代document.createElement()，DOM元素复用避免频繁创建销毁

- **可维护性高**：模块化架构，易于测试和扩展

- **可扩展性强**：通过策略模式、依赖注入和事件总线支持功能扩展

- **可复用性强**：服务组件设计独立，可在其他项目中复用

---

### 本项目代码规范

这些是 CardScroller 项目的代码风格约定：

- **文件命名规范（File Naming Convention）**：统一的文件命名风格，确保代码库的一致性和可读性
  - **JS类文件（PascalCase）**：所有类定义使用大驼峰命名，根据职责使用不同后缀（`Service`、`Factory`、`Page`、`Manager`、`Panel`、`Renderer`、`Monitor`、`Coordinator`等）
  - **JS工具函数（camelCase）**：纯函数工具使用小驼峰命名（如 `debounce.js`、`fileUtils.js`）
  - **文档文件（UPPER_SNAKE_CASE）**：项目文档使用全大写+下划线（如 `README.md`）
  - **配置文件（camelCase）**：配置文件使用小驼峰命名（如 `defaultState.json`）
  - **Python脚本（snake_case）**：Python文件使用小写+下划线（如 `check_layer_violations.py`）
  - **其他资源文件（kebab-case）**：HTML、CSS、图片等使用小写+连字符（如 `index.html`、`style.css`）
  - **文件夹（kebab-case）**：所有目录使用小写+连字符（如 `entry-animation/`）
  - **详细后缀选择判断标准请参考** [DESIGN_STANDARDS.md - 二.3](DESIGN_STANDARDS.md#3-文件命名规范判断标准)

- **JSDoc文档标准化（JSDoc Documentation Standards）**：统一的代码文档规范，确保代码可读性和可维护性
  - **文件头部注释**：每个类文件必须包含头部注释，说明类名、职责、依赖关系（可选：职责说明、架构说明）
  - **方法注释规范**：每个方法必须包含JSDoc，注明参数类型、返回值、可能抛出的错误
  - **命名一致性原则**：注释应反映代码中实际使用的名称（DI注入用camelCase，类名用PascalCase）
  - **必需的JSDoc标签**：`@param`（所有参数）、`@returns`（所有方法）、`@throws`（Fail Fast场景）、`@private`（私有方法）
  - **详细规范请参考** [DESIGN_STANDARDS.md - 四.1 文件头部注释标准格式](DESIGN_STANDARDS.md#1-jsdoc文件头部注释标准格式)

- **统一具名导出（Named Exports Principle）**：整个项目统一使用ES6具名导出（Named Exports），遵循以下规则：
  - 导出类定义使用内联导出：`export class ServiceName { }`
  - 导出实例/常量使用末尾导出：`export { instance }`
  - 批量导出使用末尾导出：`export { A, B, C }`
  - 禁止使用默认导出（Default Export），确保代码风格一致性、更好的IDE支持、更有效的Tree-shaking优化和更清晰的导入语义

---

**CardScroller** - 让滚动视频制作变得简单！让开发者头发掉得更快！

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
项目文件统计脚本
自动统计DI组件数量、文件数量、代码行数，确保文档中的数字准确无误

说明：
- DI组件包括：策略管理器、对象池、工厂、页面、服务（不全是Service类）
- 服务分类包括：核心服务（策略管理器+对象池+工厂）、业务服务、工具服务、系统服务、UI服务、模态框服务

"""

import os
import re
from pathlib import Path
from collections import defaultdict

# ============================================================================
# 配置常量区域（Single Source of Truth）
# ============================================================================

# 项目根目录
PROJECT_ROOT = Path(__file__).parent

# 核心文件白名单（所有需要统计的核心文件）
# 注意：修改核心文件列表时，只需在此处修改一次即可
CORE_FILES = {
    'json': {'config/defaultState.json'},
    'html': {'index.html'},
    'css': {'css/style.css'},
    'md': {'README.md', 'ARCHITECTURE_LAYERS.md', 'DESIGN_STANDARDS.md'},
    'py': {'check_layer_violations.py', 'count_project_files.py', 'remove_dataurl.py', 'count_all_animations.py'},
    'bat': {'start.bat'},
}

# 排除目录（不参与统计的目录）
EXCLUDE_DIRS = {'template'}

# 服务统计配置
# 警告：这些数字需要与 ServiceRegistry.js 中的实际注册保持同步！
SERVICE_CONFIG = {
    # 核心服务配置（与 ServiceRegistry._registerCoreServices() 同步）
    'core_factories': 1,  # CustomSelectFactory（其他工厂在UI服务中注册）
    
    # 工具服务配置（与 ServiceRegistry._registerUtilServices() 同步）
    'utils_unregistered_files': 1,  # PreferenceService.js（统一服务，但不在DI容器中注册，由ApplicationBootstrap直接使用）
    
    # UI服务配置（与 ServiceRegistry._registerUIServices() 同步）
    'ui_factories_in_components': 4,  # ColorPickerFactory, PreviewManagerFactory, BoundaryEditorManagerFactory, EntryAnimationHelpDialogsFactory（在components/目录）
    'ui_unregistered_files': 1,  # CardBoundaryEditorService.js（辅助类，未注册为服务。注：CardBoundaryEditorFactory在ui/目录，已被service_counts['ui']统计）
}

# 服务目录映射
SERVICE_DIRS = {
    'business': 'js/services/business',
    'utils': 'js/services/utils',
    'system': 'js/services/system',
    'ui': 'js/services/ui',
    'modal': 'js/services/modal',
}

# 代码文件扩展名
CODE_EXTENSIONS = {'.js', '.html', '.css'}

# ============================================================================
# 工具函数
# ============================================================================

def count_files_in_dir(dir_path, extension='.js', exclude_dirs=None):
    """
    统计目录中的文件数量
    
    @param dir_path: 目录路径（相对于PROJECT_ROOT）
    @param extension: 文件扩展名（默认.js）
    @param exclude_dirs: 要排除的目录集合
    @returns: 文件数量
    @throws ValueError: 如果参数无效
    """
    # Fail Fast: 参数验证
    if not dir_path:
        raise ValueError("count_files_in_dir: dir_path cannot be empty")
    if not extension.startswith('.'):
        raise ValueError(f"count_files_in_dir: extension must start with '.', got: {extension}")
    
    if exclude_dirs is None:
        exclude_dirs = set()
    
    full_path = PROJECT_ROOT / dir_path
    if not full_path.exists():
        return 0
    
    if full_path.is_file():
        return 1 if full_path.suffix == extension else 0
    
    count = 0
    for file in full_path.rglob(f'*{extension}'):
        # 检查是否在排除目录中
        if any(excluded in file.parts for excluded in exclude_dirs):
            continue
        count += 1
    
    return count

def count_services_by_category():
    """
    统计各分类的服务数量
    
    @returns: 字典，键为分类名，值为服务数量
    """
    counts = {}
    
    for category, dir_path in SERVICE_DIRS.items():
        count = count_files_in_dir(dir_path, '.js')
        counts[category] = count
    
    return counts

def count_core_files():
    """
    统计核心DI组件（需要与 ServiceRegistry.js 的 _registerCoreServices() 保持一致）
    
    警告：此函数的返回值必须与 ServiceRegistry.js 中 _registerCoreServices() 实际注册的DI组件数量一致！
    如果修改了核心DI组件的注册，必须同步更新 SERVICE_CONFIG['core_factories'] 的值。
    
    当前核心DI组件（5个）：
    - 3个策略管理器（scrollStrategyManager, fileProcessStrategyManager, entryAnimationStrategyManager）
    - 1个对象池（transitionFragmentPool）
    - 1个组件工厂（customSelectFactory）
    
    注意：其他工厂（如 ColorPickerFactory、CardBoundaryEditorFactory 等）虽然也是工厂类，
    但它们在 _registerUIServices() 中注册，属于UI组件，不计入核心组件。
    
    @returns: 字典，包含 strategy_managers, object_pools, component_factories, core_total
    """
    # 策略管理器 (3个) - 自动统计
    strategy_managers = count_files_in_dir('js/patterns/scroll', '.js') + \
                       count_files_in_dir('js/patterns/file', '.js') + \
                       count_files_in_dir('js/patterns/entry', '.js')
    strategy_managers = strategy_managers // 2  # 每个目录有2个文件，只取Manager
    
    # 对象池 (1个) - 自动统计
    object_pools = count_files_in_dir('js/patterns/transition', '.js')
    
    # 核心组件工厂 - 从配置常量读取
    core_factories = SERVICE_CONFIG['core_factories']
    
    return {
        'strategy_managers': strategy_managers,
        'object_pools': object_pools,
        'component_factories': core_factories,
        'core_total': strategy_managers + object_pools + core_factories
    }

def count_all_js_files():
    """
    统计所有JS文件
    
    @returns: JS文件总数
    """
    total = 0
    
    # 核心
    total += count_files_in_dir('js/core', '.js')
    
    # 策略
    total += count_files_in_dir('js/patterns', '.js')
    
    # 工具
    total += count_files_in_dir('js/helpers', '.js')
    
    # 组件
    total += count_files_in_dir('js/components', '.js')
    
    # 服务
    total += count_files_in_dir('js/services', '.js')
    
    # 启动
    total += count_files_in_dir('js/bootstrap', '.js')
    
    # 入口文件（js/ 根目录）
    js_root_files = [f for f in (PROJECT_ROOT / 'js').glob('*.js')]
    total += len(js_root_files)
    
    return total

def is_core_file(file_path, file_type):
    """
    判断文件是否为核心文件
    
    @param file_path: 文件路径（Path对象）
    @param file_type: 文件类型（'json', 'html', 'css', 'md', 'py', 'bat'）
    @returns: 是否为核心文件
    @throws ValueError: 如果file_type不在CORE_FILES中
    """
    # Fail Fast: 参数验证
    if file_type not in CORE_FILES:
        raise ValueError(f"is_core_file: Unknown file_type: {file_type}")
    
    core_set = CORE_FILES[file_type]
    
    # 对于json和css，需要检查完整路径
    if file_type in ['json', 'css']:
        relative_path = str(file_path.relative_to(PROJECT_ROOT)).replace('\\', '/')
        return relative_path in core_set
    
    # 对于html、md、py、bat，只检查文件名
    return file_path.name in core_set

def count_project_files():
    """
    统计项目所有文件类型（排除模板目录）
    
    @returns: 字典，包含各类文件数量和总数
    """
    js_files = count_all_js_files()
    
    # 统计各类核心文件
    json_files = len([f for f in PROJECT_ROOT.rglob('*.json') 
                      if is_core_file(f, 'json')])
    
    html_files = len([f for f in PROJECT_ROOT.glob('*.html') 
                      if is_core_file(f, 'html')])
    
    css_files = len([f for f in PROJECT_ROOT.rglob('*.css') 
                     if not any(excluded in f.parts for excluded in EXCLUDE_DIRS)
                     and is_core_file(f, 'css')])
    
    md_files = len([f for f in PROJECT_ROOT.glob('*.md') 
                    if is_core_file(f, 'md')])
    
    py_files = len([f for f in PROJECT_ROOT.glob('*.py') 
                    if is_core_file(f, 'py')])
    
    bat_files = len([f for f in PROJECT_ROOT.glob('*.bat') 
                     if is_core_file(f, 'bat')])
    
    license_files = len(list(PROJECT_ROOT.glob('LICENSE*')))
    
    counts = {
        'js': js_files,
        'json': json_files,
        'html': html_files,
        'css': css_files,
        'md': md_files,
        'py': py_files,
        'bat': bat_files,
        'license': license_files,
    }
    
    counts['total'] = sum(counts.values())
    
    return counts

def print_service_statistics():
    """
    打印DI组件统计信息
    
    说明：DI组件包括策略管理器、对象池、工厂、页面、服务等所有通过DI容器管理的类
    
    @returns: 字典，包含各类统计数据，供验证使用
    """
    print("=" * 80)
    print("📊 CardScroller 项目文件统计")
    print("=" * 80)
    print()
    
    # 1. DI组件分类统计
    print("1️⃣  DI组件分类统计：")
    print("-" * 80)
    
    service_counts = count_services_by_category()
    core_counts = count_core_files()
    
    print(f"   核心DI组件 (Core):")
    print(f"      - 策略管理器 (Strategy Managers): {core_counts['strategy_managers']}")
    print(f"      - 对象池 (Object Pools): {core_counts['object_pools']}")
    print(f"      - 组件工厂 (Component Factories): {core_counts['component_factories']}")
    print(f"      小计: {core_counts['core_total']}")
    print()
    
    for category in ['utils', 'business', 'system', 'ui', 'modal']:
        display_name = {
            'utils': '工具服务 (Utils)',
            'business': '业务服务 (Business)',
            'system': '系统服务 (System)',
            'ui': 'UI服务 (UI)',
            'modal': '模态框服务 (Modal)'
        }[category]
        
        print(f"   {display_name}: {service_counts[category]}")
    
    # UI服务总数计算（包括工厂和页面）
    ui_factories = SERVICE_CONFIG['ui_factories_in_components']
    ui_unregistered = SERVICE_CONFIG['ui_unregistered_files']
    ui_total = service_counts['ui'] + service_counts['modal'] + ui_factories - ui_unregistered
    print(f"   UI组件总计 (UI + Modal + Components工厂): {ui_total}")
    print()
    
    # DI组件总数（扣除未注册的服务）
    utils_unregistered = SERVICE_CONFIG['utils_unregistered_files']
    utils_registered = service_counts['utils'] - utils_unregistered
    total_services = core_counts['core_total'] + sum(service_counts.values()) + ui_factories - ui_unregistered - utils_unregistered
    print(f"   ✅ DI组件总数: {total_services} = {core_counts['core_total']} + {utils_registered} + {service_counts['business']} + {service_counts['system']} + {ui_total}")
    print(f"   （注：utils/目录有{service_counts['utils']}个文件，其中{utils_unregistered}个未在DI中注册：PreferenceService）")
    print()
    
    # 2. 文件类型统计
    print("2️⃣  文件类型统计：")
    print("-" * 80)
    
    file_counts = count_project_files()
    
    print(f"   JavaScript文件: {file_counts['js']}")
    print(f"   JSON文件: {file_counts['json']}")
    print(f"   HTML文件: {file_counts['html']}")
    print(f"   CSS文件: {file_counts['css']}")
    print(f"   Markdown文档: {file_counts['md']}")
    print(f"   Python脚本: {file_counts['py']}")
    print(f"   批处理脚本: {file_counts['bat']}")
    print(f"   License文件: {file_counts['license']}")
    print()
    print(f"   ✅ 文件总数: {file_counts['total']}")
    print()
    
    # 3. 详细服务列表
    print("3️⃣  详细服务列表：")
    print("-" * 80)
    
    for category, dir_path in SERVICE_DIRS.items():
        full_path = PROJECT_ROOT / dir_path
        if full_path.exists():
            files = sorted([f.name for f in full_path.glob('*.js')])
            if files:
                display_name = {
                    'utils': '工具服务 (Utils)',
                    'business': '业务服务 (Business)',
                    'system': '系统服务 (System)',
                    'ui': 'UI服务 (UI)',
                    'modal': '模态框服务 (Modal)'
                }[category]
                
                print(f"\n   {display_name} ({len(files)}个):")
                for i, file in enumerate(files, 1):
                    print(f"      {i:2d}. {file}")
    
    # 4. 其他项目文件
    print()
    print("4️⃣  其他项目文件：")
    print("-" * 80)
    
    # JSON 配置文件
    json_files = sorted([f for f in PROJECT_ROOT.rglob('*.json') 
                         if is_core_file(f, 'json')],
                        key=lambda f: f.relative_to(PROJECT_ROOT))
    if json_files:
        print(f"\n   JSON 核心配置文件 ({len(json_files)}个):")
        for i, file in enumerate(json_files, 1):
            rel_path = file.relative_to(PROJECT_ROOT)
            print(f"      {i:2d}. {rel_path}")
    
    # HTML 文件
    html_files = sorted([f.name for f in PROJECT_ROOT.glob('*.html') 
                         if is_core_file(f, 'html')])
    if html_files:
        print(f"\n   HTML 文件 ({len(html_files)}个):")
        for i, file in enumerate(html_files, 1):
            print(f"      {i:2d}. {file}")
    
    # CSS 文件
    css_files = sorted([f for f in PROJECT_ROOT.rglob('*.css') 
                        if not any(excluded in f.parts for excluded in EXCLUDE_DIRS)
                        and is_core_file(f, 'css')])
    if css_files:
        print(f"\n   CSS 样式文件 ({len(css_files)}个):")
        for i, file in enumerate(css_files, 1):
            rel_path = file.relative_to(PROJECT_ROOT)
            print(f"      {i:2d}. {rel_path}")
    
    # Markdown 文档
    md_files = sorted([f.name for f in PROJECT_ROOT.glob('*.md') 
                       if is_core_file(f, 'md')])
    if md_files:
        print(f"\n   Markdown 核心文档 ({len(md_files)}个):")
        for i, file in enumerate(md_files, 1):
            print(f"      {i:2d}. {file}")
    
    # Python 脚本
    py_files = sorted([f.name for f in PROJECT_ROOT.glob('*.py') 
                       if is_core_file(f, 'py')])
    if py_files:
        print(f"\n   Python 项目脚本 ({len(py_files)}个):")
        for i, file in enumerate(py_files, 1):
            print(f"      {i:2d}. {file}")
    
    # 批处理脚本
    bat_files = sorted([f.name for f in PROJECT_ROOT.glob('*.bat') 
                        if is_core_file(f, 'bat')])
    if bat_files:
        print(f"\n   批处理脚本 ({len(bat_files)}个):")
        for i, file in enumerate(bat_files, 1):
            print(f"      {i:2d}. {file}")
    
    # LICENSE 文件
    license_files = sorted([f.name for f in PROJECT_ROOT.glob('LICENSE*')])
    if license_files:
        print(f"\n   许可证文件 ({len(license_files)}个):")
        for i, file in enumerate(license_files, 1):
            print(f"      {i:2d}. {file}")
    
    # 5. 不参与统计的文件
    print()
    print("5️⃣  不参与统计的文件：")
    print("-" * 80)
    
    # 模板目录文件
    template_files = sorted([f for f in PROJECT_ROOT.rglob('template/**/*') if f.is_file()])
    if template_files:
        print(f"\n   模板文件 (template/ 目录，{len(template_files)}个):")
        for i, file in enumerate(template_files[:10], 1):  # 最多显示10个
            rel_path = file.relative_to(PROJECT_ROOT)
            print(f"      {i:2d}. {rel_path}")
        if len(template_files) > 10:
            print(f"      ... 还有 {len(template_files) - 10} 个文件")
    
    # 非核心 Markdown 文档
    all_md_files = set([f.name for f in PROJECT_ROOT.glob('*.md')])
    non_core_md = sorted(all_md_files - CORE_FILES['md'])
    if non_core_md:
        print(f"\n   设计文档 (非核心文档，{len(non_core_md)}个):")
        for i, file in enumerate(non_core_md, 1):
            print(f"      {i:2d}. {file}")
    
    # 非核心 Python 脚本
    all_py_files = set([f.name for f in PROJECT_ROOT.glob('*.py')])
    non_core_py = sorted(all_py_files - CORE_FILES['py'])
    if non_core_py:
        print(f"\n   临时脚本 (非项目脚本，{len(non_core_py)}个):")
        for i, file in enumerate(non_core_py, 1):
            print(f"      {i:2d}. {file}")
    
    # 非核心 HTML 文件
    all_html_files = set([f.name for f in PROJECT_ROOT.glob('*.html')])
    non_core_html = sorted(all_html_files - CORE_FILES['html'])
    if non_core_html:
        print(f"\n   测试文件 (非核心HTML，{len(non_core_html)}个):")
        for i, file in enumerate(non_core_html, 1):
            print(f"      {i:2d}. {file}")
    
    if not template_files and not non_core_md and not non_core_py and not non_core_html:
        print("\n   ✅ 无排除文件")
    
    print()
    print("=" * 80)
    print("✅ 统计完成！")
    print("=" * 80)
    
    # 返回结果供验证使用
    return {
        'total_services': total_services,
        'core': core_counts['core_total'],
        'utils': service_counts['utils'],
        'business': service_counts['business'],
        'system': service_counts['system'],
        'ui': ui_total,
        'total_js': file_counts['js'],
        'total_files': file_counts['total']
    }

def count_code_lines(file_path):
    """
    统计代码文件的有效行数（排除空行和注释）
    
    @param file_path: 文件路径（Path对象）
    @returns: 有效代码行数
    @throws FileNotFoundError: 如果文件不存在
    @throws IOError: 如果文件无法读取
    """
    # Fail Fast: 文件验证
    if not file_path.exists():
        raise FileNotFoundError(f"count_code_lines: File not found: {file_path}")
    
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        raise IOError(f"count_code_lines: Failed to read file {file_path}: {e}")
    
    # 根据文件类型移除注释
    ext = file_path.suffix
    
    if ext == '.js':
        # 移除单行注释
        content = re.sub(r'//.*', '', content)
        # 移除多行注释
        content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    elif ext == '.html':
        # 移除HTML注释
        content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)
    elif ext == '.css':
        # 移除CSS注释
        content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    
    # 统计非空行
    lines = content.split('\n')
    code_lines = [line for line in lines if line.strip()]
    
    return len(code_lines)

def count_characters(file_path):
    """
    统计代码文件的有效字符数（排除注释，保留空白字符）
    
    统计规则：
    - 排除：单行注释、多行注释、HTML注释
    - 保留：所有空白字符（空格、Tab、换行符）- 这些是代码结构的一部分
    - 中文字符：按 Unicode 标准，每个中文字算1个字符
    
    @param file_path: 文件路径（Path对象）
    @returns: 有效代码字符数
    @throws FileNotFoundError: 如果文件不存在
    @throws IOError: 如果文件无法读取
    """
    # Fail Fast: 文件验证
    if not file_path.exists():
        raise FileNotFoundError(f"count_characters: File not found: {file_path}")
    
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        raise IOError(f"count_characters: Failed to read file {file_path}: {e}")
    
    # 根据文件类型移除注释（复用 count_code_lines 的逻辑）
    ext = file_path.suffix
    
    if ext == '.js':
        # 移除单行注释
        content = re.sub(r'//.*', '', content)
        # 移除多行注释
        content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    elif ext == '.html':
        # 移除HTML注释
        content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)
    elif ext == '.css':
        # 移除CSS注释
        content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    
    # 统计字符数（包括空格、换行、Tab等所有字符）
    return len(content)

def count_js_structures(file_path):
    """
    统计JavaScript文件中的代码结构（类、方法、变量）
    
    增强版统计，支持：
    - 类: class/export class
    - 方法: 类方法(含async/static)、箭头函数、function声明、getter/setter
    - 变量: const/let/var、类属性、静态属性、解构赋值
    
    @param file_path: 文件路径（Path对象）
    @returns: 字典，包含classes, methods, variables的数量
    @throws FileNotFoundError: 如果文件不存在
    """
    # Fail Fast: 文件验证
    if not file_path.exists():
        raise FileNotFoundError(f"count_js_structures: File not found: {file_path}")
    
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        raise IOError(f"count_js_structures: Failed to read file {file_path}: {e}")
    
    # 移除注释和字符串，避免误判
    # 移除单行注释
    content_no_comments = re.sub(r'//.*', '', content)
    # 移除多行注释
    content_no_comments = re.sub(r'/\*.*?\*/', '', content_no_comments, flags=re.DOTALL)
    # 移除字符串（简化处理，移除双引号、单引号、模板字符串）
    content_no_comments = re.sub(r'"[^"]*"', '""', content_no_comments)
    content_no_comments = re.sub(r"'[^']*'", "''", content_no_comments)
    content_no_comments = re.sub(r'`[^`]*`', '``', content_no_comments)
    
    # ============================================================================
    # 统计类声明
    # ============================================================================
    # 匹配: export class ClassName、class ClassName
    classes = len(re.findall(r'\bclass\s+\w+', content_no_comments))
    
    # ============================================================================
    # 统计方法/函数声明（不包括回调箭头函数）
    # ============================================================================
    methods = 0
    
    # 1. 类方法（含async、static、getter/setter）
    # 匹配: methodName() {, async methodName() {, static methodName() {
    #      get propertyName() {, set propertyName() {
    # 注意：避免匹配 if/for/while 等关键字
    class_methods = re.findall(
        r'(?:async\s+|static\s+|get\s+|set\s+)*\b(?!if|for|while|switch|catch)\w+\s*\([^)]*\)\s*\{',
        content_no_comments
    )
    methods += len(class_methods)
    
    # 2. 箭头函数赋值
    # 匹配: const func = () =>, const func = async () =>, let func = async (...) =>
    arrow_functions = re.findall(
        r'(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>',
        content_no_comments
    )
    methods += len(arrow_functions)
    
    # 3. function 声明
    # 匹配: function funcName(), export function funcName(), async function funcName()
    function_declarations = re.findall(
        r'(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(',
        content_no_comments
    )
    methods += len(function_declarations)
    
    # ============================================================================
    # 统计变量声明
    # ============================================================================
    variables = 0
    
    # 1. const/let/var 单变量声明
    # 匹配: const a =, let b =, var c =
    single_var_declarations = re.findall(
        r'\b(?:const|let|var)\s+(\w+)\s*=',
        content_no_comments
    )
    variables += len(single_var_declarations)
    
    # 2. 解构赋值中的变量
    # 匹配: const { a, b, c } =, const [ x, y ] =
    # 对象解构
    object_destructuring = re.findall(
        r'\b(?:const|let|var)\s*\{\s*([^}]+)\}\s*=',
        content_no_comments
    )
    for match in object_destructuring:
        # 统计逗号分隔的变量数量（粗略估计）
        var_names = [v.strip().split(':')[0].strip() for v in match.split(',') if v.strip()]
        variables += len(var_names)
    
    # 数组解构
    array_destructuring = re.findall(
        r'\b(?:const|let|var)\s*\[\s*([^\]]+)\]\s*=',
        content_no_comments
    )
    for match in array_destructuring:
        # 统计逗号分隔的变量数量
        var_names = [v.strip() for v in match.split(',') if v.strip() and v.strip() != '...']
        variables += len(var_names)
    
    # 3. 类属性赋值
    # 匹配: this.property =
    class_properties = re.findall(r'\bthis\.(\w+)\s*=', content_no_comments)
    variables += len(class_properties)
    
    # 4. 静态属性
    # 匹配: static PROPERTY =
    static_properties = re.findall(r'\bstatic\s+(\w+)\s*=', content_no_comments)
    variables += len(static_properties)
    
    return {
        'classes': classes,
        'methods': methods,
        'variables': variables
    }

def count_all_code_lines():
    """
    统计所有代码文件的行数、字符数和结构（排除模板目录）
    
    @returns: 字典，包含各类文件的统计信息
    """
    stats = {
        '.js': {
            'files': 0, 
            'lines': 0,
            'characters': 0,
            'classes': 0,
            'methods': 0,
            'variables': 0
        },
        '.html': {'files': 0, 'lines': 0, 'characters': 0},
        '.css': {'files': 0, 'lines': 0, 'characters': 0},
    }
    
    # 统计 JS 文件
    for js_file in PROJECT_ROOT.rglob('*.js'):
        if any(excluded in js_file.parts for excluded in EXCLUDE_DIRS):
            continue
        try:
            stats['.js']['files'] += 1
            stats['.js']['lines'] += count_code_lines(js_file)
            stats['.js']['characters'] += count_characters(js_file)
            
            # 统计JS代码结构
            structures = count_js_structures(js_file)
            stats['.js']['classes'] += structures['classes']
            stats['.js']['methods'] += structures['methods']
            stats['.js']['variables'] += structures['variables']
        except Exception as e:
            print(f"Warning: Failed to count in {js_file}: {e}")
    
    # 统计 HTML 文件（仅核心文件）
    for html_file in PROJECT_ROOT.rglob('*.html'):
        if any(excluded in html_file.parts for excluded in EXCLUDE_DIRS):
            continue
        if not is_core_file(html_file, 'html'):
            continue
        try:
            stats['.html']['files'] += 1
            stats['.html']['lines'] += count_code_lines(html_file)
            stats['.html']['characters'] += count_characters(html_file)
        except Exception as e:
            print(f"Warning: Failed to count in {html_file}: {e}")
    
    # 统计 CSS 文件（仅核心文件）
    for css_file in PROJECT_ROOT.rglob('*.css'):
        if any(excluded in css_file.parts for excluded in EXCLUDE_DIRS):
            continue
        if not is_core_file(css_file, 'css'):
            continue
        try:
            stats['.css']['files'] += 1
            stats['.css']['lines'] += count_code_lines(css_file)
            stats['.css']['characters'] += count_characters(css_file)
        except Exception as e:
            print(f"Warning: Failed to count in {css_file}: {e}")
    
    return stats

def verify_documentation(stats):
    """
    验证文档中的数字是否正确
    
    @param stats: 统计数据字典
    @returns: None
    """
    print()
    print("🔍 验证文档数字...")
    print("-" * 80)
    
    expected = {
        'ServiceRegistry.js': {
            'total_services': stats['total_services'],
        },
        'ServiceImports.js': {
            'total_services': stats['total_services'],
        },
        'README.md': {
            'js_files': stats['total_js'],
        },
    }
    
    print(f"✅ 期望的DI组件总数: {expected['ServiceRegistry.js']['total_services']}")
    print(f"✅ 期望的JS文件数: {expected['README.md']['js_files']}")
    print(f"✅ 期望的总文件数: {stats['total_files']}")
    print()
    print("📝 请手动验证以下文件中的数字是否匹配：")
    print("   - js/bootstrap/ServiceRegistry.js")
    print("   - js/bootstrap/ServiceImports.js")
    print("   - README.md")
    print("   - ARCHITECTURE_LAYERS.md")
    print("   - DESIGN_STANDARDS.md")
    print()

def main():
    """
    主函数
    
    @returns: None
    """
    # Fail Fast: 验证项目根目录
    if not PROJECT_ROOT.exists():
        raise RuntimeError(f"Project root does not exist: {PROJECT_ROOT}")
    
    try:
        # 统计服务和文件
        stats = print_service_statistics()
        
        # 验证文档
        verify_documentation(stats)
        
        # 统计代码行数、字符数和结构
        print()
        print("=" * 80)
        print("📏 代码统计（不包括空行和注释）")
        print("=" * 80)
        print()
        
        code_stats = count_all_code_lines()
        
        # 先计算总数
        total_files = 0
        total_lines = 0
        total_characters = 0
        
        for ext in ['.js', '.html', '.css']:
            total_files += code_stats[ext]['files']
            total_lines += code_stats[ext]['lines']
            total_characters += code_stats[ext]['characters']
        
        # 再打印详细信息（包含百分比）
        for ext in ['.js', '.html', '.css']:
            files = code_stats[ext]['files']
            lines = code_stats[ext]['lines']
            characters = code_stats[ext]['characters']
            
            ext_name = {
                '.js': 'JavaScript',
                '.html': 'HTML',
                '.css': 'CSS'
            }[ext]
            
            line_percentage = (lines / total_lines * 100) if total_lines > 0 else 0
            char_percentage = (characters / total_characters * 100) if total_characters > 0 else 0
            print(f"   {ext_name:12s}: {files:3d} 个文件, {lines:6,d} 行代码 ({line_percentage:5.1f}%), {characters:9,d} 字符 ({char_percentage:5.1f}%)")
        
        print()
        print(f"   ✅ 总计: {total_files} 个文件, {total_lines:,} 行有效代码, {total_characters:,} 字符")
        print()
        
        # JavaScript 代码结构统计
        if code_stats['.js']['files'] > 0:
            print("-" * 80)
            print("🔍 JavaScript 代码结构统计：")
            print()
            print(f"   类 (Classes):      {code_stats['.js']['classes']:5d} 个")
            print(f"   方法/函数 (Methods): {code_stats['.js']['methods']:5d} 个")
            print(f"   变量 (Variables):   {code_stats['.js']['variables']:5d} 个")
            print()
            print("   说明：")
            print("   - 类：export class / class 声明")
            print("   - 方法：类方法(含async/static/getter/setter)、箭头函数赋值、function声明")
            print("   - 变量：const/let/var声明(含解构赋值)、类属性(this.xxx)、静态属性(static)")
            print("   - 注意：回调箭头函数(如map/filter中的)不计入方法统计")
            print()
        
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())

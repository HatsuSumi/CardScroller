#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统计 CardScroller 项目中的所有动画数量
输出格式与README.md中的描述一致，方便对比验证
"""

import re
from pathlib import Path

def count_keyframes(css_content):
    """统计 @keyframes 动画"""
    pattern = r'@keyframes\s+([\w-]+)'
    matches = re.findall(pattern, css_content)
    return len(matches), matches

def count_transitions(css_content):
    """统计 transition 属性并分类"""
    content_no_comments = re.sub(r'/\*.*?\*/', '', css_content, flags=re.DOTALL)
    
    # 找到所有transition及其选择器
    lines = content_no_comments.split('\n')
    transitions = []
    
    for i, line in enumerate(lines):
        if re.search(r'\btransition\s*:', line):
            selector = ""
            for j in range(i-1, max(0, i-20), -1):
                if '{' in lines[j]:
                    for k in range(j, max(0, j-5), -1):
                        if lines[k].strip() and not lines[k].strip().startswith('/*'):
                            selector = lines[k].strip()
                            break
                    break
            transitions.append(selector)
    
    # 分类
    categories = {
        '按钮/控件类': [],
        '卡片/列表项类': [],
        '模态框/对话框类': [],
        '输入控件类': [],
        '提示/工具类': [],
        '布局/面板类': [],
        '动画元素类': [],
        '其他': []
    }
    
    for s in transitions:
        lower = s.lower()
        if any(kw in lower for kw in ['btn', 'button', 'control']):
            categories['按钮/控件类'].append(s)
        elif any(kw in lower for kw in ['modal', 'dialog']):
            categories['模态框/对话框类'].append(s)
        elif any(kw in lower for kw in ['input', 'select', 'slider', 'checkbox', 'trigger']):
            categories['输入控件类'].append(s)
        elif any(kw in lower for kw in ['card', 'item', 'sequence']):
            categories['卡片/列表项类'].append(s)
        elif any(kw in lower for kw in ['tooltip', 'hint', 'message']):
            categories['提示/工具类'].append(s)
        elif any(kw in lower for kw in ['bubble', 'animation', 'preset', 'visualization', 'mask']):
            categories['动画元素类'].append(s)
        elif any(kw in lower for kw in ['panel', 'sidebar', 'container', 'section', 'wrapper', 'canvas', 'page', 'nav']):
            categories['布局/面板类'].append(s)
        else:
            categories['其他'].append(s)
    
    return len(transitions), categories

def count_hovers(css_content):
    """统计 :hover 选择器并分类"""
    content_no_comments = re.sub(r'/\*.*?\*/', '', css_content, flags=re.DOTALL)
    pattern = r'([^{}\n]+:hover[^{]*)\s*\{'
    hovers = [s.strip() for s in re.findall(pattern, content_no_comments)]
    
    # 分类
    categories = {
        '按钮类': [],
        '卡片类': [],
        '输入控件类': [],
        '图标/SVG/箭头类': [],
        '滚动条类': [],
        '链接/导航类': [],
        '面板/容器类': [],
        '其他': []
    }
    
    for s in hovers:
        lower = s.lower()
        if 'scrollbar' in lower:
            categories['滚动条类'].append(s)
        elif any(kw in lower for kw in ['btn', 'button', '-close']):
            categories['按钮类'].append(s)
        elif 'card' in lower:
            categories['卡片类'].append(s)
        elif any(kw in lower for kw in ['input', 'select', 'slider', 'checkbox', 'trigger', 'preset']):
            categories['输入控件类'].append(s)
        elif any(kw in lower for kw in ['icon', 'svg', 'arrow']):
            categories['图标/SVG/箭头类'].append(s)
        elif any(kw in lower for kw in ['link', 'nav', 'item.show', 'qr-code-item']):
            categories['链接/导航类'].append(s)
        elif any(kw in lower for kw in ['panel', 'container', 'section', 'label', 'hint', 'box']):
            categories['面板/容器类'].append(s)
        else:
            categories['其他'].append(s)
    
    return len(hovers), categories

def verify_svg_animations():
    """验证SVG动画（手动定义的5个）"""
    svg_animations = [
        "下拉菜单箭头旋转 (.select-arrow, rotate 180°)",
        "性能提示折叠箭头 (.performance-hint-toggle-arrow, rotate 180°)",
        "刷新按钮表情符号旋转 (.card-position-refresh-btn .btn-icon, rotate 180°)",
        "配置页面导航项悬停左移 (.config-nav-item:hover, translateX -4px)",
        "性能报告SVG边框跑马灯 (PerformanceReportPage.js createElementNS)"
    ]
    return len(svg_animations), svg_animations

def verify_canvas_animations():
    """验证Canvas动画（手动定义的2个）"""
    canvas_animations = [
        "气泡菜单装饰背景 (BubbleMenuService.js RAF循环)",
        "边界编辑器放大镜 (CardBoundaryEditorService.js magnifierCanvas)"
    ]
    return len(canvas_animations), canvas_animations

def verify_js_number_animation():
    """验证JS数值动画（手动定义的1个）"""
    js_animations = [
        "卡片位置面板数字补间 (CardPositionInfoPanel.js _animateNumber + easeOutCubic)"
    ]
    return len(js_animations), js_animations

def main():
    project_root = Path(__file__).parent
    css_file = project_root / 'css' / 'style.css'
    
    # 读取CSS文件
    css_content = css_file.read_text(encoding='utf-8')
    
    print("=" * 80)
    print("CardScroller 动画数量统计")
    print("=" * 80)
    print()
    
    # 1. @keyframes
    keyframes_count, keyframes_list = count_keyframes(css_content)
    print(f"1. CSS @keyframes 关键帧动画: {keyframes_count} 个")
    print(f"   动画名称: {', '.join(keyframes_list[:10])}")
    if len(keyframes_list) > 10:
        print(f"   ... (还有 {len(keyframes_list)-10} 个)")
    print()
    
    # 2. transition
    transitions_count, transitions_categories = count_transitions(css_content)
    print(f"2. CSS transition 过渡: {transitions_count} 个")
    for cat, items in transitions_categories.items():
        if items:
            print(f"   - {cat}: {len(items)}个")
    print()
    
    # 3. :hover
    hovers_count, hovers_categories = count_hovers(css_content)
    print(f"3. CSS :hover 交互动画: {hovers_count} 个")
    for cat, items in hovers_categories.items():
        if items:
            print(f"   - {cat}: {len(items)}个")
    print()
    
    # 4. SVG动画
    svg_count, svg_list = verify_svg_animations()
    print(f"4. SVG/图标动画: {svg_count} 处")
    for i, anim in enumerate(svg_list, 1):
        print(f"   {i}. {anim}")
    print()
    
    # 5. Canvas动画
    canvas_count, canvas_list = verify_canvas_animations()
    print(f"5. Canvas 动画系统: {canvas_count} 个")
    for i, anim in enumerate(canvas_list, 1):
        print(f"   {i}. {anim}")
    print()
    
    # 6. JS数值动画
    js_count, js_list = verify_js_number_animation()
    print(f"6. JavaScript 数值动画: {js_count} 个")
    for i, anim in enumerate(js_list, 1):
        print(f"   {i}. {anim}")
    print()
    
    # 总结
    print("=" * 80)
    print("README.md 中应显示的数字：")
    print("=" * 80)
    total = keyframes_count + transitions_count + hovers_count + svg_count + canvas_count + js_count
    print(f"UI/UX 动画效果（{keyframes_count} 种 CSS @keyframes 关键帧动画 + "
          f"{transitions_count} 个 transition 过渡 + {hovers_count} 个 :hover 交互 + "
          f"{svg_count} 个 SVG 动画 + {canvas_count} 个 Canvas 动画 + {js_count} 个 JS 数值动画）")
    print(f"总计: {total} 个动画效果")
    print("=" * 80)

if __name__ == '__main__':
    main()

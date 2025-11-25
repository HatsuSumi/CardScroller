@echo off
chcp 65001 >nul
echo ====================================
echo   CardScroller 启动脚本
echo ====================================
echo.
echo [1/3] 检查Python环境...

where python >nul 2>&1
if %errorlevel% equ 0 (
    echo [√] 找到 python 命令
    set PYTHON_CMD=python
    goto :start_server
)

where py >nul 2>&1
if %errorlevel% equ 0 (
    echo [√] 找到 py 命令
    set PYTHON_CMD=py
    goto :start_server
)

echo [×] 未找到Python，请先安装Python
echo.
echo 下载地址：https://python.org
echo.
pause
exit /b 1

:start_server
echo.
echo [2/3] 启动本地服务器...
echo.
echo 服务器地址：http://localhost:8000
echo 按 Ctrl+C 可停止服务器
echo.
echo ====================================
echo.

start http://localhost:8000

%PYTHON_CMD% -m http.server 8000

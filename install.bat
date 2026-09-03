@echo off
chcp 65001 >nul
title InkWeave v4.8 一键安装

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║     InkWeave 写作引擎 v4.8 安装程序      ║
echo  ╚══════════════════════════════════════════╝
echo.

:: 1. 检查 Node.js
echo  [1/4] 检查 Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [错误] 未找到 Node.js，请先安装 Node.js (v18+)
    echo  下载地址：https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo         Node.js 版本：%NODE_VER%

:: 2. 安装依赖
echo.
echo  [2/4] 安装依赖...
cd /d "%~dp0"
call npm install --silent 2>&1
if %errorlevel% neq 0 (
    echo  [错误] 依赖安装失败，请检查网络连接
    pause
    exit /b 1
)
echo         ✓ 依赖安装完成

:: 3. 编译 TypeScript
echo.
echo  [3/4] 编译 TypeScript...
call npm run build 2>&1
if %errorlevel% neq 0 (
    echo  [错误] 编译失败
    pause
    exit /b 1
)
echo         ✓ 编译完成

:: 4. 全局注册 inkweave 命令
echo.
echo  [4/4] 注册 inkweave 命令...
call npm link 2>&1
if %errorlevel% neq 0 (
    echo  [警告] 全局注册失败，可手动执行：npm link
    echo         或使用 node dist/检测工具/xxx.js 直接运行
)
echo         ✓ 命令注册完成

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  安装完成！                               ║
echo  ║                                          ║
echo  ║  可用命令：                               ║
echo  ║    inkweave check      单章检测           ║
echo  ║    inkweave check-all  全卷检测           ║
echo  ║    inkweave pre-analysis  写前分析        ║
echo  ║    inkweave quick-write   轻量快写        ║
echo  ║    inkweave auto-pipeline 全链路自动化    ║
echo  ║    inkweave verify-gates  门禁验证        ║
echo  ║    inkweave compile-kb   编译知识库       ║
echo  ╚══════════════════════════════════════════╝
echo.
pause
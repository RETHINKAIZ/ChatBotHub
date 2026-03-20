#!/bin/bash
# 图标生成脚本 - 使用 ImageMagick 创建简单图标

cd "$(dirname "$0")"

# 检查是否安装了 ImageMagick
if ! command -v convert &> /dev/null; then
    echo "未找到 ImageMagick，创建简单的占位符文件"
    # 创建空的 PNG 文件占位符
    echo "请手动添加图标文件到 icons/ 目录"
    exit 0
fi

# 创建渐变色图标
convert -size 128x128 xc:'#667eea' -fill '#764ba2' \
    -draw "roundrectangle 0,0 128,128 24,24" \
    -fill white -gravity center -pointsize 40 \
    -annotate 0 "AI" icons/icon128.png

# 缩小生成其他尺寸
convert icons/icon128.png -resize 48x48 icons/icon48.png
convert icons/icon128.png -resize 16x16 icons/icon16.png

echo "图标生成完成！"

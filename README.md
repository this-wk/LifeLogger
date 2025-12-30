# MyTimeLogger (时间日志小程序)

这是一个简单的微信小程序，用于记录日常活动的时间消耗。
This is a simple WeChat Mini Program for logging daily activity duration.

## 功能 Features
- **查看日志 (View Logs)**: 首页展示所有时间记录。
- **新建日志 (Create Log)**: 记录活动名称、耗时、日期和备注。

## 快速开始 Quick Start

### 1. 环境准备 (Prerequisites)
- 安装 [微信开发者工具 (WeChat DevTools)](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html).
- 拥有一个微信小程序 AppID (注册地址: [mp.weixin.qq.com](https://mp.weixin.qq.com/)).
  - *注意：使用测试号或 `touristappid` 可能无法使用云开发数据库。*
  - *Note: Using a test ID or `touristappid` may restrict Cloud DB usage.*

### 2. 云开发配置 (Cloud Development Setup)
本项目使用了**微信云开发 (WeChat Cloud Development)**。

1. 打开开发者工具，点击工具栏的 **"云开发 (Cloud)"** 按钮，开通云开发环境。
2. 在云开发控制台 -> **数据库 (Database)**。
3. 创建一个新的集合 (Collection)，命名为 `timelogs`。
   - 权限设置为：**"所有用户可读，仅创建者可读写"** (或是默认权限)。

### 3. 运行 (Run)
- 在开发者工具中导入本项目目录。
- 确保 `project.config.json` 中的 `appid` 填入你自己的 AppID。
- 点击 **"编译 (Compile)"**。

## 代码结构 Structure
- `miniprogram/pages/index`: 日志列表页。
- `miniprogram/pages/create`: 新建日志页。
- `miniprogram/app.js`: 云开发初始化。

## 技术栈 Tech Stack
- WXML / WXSS / JS
- WeChat Cloud Database (NoSQL)

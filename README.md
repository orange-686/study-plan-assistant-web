# 学习计划助手

一个面向大学生的学习时间管理 Web 应用，支持每日学习计划、课程表避让、自动排程、番茄钟、考试计时、提醒、统计分析和云端同步。

在线地址：
[https://study-plan-assistant-li.vercel.app](https://study-plan-assistant-li.vercel.app)

GitHub 仓库：
[https://github.com/orange-686/study-plan-assistant-web](https://github.com/orange-686/study-plan-assistant-web)

## 项目特点

- React + TypeScript + Vite + Tailwind CSS 构建
- 支持本地保存与 Supabase 云端同步
- 支持课程表模式，自动避开上课时间
- 支持建议排程，按优先级和时间规则分配任务
- 支持番茄钟与考试计时两种专注模式
- 支持浏览器通知、深色模式和移动端适配
- 针对 Safari 做了兼容和缓存策略优化

## 主要功能

### 计划页

- 展示指定日期的学习任务列表
- 新增、编辑、删除任务
- 任务字段包括：
  - 任务名
  - 科目
  - 优先级
  - 预计时长
  - 开始时间
  - 截止时间
  - 安排模式
- 支持任务状态：
  - 未开始
  - 进行中
  - 已完成
  - 延期
- 支持“今日学习计划”折叠显示
- 折叠状态下仍显示当日最优先任务摘要

### 课程表模式

- 按星期设置固定课程
- 排程时自动避开课程时间
- 支持设置课程前后缓冲时间

### 计划规则设置

- 可设置任务可安排的时间区间
- 可设置优先安排的时间区间
- 可设置临近课程的间隔分钟数
- 支持折叠显示

### 建议排程

- 按优先级自动调整任务先后顺序
- 优先安排高优先级任务
- 遵守课程表、时间规则和当前北京时间限制
- 支持灵活任务自动改期

### 番茄钟

- 默认 25 分钟专注 + 5 分钟休息
- 可自定义专注和休息时长
- 切换页面或熄屏后按真实时间继续结算

### 考试页

- 支持设置考试内容、科目、考试总时长
- 支持开始、暂停、继续、重置、重新设置考试时间
- 中央大字号倒计时显示
- 支持全屏模式
- 关键节点提醒：
  - 剩余 30 分钟
  - 剩余 15 分钟
  - 剩余 5 分钟
  - 剩余 1 分钟
  - 考试结束
- 支持弹窗、页面闪烁和声音提醒
- 考试结束后自动退出全屏
- 考试时长会计入对应科目的学习统计

### 统计页

- 最近 7 天学习时长
- 各科目学习占比
- 完成率趋势
- 统计任务实际学习时间和考试计时时长

### 提醒与同步

- 支持任务开始提醒
- 支持番茄钟结束提醒
- 支持晚上 21:30 复盘提醒
- 支持 Supabase 登录与云端同步
- 未配置 Supabase 时自动回退到 localStorage

## 技术栈

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Supabase
- Vercel

## 本地运行

```bash
npm install
npm run dev -- --host 127.0.0.1
```

默认开发地址类似：

```text
http://127.0.0.1:5173/
```

## 构建与检查

```bash
npm run lint
npm run build
```

## 环境变量

如需启用云端同步，请创建本地环境变量文件：

```bash
cp .env.example .env.local
```

需要配置：

```bash
VITE_SUPABASE_URL=你的 Supabase 项目地址
VITE_SUPABASE_ANON_KEY=你的公开匿名 key
```

## Supabase 初始化

在 Supabase SQL Editor 中执行：

[supabase/schema.sql](/Users/li/Documents/Playground/supabase/schema.sql)

该脚本会创建 `planner_snapshots` 表，并启用按用户隔离的行级权限。

## 部署说明

项目已适配 Vercel 部署，并包含缓存策略配置：

- `index.html` 使用 `no-store, no-cache, must-revalidate`
- 带哈希的静态资源长期缓存

相关配置文件：

- [vercel.json](/Users/li/Documents/Playground/vercel.json)
- [vite.config.ts](/Users/li/Documents/Playground/vite.config.ts)

## 目录结构

```text
.
├── public/
├── src/
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── lib/
│       └── supabase.ts
├── supabase/
│   └── schema.sql
├── .env.example
├── package.json
├── vercel.json
└── vite.config.ts
```

## 功能说明

更详细的页面与功能说明见：

[docs/FEATURES.md](/Users/li/Documents/Playground/docs/FEATURES.md)

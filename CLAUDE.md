# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目用途

将极客时间（Geek Time）课程文章批量导出为干净的 PDF，只保留正文内容（无侧边栏、导航栏）。

## 运行命令

```bash
# 单篇导出
node bin/geektime-pdf.mjs https://time.geekbang.org/column/article/320980

# 批量导出整个课程
node bin/geektime-pdf.mjs --course https://time.geekbang.org/column/intro/100066601 -o "./download/成为 AI 产品经理"

# 查看帮助
node bin/geektime-pdf.mjs --help
```

首次运行弹出浏览器窗口登录，登录态保存在 `.auth/storage-state.json`，后续无头复用。已存在的 PDF 通过文件名前缀匹配预扫描跳过（支持断点续导，不打开浏览器）。3 篇并发导出，空白 PDF 自动重试。

## 架构

模块化结构，基于 `playwright-core` + 本地 Chrome。

```
bin/geektime-pdf.mjs   CLI 入口（shebang）
src/
  cli.mjs              参数解析、流程编排
  browser.mjs          Chrome 路径检测、浏览器启动/关闭
  auth.mjs             登录、认证态加载与校验
  scraper.mjs          课程文章列表抓取（API）
  exporter.mjs         单篇/批量导出、PDF 体积校验
  pdf-merge.mjs        PDF 合并 + 书签（含独立合并模式）
  constants.mjs        UA、并发数、选择器等常量
```

### 核心流程

```
登录 → API 获取文章列表 → 预扫描已有 PDF 跳过 → 3 并发：导航 → 等待正文渲染 → 滚动加载 → 正文提取 → PDF 导出 + 体积校验
```

### 模块依赖关系

```
cli.mjs → exporter.mjs / scraper.mjs / pdf-merge.mjs → auth.mjs → browser.mjs → constants.mjs
```

### 关键函数

| 模块 | 函数 | 职责 |
|------|------|------|
| auth.mjs | `loginAndSaveState` | 有界面模式密码登录，`context.storageState()` 保存 cookies + localStorage |
| scraper.mjs | `scrapeArticleUrls` | 调用 `/serv/v1/column/articles` API 获取课程全部文章 ID + 标题 |
| exporter.mjs | `exportArticlePdf` | 导航到文章页 → 等待正文内容渲染 → 滚动触发懒加载 → 替换 body → `page.pdf()` |
| exporter.mjs | `doExport` | 预扫描目录跳过已有 PDF，3 并发 worker 导出，PDF < 50KB 视为空白自动重试 |
| pdf-merge.mjs | `mergePdfs` | 合并文章 PDF 为带书签的合集 |
| pdf-merge.mjs | `mergeOnly` | 独立合并模式（不重新导出） |
| cli.mjs | `batchExport` | 编排批量导出，处理登录态过期重试 |

### 正文提取原理

极客时间 SPA 页面没有 `<a>` 链接指向文章，目录是 Vue 组件渲染。正文提取通过：
1. `page.waitForFunction` 等待正文容器（如 `[class*="mainAreaWrapper"]`）内文本超过 200 字，确保 AJAX 内容已加载
2. `page.evaluate` 定位容器 → `document.body.innerHTML = mainEl.innerHTML` 替换整个页面为纯正文
3. 添加基础排版样式后调用 `page.pdf()`
4. 导出后校验 PDF 体积，< 50KB 视为空白，删除后自动重试一次

### 课程文章列表获取

DOM 中无法直接抓取文章链接（Vue SPA，`<div>` 渲染无 href）。通过在已登录页面内调用 API 解决：
- `POST https://time.geekbang.org/serv/v1/column/articles`
- 参数：`{ cid: courseId, size: 500, prev: 0, order: 'earliest', sample: false }`
- 返回 `{ id, article_title }` 数组，拼接为 `/column/article/{id}` 即可

## 已知约束

- 极客时间检测 Headless Chrome UA 返回 451，必须用真实 Chrome UA（`UA` 常量）
- `acw_tc` cookie 30 分钟过期，旧值导致 451，注入前需过滤掉让服务器重新下发
- 登录按钮是 `<div>` 而非 `<button>`，通过 JS DOM 遍历查找文本为"登录"的叶子元素并 `.click()`
- 登录页默认是短信验证模式，需先点击"密码登录"链接切换
- Chrome 路径支持跨平台自动检测，也可通过 `CHROME_PATH` 环境变量指定

# GeekTime PDF Exporter

![License](https://img.shields.io/github/license/wwwweeia/geektime-pdf-exporter)
![Node](https://img.shields.io/node/v/geektime-pdf-exporter)

> 极客时间课程文章批量导出为 PDF，支持断点续导、3 并发加速、自动合并带书签合集
>
> Batch export GeekTime course articles to clean PDFs with bookmarks, resume support, and concurrent processing.

## 特性

- **批量导出** — 整个课程一键导出为独立 PDF + 带书签合集
- **断点续导** — 已存在的 PDF 自动跳过，中断后再跑不重复
- **3 并发加速** — 多篇文章同时导出，可配置并发数
- **自动合并** — 批量导出后自动合并为带书签的合集 PDF
- **空白检测** — PDF 体积过小自动重试，确保内容完整
- **跨平台** — 自动检测 macOS / Linux / Windows 上的 Chrome 路径

## 前置条件

- Node.js >= 18
- Chrome 或 Chromium 浏览器
- 极客时间账号（已购买对应课程）

## 安装

```bash
git clone https://github.com/wwwweeia/geektime-pdf-exporter.git
cd geektime-pdf-exporter
npm install
```

## 使用方法

### 单篇导出

```bash
npx geektime-pdf-exporter https://time.geekbang.org/column/article/320980
```

### 批量导出整个课程

```bash
npx geektime-pdf-exporter --course https://time.geekbang.org/column/intro/100066601 -o "./download/课程名"
```

批量导出完成后自动合并为一个带书签的 PDF（`{课程名}_合集.pdf`）。

### 仅合并已有 PDF

如果已经有导出的单篇 PDF，可以单独运行合并：

```bash
npx geektime-pdf-exporter --merge-only "./download/课程名"
```

### 所有选项

```
选项:
  --course <url>       课程目录页 URL
  --output, -o <dir>   输出目录（默认 ./download）
  --concurrency, -c N  并发导出数（默认 3）
  --merge-only <dir>   仅合并目录下已有 PDF
  --no-merge           批量导出时不自动合并
  --verbose            显示详细调试日志
  --version, -v        显示版本号
  --help, -h           显示帮助信息
```

## 配置

### 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `GEEKTIME_PHONE` | 极客时间登录手机号 | 首次登录时必需 |
| `GEEKTIME_PASSWORD` | 极客时间登录密码 | 首次登录时必需 |
| `CHROME_PATH` | Chrome/Chromium 路径 | 可选，默认自动检测 |

首次运行时设置环境变量：

```bash
export GEEKTIME_PHONE=你的手机号
export GEEKTIME_PASSWORD=你的密码
```

也可以创建 `.env` 文件（参考 `.env.example`）。

首次运行会弹出浏览器窗口让你确认登录，登录态保存在 `.auth/` 目录，后续自动无头运行。

## 工作原理

1. 通过浏览器自动化登录极客时间
2. 调用课程 API 获取文章列表（SPA 页面无直接链接，需走 API）
3. 并发导出：导航到文章页 → 等待正文渲染 → 滚动加载图片 → 提取正文 → 生成 PDF
4. 自动合并为带书签的合集 PDF

详细技术设计见 [docs/design-overview.md](docs/design-overview.md)。

## 项目结构

```
bin/
  geektime-pdf-exporter.mjs   CLI 入口
src/
  cli.mjs                     参数解析、流程编排
  browser.mjs                 Chrome 路径检测、浏览器启动
  auth.mjs                    登录、认证态管理
  scraper.mjs                 课程文章列表抓取
  exporter.mjs                单篇/批量导出
  pdf-merge.mjs               PDF 合并 + 书签
  constants.mjs               常量定义
```

## FAQ

**登录态过期怎么办？**

工具会自动检测登录态，过期时自动重新弹出浏览器登录。也可以删除 `.auth/storage-state.json` 强制重新登录。

**Chrome 路径找不到？**

设置 `CHROME_PATH` 环境变量指向你的 Chrome/Chromium 可执行文件路径。

**导出的 PDF 是空白的？**

工具会自动检测空白 PDF（< 50KB）并重试一次。如果仍然失败，可能是网络问题，删除该 PDF 后重新运行即可（断点续导会跳过正常的文件）。

## 相关项目

| 项目 | 说明 |
|------|------|
| [geektime-downloader](https://github.com/nickliqian/geektime-downloader) | 全功能下载器，支持 PDF/Markdown/音频/视频 |
| [geektime2pdf](https://github.com/guoweikuang/geektime2pdf) | 专栏转 PDF，含评论和音频 |

本项目专注于**简洁、开箱即用**：单命令导出 + 自动合并书签，代码模块化易维护。

## 声明

本工具仅供个人学习和备份已购课程内容使用。使用者需确保遵守当地法律法规及极客时间用户协议，对因使用本工具产生的任何法律责任由使用者自行承担，与作者无关。请勿将导出内容用于商业用途或二次分发。

## License

[MIT](LICENSE)

# GeekTime PDF Exporter

将极客时间（Geek Time）课程文章批量导出为干净的 PDF，只保留正文内容（无侧边栏、导航栏），自动合并为带书签的合集。

## 特性

- 批量导出整个课程为独立 PDF + 带书签合集
- 单篇文章导出
- 断点续导（已存在的 PDF 自动跳过）
- 3 篇并发导出，空白 PDF 自动重试
- 自动嵌入 PDF 元数据（标题、作者、课程名）
- 跨平台 Chrome/Chromium 自动检测

## 前置条件

- Node.js >= 18
- Chrome 或 Chromium 浏览器
- 极客时间账号（已购买对应课程）

## 安装

```bash
git clone https://github.com/wwwweeia/geektime-pdf.git
cd geektime-pdf
npm install
```

## 使用方法

### 单篇导出

```bash
# 使用 npx
npx geektime-pdf https://time.geekbang.org/column/article/320980

# 或直接运行
node bin/geektime-pdf.mjs https://time.geekbang.org/column/article/320980
```

### 批量导出整个课程

```bash
npx geektime-pdf --course https://time.geekbang.org/column/intro/100066601 -o "./download/课程名"
```

批量导出完成后自动合并为一个带书签的 PDF（`{课程名}_合集.pdf`）。

### 仅合并已有 PDF

如果已经有导出的单篇 PDF，可以单独运行合并：

```bash
npx geektime-pdf --merge-only "./download/课程名"
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
  geektime-pdf.mjs    CLI 入口
src/
  cli.mjs             参数解析、流程编排
  browser.mjs         Chrome 路径检测、浏览器启动
  auth.mjs            登录、认证态管理
  scraper.mjs         课程文章列表抓取
  exporter.mjs        单篇/批量导出
  pdf-merge.mjs       PDF 合并 + 书签
  constants.mjs       常量定义
```

## 声明

本工具仅供个人备份已购课程内容使用。请尊重版权，不要将导出的 PDF 用于商业用途或二次分发。

## License

[MIT](LICENSE)

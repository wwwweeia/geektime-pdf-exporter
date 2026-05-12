import { existsSync, unlinkSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { launchBrowser } from './browser.mjs';
import { loginAndSaveState, checkLoginState } from './auth.mjs';
import { scrapeArticleUrls } from './scraper.mjs';
import { doExport, singleExport } from './exporter.mjs';
import { mergePdfs, mergeOnly } from './pdf-merge.mjs';
import { STATE_FILE, DEFAULT_OUTPUT_DIR, CONCURRENCY } from './constants.mjs';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

function printUsage() {
  console.log(`geektime-pdf-exporter v${pkg.version} - 极客时间课程 PDF 导出工具

用法:
  单篇导出:  geektime-pdf-exporter <文章URL> [-o <输出目录>]
  批量导出:  geektime-pdf-exporter --course <课程URL> --output <输出目录>
  独立合并:  geektime-pdf-exporter --merge-only <目录>
  查看版本:  geektime-pdf-exporter --version

选项:
  --course <url>       课程目录页 URL（如 https://time.geekbang.org/column/intro/100066601）
  --output, -o <dir>   输出目录（默认 ./download）
  --concurrency, -c N  并发导出数（默认 ${CONCURRENCY}）
  --merge-only <dir>   仅合并目录下已有 PDF，不重新导出
  --no-merge           批量导出时不自动合并
  --verbose            显示详细调试日志
  --version, -v        显示版本号
  --help, -h           显示帮助信息

环境变量:
  GEEKTIME_PHONE      极客时间登录手机号（首次登录时必需）
  GEEKTIME_PASSWORD   极客时间登录密码（首次登录时必需）
  CHROME_PATH         Chrome/Chromium 可执行文件路径（自动检测）

示例:
  geektime-pdf-exporter https://time.geekbang.org/column/article/320980
  geektime-pdf-exporter --course https://time.geekbang.org/column/intro/100066601 -o ./download/课程名
  geektime-pdf-exporter --merge-only ./download/课程名
`);
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    return { mode: 'help' };
  }
  if (args.includes('--version') || args.includes('-v')) {
    return { mode: 'version' };
  }

  const mergeOnlyIdx = args.indexOf('--merge-only');
  if (mergeOnlyIdx !== -1) {
    const dir = args[mergeOnlyIdx + 1];
    if (!dir) throw new Error('--merge-only 需要指定目录路径');
    return { mode: 'merge-only', dir };
  }

  const courseIdx = args.indexOf('--course');
  if (courseIdx !== -1) {
    const courseUrl = args[courseIdx + 1];
    if (!courseUrl) throw new Error('--course 需要指定课程 URL');

    if (!courseUrl.match(/time\.geekbang\.org\/column\/intro\/\d+/)) {
      throw new Error(`课程 URL 格式不正确: ${courseUrl}\n期望格式: https://time.geekbang.org/column/intro/XXXXXXX`);
    }

    const outputIdx = args.indexOf('--output');
    const shortOutputIdx = args.indexOf('-o');
    const outputDir = outputIdx !== -1 ? args[outputIdx + 1]
      : shortOutputIdx !== -1 ? args[shortOutputIdx + 1]
      : DEFAULT_OUTPUT_DIR;

    const concIdx = args.indexOf('--concurrency');
    const shortConcIdx = args.indexOf('-c');
    const concArg = concIdx !== -1 ? args[concIdx + 1]
      : shortConcIdx !== -1 ? args[shortConcIdx + 1]
      : null;
    const concurrency = concArg ? parseInt(concArg) : CONCURRENCY;

    return {
      mode: 'batch',
      courseUrl,
      outputDir: outputDir || DEFAULT_OUTPUT_DIR,
      concurrency: isNaN(concurrency) ? CONCURRENCY : Math.max(1, concurrency),
      noMerge: args.includes('--no-merge'),
      verbose: args.includes('--verbose'),
    };
  }

  // 单篇模式
  const articleUrl = args.find(a => a.startsWith('http'));
  if (!articleUrl) throw new Error('请提供文章 URL 或使用 --course 指定课程');

  if (!articleUrl.match(/time\.geekbang\.org\/column\/article\/\d+/)) {
    throw new Error(`文章 URL 格式不正确: ${articleUrl}\n期望格式: https://time.geekbang.org/column/article/XXXXXXX`);
  }

  const outputIdx = args.indexOf('--output');
  const shortOutputIdx = args.indexOf('-o');
  const outputDir = outputIdx !== -1 ? args[outputIdx + 1]
    : shortOutputIdx !== -1 ? args[shortOutputIdx + 1]
    : DEFAULT_OUTPUT_DIR;

  return {
    mode: 'single',
    articleUrl,
    outputDir: outputDir || DEFAULT_OUTPUT_DIR,
    verbose: args.includes('--verbose'),
  };
}

async function batchExport(config) {
  mkdirSync(config.outputDir, { recursive: true });

  const needLogin = !existsSync(STATE_FILE);
  const browser = await launchBrowser({ headless: !needLogin });

  try {
    if (needLogin) await loginAndSaveState(browser);

    let loggedIn = await checkLoginState(browser);
    if (!loggedIn) {
      console.log('[重试] 登录态已过期，重新登录...');
      await browser.close();
      const b2 = await launchBrowser({ headless: false });
      await loginAndSaveState(b2);
      loggedIn = await checkLoginState(b2);
      if (!loggedIn) throw new Error('登录失败，请检查凭证是否正确');

      const articles = await scrapeArticleUrls(b2, config.courseUrl);
      if (articles.length === 0) throw new Error('未找到文章，请检查课程 URL');
      await doExport(b2, articles, config.outputDir, config.concurrency);
      if (!config.noMerge) await mergePdfs(config.outputDir, articles);
      await b2.close();
      return;
    }

    const articles = await scrapeArticleUrls(browser, config.courseUrl);
    if (articles.length === 0) throw new Error('未找到文章，请检查课程 URL');
    await doExport(browser, articles, config.outputDir, config.concurrency);
    if (!config.noMerge) await mergePdfs(config.outputDir, articles);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runSingleExport(config) {
  const needLogin = !existsSync(STATE_FILE);
  const browser = await launchBrowser({ headless: !needLogin });

  try {
    if (needLogin) await loginAndSaveState(browser);

    const result = await singleExport(browser, config.articleUrl, config.outputDir);
    if (!result) {
      console.log('[重试] 重新登录...');
      if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
      await browser.close();
      const b2 = await launchBrowser({ headless: false });
      await loginAndSaveState(b2);
      await singleExport(b2, config.articleUrl, config.outputDir);
      await b2.close();
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function run() {
  const config = parseArgs(process.argv.slice(2));

  switch (config.mode) {
    case 'help':
      printUsage();
      break;
    case 'version':
      console.log(`geektime-pdf-exporter v${pkg.version}`);
      break;
    case 'merge-only':
      await mergeOnly(config.dir);
      break;
    case 'batch':
      await batchExport(config);
      break;
    case 'single':
      await runSingleExport(config);
      break;
    default:
      printUsage();
  }
}

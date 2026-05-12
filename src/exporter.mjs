import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { createContext } from './auth.mjs';
import { ARTICLE_SELECTORS, ARTICLE_CONTENT_SELECTORS, MIN_PDF_SIZE } from './constants.mjs';

async function exportArticlePdf(browser, articleUrl, outputDir, meta = {}) {
  const context = await createContext(browser);
  const page = await context.newPage();

  await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  if (page.url().includes('signin') || page.url().includes('login')) {
    console.log(`[跳过] 被重定向到登录页: ${articleUrl}`);
    await context.close();
    return null;
  }

  // 等待正文内容实际渲染（不只是空容器）
  await page.waitForFunction((sels) => {
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 200) return true;
    }
    return false;
  }, ARTICLE_CONTENT_SELECTORS, { timeout: 20000 }).catch(() => {});

  // 滚动触发懒加载（图片等）
  await page.evaluate(async () => {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 20; i++) {
      window.scrollBy(0, 1200);
      await delay(100);
      if ((window.innerHeight + window.scrollY) >= document.body.scrollHeight) break;
    }
    window.scrollTo(0, 0);
    await delay(300);
  });

  // 提取正文并替换 body
  const found = await page.evaluate((sels) => {
    let mainEl = null;
    for (const sel of sels) {
      mainEl = document.querySelector(sel);
      if (mainEl) break;
    }
    if (!mainEl) return { ok: false, title: document.title };

    document.body.innerHTML = mainEl.innerHTML;
    document.body.style.padding = '40px 60px';
    document.body.style.maxWidth = '900px';
    document.body.style.margin = '0 auto';
    document.body.style.fontSize = '16px';
    document.body.style.lineHeight = '1.8';
    document.body.style.color = '#333';
    return { ok: true, title: document.title };
  }, ARTICLE_SELECTORS);

  const title = found.title || 'geektime-article';
  const safeTitle = title.replace(/[\/\\:*?"<>|]/g, '_').substring(0, 80);
  const outputPath = join(outputDir, `${safeTitle}.pdf`);

  if (existsSync(outputPath)) {
    console.log(`[跳过] 已存在: ${safeTitle}.pdf`);
    await context.close();
    return outputPath;
  }

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
  });

  // 嵌入 PDF 元数据
  await embedPdfMetadata(outputPath, {
    title: found.title || meta.title || '',
    author: meta.author || '',
    subject: meta.columnTitle || '',
    keywords: [meta.columnTitle, '极客时间'].filter(Boolean),
  });

  console.log(`[完成] ${safeTitle}.pdf`);
  await context.close();
  return outputPath;
}

async function embedPdfMetadata(pdfPath, meta) {
  try {
    const bytes = readFileSync(pdfPath);
    const doc = await PDFDocument.load(bytes);
    if (meta.title) doc.setTitle(meta.title, { showInWindowTitleBar: true });
    if (meta.author) doc.setAuthor(meta.author);
    if (meta.subject) doc.setSubject(meta.subject);
    if (meta.keywords?.length) doc.setKeywords(meta.keywords);
    doc.setCreator('GeekTime PDF Exporter');
    doc.setProducer('pdf-lib');
    writeFileSync(pdfPath, await doc.save());
  } catch (err) {
    console.log(`[元数据] 写入失败: ${err.message}`);
  }
}

export async function doExport(browser, articles, outputDir, concurrency = 3) {
  // 预扫描已有 PDF
  const existingFiles = existsSync(outputDir)
    ? readdirSync(outputDir).filter(f => f.endsWith('.pdf'))
    : [];

  const results = { success: 0, skipped: 0, failed: 0 };

  const todo = [];
  for (const article of articles) {
    const safeTitle = article.title.replace(/[\/\\:*?"<>|]/g, '_').substring(0, 80);
    if (existingFiles.some(f => f.startsWith(safeTitle))) {
      results.skipped++;
    } else {
      todo.push(article);
    }
  }

  console.log(`\n[批量导出] 共 ${articles.length} 篇，已存在 ${results.skipped} 篇，待导出 ${todo.length} 篇\n`);
  if (todo.length === 0) {
    console.log(`\n[汇总] 全部已导出，跳过: ${results.skipped}`);
    return;
  }

  let nextIdx = 0;

  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= todo.length) break;
      const { url, title } = todo[idx];
      console.log(`[${idx + 1}/${todo.length}] ${title}`);

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await exportArticlePdf(browser, url, outputDir, todo[idx]);
          if (!result) { results.failed++; break; }

          const size = statSync(result).size;
          if (size < MIN_PDF_SIZE) {
            console.log(`[警告] ${(size / 1024).toFixed(1)}KB，可能空白`);
            unlinkSync(result);
            if (attempt === 0) continue;
            results.failed++;
            break;
          }

          results.success++;
          break;
        } catch (err) {
          console.error(`[失败] ${title}: ${err.message}`);
          results.failed++;
          break;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, () => worker()));

  console.log(`\n[汇总] 成功: ${results.success}, 跳过: ${results.skipped}, 失败: ${results.failed}`);
}

export async function singleExport(browser, articleUrl, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  return exportArticlePdf(browser, articleUrl, outputDir);
}

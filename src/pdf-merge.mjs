import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { PDFDocument, PDFName, PDFDict, PDFNull, PDFNumber, PDFHexString } from 'pdf-lib';

function addPdfOutlines(pdfDoc, bookmarks) {
  if (bookmarks.length === 0) return;

  const context = pdfDoc.context;
  const pages = pdfDoc.getPages();
  const outlineRootRef = context.nextRef();
  const itemRefs = bookmarks.map(() => context.nextRef());

  for (let i = 0; i < bookmarks.length; i++) {
    const { title, pageIndex } = bookmarks[i];
    const pageRef = pages[pageIndex].ref;
    const dest = context.obj([pageRef, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull]);

    const itemMap = new Map();
    itemMap.set(PDFName.of('Title'), PDFHexString.fromText(title));
    itemMap.set(PDFName.of('Parent'), outlineRootRef);
    itemMap.set(PDFName.of('Dest'), dest);
    if (i > 0) itemMap.set(PDFName.of('Prev'), itemRefs[i - 1]);
    if (i < bookmarks.length - 1) itemMap.set(PDFName.of('Next'), itemRefs[i + 1]);

    context.assign(itemRefs[i], PDFDict.fromMapWithContext(itemMap, context));
  }

  const rootMap = new Map();
  rootMap.set(PDFName.of('Type'), PDFName.of('Outlines'));
  rootMap.set(PDFName.of('First'), itemRefs[0]);
  rootMap.set(PDFName.of('Last'), itemRefs[bookmarks.length - 1]);
  rootMap.set(PDFName.of('Count'), PDFNumber.of(bookmarks.length));
  context.assign(outlineRootRef, PDFDict.fromMapWithContext(rootMap, context));

  pdfDoc.catalog.set(PDFName.of('Outlines'), outlineRootRef);
}

/**
 * 合并文章 PDF 为带书签的合集
 */
export async function mergePdfs(outputDir, articles) {
  const existingFiles = readdirSync(outputDir).filter(f => f.endsWith('.pdf') && !f.includes('合集'));
  const pdfEntries = [];

  for (const article of articles) {
    const safeTitle = article.title.replace(/[\/\\:*?"<>|]/g, '_').substring(0, 80);
    const matched = existingFiles.find(f => f.startsWith(safeTitle));
    if (matched) {
      pdfEntries.push({ title: article.title, path: join(outputDir, matched) });
    }
  }

  if (pdfEntries.length === 0) {
    console.log('[合并] 没有找到可合并的 PDF');
    return;
  }

  console.log(`\n[合并] 开始合并 ${pdfEntries.length} 篇文章...`);
  const mergedPdf = await PDFDocument.create();
  const bookmarks = [];
  let currentPageIndex = 0;

  for (const entry of pdfEntries) {
    const bytes = readFileSync(entry.path);
    const pdf = await PDFDocument.load(bytes);
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(p => mergedPdf.addPage(p));
    bookmarks.push({ title: entry.title, pageIndex: currentPageIndex });
    currentPageIndex += pdf.getPageCount();
  }

  addPdfOutlines(mergedPdf, bookmarks);

  const courseName = articles[0]?.columnTitle || '极客时间课程';
  mergedPdf.setTitle(courseName);
  mergedPdf.setAuthor(articles[0]?.author || '');
  mergedPdf.setSubject(courseName);
  mergedPdf.setKeywords(['极客时间', courseName]);
  mergedPdf.setCreator('GeekTime PDF Exporter');
  mergedPdf.setProducer('pdf-lib');

  const safeCourseName = courseName.replace(/[\/\\:*?"<>|]/g, '_');
  const mergedPath = join(outputDir, `${safeCourseName}_合集.pdf`);
  const saved = await mergedPdf.save();
  writeFileSync(mergedPath, saved);

  const sizeMB = (saved.length / 1024 / 1024).toFixed(1);
  console.log(`[合并] 完成: ${safeCourseName}_合集.pdf (${sizeMB}MB, ${currentPageIndex}页)`);
}

/**
 * 独立合并模式：扫描目录下已有的 PDF，生成带书签的合集
 */
export async function mergeOnly(targetDir) {
  const dirName = targetDir.split('/').pop();

  const files = readdirSync(targetDir)
    .filter(f => f.endsWith('.pdf') && !f.includes('合集'))
    .sort();

  if (files.length === 0) {
    console.log(`[合并] ${dirName} 中没有 PDF 文件`);
    return;
  }

  // 尝试从文件名解析文章信息
  function parseArticleInfo(filename) {
    const name = filename.replace(/\.pdf$/, '');
    const match = name.match(/^(\d+)\s*[|｜_]\s*(.+?)-(.+)-极客时间$/);
    if (match) {
      return { index: parseInt(match[1]), title: match[2].trim(), courseName: match[3].trim() };
    }
    return { index: 0, title: name, courseName: '' };
  }

  const entries = files.map(f => ({
    filename: f,
    path: join(targetDir, f),
    ...parseArticleInfo(f),
  })).sort((a, b) => {
    if (a.index > 0 && b.index > 0) return a.index - b.index;
    return a.filename.localeCompare(b.filename);
  });

  const courseName = entries[0]?.courseName || dirName;

  // 嵌入单篇元数据
  for (const entry of entries) {
    try {
      const bytes = readFileSync(entry.path);
      const doc = await PDFDocument.load(bytes);
      doc.setTitle(entry.filename.replace(/\.pdf$/, ''));
      doc.setSubject(courseName);
      doc.setKeywords(['极客时间', courseName]);
      doc.setCreator('GeekTime PDF Exporter');
      doc.setProducer('pdf-lib');
      writeFileSync(entry.path, await doc.save());
    } catch (err) {
      console.error(`  元数据失败: ${entry.filename}: ${err.message}`);
    }
  }

  // 合并
  const mergedPdf = await PDFDocument.create();
  const bookmarks = [];
  let currentPageIndex = 0;

  for (const entry of entries) {
    const bytes = readFileSync(entry.path);
    const pdf = await PDFDocument.load(bytes);
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(p => mergedPdf.addPage(p));
    const bookmarkTitle = entry.index > 0
      ? `${String(entry.index).padStart(2, '0')} | ${entry.title}`
      : entry.title;
    bookmarks.push({ title: bookmarkTitle, pageIndex: currentPageIndex });
    currentPageIndex += pdf.getPageCount();
  }

  addPdfOutlines(mergedPdf, bookmarks);

  mergedPdf.setTitle(courseName);
  mergedPdf.setSubject(courseName);
  mergedPdf.setKeywords(['极客时间', courseName]);
  mergedPdf.setCreator('GeekTime PDF Exporter');
  mergedPdf.setProducer('pdf-lib');

  const safeName = courseName.replace(/[\/\\:*?"<>|]/g, '_');
  const mergedPath = join(targetDir, `${safeName}_合集.pdf`);
  const saved = await mergedPdf.save();
  writeFileSync(mergedPath, saved);

  const sizeMB = (saved.length / 1024 / 1024).toFixed(1);
  console.log(`[合并] ${dirName}: ${entries.length}篇 → ${sizeMB}MB, ${currentPageIndex}页, ${bookmarks.length}个书签`);
}

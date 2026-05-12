import { createContext } from './auth.mjs';

export async function scrapeArticleUrls(browser, courseUrl) {
  const context = await createContext(browser);
  const page = await context.newPage();

  // 先访问首页获取新鲜 cookie
  await page.goto('https://time.geekbang.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const courseId = courseUrl.match(/\/(\d+)/)?.[1];
  if (!courseId) {
    throw new Error(`无法从 URL 提取课程 ID: ${courseUrl}`);
  }

  console.log(`[目录] 通过 API 获取课程 ${courseId} 的文章列表...`);
  const articles = await page.evaluate(async (cid) => {
    const resp = await fetch('https://time.geekbang.org/serv/v1/column/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid, size: 500, prev: 0, order: 'earliest', sample: false }),
    });
    const json = await resp.json();
    if (json.code !== 0 || !json.data?.list) return [];
    return json.data.list.map(a => ({
      id: a.id,
      title: a.article_title,
      url: `https://time.geekbang.org/column/article/${a.id}`,
      author: a.author?.uname || a.author_name || '',
      columnTitle: a.column_title || '',
      publishTime: a.publish_time ? new Date(a.publish_time * 1000).toISOString().slice(0, 10) : '',
    }));
  }, courseId);

  console.log(`[目录] 找到 ${articles.length} 篇文章`);
  await context.close();
  return articles;
}

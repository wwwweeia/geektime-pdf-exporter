import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

export const AUTH_DIR = join(PROJECT_ROOT, '.auth');
export const STATE_FILE = join(AUTH_DIR, 'storage-state.json');
export const DEFAULT_OUTPUT_DIR = join(PROJECT_ROOT, 'download');

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

export const CONCURRENCY = 3;
export const MIN_PDF_SIZE = 50 * 1024; // 50KB
export const VIEWPORT = { width: 1280, height: 900 };

export const ARTICLE_SELECTORS = [
  '[class*="mainAreaWrapper"]',
  '[class*="article-detail"]',
  '[class*="article-content"]',
  'article',
  '[class*="content"]',
];

export const ARTICLE_CONTENT_SELECTORS = ARTICLE_SELECTORS.slice(0, -1);

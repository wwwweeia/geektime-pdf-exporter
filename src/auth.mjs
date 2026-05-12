import { existsSync, readFileSync, mkdirSync } from 'fs';
import { UA, VIEWPORT, AUTH_DIR, STATE_FILE } from './constants.mjs';

function ensureCredentials() {
  if (!process.env.GEEKTIME_PHONE || !process.env.GEEKTIME_PASSWORD) {
    throw new Error(
      '需要登录但未设置凭证。请设置环境变量:\n' +
      '  export GEEKTIME_PHONE=你的手机号\n' +
      '  export GEEKTIME_PASSWORD=你的密码\n' +
      '或创建 .env 文件（参考 .env.example）'
    );
  }
}

export async function loginAndSaveState(browser) {
  ensureCredentials();

  console.log('[登录] 打开浏览器进行登录...');
  const context = await browser.newContext({ viewport: VIEWPORT, userAgent: UA });
  const page = await context.newPage();

  const loginTimeout = setTimeout(() => {
    console.error('[登录] 登录超时（2分钟），请重试');
    process.exit(1);
  }, 120_000);

  try {
    await page.goto('https://account.geekbang.org/signin?redirect=https%3A%2F%2Ftime.geekbang.org%2F', {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await page.waitForTimeout(3000);
    console.log('[登录] 登录页已加载');

    // 切换到密码登录
    const pwdLoginTab = page.locator('a:has-text("密码登录")').first();
    await pwdLoginTab.waitFor({ timeout: 10000 });
    await pwdLoginTab.click();
    await page.waitForTimeout(1000);

    // 填写手机号和密码
    const phoneInput = page.locator('input[name="cellphone"], input[placeholder="手机号"]').first();
    await phoneInput.waitFor({ timeout: 5000 });
    await phoneInput.fill(process.env.GEEKTIME_PHONE);

    const pwdInput = page.locator('input[type="password"]').first();
    await pwdInput.waitFor({ timeout: 5000 });
    await pwdInput.fill(process.env.GEEKTIME_PASSWORD);

    // 勾选协议
    const agreeCheckbox = page.locator('input#agree[type="checkbox"]').first();
    if (await agreeCheckbox.isVisible().catch(() => false)) {
      if (!(await agreeCheckbox.isChecked().catch(() => false))) {
        await agreeCheckbox.check({ force: true });
      }
    }

    // 登录按钮是 <div> 不是 <button>，需要遍历 DOM 查找
    const clicked = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.textContent?.trim() === '登录' && el.children.length === 0) {
          el.click();
          return true;
        }
      }
      return false;
    });
    if (!clicked) await pwdInput.press('Enter');
    console.log('[登录] 已提交登录');

    await page.waitForTimeout(3000);
    try {
      await page.waitForURL(url => url.toString().startsWith('https://time.geekbang.org'), { timeout: 15000 });
      console.log('[登录] 登录成功');
    } catch {
      await page.goto('https://time.geekbang.org/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    await page.waitForTimeout(2000);

    if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });
    await context.storageState({ path: STATE_FILE });
    console.log('[登录] 登录态已保存');
  } finally {
    clearTimeout(loginTimeout);
    await context.close();
  }
}

export function loadAuthState() {
  const stateData = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  const now = Date.now() / 1000;
  // 过滤 acw_tc（30分钟过期）和已过期 cookie，让服务器重新下发
  stateData.cookies = stateData.cookies.filter(c => {
    if (c.name === 'acw_tc') return false;
    if (c.expires > 0 && c.expires < now) return false;
    return true;
  });
  return stateData;
}

export async function createContext(browser) {
  return browser.newContext({
    storageState: loadAuthState(),
    viewport: VIEWPORT,
    userAgent: UA,
  });
}

export async function checkLoginState(browser) {
  const context = await createContext(browser);
  const page = await context.newPage();
  await page.goto('https://time.geekbang.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const loginVisible = await page.locator('a:has-text("登录")').first().isVisible().catch(() => false);
  await context.close();
  return !loginVisible;
}

import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { chromium } from 'playwright-core';
import { UA, VIEWPORT } from './constants.mjs';

const MACOS_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const LINUX_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
];

const WINDOWS_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function findChromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates = process.platform === 'darwin' ? MACOS_PATHS
    : process.platform === 'win32' ? WINDOWS_PATHS
    : LINUX_PATHS;

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  // 降级：尝试 which
  try {
    const cmd = process.platform === 'win32' ? 'where chrome' : 'which google-chrome || which chromium-browser || which chromium';
    const result = execSync(cmd, { encoding: 'utf-8' }).trim().split('\n')[0];
    if (result && existsSync(result)) return result;
  } catch {}

  return null;
}

export function getChromePath() {
  const path = findChromePath();
  if (!path) {
    throw new Error(
      '未找到 Chrome/Chromium 浏览器。请设置 CHROME_PATH 环境变量指定浏览器路径。\n' +
      '下载地址: https://www.google.com/chrome/'
    );
  }
  return path;
}

export async function launchBrowser({ headless = true } = {}) {
  const chromePath = getChromePath();
  return chromium.launch({ executablePath: chromePath, headless });
}

export { UA, VIEWPORT };

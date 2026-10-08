/* アプリアイコン（SVG / PNG）を生成する
   使い方: node tools/generate-icons.mjs   （Playwright と Chromium が必要） */

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'icons');

/** 進捗リングと新芽のマーク。rounded=false で全面塗り（maskable / iOS 用） */
function appIcon({ rounded }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#34c2a6"/>
      <stop offset="1" stop-color="#127063"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="116"' : ''} fill="url(#bg)"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="34"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#fff" stroke-width="34" stroke-linecap="round"
          stroke-dasharray="${(2 * Math.PI * 150 * 0.72).toFixed(1)} 1000" transform="rotate(-90 256 256)"/>
  <path d="M256 338V246" stroke="#fff" stroke-width="22" stroke-linecap="round" fill="none"/>
  <path d="M256 266c-8-36-38-58-80-56 2 40 32 64 80 56z" fill="#fff"/>
  <path d="M256 250c4-48 40-80 94-80-2 52-40 84-94 80z" fill="#e8fff8"/>
</svg>`;
}

function sosIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="48" fill="#c8434f"/>
  <path d="M48 72S24 57.5 17.6 42.8C13 32.1 19.7 20 31.4 20c6.6 0 11.4 3.8 13.9 7.9 2.5-4.1 7.3-7.9 13.9-7.9 11.7 0 18.4 12.1 13.6 22.8C66.5 57.6 48 72 48 72z" fill="#fff"/>
</svg>`;
}

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { /* fallthrough */ }
  const globalRoot = path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright');
  return require(globalRoot);
}

async function main() {
  await mkdir(out, { recursive: true });
  const rounded = appIcon({ rounded: true });
  const full = appIcon({ rounded: false });
  await writeFile(path.join(out, 'icon.svg'), rounded);

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (svg, size, file) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(out, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  await render(rounded, 192, 'icon-192.png');
  await render(rounded, 512, 'icon-512.png');
  await render(full, 512, 'maskable-512.png');
  await render(full, 180, 'apple-touch-icon.png');
  await render(sosIcon(), 96, 'sos-96.png');
  await browser.close();
  console.log('icons generated in', out);
}

main().catch((e) => { console.error(e); process.exit(1); });

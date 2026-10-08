/* E2E テスト（Playwright / スマホ幅）
   使い方: node tests/e2e.mjs   （SCREENSHOT_DIR を指定するとスクリーンショットを保存） */

import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = process.env.SCREENSHOT_DIR || path.join(os.tmpdir(), 'yamelog-e2e');
const DAY = 86400000;

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { /* fallthrough */ }
  return require(path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright'));
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const steps = [];
async function step(name, fn) {
  process.stdout.write(`• ${name} ... `);
  await fn();
  steps.push(name);
  console.log('ok');
}

async function main() {
  await mkdir(shotDir, { recursive: true });
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'ja-JP', timezoneId: 'Asia/Tokyo', acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const shot = (name) => page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true, animations: 'disabled' });
  const noOverflow = async () => {
    const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    assert.ok(sw <= w, `横スクロールが発生しています (${sw} > ${w})`);
  };
  const closeSheet = async () => {
    await page.locator('#sheet [data-action="sheet-close"]').first().click();
    await page.locator('#sheet').waitFor({ state: 'hidden' });
  };

  try {
    await step('初回起動でようこそ画面へ', async () => {
      await page.goto(base);
      await page.waitForURL(/#\/welcome$/);
      await page.getByText('やめたい習慣を、今日もやめている。').waitFor();
      await noOverflow();
      await shot('01-welcome');
    });

    await step('習慣を登録（プリセット・過去日時・理由）', async () => {
      await page.getByRole('link', { name: 'はじめる' }).click();
      await page.waitForURL(/#\/new$/);
      await page.getByRole('button', { name: /お酒/ }).click();
      assert.equal(await page.locator('[data-field="name"]').inputValue(), 'お酒');
      assert.equal(await page.locator('[data-field="costPerDay"]').inputValue(), '800');
      const tenDaysAgo = await page.evaluate((d) => {
        const t = new Date(Date.now() - d * 10 - 3 * 3600000);
        const p = (n) => String(n).padStart(2, '0');
        return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
      }, DAY);
      await page.locator('[data-field="startedAt"]').fill(tenDaysAgo);
      await page.locator('#reason-input').fill('朝をすっきり迎えたい');
      await page.getByRole('button', { name: '追加', exact: true }).click();
      await page.getByRole('button', { name: '＋ 家族・大切な人のため' }).click();
      assert.equal(await page.locator('.reason-list li').count(), 2);
      await noOverflow();
      await shot('02-editor');
      await page.getByRole('button', { name: 'この習慣をやめる' }).click();
      await page.waitForURL(/#\/$/);
    });

    await step('ホームでカウンターが毎秒進む', async () => {
      const days = page.locator('.habit-card [data-k="days"]');
      await days.waitFor();
      assert.equal(await days.textContent(), '10');
      const before = await page.locator('.habit-card [data-k="hms"]').textContent();
      await page.waitForTimeout(1300);
      const after = await page.locator('.habit-card [data-k="hms"]').textContent();
      assert.notEqual(before, after);
      const money = await page.locator('.habit-card [data-k="money"]').textContent();
      assert.match(money, /^¥8,\d{3}$/);
      assert.equal(await page.locator('#sheet').isHidden(), true, '過去日付の登録ではお祝いしない');
      await noOverflow();
      await shot('03-home');
    });

    await step('今日の誓い', async () => {
      await page.getByRole('button', { name: '今日もやめると誓う' }).click();
      await page.locator('.pledge-card.done').waitFor();
      const c = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('yamelog:v1')).checkins)[0]);
      assert.ok(c.pledgedAt);
    });

    await step('習慣の詳細', async () => {
      await page.locator('.habit-card').click();
      await page.waitForURL(/#\/habit\//);
      await page.getByText('これまでの成果').waitFor();
      assert.equal(await page.locator('.medal.done').count(), 3); // 1日・3日・1週間
      assert.equal(await page.locator('.reasons-card li').count(), 2);
      await noOverflow();
      await shot('04-habit');
    });

    await step('スリップを記録してリセット', async () => {
      await page.getByRole('button', { name: 'スリップを記録する' }).click();
      await page.locator('#sheet').getByRole('button', { name: 'ストレス' }).click();
      await page.locator('#relapse-note').fill('飲み会で');
      await shot('05-relapse-sheet');
      await page.getByRole('button', { name: '記録してカウンターをリセット' }).click();
      await page.getByText('また、ここから。').waitFor();
      await closeSheet();
      assert.equal(await page.locator('.ring-center [data-k="days"]').textContent(), '0');
      assert.equal(await page.locator('.list li').count(), 2); // 現在 + 過去1件
      assert.match(await page.locator('.list li').nth(1).textContent(), /きっかけ: ストレス/);
      assert.match(await page.locator('.stat').filter({ hasText: '最長記録' }).textContent(), /10日/);
    });

    await step('衝動SOS → 乗り越えた', async () => {
      await page.goto(`${base}#/sos`);
      await page.getByText('衝動SOS').waitFor();
      await page.waitForTimeout(1200);
      assert.match(await page.locator('#sos-timer').textContent(), /^00:0[1-2]$/);
      assert.match(await page.locator('#reason-carousel').textContent(), /やめる理由/);
      await noOverflow();
      await shot('06-sos');
      await page.getByRole('button', { name: '乗り越えた！' }).click();
      await page.locator('#sheet').getByRole('button', { name: '4', exact: true }).click();
      await page.locator('#sheet').getByRole('button', { name: '退屈' }).click();
      await page.getByRole('button', { name: '記録する' }).click();
      await page.waitForURL(/#\/$/);
      await page.getByText('乗り越えました！ これで 1 回目です').waitFor();
    });

    await step('日記を書く', async () => {
      await page.getByRole('link', { name: '日記' }).click();
      await page.waitForURL(/#\/journal$/);
      await page.getByRole('button', { name: '✏️ 今の気持ちを書く' }).click();
      await page.locator('#sheet').getByRole('button', { name: 'いい感じ' }).click();
      await page.locator('#journal-text').fill('SOSで呼吸したら落ち着いた。\n明日も続ける。');
      await page.getByRole('button', { name: '保存する' }).click();
      await page.locator('.entry').first().waitFor();
      assert.match(await page.locator('.entry p').first().textContent(), /呼吸したら落ち着いた/);
      await shot('07-journal');
    });

    await step('記録（カレンダー・統計）', async () => {
      await page.getByRole('link', { name: '記録' }).click();
      await page.waitForURL(/#\/records$/);
      await page.locator('.day.today').waitFor();
      // 10日前から開始 → 今月の「今日より前」の日はクリーン（月初をまたぐ場合はその分だけ）
      const expectedClean = await page.evaluate(() => Math.min(9, new Date().getDate() - 1));
      assert.ok(await page.locator('.day.clean').count() >= expectedClean);
      assert.ok(await page.locator('.day.today.relapse').count() === 1, '今日はスリップ日として表示');
      assert.equal(await page.locator('.bar-row').count(), 2); // ストレス・退屈
      await noOverflow();
      await shot('08-records');
      await page.locator('.day.today').click();
      await page.locator('#sheet').getByText('今日の誓い').waitFor();
      await closeSheet();
    });

    await step('設定: ダークテーマ', async () => {
      await page.getByRole('link', { name: '設定' }).click();
      await page.getByRole('button', { name: 'ダーク' }).click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
      await noOverflow();
      await shot('09-settings-dark');
      await page.goto(`${base}#/`);
      await page.locator('.habit-card').waitFor();
      await shot('10-home-dark');
      await page.goto(`${base}#/settings`);
      await page.getByRole('button', { name: '自動' }).click();
    });

    let backupPath;
    await step('バックアップ書き出し → 全削除 → 復元', async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /バックアップを書き出す/ }).click(),
      ]);
      backupPath = path.join(shotDir, 'backup.json');
      await download.saveAs(backupPath);
      const backup = JSON.parse(await readFile(backupPath, 'utf8'));
      assert.equal(backup.app, 'yamelog');
      assert.equal(backup.habits.length, 1);

      await page.getByRole('button', { name: /すべてのデータを削除/ }).click();
      await page.locator('#sheet').getByRole('button', { name: 'すべて削除' }).click();
      await page.waitForURL(/#\/welcome$/);

      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'バックアップから復元する' }).click(),
      ]);
      await chooser.setFiles(backupPath);
      await page.waitForURL(/#\/$/);
      await page.locator('.habit-card').waitFor();
      const data = await page.evaluate(() => JSON.parse(localStorage.getItem('yamelog:v1')));
      assert.equal(data.habits[0].history.length, 1);
      assert.equal(data.journal.length, 1);
      assert.equal(data.urges.length, 1);
    });

    await step('マイルストーン到達でお祝い', async () => {
      await page.evaluate((DAY) => {
        const d = JSON.parse(localStorage.getItem('yamelog:v1'));
        d.habits.push({ id: 'h_sns', name: 'SNS', emoji: '📱', color: '#4c8bf5', startedAt: Date.now() - DAY - 60000, createdAt: Date.now() - DAY * 2, costPerDay: 0, minutesPerDay: 120, reasons: [], history: [], relapses: [], celebrated: 0 });
        localStorage.setItem('yamelog:v1', JSON.stringify(d));
      }, DAY);
      await page.reload();
      await page.locator('.celebrate').waitFor();
      assert.match(await page.locator('.celebrate h2').textContent(), /SNSをやめて1日！/);
      await shot('11-celebrate');
      await closeSheet();
      const celebrated = await page.evaluate(() => JSON.parse(localStorage.getItem('yamelog:v1')).habits.find((h) => h.id === 'h_sns').celebrated);
      assert.equal(celebrated, 1);
      await page.waitForTimeout(1200);
      assert.equal(await page.locator('#sheet').isHidden(), true, '同じマイルストーンを二度お祝いしない');
    });

    await step('夜の振り返り（17時以降）', async () => {
      const evening = await page.evaluate(() => new Date().setHours(21, 0, 0, 0)); // ページのタイムゾーンで今日の21時
      await page.clock.install({ time: evening });
      await page.reload();
      await page.getByRole('button', { name: 'やめられた！' }).click();
      await page.getByText('今日もやめられました！').waitFor();
    });

    await step('PWA: マニフェストと Service Worker、オフライン起動', async () => {
      const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
      assert.equal(manifest.display, 'standalone');
      assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload(); // SW の管理下で読み込み直す
      assert.ok(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
      await context.setOffline(true);
      await page.reload();
      await page.locator('.habit-card').first().waitFor();
      await page.goto(`${base}#/records`);
      await page.locator('.calendar').waitFor();
      await context.setOffline(false);
    });

    await step('小さい画面（320px）でも崩れない', async () => {
      await page.setViewportSize({ width: 320, height: 640 });
      for (const r of ['#/', '#/records', '#/settings', '#/new', '#/sos']) {
        await page.goto(`${base}${r}`);
        await page.waitForTimeout(150);
        await noOverflow();
      }
      await page.goto(`${base}#/`);
      await shot('12-home-320');
    });

    assert.deepEqual(errors, [], `コンソールエラー:\n${errors.join('\n')}`);
    console.log(`\n✅ E2E: ${steps.length} ステップすべて成功（スクリーンショット: ${shotDir}）`);
  } catch (e) {
    await shot('zz-failure').catch(() => {});
    console.log('FAILED');
    console.error(e);
    if (errors.length) console.error('ブラウザのエラー:\n' + errors.join('\n'));
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main();

// Mock family only; exercise parent controls without changing production rules or balances.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL, output = process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(':3443')); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP 14.103.24.55 127.0.0.1'] });
let role = 'parent', amount = 1, fail = false, stateReads = 0; const errors = [], changes = [];
const state = () => ({ today: '2026-11-20', viewer: { id: '11111111-1111-4111-8111-111111111111', name: '模拟账号', username: 'qa', role }, books: [], logs: [], homeworkRewardRules: { dailyPoints: amount }, rules: { dailyPoints: 2, backfillCounts: false, milestones: [] }, stats: { days: 0, minutes: 0, pages: 0, currentStreak: 0, bestStreak: 0, booksFinished: 0 }, growth: { balance: 1, earned: 1, ledger: [{ id: 'old-credit', date: '2026-11-20', points: 1, label: '当天作业完成', kind: 'homework' }] }, wishes: [], rewards: [], redemptions: [], calendar: [], reviewBudget: { used: 0, limit: 20 }, hasMore: false });
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.on('pageerror', e => errors.push(e.message));
 await page.route('**/assistant-api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path.endsWith('/status')) return send({ authenticated: true, available: true, accounts: true, viewer: state().viewer, speech: true });
  if (path.endsWith('/reading/state')) { stateReads++; return send(state()); }
  if (path.endsWith('/homework-rules')) {
   assert.equal(route.request().method(), 'PATCH'); assert.equal(role, 'parent'); const data = route.request().postDataJSON(); changes.push(data);
   assert.deepEqual(Object.keys(data), ['dailyPoints']);
   if (fail) return send({ error: '模拟保存失败，填写仍保留。' }, 503);
   amount = data.dailyPoints; return send({ dailyPoints: amount });
  }
  if (path.endsWith('/memories')) return send({ items: [] });
  if (path.endsWith('/learning/state')) return send({ date: new URL(route.request().url()).searchParams.get('date'), status: 'empty', report: null, uploads: [], dates: [], pending: false });
  throw Error('Unexpected mock API: ' + path);
 });
 await page.goto(base + '/reading/?view=manage', { waitUntil: 'networkidle' });
 const section = page.locator('.homework-reward-settings'), input = section.getByLabel('每日作业奖励（个小脚步）', { exact: true }), save = section.getByRole('button', { name: '保存作业奖励', exact: true });
 await input.waitFor(); assert.equal(await input.inputValue(), '1'); assert.ok(await save.isDisabled());
 for (const invalid of ['', '-1', '1.5', '101']) { await input.fill(invalid); assert.ok(await save.isDisabled()); }
 await input.fill('3'); fail = true; await save.click(); await page.getByRole('alert').filter({ hasText: '保存失败' }).waitFor(); assert.equal(await input.inputValue(), '3');
 fail = false; await save.click(); await section.getByText('当前：每天作业全部做完，攒', { exact: false }).waitFor();
 assert.equal(amount, 3); await page.reload(); await input.waitFor(); assert.equal(await input.inputValue(), '3');
 // Background polling must not overwrite a parent's unsaved amount.
 await input.fill('5'); amount = 2; const before = stateReads;
 await page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/reading/state'));
 assert.ok(stateReads > before); assert.equal(await input.inputValue(), '5');
 await save.click(); await page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/reading/state')).catch(() => {});
 assert.equal(amount, 5);
 await input.fill('0'); await save.click(); await section.getByText('当前已关闭作业完成奖励。', { exact: true }).waitFor();
 for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
  await page.setViewportSize(viewport); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await section.scrollIntoViewIfNeeded(); await page.screenshot({ path: output + `/parent-homework-settings-${viewport.width}.png` });
 }
 await page.goto(base + '/reading/?view=growth', { waitUntil: 'networkidle' });
 await page.getByText('家长暂时关闭了作业完成奖励，已攒的小脚步会保留。', { exact: true }).waitFor();
 amount = 5; role = 'child'; await page.reload();
 await page.locator('.reading-homework-reward .reading-token').filter({ hasText: '+5' }).waitFor();
 assert.equal(await page.locator('.homework-reward-settings').count(), 0); assert.equal(await page.getByRole('button', { name: '保存作业奖励', exact: true }).count(), 0);
 await page.getByText('小脚步明细 · 累计攒了1个小脚步', { exact: true }).click();
 assert.ok((await page.locator('.reading-ledger').innerText()).includes('+1')); assert.deepEqual(errors, []);
 console.log('HOMEWORK_REWARD_SETTINGS_UI_OK=true parent-only,default-one,validation,retry-keeps-draft,save-refresh,zero-disables,live-child-rule,old-credit-preserved,poll-preserves-unsaved,phone-tablet-desktop');
} finally { await browser.close(); }

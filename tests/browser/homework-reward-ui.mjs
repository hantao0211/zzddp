// Invented completion and ledger records only; never awards on the production family.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL, output = process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(':3443')); await mkdir(output, { recursive: true });
const viewer = { id: '11111111-1111-4111-8111-111111111111', username: 'qa-child', name: '模拟孩子', role: 'child' };
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP 14.103.24.55 127.0.0.1'] });
let earned = false, writes = 0; const errors = [];
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.on('pageerror', e => errors.push(e.message));
 await page.route('**/assistant-api/**', async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname;
  const send = v => route.fulfill({ contentType: 'application/json', body: JSON.stringify(v) });
  if (req.method() !== 'GET') { writes++; throw Error('Reward UI must never write points'); }
  if (path.endsWith('/status')) return send({ authenticated: true, available: true, accounts: true, viewer, speech: true });
  if (path.endsWith('/memories')) return send({ items: [] });
  if (path.endsWith('/homework-context')) return send({ date: '2026-11-20', revision: 1, entries: [], availableDates: [], familyNotes: [], hasMaterials: true });
  if (path.endsWith('/reading/state')) return send({ today: '2026-11-20', viewer, books: [], logs: [], rules: { dailyPoints: 2, backfillCounts: false, milestones: [] }, stats: { days: 0, minutes: 0, pages: 0, currentStreak: 0, bestStreak: 0, booksFinished: 0 }, growth: { balance: earned ? 1 : 0, earned: earned ? 1 : 0, ledger: earned ? [{ id: 'synthetic-credit', date: '2026-11-20', points: 1, label: '当天作业完成', kind: 'homework' }] : [] }, wishes: [], rewards: [], redemptions: [], calendar: [], reviewBudget: { used: 0, limit: 20 }, hasMore: false });
  if (path.endsWith('/learning/state')) { const date = url.searchParams.get('date'); return send({ date, status: 'processed', pending: false, note: '', dates: [date], quota: { calls: 0, limit: 60 }, homeworkReward: { eligible: true, earned, points: 1 }, uploads: ['memo', 'homework'].map(kind => ({ id: kind, date, kind, status: 'processed', files: [{ stored: true, pages: [], name: 'synthetic.jpg' }], subjects: [], issues: [] })), report: { date, memoId: 'memo', tasks: [{ id: 'task', subject: '数学', title: '数学P74', requirement: '模拟数学练习', format: 'written', coverage: 'complete', evidence: [], memoEvidence: [], missing: [], writtenCompletion: { version: 'written-v2', status: 'done', reason: '模拟做完', parts: [] } }], unclassified: [], unassigned: [], uncertainties: [], familyNotes: [], updatedAt: '' } }); }
  throw Error('Unexpected QA path: ' + path);
 });
 await page.goto(base + '/?studyDate=2026-11-20', { waitUntil: 'networkidle' });
 const card = page.locator('.study-homework-reward'); await card.waitFor(); assert.match(await card.innerText(), /当天作业全部做完/); assert.match(await card.innerText(), /\+1/);
 earned = true; await page.evaluate(() => window.dispatchEvent(new Event('xiaobu:homework-updated')));
 await card.filter({ hasText: '奖励已到账' }).waitFor();
 await page.locator('.study-home-companion .reading-token').filter({ hasText: '1' }).waitFor({ state: 'attached' });
 for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
  await page.setViewportSize(viewport); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: output + `/homework-credit-${viewport.width}.png` });
 }
 await page.goto(base + '/reading/?view=growth', { waitUntil: 'networkidle' });
 await page.getByRole('heading', { name: '每天作业，走一小步', exact: true }).waitFor();
 const rules = page.locator('.reading-homework-reward'); assert.match(await rules.innerText(), /每天只奖励一次/); assert.match(await rules.innerText(), /不要求全部答对/);
 await page.getByText('小脚步明细 · 累计攒了1个小脚步', { exact: true }).click();
 await page.getByText('2026-11-20 · 当天作业完成', { exact: true }).waitFor();
 assert.equal(writes, 0); assert.deepEqual(errors, []);
 console.log('HOMEWORK_REWARD_UI_OK=true one-step,earned-feedback,live-balance,combined-growth-ledger,read-only-client,phone-tablet-desktop');
} finally { await browser.close(); }

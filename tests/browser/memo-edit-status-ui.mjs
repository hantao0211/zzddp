// Invented records only: exercise repeated help clicks, correction, retry and page changes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL, output = process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(':3443')); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP 14.103.24.55 127.0.0.1'] });
const viewer = { id: '11111111-1111-4111-8111-111111111111', name: '模拟孩子', username: 'qa-child', role: 'child' };
let entry = { subject: '数学', title: '练居（字迹待确认）', requirement: '练居，第74页', format: 'written' }, revision = 1, hasPhoto = false, fail = false, conflict = false;
const initial = { ...entry }, requests = [], errors = [];
const entryId = '22222222-2222-4222-8222-222222222222:entry:1';
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
 page.on('pageerror', e => errors.push(e.message));
 await page.route('**/assistant-api/**', async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname;
  const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path.endsWith('/status')) return send({ authenticated: true, available: true, accounts: true, viewer, speech: true });
  if (path.endsWith('/memories')) return send({ items: [] });
  if (path.endsWith('/reading/state')) return send(null);
  const date = url.searchParams.get('date') || '2026-11-20';
  if (path.endsWith('/learning/state')) return send({ date, status: 'processed', pending: false, dates: [date], note: '', writtenCompletionEnabled: true, quota: { calls: 0, limit: 60 }, uploads: (hasPhoto ? ['memo', 'homework'] : ['memo']).map(kind => ({ id: kind, date, kind, status: 'processed', createdAt: '', subjects: ['数学'], aiMs: 0, issues: [], note: '', files: [{ id: kind + '-file', name: 'synthetic.jpg', stored: true, size: 100, pages: [] }] })), report: { date, memoId: 'memo', updatedAt: '', tasks: [{ id: 'test-task', ...entry, coverage: 'none', missing: [], evidence: [], memoEvidence: [], writtenCompletion: null, reviewActivity: null }], unclassified: [], uncertainties: [], unassigned: [], familyNotes: [] } });
  if (path.endsWith('/homework-context')) return send({ date, revision, hasMaterials: true, availableDates: [date], pending: false, entries: [{ ...entry, entryId }, { entryId: '22222222-2222-4222-8222-222222222222:entry:0', subject: '语文', title: '预习第20课', requirement: '预习第20课', format: 'reading' }], uncertainties: [], familyNotes: [] });
  if (path.endsWith('/memo-entries/update')) {
   const data = req.postDataJSON(); requests.push(data);
   if (fail) return send({ error: '模拟连接失败，填写仍保留。' }, 503);
   if (conflict) { conflict = false; revision++; return send({ error: '清单刚有更新，请重新读取。' }, 409); }
   assert.equal(data.revision, revision); entry = data.entry; revision++;
   return send({ id: '33333333-3333-4333-8333-333333333333', date: data.date, title: entry.title, requirement: entry.requirement, userQuote: '直接修改备忘录', createdAt: '' });
  }
  if (path.endsWith('/undo')) { entry = { ...initial }; revision++; return send({ undone: true, date }); }
  throw Error('Unexpected mock API: ' + path);
 });
 await page.goto(base + '/?studyDate=2026-11-20', { waitUntil: 'networkidle' });
 await page.getByRole('button', { name: `查看${entry.title}的完成情况`, exact: true }).waitFor();
 assert.ok((await page.getByRole('region', { name: '作业概况' }).innerText()).includes('未交照片'));
 const status = () => page.getByRole('dialog', { name: '这项作业的情况', exact: true });
 for (let i = 0; i < 6; i++) {
  await page.getByRole('button', { name: `查看${entry.title}的完成情况`, exact: true }).click();
  await status().waitFor(); assert.match(await status().innerText(), /不是要求家长/);
  await status().getByRole('button', { name: '关闭', exact: true }).click(); await status().waitFor({ state: 'hidden' });
 }
 await page.getByRole('button', { name: `修改${entry.title}`, exact: true }).click();
 const editor = () => page.getByRole('dialog', { name: '修改备忘录清单', exact: true }); await editor().waitFor();
 assert.equal(await editor().getByLabel('作业名称', { exact: true }).inputValue(), initial.title);
 const saveEdit = editor().getByRole('button', { name: '保存并重新整理', exact: true });
 assert.ok(await saveEdit.isDisabled());
 assert.ok(await editor().getByText('修改内容后即可保存。', { exact: true }).isVisible());
 assert.equal(await saveEdit.evaluate(button => getComputedStyle(button).backgroundColor), 'rgb(117, 101, 116)');
 assert.equal(await saveEdit.locator('.lucide-lock-keyhole').count(), 1);
 await editor().getByLabel('作业名称', { exact: true }).fill('数学练习册P74');
 await editor().getByLabel('作业具体要求', { exact: true }).fill('完成数学练习册第74页，不是“练居”。');
 fail = true; await editor().getByRole('button', { name: '保存并重新整理', exact: true }).click();
 const failureReceipt = editor().locator('.memo-edit-feedback').getByRole('alert').filter({ hasText: '连接失败' });
 await failureReceipt.waitFor();
 const closeBox = await editor().getByRole('button', { name: '关闭修改清单', exact: true }).boundingBox();
 const receiptBox = await failureReceipt.boundingBox();
 assert.ok(closeBox && receiptBox && closeBox.y + closeBox.height <= receiptBox.y, 'The receipt must leave the close button visible');
 assert.equal(await editor().getByLabel('作业名称', { exact: true }).inputValue(), '数学练习册P74');
 fail = false; await editor().getByRole('button', { name: '保存并重新整理', exact: true }).click(); await editor().waitFor({ state: 'hidden' });
 assert.equal(requests[0].requestId, requests[1].requestId); assert.equal(requests[1].entryId, entryId);
 await page.getByRole('button', { name: '修改数学练习册P74', exact: true }).waitFor();
 await page.reload(); await page.getByRole('button', { name: '修改数学练习册P74', exact: true }).waitFor();
 hasPhoto = true; await page.reload();
 await page.getByRole('button', { name: `查看${entry.title}的照片情况`, exact: true }).click();
 assert.match(await status().innerText(), /已经有作业照片/); assert.match(await status().innerText(), /不必重复上传/);
 await status().getByRole('button', { name: '识别有误，修改这项', exact: true }).click(); await editor().waitFor();
 await editor().getByLabel('作业具体要求', { exact: true }).fill('数学练习册第74页第一到三题。');
 conflict = true; await editor().getByRole('button', { name: '保存并重新整理', exact: true }).click();
 await editor().getByRole('button', { name: '读取最新清单，保留我的填写', exact: true }).click();
 assert.equal(await editor().getByLabel('作业具体要求', { exact: true }).inputValue(), '数学练习册第74页第一到三题。');
 await editor().getByRole('button', { name: '保存并重新整理', exact: true }).click(); await editor().waitFor({ state: 'hidden' });
 await page.getByRole('button', { name: '撤销修改', exact: true }).click(); await page.getByRole('button', { name: `修改${initial.title}`, exact: true }).waitFor();
 await page.getByRole('button', { name: '修改清单', exact: true }).click(); await editor().getByRole('button', { name: /预习第20课/ }).waitFor();
 await editor().getByRole('button', { name: '关闭修改清单', exact: true }).click();
 for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
  await page.setViewportSize(viewport); await page.waitForTimeout(50);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: `查看${entry.title}的照片情况`, exact: true }).click(); await status().waitFor();
  await page.screenshot({ path: output + `/status-${viewport.width}.png` });
  await status().getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: `修改${entry.title}`, exact: true }).click(); await editor().getByLabel('作业名称', { exact: true }).waitFor();
  const b = await editor().boundingBox(); assert.ok(b.x >= -1 && b.x + b.width <= viewport.width + 1);
  await page.screenshot({ path: output + `/edit-${viewport.width}.png` });
  await editor().getByRole('button', { name: '关闭修改清单', exact: true }).click();
 }
 await page.goto(base + '/reading/', { waitUntil: 'networkidle' }); await page.goBack({ waitUntil: 'networkidle' });
 await page.getByRole('button', { name: `查看${entry.title}的完成情况`, exact: true }).click(); await status().waitFor();
 await status().getByRole('button', { name: '关闭', exact: true }).click();
 await page.getByRole('button', { name: '查看详情', exact: true }).click(); await page.getByRole('button', { name: '修改清单', exact: true }).click(); await editor().waitFor();
 assert.deepEqual(errors, []);
 console.log('MEMO_EDIT_STATUS_UI_OK=true direct-child-edit,correct-entry,retry-idempotency,conflict-preserves-draft,save-refresh,undo,global-and-detail-entry,photo-explanations,repeated-clicks,page-back,phone-tablet-desktop');
} finally { await browser.close(); }

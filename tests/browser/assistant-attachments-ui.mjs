// Synthetic photo questions only; no production login, child documents or paid AI calls.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const base = process.env.SMOKE_BASE_URL, output = process.env.SMOKE_OUTPUT_DIR;
assert.ok(base?.endsWith(':3443')); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP 14.103.24.55 127.0.0.1'] });
const errors = [], requests = []; let mode = 'ok', uploads = 0;
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
 page.on('pageerror', e => errors.push(e.message));
 await page.route('**/assistant-api/**', async route => {
  const url = new URL(route.request().url()), path = url.pathname;
  const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path.endsWith('/status')) return send({ available: true, authenticated: true, speech: true });
  if (path.endsWith('/memories')) return send({ items: [] });
  if (path.endsWith('/reading/state')) return send(null);
  if (path.endsWith('/homework-context')) return send({ date: url.searchParams.get('date') || '2026-11-20', revision: 1, availableDates: [], hasMaterials: false, pending: false, entries: [], uncertainties: [], familyNotes: [] });
  if (path.endsWith('/learning/state')) return send({ date: '2026-11-20', status: 'empty', report: null, uploads: [], dates: [], pending: false });
  if (path.endsWith('/chat')) {
   const body = route.request().postDataJSON(); requests.push(body);
   if (mode === 'failure') return send({ error: '测试连接暂时失败，请重试。' }, 503);
   return send({ id: `synthetic-${requests.length}`, answer: body.photos?.length ? '我看到你发来的算式。我们可以从第一步一起看。' : '好的，我们继续聊。', spokenAnswer: '我们一起看第一步。', changeStatus: 'none' });
  }
  if (path.includes('/uploads')) { uploads++; throw Error('Chat must not submit homework'); }
  throw Error('Unexpected API path: ' + path);
 });
 await page.goto(base + '/?assistant=1', { waitUntil: 'networkidle' });
 const input = page.locator('#assistant-question'), files = page.getByLabel('选择对话图片', { exact: true });
 await input.waitFor(); assert.equal(await files.getAttribute('accept'), 'image/*');
 const png = await page.evaluate(() => {
  const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 1800;
  const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#222'; c.font = '100px sans-serif'; c.fillText('7 + 5 = 12', 100, 220); c.fillText('Synthetic photo', 100, 430);
  // Deterministic pencil-like marks exercise browser resizing and compression.
  for (let i = 0; i < 5000; i++) { c.fillStyle = `rgb(${i%180},${i%180},${i%180})`; c.fillRect((i*97)%1400, 600+(i*73)%1100, 2, 8); }
  return canvas.toDataURL('image/png').split(',')[1];
 });
 const fixture = name => ({ name, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
 const picker = page.waitForEvent('filechooser');
 await page.getByRole('button', { name: '添加图片，可拍照或从相册选择', exact: true }).click();
 await (await picker).setFiles(fixture('synthetic-math.png'));
 await page.getByLabel('待发送图片', { exact: true }).waitFor();
 assert.ok(!(await page.getByRole('button', { name: '发送问题', exact: true }).isDisabled()));
 await page.getByRole('button', { name: '放大图片1', exact: true }).click();
 await page.getByRole('region', { name: '图片预览' }).waitFor();
 await page.getByRole('button', { name: '返回对话', exact: true }).click();
 await page.screenshot({ path: output + '/photo-before-send-phone.png' });
 await page.getByRole('button', { name: '发送问题', exact: true }).click();
 await page.locator('.assistant-message.assistant').waitFor();
 assert.equal(requests[0].photoOrigin, 'current'); assert.equal(requests[0].photos.length, 1);
 assert.equal(requests[0].photos[0].mimeType, 'image/jpeg');
 assert.ok(Buffer.from(requests[0].photos[0].base64, 'base64').length <= 450000);
 assert.ok(requests[0].question.includes('图片')); assert.equal(uploads, 0);
 assert.equal(await page.locator('.assistant-message.user img').count(), 1);
 await input.fill('第二步呢？'); await page.getByRole('button', { name: '发送问题', exact: true }).click();
 await page.locator('.assistant-message.assistant').nth(1).waitFor();
 assert.equal(requests[1].photoOrigin, 'previous'); assert.deepEqual(requests[1].photos, requests[0].photos);
 assert.ok(requests[1].history.some(m => m.role === 'assistant'));
 await files.setInputFiles([fixture('a.png'), fixture('b.png')]);
 await page.getByText('已选 2/3 张，可加一句想问的', { exact: true }).waitFor();
 await files.setInputFiles([fixture('c.png'), fixture('d.png')]);
 await page.getByRole('alert').filter({ hasText: '最多发3张' }).waitFor();
 assert.equal(await page.locator('.assistant-photo-draft img').count(), 2);
 await files.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
 await page.getByRole('alert').filter({ hasText: '无法读取' }).waitFor();
 assert.equal(await page.locator('.assistant-photo-draft img').count(), 2);
 await files.setInputFiles(fixture('c.png')); await page.getByText('已选 3/3 张，可加一句想问的', { exact: true }).waitFor();
 await page.getByRole('button', { name: '移除图片2', exact: true }).click();
 assert.equal(await page.locator('.assistant-photo-draft img').count(), 2);
 mode = 'failure'; await input.fill('这两张图有什么不同？'); await page.getByRole('button', { name: '发送问题', exact: true }).click();
 await page.getByRole('alert').filter({ hasText: '连接暂时失败' }).waitFor();
 assert.equal(await input.inputValue(), '这两张图有什么不同？'); assert.equal(await page.locator('.assistant-photo-draft img').count(), 2);
 for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 670 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
  await page.setViewportSize(viewport); await page.waitForTimeout(100);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const panel = await page.locator('.assistant-dialog').boundingBox(), text = await input.boundingBox(), conversation = await page.locator('.assistant-messages').boundingBox();
  assert.ok(text.width >= 100); assert.ok(conversation.height >= panel.height * .45);
  assert.ok(text.y + text.height <= panel.y + panel.height);
  await page.screenshot({ path: output + `/attachments-${viewport.width}.png` });
 }
 mode = 'ok'; await page.getByRole('button', { name: '发送问题', exact: true }).click();
 await page.locator('.assistant-message.assistant').nth(2).waitFor();
 assert.equal(requests.at(-1).photos.length, 2); assert.equal(requests.at(-1).photoOrigin, 'current');
 await page.getByRole('button', { name: '不再参考上次图片', exact: true }).click();
 await input.fill('我们换个话题'); await page.getByRole('button', { name: '发送问题', exact: true }).click();
 await page.locator('.assistant-message.assistant').nth(3).waitFor(); assert.ok(!requests.at(-1).photos);
 await page.getByRole('button', { name: '更多功能', exact: true }).click();
 await page.getByRole('button', { name: '清空对话', exact: true }).click();
 await page.getByRole('button', { name: '返回对话', exact: true }).click();
 assert.equal(await page.locator('.assistant-message img').count(), 0);
 await page.reload(); await input.waitFor(); assert.equal(await page.locator('.assistant-photo-draft img').count(), 0);
 await page.goto(base + '/reading/?assistant=1', { waitUntil: 'networkidle' }); await input.waitFor();
 await files.setInputFiles(fixture('reading.png')); await page.getByLabel('待发送图片', { exact: true }).waitFor();
 await input.fill('这段话怎么理解？'); await page.getByRole('button', { name: '发送问题', exact: true }).click();
 await page.locator('.assistant-message.assistant').waitFor(); assert.equal(requests.at(-1).readingMode, true); assert.equal(requests.at(-1).photos.length, 1);
 assert.deepEqual(errors, []); assert.equal(uploads, 0);
 console.log('ASSISTANT_ATTACHMENTS_UI_OK=true native-picker,compression,preview,remove,image-only,follow-up,three-photo-limit,invalid-file,retry-preserves-photos-and-question,small-phone-tablet-desktop,clear,refresh,reading-mode,no-homework-autosubmit');
} finally { await browser.close(); }

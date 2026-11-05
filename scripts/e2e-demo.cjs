// End-to-end demo check. Run: npm run build && npx vite preview --port 4173, then: node scripts/e2e-demo.cjs /tmp/out
// Screenshots go to <dir>/shots. Exits non-zero on failure.
const { chromium } = require('playwright');
const S = process.argv[2] || '.';
const BASE = process.env.BASE_URL || 'http://localhost:4173';
require('fs').mkdirSync(S + '/shots', { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(BASE + '/');
  await p.getByRole('button', { name: 'Use the sample note' }).click();
  await p.getByRole('button', { name: 'Make roster' }).click();
  await p.getByRole('heading', { name: /Check the draft/ }).waitFor();
  await p.screenshot({ path: S + '/shots/1-draft.png', fullPage: true });
  await p.getByRole('button', { name: 'Publish sign-up link' }).click();
  await p.waitForURL(/\/c\//);
  const coordUrl = p.url();
  console.log('coord', coordUrl);
  await p.screenshot({ path: S + '/shots/2-roster.png', fullPage: true });
  const slug = coordUrl.match(/\/c\/([a-z0-9]+)/)[1];
  // volunteer in a second tab (same browser storage in demo mode)
  const v = await ctx.newPage();
  await v.goto(BASE + '/e/' + slug);
  await v.getByRole('button', { name: /Pick Griddles/ }).click();
  await v.getByLabel('Your name').fill('Test Volunteer');
  await v.getByLabel('Phone or email').fill('(408) 555-0190');
  await v.getByRole('button', { name: 'Sign me up' }).click();
  await v.getByRole('heading', { name: /signed up/ }).waitFor();
  await v.screenshot({ path: S + '/shots/3-volunteer-done.png', fullPage: true });
  // roster picks it up
  await p.bringToFront();
  await p.waitForTimeout(5500);
  const has = await p.getByText('Test Volunteer').count();
  console.log('roster shows volunteer:', has > 0);
  if (!has) throw new Error('roster did not update');
  // fill gap for syrup (students)
  const syrupCard = p.locator('.card.gap', { hasText: 'Syrup' }).first();
  await syrupCard.getByRole('button', { name: 'Fill this gap' }).click();
  await p.getByRole('heading', { name: /Messages to fill/ }).waitFor();
  const draftsText = await p.locator('section[aria-labelledby="drafts-h"]').innerText();
  console.log('--- drafts ---\n' + draftsText.slice(0, 1500));
  await p.screenshot({ path: S + '/shots/4-drafts.png', fullPage: true });
  // mark test volunteer dropped -> backfill
  await p.getByRole('group', { name: 'Actions for Test Volunteer' }).getByRole('button', { name: 'Dropped out' }).click();
  await p.getByRole('heading', { name: /Backfill messages/ }).waitFor();
  const bf = await p.locator('section[aria-labelledby="drafts-h"] .card').first().innerText();
  console.log('--- backfill first ---\n' + bf);
  await p.getByRole('button', { name: 'Simulate a volunteer signing up' }).click();
  await p.waitForTimeout(300);
  console.log('errors:', errs);
  if (errs.length) throw new Error('console errors');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

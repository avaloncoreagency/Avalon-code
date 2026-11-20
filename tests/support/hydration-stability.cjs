const assert = require('node:assert/strict');
/**
 * Regression for React #418 (intermittent hydration mismatch, see docs/recovery/REACT_418_ROOT_CAUSE.md).
 * Repeated direct navigations and reloads of the pages where it was observed, in ES at 390 px and EN at 1440 px,
 * for a product WITH a URL and one WITHOUT, plus an unauthorized session. Every page must finish hydrating; any
 * pageerror is collected by the caller's context() and fails the suite at the end.
 */
module.exports = async function hydrationStability({ db, context, miguel, outsider, origin, ids, rounds = 4 }) {
  await db.exec('reset role');
  await db.query(`update os_projects set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{operations}',
    coalesce(settings -> 'operations', '{}'::jsonb) || '{"url":"https://nova-restaurant.example.invalid"}'::jsonb) where id = $1`, [ids.withUrl]);
  const hydrated = page => page.waitForFunction(() => {
    const main = document.querySelector('#main');
    return !!main && Object.keys(main).some(k => k.startsWith('__reactFiber'));
  }, null, { timeout: 15000 });
  const pages = [
    `/admin/workspace/products/${ids.withUrl}`,
    `/admin/workspace/products/${ids.withoutUrl}`,
    `/admin/workspace/crm/clients/${ids.client}`,
    '/admin/workspace/crm/leads',
    '/admin/workspace/crm/sales',
  ];
  for (const [lang, width] of [['es', 390], ['en', 1440]]) {
    const page = await context(miguel, { width, height: 900 }, 'America/New_York', lang);
    for (const path of pages) {
      await page.goto(origin + path);
      await hydrated(page);
      assert.equal(await page.evaluate(() => document.documentElement.lang), lang, `${path} renders in ${lang}`);
      if (path.includes('/products/')) await page.getByTestId('project-context').waitFor();
      for (let i = 0; i < rounds; i++) { await page.reload(); await hydrated(page); }
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no horizontal overflow at ${width}px`);
    await page.context().close();
  }
  // Unauthorized session: redirected away from the product, without client-side errors.
  const intruder = await context(outsider, { width: 390, height: 844 });
  for (const id of [ids.withUrl, ids.withoutUrl]) {
    await intruder.goto(`${origin}/admin/workspace/products/${id}`);
    assert.doesNotMatch(new URL(intruder.url()).pathname, /\/admin\/workspace\/products\//, 'non-member cannot open a product');
    await intruder.reload();
  }
  await intruder.context().close();
};

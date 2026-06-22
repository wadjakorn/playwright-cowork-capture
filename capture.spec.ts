/**
 * capture.spec.ts — Synology DSM root-folder enumeration with PII-aware screenshots
 *
 * Deterministic Playwright spec that reproduces the flow:
 *   1. Open signin → log in with NAS_USER / NAS_PASS
 *   2. Wait for DSM desktop
 *   3. Open File Station from desktop icon
 *   4. Click each root shared folder in the left tree
 *   5. Apply PII blur, screenshot full page → ./shots/<step>.png
 *   6. Write enumeration to ./shots/metadata.json
 *
 * Run:    npm i && npx playwright install chromium && \
 *         NAS_USER=wadjakorn NAS_PASS=... npx playwright test capture.spec.ts
 * Cron:   `0 8 * * * cd /path && NAS_USER=... NAS_PASS=... npx playwright test capture.spec.ts`
 *
 * Selectors are role/text-based on purpose — DSM ExtJS renders dynamic class names
 * so anything matching `.x-grid3-cell-xxxx` is brittle.
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TARGET_URL = process.env.NAS_URL ?? 'https://wadjakorn.sg3.quickconnect.to/#/signin';
const NAS_USER = process.env.NAS_USER ?? '';
const NAS_PASS = process.env.NAS_PASS ?? '';
const SHOTS_DIR = path.join(__dirname, 'shots');

/** CSS selectors of any element that visually contains PII. Applied as `filter: blur(12px)` before each screenshot. */
const PII_SELECTORS = [
  '.syno-finder-icon-text',                          // file/folder name labels in main panel
  '[class*="finder-icon"] img[src*="thumb"]',        // photo thumbnails
  '.x-tree-node-anchor span',                        // tree-node usernames
  '[class*="header-username"]',                      // top-right account name
  '[data-pii="true"]'                                // manual escape hatch
];

const PII_CSS = `
  ${PII_SELECTORS.join(', ')} {
    filter: blur(12px) !important;
    color: transparent !important;
    text-shadow: 0 0 8px rgba(0,0,0,0.6) !important;
  }
`;

async function applyPiiBlur(page: Page): Promise<void> {
  await page.addStyleTag({ content: PII_CSS });
}

async function snap(page: Page, name: string): Promise<void> {
  await applyPiiBlur(page);
  const file = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  // eslint-disable-next-line no-console
  console.log(`  shot → ${file}`);
}

/** Click a left-tree treeitem by its accessible name. */
async function clickTreeItem(page: Page, name: string): Promise<void> {
  const node = page.getByRole('treeitem', { name });
  await node.waitFor({ state: 'visible', timeout: 10_000 });
  await node.click();
  // DSM lazy-loads grid; wait for the row count footer to settle
  await page.waitForFunction(
    () => /\d+\s+(items|รายการ)/.test(document.body.innerText),
    { timeout: 10_000 }
  );
}

/** Extract the visible folder/file labels in the active File Station panel. */
async function listVisibleItems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = new Set<string>();
    document.querySelectorAll('[class*="finder-icon"]').forEach((el) => {
      const txt = el.textContent?.trim();
      if (txt && txt.length < 80) seen.add(txt);
    });
    return Array.from(seen);
  });
}

test.beforeAll(async () => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
});

test('synology DSM — capture root directory enumeration', async ({ page }) => {
  test.setTimeout(120_000);
  page.setViewportSize({ width: 1440, height: 900 });

  // --- 1. Signin ----------------------------------------------------------
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

  // Detect whether we landed on signin form OR straight on desktop (cookie still valid).
  const onSignin = await page.locator('input[type="password"], input[name="passwd"]').first()
    .isVisible({ timeout: 5_000 }).catch(() => false);

  if (onSignin) {
    if (!NAS_USER || !NAS_PASS) {
      throw new Error('NAS_USER and NAS_PASS env vars are required for fresh signin');
    }
    await page.locator('input[type="text"], input[name="username"]').first().fill(NAS_USER);
    await page.locator('input[type="password"], input[name="passwd"]').first().fill(NAS_PASS);
    await snap(page, '01_signin_form');
    await page.getByRole('button', { name: /sign in|เข้าสู่ระบบ|登入/i }).click();
  } else {
    await snap(page, '01_signin_landing');
  }

  // --- 2. Wait for DSM desktop --------------------------------------------
  // Desktop is identified by the presence of File Station icon (treeitem in desktop menu).
  await expect(page.getByRole('menuitem', { name: /file station/i }).first())
    .toBeVisible({ timeout: 30_000 });
  await snap(page, '02_desktop');

  // --- 3. Open File Station -----------------------------------------------
  await page.getByRole('menuitem', { name: /file station/i }).first().dblclick();
  await expect(page.getByRole('treeitem', { name: /^docker$/i })).toBeVisible({ timeout: 15_000 });

  // --- 4. Enumerate root shared folders -----------------------------------
  const folders = ['docker', 'home', 'homes', 'photo'] as const;
  const enumeration: Record<string, { count: number; items: string[] }> = {};

  for (const [idx, name] of folders.entries()) {
    await clickTreeItem(page, name);
    await page.waitForTimeout(800);                  // let icons paint
    const items = await listVisibleItems(page);
    const footer = await page.locator('text=/\\d+\\s+(items|รายการ)/').first().textContent().catch(() => '');
    const count = parseInt(footer?.match(/\d+/)?.[0] ?? `${items.length}`, 10);
    enumeration[name] = { count, items };
    await snap(page, `0${idx + 3}_${name}`);
  }

  // --- 4b. Drill into /homes/<NAS_USER> -----------------------------------
  // The mission: "ค้นหาไฟล์ของ user: wadjakorn" — explicit per-user enumeration.
  const userFolder = NAS_USER || 'wadjakorn';
  await clickTreeItem(page, 'homes');
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: userFolder, exact: true }).dblclick();
  await page.waitForFunction(
    () => /\d+\s+(items|รายการ)/.test(document.body.innerText),
    { timeout: 10_000 }
  );
  await page.waitForTimeout(800);
  const userItems = await listVisibleItems(page);
  const userFooter = await page.locator('text=/\\d+\\s+(items|รายการ)/').first().textContent().catch(() => '');
  const userCount = parseInt(userFooter?.match(/\d+/)?.[0] ?? `${userItems.length}`, 10);
  await snap(page, '07_wadjakorn_home');

  // --- 5. Write metadata.json --------------------------------------------
  const meta = {
    captured_at: new Date().toISOString(),
    captured_by: 'playwright@capture.spec.ts',
    target: TARGET_URL,
    root_shared_folders: folders.map((name, i) => ({
      name,
      item_count: enumeration[name].count,
      items: enumeration[name].items,
      screenshot: `shots/0${i + 3}_${name}.png`,
    })),
    user_home_drilldown: {
      name: userFolder,
      path: `/homes/${userFolder}`,
      item_count: userCount,
      items: userItems,
      screenshot: 'shots/07_wadjakorn_home.png',
    },
  };
  fs.writeFileSync(path.join(SHOTS_DIR, 'metadata.json'), JSON.stringify(meta, null, 2));
  // eslint-disable-next-line no-console
  console.log(`  metadata → ${path.join(SHOTS_DIR, 'metadata.json')}`);

  // --- 6. Assert we got what we expected ---------------------------------
  expect(Object.keys(enumeration)).toEqual([...folders]);
  for (const name of folders) {
    expect(enumeration[name].count, `${name} should have items`).toBeGreaterThan(0);
  }
});

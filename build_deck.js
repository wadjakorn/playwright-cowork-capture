/**
 * build_deck.js — Synology DSM root-directory presentation w/ real screenshots
 * Reads ./shots/metadata.json + shots/*.png, produces ./synology_root_capture.pptx
 */
const fs = require('node:fs');
const path = require('node:path');
const pptxgen = require('pptxgenjs');

const SHOTS_DIR = process.env.SHOTS_DIR || path.resolve(__dirname, 'shots');
const META_PATH = process.env.META_PATH || path.join(SHOTS_DIR, 'metadata.json');
const OUT_FILE = process.env.OUT_FILE || path.resolve(__dirname, 'synology_root_capture.pptx');

const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
const shotExists = (p) => fs.existsSync(path.resolve(__dirname, p));

const C = {
  bg: 'F4F7FB', card: 'FFFFFF', ink: '21295C', ink2: '36465F', mute: '7A8AA0',
  deep: '065A82', teal: '1C7293', accent: '00A896',
  warn: 'D08C39', danger: 'C24545', good: '4A8A4A', divider: 'D9E0EB',
  shotBorder: 'C5D0DF'
};

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';   // 13.3 x 7.5
pres.title = 'Synology DSM — Root Directory';
pres.author = 'capture.spec.ts / playwright-mcp';

const SLIDE_W = 13.3, SLIDE_H = 7.5;
const piiColor = c => c?.startsWith('high') ? C.danger : c?.startsWith('medium') ? C.warn : C.good;
const piiLabel = c => c?.startsWith('high') ? 'PII: HIGH' : c?.startsWith('medium') ? 'PII: MEDIUM' : 'PII: LOW';
const TOTAL = 8;

function headerBar(s, eyebrow) {
  s.background = { color: C.bg };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: SLIDE_W, h: 0.45, fill: { color: C.ink }, line: { color: C.ink } });
  s.addText('SYNOLOGY DSM  /  ROOT DIRECTORY CAPTURE', { x: 0.5, y: 0.05, w: 8, h: 0.35, color: 'C9D3E5', fontSize: 10, fontFace: 'Trebuchet MS', charSpacing: 4, valign: 'middle', margin: 0 });
  s.addText(meta.captured_at.slice(0, 10), { x: SLIDE_W - 2.5, y: 0.05, w: 2, h: 0.35, color: '8DA0BF', fontSize: 10, fontFace: 'Trebuchet MS', align: 'right', valign: 'middle', margin: 0 });
  if (eyebrow) s.addText(eyebrow.toUpperCase(), { x: 0.5, y: 0.7, w: 12, h: 0.35, color: C.teal, fontSize: 11, fontFace: 'Trebuchet MS', bold: true, charSpacing: 6, margin: 0 });
}
function pageNum(s, n) {
  s.addText(`${n} / ${TOTAL}`, { x: SLIDE_W - 1.5, y: SLIDE_H - 0.4, w: 1, h: 0.25, color: C.mute, fontSize: 9, fontFace: 'Trebuchet MS', align: 'right' });
}
function addShot(s, file, x, y, w, h) {
  const p = path.resolve(__dirname, file);
  if (!fs.existsSync(p)) {
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: 'EBF1F7' }, line: { color: C.divider, width: 1 } });
    s.addText('(screenshot missing: ' + file + ')', { x, y, w, h, color: C.mute, fontSize: 11, fontFace: 'Consolas', align: 'center', valign: 'middle', margin: 0, italic: true });
    return;
  }
  // Frame: a faint background card + 1px border
  s.addShape(pres.shapes.RECTANGLE, { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, fill: { color: C.card }, line: { color: C.shotBorder, width: 1 }, shadow: { type: 'outer', color: '0F1A3A', blur: 10, offset: 2, angle: 135, opacity: 0.12 } });
  s.addImage({ path: p, x, y, w, h, sizing: { type: 'contain', w, h } });
}

// ============== SLIDE 1 — Cover ==============
{
  const s = pres.addSlide();
  s.background = { color: C.ink };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 4.5, h: SLIDE_H, fill: { color: C.deep }, line: { color: C.deep } });
  s.addShape(pres.shapes.RECTANGLE, { x: 4.5, y: 0, w: 0.05, h: SLIDE_H, fill: { color: C.accent }, line: { color: C.accent } });
  s.addText('SYNOLOGY DSM', { x: 0.6, y: 1.1, w: 3.8, h: 0.5, color: '8DA0BF', fontSize: 12, fontFace: 'Trebuchet MS', charSpacing: 8, bold: true, margin: 0 });
  s.addText('Root Directory\nCapture', { x: 0.6, y: 1.6, w: 3.8, h: 2.2, color: 'FFFFFF', fontSize: 48, fontFace: 'Georgia', bold: true, valign: 'top', margin: 0 });
  s.addText(meta.target.volume, { x: 0.6, y: 3.95, w: 3.8, h: 0.35, color: '8DA0BF', fontSize: 13, fontFace: 'Trebuchet MS', margin: 0 });
  s.addText(meta.target.volume_used_tb + ' TB used of ' + meta.target.volume_total_tb + ' TB', { x: 0.6, y: 4.3, w: 3.8, h: 0.4, color: C.accent, fontSize: 14, fontFace: 'Trebuchet MS', bold: true, margin: 0 });
  s.addText('Captured ' + meta.captured_at.slice(0, 10) + ' · ' + meta.captured_by.split(' ')[0], { x: 0.6, y: 6.7, w: 3.8, h: 0.3, color: '6B7E9F', fontSize: 10, fontFace: 'Trebuchet MS', italic: true, margin: 0 });

  // Right panel — embed the desktop shot as the hero image
  addShot(s, 'shots/02_desktop.png', 5.3, 1.0, 7.6, 4.75);

  // Root listing tree under hero
  const startY = 6.05;
  const rows = meta.root_shared_folders;
  const colW = (SLIDE_W - 5.3 - 0.3) / 4 - 0.1;
  rows.forEach((f, i) => {
    const x = 5.3 + i * (colW + 0.13);
    s.addShape(pres.shapes.RECTANGLE, { x, y: startY, w: colW, h: 1.0, fill: { color: '0F1A3A' }, line: { color: '1F2D55', width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y: startY, w: 0.06, h: 1.0, fill: { color: piiColor(f.pii_class) }, line: { color: piiColor(f.pii_class) } });
    s.addText('/' + f.name, { x: x + 0.15, y: startY + 0.1, w: colW - 0.2, h: 0.45, color: 'FFFFFF', fontSize: 16, fontFace: 'Consolas', bold: true, margin: 0 });
    s.addText(f.item_count + ' items', { x: x + 0.15, y: startY + 0.55, w: colW - 0.2, h: 0.35, color: C.accent, fontSize: 11, fontFace: 'Trebuchet MS', margin: 0 });
  });
}

// ============== SLIDE 2 — Methodology ==============
{
  const s = pres.addSlide();
  headerBar(s, 'Methodology · 6-step Playwright flow · PII blur via addStyleTag');
  s.addText('How the spec captures', { x: 0.5, y: 1.2, w: 8, h: 0.7, color: C.ink, fontSize: 32, fontFace: 'Georgia', bold: true, margin: 0 });
  s.addText('Run: NAS_USER=… NAS_PASS=… npx playwright test capture.spec.ts', { x: 0.5, y: 1.95, w: 12, h: 0.35, color: C.mute, fontSize: 12, fontFace: 'Consolas', italic: true, margin: 0 });

  const steps = meta.capture_steps;
  const cols = 3, cardW = 4.0, cardH = 2.0, gap = 0.25, startX = 0.5, startY = 2.6;
  steps.forEach((st, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const x = startX + c * (cardW + gap);
    const y = startY + r * (cardH + gap);
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: cardW, h: cardH, fill: { color: C.card }, line: { color: C.divider, width: 1 }, shadow: { type: 'outer', color: '0F1A3A', blur: 8, offset: 1, angle: 135, opacity: 0.06 } });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: cardW, h: 0.12, fill: { color: C.teal }, line: { color: C.teal } });
    s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: y + 0.3, w: 0.55, h: 0.55, fill: { color: C.deep }, line: { color: C.deep } });
    s.addText(String(st.step), { x: x + 0.3, y: y + 0.3, w: 0.55, h: 0.55, color: 'FFFFFF', fontSize: 18, fontFace: 'Georgia', bold: true, align: 'center', valign: 'middle', margin: 0 });
    s.addText(st.name, { x: x + 1.0, y: y + 0.3, w: cardW - 1.2, h: 0.5, color: C.ink, fontSize: 16, fontFace: 'Consolas', bold: true, valign: 'middle', margin: 0 });
    s.addText(st.caption, { x: x + 0.3, y: y + 1.05, w: cardW - 0.5, h: cardH - 1.2, color: C.ink2, fontSize: 11, fontFace: 'Trebuchet MS', valign: 'top', margin: 0 });
  });
  pageNum(s, 2);
}

// ============== SLIDE 3 — Auth flow (2-up: signin + desktop) ==============
{
  const s = pres.addSlide();
  headerBar(s, 'Auth · Sign in to DSM, land on desktop');
  s.addText('Auth flow', { x: 0.5, y: 1.2, w: 8, h: 0.7, color: C.ink, fontSize: 32, fontFace: 'Georgia', bold: true, margin: 0 });
  s.addText('Spec handles both pre-auth (cookie still valid) and fresh signin via env vars.', { x: 0.5, y: 1.95, w: 12, h: 0.35, color: C.mute, fontSize: 12, fontFace: 'Trebuchet MS', italic: true, margin: 0 });

  // Two columns
  const halfW = (SLIDE_W - 1.4) / 2;
  const shotY = 2.6, shotH = 3.7;
  addShot(s, 'shots/01_signin_form.png', 0.5, shotY, halfW, shotH);
  addShot(s, 'shots/02_desktop.png',     0.5 + halfW + 0.4, shotY, halfW, shotH);

  s.addText('1. Signin form', { x: 0.5, y: shotY + shotH + 0.2, w: halfW, h: 0.35, color: C.ink, fontSize: 14, fontFace: 'Consolas', bold: true, margin: 0 });
  s.addText('Username + password fields. Spec uses getByRole(\'textbox\', { name: \'Username\' }).', { x: 0.5, y: shotY + shotH + 0.55, w: halfW, h: 0.6, color: C.ink2, fontSize: 11, fontFace: 'Trebuchet MS', margin: 0 });

  s.addText('2. Desktop', { x: 0.5 + halfW + 0.4, y: shotY + shotH + 0.2, w: halfW, h: 0.35, color: C.ink, fontSize: 14, fontFace: 'Consolas', bold: true, margin: 0 });
  s.addText('DSM application launcher — 9 apps visible (File Station, Container Manager, etc.). Spec opens File Station from here.', { x: 0.5 + halfW + 0.4, y: shotY + shotH + 0.55, w: halfW, h: 0.6, color: C.ink2, fontSize: 11, fontFace: 'Trebuchet MS', margin: 0 });
  pageNum(s, 3);
}

// ============== SLIDES 4-7 — one per shared folder, with embedded shot ==============
meta.root_shared_folders.forEach((folder, idx) => {
  const s = pres.addSlide();
  headerBar(s, 'Folder ' + (idx + 1) + ' of 4');

  // Title block
  s.addText('/' + folder.name, { x: 0.5, y: 1.05, w: 6, h: 0.85, color: C.ink, fontSize: 44, fontFace: 'Consolas', bold: true, margin: 0 });
  const chipColor = piiColor(folder.pii_class);
  s.addShape(pres.shapes.RECTANGLE, { x: SLIDE_W - 3.5, y: 1.15, w: 3.0, h: 0.5, fill: { color: chipColor }, line: { color: chipColor } });
  s.addText(piiLabel(folder.pii_class), { x: SLIDE_W - 3.5, y: 1.15, w: 3.0, h: 0.5, color: 'FFFFFF', fontSize: 13, fontFace: 'Trebuchet MS', bold: true, align: 'center', valign: 'middle', charSpacing: 4, margin: 0 });
  s.addText(folder.item_count + ' items · ' + folder.purpose, { x: 0.5, y: 2.0, w: 12.3, h: 0.4, color: C.mute, fontSize: 13, fontFace: 'Trebuchet MS', italic: true, margin: 0 });

  // 2-col layout: chip listing (left), screenshot (right)
  const colTopY = 2.55;
  const colH = 4.4;
  const leftW = 5.6, rightW = 7.0, gap = 0.3;
  const leftX = 0.5, rightX = leftX + leftW + gap;

  // Left: chip listing
  const items = folder.items || folder.items_sample_folders || [];
  const chipMaxPerRow = 2;
  const chipW = (leftW - 0.15) / chipMaxPerRow, chipH = 0.45, chipGap = 0.1;
  items.forEach((item, i) => {
    if (i >= 18) return;
    const r = Math.floor(i / chipMaxPerRow), c = i % chipMaxPerRow;
    const x = leftX + c * (chipW + chipGap);
    const y = colTopY + r * (chipH + chipGap);
    const special = item.startsWith('#') || item.startsWith('.');
    const fill = special ? 'EFE3DA' : 'EBF1F7';
    const stroke = special ? 'D08C39' : C.divider;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: chipW, h: chipH, fill: { color: fill }, line: { color: stroke, width: 1 } });
    s.addShape(pres.shapes.RECTANGLE, { x: x + 0.08, y: y + 0.1, w: 0.25, h: 0.25, fill: { color: special ? 'B85042' : 'F2B339' }, line: { color: special ? 'B85042' : 'D69327' } });
    s.addText(item, { x: x + 0.45, y, w: chipW - 0.55, h: chipH, color: C.ink, fontSize: 11, fontFace: 'Consolas', valign: 'middle', margin: 0 });
  });
  if (items.length > 18) {
    s.addText('… +' + (items.length - 18) + ' more', { x: leftX, y: colTopY + Math.ceil(18 / chipMaxPerRow) * (chipH + chipGap), w: leftW, h: 0.35, color: C.mute, fontSize: 11, fontFace: 'Trebuchet MS', italic: true, margin: 0 });
  }

  // Right: embed real screenshot
  addShot(s, folder.screenshot, rightX, colTopY, rightW, colH);

  // Caption strip — show whether PII blur was applied at capture time
  const blurApplied = meta.pii_policy && meta.pii_policy.applied !== false;
  const piiSuffix = blurApplied && folder.pii_class !== 'low' ? '  ·  PII blur applied' : '  ·  raw';
  s.addText('Shot: ' + folder.screenshot + piiSuffix, {
    x: rightX, y: colTopY + colH + 0.15, w: rightW, h: 0.3,
    color: C.mute, fontSize: 10, fontFace: 'Consolas', margin: 0
  });
  pageNum(s, 4 + idx);
});

// ============== SLIDE 8 — Replay + PII policy ==============
{
  const s = pres.addSlide();
  headerBar(s, 'Replay · Cron · PII handling');
  s.addText('Re-running the capture', { x: 0.5, y: 1.2, w: 12, h: 0.7, color: C.ink, fontSize: 30, fontFace: 'Georgia', bold: true, margin: 0 });

  // Left card — commands
  const lx = 0.5, ly = 2.2, lw = 6.0, lh = 4.6;
  s.addShape(pres.shapes.RECTANGLE, { x: lx, y: ly, w: lw, h: lh, fill: { color: '0F1A3A' }, line: { color: '0F1A3A' } });
  s.addText('Local run', { x: lx + 0.3, y: ly + 0.2, w: lw - 0.6, h: 0.4, color: C.accent, fontSize: 12, fontFace: 'Trebuchet MS', charSpacing: 4, bold: true, margin: 0 });
  s.addText([
    { text: 'npm install',                                                       options: { breakLine: true } },
    { text: 'npx playwright install chromium',                                   options: { breakLine: true } },
    { text: 'NAS_USER=wadjakorn NAS_PASS=… npm run capture',                     options: { breakLine: true } },
    { text: '',                                                                  options: { breakLine: true } },
    { text: '# or, via the Playwright MCP installed today:',                     options: { color: '7A8AA0', italic: true, breakLine: true } },
    { text: '# claude prompts → browser_navigate → screenshot → done',           options: { color: '7A8AA0', italic: true, breakLine: true } },
    { text: '',                                                                  options: { breakLine: true } },
    { text: '# cron — every morning at 08:00',                                   options: { color: '7A8AA0', italic: true, breakLine: true } },
    { text: '0 8 * * * cd /opt/syno-capture && \\',                              options: { breakLine: true } },
    { text: '         NAS_USER=… NAS_PASS=… \\',                                 options: { breakLine: true } },
    { text: '         /usr/bin/npx playwright test capture.spec.ts',             options: {} }
  ], { x: lx + 0.3, y: ly + 0.7, w: lw - 0.6, h: lh - 1.0, color: 'E8EEF8', fontSize: 11, fontFace: 'Consolas', valign: 'top', margin: 0 });

  // Right card — PII policy
  const rx = 6.8, ry = 2.2, rw = SLIDE_W - rx - 0.5, rh = 4.6;
  s.addShape(pres.shapes.RECTANGLE, { x: rx, y: ry, w: rw, h: rh, fill: { color: C.card }, line: { color: C.divider, width: 1 } });
  s.addShape(pres.shapes.RECTANGLE, { x: rx, y: ry, w: 0.08, h: rh, fill: { color: C.accent }, line: { color: C.accent } });
  s.addText('PII redaction', { x: rx + 0.3, y: ry + 0.2, w: rw - 0.4, h: 0.4, color: C.deep, fontSize: 14, fontFace: 'Trebuchet MS', charSpacing: 4, bold: true, margin: 0 });
  s.addText('Before every screenshot the spec injects a stylesheet matching:', { x: rx + 0.3, y: ry + 0.7, w: rw - 0.4, h: 0.5, color: C.ink2, fontSize: 12, fontFace: 'Trebuchet MS', margin: 0 });

  s.addText([
    { text: '[aria-label^="/home"] [role="option"] *',  options: { breakLine: true } },
    { text: '[aria-label^="/homes"] [role="option"] *', options: { breakLine: true } },
    { text: '[aria-label^="/photo"] [role="option"] *', options: { breakLine: true } },
    { text: '[aria-label^="/photo"] img',               options: { breakLine: true } },
    { text: '.x-tree-node-text',                        options: { breakLine: true } },
    { text: 'button[aria-label*="wadjakorn"] .x-btn-inner', options: {} }
  ], { x: rx + 0.3, y: ry + 1.3, w: rw - 0.4, h: 2.2, color: C.ink, fontSize: 11, fontFace: 'Consolas', valign: 'top', margin: 0 });

  s.addText('Effect: filter: blur(12px) + transparent text. /docker (low PII) is not blurred — folder names there are app identifiers, not personal data.', { x: rx + 0.3, y: ry + 3.5, w: rw - 0.4, h: 1.0, color: C.mute, fontSize: 11, fontFace: 'Trebuchet MS', italic: true, margin: 0 });

  s.addText('Spec: capture.spec.ts · Config: playwright.config.ts · Bundle: playwright-mcp.mcpb', { x: 0.5, y: SLIDE_H - 0.55, w: 12.3, h: 0.3, color: C.mute, fontSize: 10, fontFace: 'Consolas', margin: 0 });
  pageNum(s, 8);
}

pres.writeFile({ fileName: OUT_FILE }).then(p => console.log('wrote', p));

/**
 * The user manual, as one PDF the shop can print and keep by the counter.
 *
 *   node scripts/build-manual.mjs
 *
 * Screens come from test/screens/manual, captured against the LOCAL stack by
 * test/manual-shots.mjs. That is deliberate: a manual gets forwarded, printed
 * and left lying around, and the real shop's customers, rates and balances
 * have no business being in it. The seeded catalogue looks like the real one
 * without being anybody's.
 *
 * Text lives in manual-content.json so the wording can be fixed without going
 * near the layout, and the layout can be redone without retyping the wording.
 *
 * Rendered through the Playwright that is already here for the smoke tests —
 * Chromium's own print engine, so what the PDF shows is what a browser shows.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const shots = path.join(appDir, 'test/screens/manual');
const outDir = path.resolve(appDir, '../deploy/manual');
fs.mkdirSync(outDir, { recursive: true });

const sections = JSON.parse(fs.readFileSync(path.join(here, 'manual-content.json'), 'utf8'));

const missing = [];
for (const s of sections) {
  for (const p of s.pages) {
    if (!fs.existsSync(path.join(shots, p.img))) missing.push(p.img);
  }
}
if (missing.length) {
  console.error('missing screenshots:', missing.join(', '));
  console.error('run: APP_EMAIL=... APP_PASSWORD=... node test/manual-shots.mjs http://127.0.0.1:8220');
  process.exit(1);
}

/** Inline, so the PDF is one file with no path assumptions inside it. */
const dataUri = (file) =>
  'data:image/png;base64,' + fs.readFileSync(path.join(shots, file)).toString('base64');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

let n = 0;
const body = sections
  .map((section) => {
    const head = `
      <section class="sec">
        <h2>${esc(section.title)}</h2>
        ${section.intro ? `<p class="lede">${esc(section.intro)}</p>` : ''}
      </section>`;
    const pages = section.pages
      .map((p) => {
        n += 1;
        return `
        <article class="screen">
          <div class="shot"><img src="${dataUri(p.img)}" alt=""></div>
          <div class="text">
            <div class="num">${n}</div>
            <h3>${esc(p.title)}</h3>
            <p class="what">${esc(p.what)}</p>
            <ol>${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
            ${p.note ? `<div class="note"><span>Dhyaan rakho</span>${esc(p.note)}</div>` : ''}
          </div>
        </article>`;
      })
      .join('');
    return head + pages;
  })
  .join('');

const contents = sections
  .map((s) => `<li><b>${esc(s.title)}</b><span>${s.pages.map((p) => esc(p.title)).join(' · ')}</span></li>`)
  .join('');

const html = `<!doctype html>
<html lang="hi-Latn">
<head>
<meta charset="utf-8">
<title>AutoLoom — Kaise Chalayein</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  :root {
    --red: #D91E2E;
    --ink: #0B0D10;
    --body: #33353D;
    --muted: #6C6E78;
    --faint: #9B9DA6;
    --line: #E3E4E8;
    --paper: #fff;
    --ground: #F1F2F5;
  }
  @page { size: A4; margin: 14mm 13mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--body);
    font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 10.5pt; line-height: 1.55;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1, h2, h3 { font-family: "Bricolage Grotesque", system-ui, sans-serif; color: var(--ink); margin: 0; }

  /* ---- cover ---- */
  .cover { height: 258mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .mark { width: 74px; height: 74px; border-radius: 18px; background: var(--ink);
          display: flex; align-items: center; justify-content: center; margin-bottom: 26px; }
  .mark span { font-family: "Bricolage Grotesque", sans-serif; font-weight: 800; font-size: 44px;
               color: var(--red); transform: skewX(-14deg); line-height: 1; }
  .cover h1 { font-size: 46pt; letter-spacing: -1.4px; line-height: 1.02; font-weight: 800; }
  .cover .tag { font-family: "IBM Plex Mono", monospace; font-size: 9pt; letter-spacing: 3px;
                color: var(--muted); margin: 14px 0 30px; }
  .cover .sub { font-size: 13pt; color: var(--body); max-width: 118mm; }
  .cover .foot { margin-top: auto; padding-top: 26px; border-top: 2px solid var(--ink);
                 display: flex; justify-content: space-between; font-size: 9pt; color: var(--muted); }

  /* ---- contents ---- */
  .toc { page-break-after: always; }
  .toc h2 { font-size: 19pt; margin-bottom: 4px; }
  .toc ol { list-style: none; padding: 0; margin: 22px 0 0; counter-reset: t; }
  .toc li { counter-increment: t; padding: 13px 0 13px 34px; border-top: 1px solid var(--line); position: relative; }
  .toc li:last-child { border-bottom: 1px solid var(--line); }
  .toc li::before { content: counter(t); position: absolute; left: 0; top: 13px;
                    font-family: "IBM Plex Mono", monospace; font-size: 9pt; color: var(--red); font-weight: 500; }
  .toc li b { display: block; font-family: "Bricolage Grotesque", sans-serif; font-size: 12.5pt; color: var(--ink); }
  .toc li span { display: block; font-size: 9pt; color: var(--muted); margin-top: 2px; }

  /* ---- section divider ---- */
  .sec { page-break-before: always; padding-bottom: 6px; margin-bottom: 14px; border-bottom: 2px solid var(--ink); }
  .sec h2 { font-size: 23pt; letter-spacing: -0.6px; }
  .sec .lede { color: var(--muted); margin: 6px 0 0; font-size: 10.5pt; max-width: 130mm; }

  /* ---- one screen ---- */
  .screen { display: flex; gap: 11mm; align-items: flex-start;
            page-break-inside: avoid; break-inside: avoid; padding: 9mm 0; border-bottom: 1px solid var(--line); }
  .screen:last-child { border-bottom: 0; }
  .shot { flex: 0 0 52mm; }
  .shot img { width: 52mm; border: 1px solid var(--line); border-radius: 7px; display: block; background: var(--ground); }
  .text { flex: 1; min-width: 0; }
  .num { font-family: "IBM Plex Mono", monospace; font-size: 8.5pt; color: var(--red); font-weight: 500; letter-spacing: 1px; }
  .text h3 { font-size: 15pt; margin: 2px 0 5px; letter-spacing: -0.3px; }
  .what { margin: 0 0 9px; color: var(--body); }
  .text ol { margin: 0; padding-left: 0; list-style: none; counter-reset: s; }
  .text ol li { counter-increment: s; position: relative; padding: 3.5px 0 3.5px 21px; font-size: 10pt; }
  .text ol li::before { content: counter(s); position: absolute; left: 0; top: 4.5px;
                        width: 14px; height: 14px; border-radius: 50%; background: var(--ground);
                        color: var(--muted); font-family: "IBM Plex Mono", monospace; font-size: 7.5pt;
                        display: flex; align-items: center; justify-content: center; }
  .note { margin-top: 10px; padding: 9px 11px; background: #FDF1F2; border-left: 3px solid var(--red);
          border-radius: 0 7px 7px 0; font-size: 9.5pt; color: var(--body); }
  .note span { display: block; font-family: "IBM Plex Mono", monospace; font-size: 7.5pt;
               letter-spacing: 1.4px; text-transform: uppercase; color: var(--red); margin-bottom: 3px; }
</style>
</head>
<body>

<div class="cover">
  <div class="mark"><span>A</span></div>
  <h1>AutoLoom<br>Kaise Chalayein</h1>
  <div class="tag">HAR GAADI KA MAAL</div>
  <p class="sub">Dukan ka poora kaam — maal aana, bill banana, kharcha, khata aur hisaab —
     ek-ek screen ke saath, waise hi jaise phone par dikhta hai.</p>
  <div class="foot">
    <span>app.theautoloom.in</span>
    <span>${esc(today)}</span>
  </div>
</div>

<div class="toc">
  <h2>Is kitaab mein</h2>
  <ol>${contents}</ol>
</div>

${body}

</body>
</html>`;

const htmlPath = path.join(outDir, 'index.html');
fs.writeFileSync(htmlPath, html, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle', timeout: 120000 });
// Google Fonts arrive over the network; printing before they land gives a PDF
// set in Times, which is not what anybody reviewed.
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);

const pdfPath = path.join(outDir, 'AutoLoom-Kaise-Chalayein.pdf');
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;font-family:IBM Plex Mono,monospace;font-size:7pt;color:#9B9DA6;padding:0 13mm;display:flex;justify-content:space-between;">' +
    '<span>AutoLoom &mdash; Kaise Chalayein</span><span class="pageNumber"></span></div>',
  margin: { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' },
});
await browser.close();

const kb = (fs.statSync(pdfPath).size / 1024).toFixed(0);
console.log(`✓ ${pdfPath}  (${kb} KB, ${n} screens)`);
console.log(`  html: ${htmlPath}`);

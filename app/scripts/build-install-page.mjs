/**
 * Build the install page served at https://app.theautoloom.in/install
 *
 *   node scripts/build-install-page.mjs
 *
 * A standalone page, not an app route: it has to open instantly on a shop
 * phone with two bars of signal, work before anything is installed, and survive
 * being forwarded on WhatsApp. So it carries no bundle — the mark is inline
 * SVG and the QR is a data URI, which means one request and no dependency on
 * the app loading at all.
 *
 * It shows one set of instructions, chosen from the user agent, because a
 * shopkeeper reading three sets will follow the wrong one. Android gets the
 * APK; iPhone gets Add to Home Screen, which only Safari can do — so the page
 * says so plainly when it is opened in Chrome on an iPhone, which is where
 * every failed iOS install actually comes from.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-generator';

import { mark } from '../../brand/system.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../deploy/install-page');
fs.mkdirSync(out, { recursive: true });

const SITE = 'https://app.theautoloom.in';
const APK = '/download/autoloom.apk';

/** QR of the page itself, so a desktop reader can hand it to a phone. */
function qrDataUri(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(6, 8);
}

const MARK = mark({ id: 'ins' }).replace(/<\?xml[^>]*\?>/, '');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>AutoLoom — phone par lagao</title>
<meta name="theme-color" content="#0B0D10">
<meta name="description" content="AutoLoom ko apne phone par lagane ka tareeka.">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #0B0D10; --paper: #FFFFFF; --ground: #EDEEF1;
    --red: #D2141E; --muted: #6F7883; --line: #DDE0E5;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font: 16px/1.5 "IBM Plex Sans", system-ui, sans-serif;
    display: flex; justify-content: center;
    padding: 24px 16px 56px;
  }
  .wrap { width: 100%; max-width: 520px; }

  header { text-align: center; margin-bottom: 26px; }
  .mark { width: 76px; height: 76px; margin: 0 auto 12px; }
  .mark svg { width: 100%; height: 100%; display: block; }
  h1 { font-family: "Bricolage Grotesque", sans-serif; font-weight: 800;
       font-size: 34px; letter-spacing: -0.5px; margin: 0; }
  .tag { font-family: "IBM Plex Mono", monospace; font-size: 11px;
         letter-spacing: 3px; color: var(--muted); margin-top: 4px; }

  .card { background: var(--paper); border: 1.5px solid var(--ink);
          border-radius: 16px; box-shadow: 3px 3px 0 var(--ink);
          padding: 22px; margin-bottom: 18px; }
  .card h2 { font-family: "Bricolage Grotesque", sans-serif; font-weight: 800;
             font-size: 21px; margin: 0 0 4px; }
  .card p.lede { color: var(--muted); margin: 0 0 18px; font-size: 15px; }

  ol { margin: 0; padding: 0; list-style: none; counter-reset: s; }
  ol li { counter-increment: s; display: flex; gap: 13px; padding: 11px 0;
          border-top: 1px solid var(--line); align-items: flex-start; }
  ol li:first-child { border-top: 0; padding-top: 0; }
  ol li::before {
    content: counter(s); flex: 0 0 25px; height: 25px; border-radius: 13px;
    background: var(--ink); color: #fff; font-size: 13px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; margin-top: 1px;
  }
  /* Only the step's own heading is a block. A <b> inside the description is
     emphasis mid-sentence and must stay inline, or "Allow" and "Settings" break
     onto lines of their own and the step stops reading as a sentence. */
  ol li > div > b { display: block; font-weight: 600; }
  ol li span b { font-weight: 700; }
  ol li span { color: var(--muted); font-size: 14px; }

  .btn { display: block; width: 100%; text-align: center; text-decoration: none;
         background: var(--red); color: #fff; font-weight: 700; font-size: 17px;
         padding: 16px; border-radius: 999px; margin-bottom: 14px; }
  .btn.ghost { background: var(--paper); color: var(--ink);
               border: 1.5px solid var(--ink); }
  .btn[aria-disabled="true"] { background: #C8CCD2; pointer-events: none; }

  /* Size and date under the download button: on a shop phone with limited data
     the size decides whether this happens now or on wifi tonight. */
  .meta { text-align: center; color: var(--muted); font-size: 13px;
          margin: -6px 0 16px; font-family: "IBM Plex Mono", monospace; }

  .warn { background: #FDF0D9; border: 1px solid #E6C68A; color: #7A5312;
          border-radius: 12px; padding: 13px 15px; font-size: 14px;
          margin-bottom: 18px; }
  .warn b { display: block; margin-bottom: 2px; }

  .qr { text-align: center; }
  .qr img { width: 190px; height: 190px; image-rendering: pixelated;
            border: 1.5px solid var(--ink); border-radius: 12px; background: #fff; }
  .url { font-family: "IBM Plex Mono", monospace; font-size: 14px;
         word-break: break-all; margin-top: 12px; }

  footer { text-align: center; color: var(--muted); font-size: 13px; margin-top: 4px; }
  footer a { color: var(--muted); }
  .hidden { display: none; }
  @media (prefers-color-scheme: dark) {
    :root { --ground: #15171B; --paper: #1C1F24; --ink: #F2F4F7; --line: #2A2E35; --muted: #8A929C; }
    body { color: #F2F4F7; }
    .card { box-shadow: 3px 3px 0 #000; border-color: #000; }
    ol li::before { background: var(--red); }
    .btn.ghost { border-color: #3A3F47; }
  }
</style>
</head>
<body>
<div class="wrap">

  <header>
    <div class="mark">${MARK}</div>
    <h1>AutoLoom</h1>
    <div class="tag">HAR GAADI KA MAAL</div>
  </header>

  <!-- ANDROID -->
  <section id="android" class="card hidden">
    <h2>Android phone</h2>
    <p class="lede">App install karo — signal na ho tab bhi chalega.</p>
    <a class="btn" id="apk" href="${APK}" download>APK download karo</a>
    <div id="apk-meta" class="meta hidden"></div>
    <ol>
      <li><div><b>Download dabao</b><span>File niche "Downloads" mein aa jayegi.</span></div></li>
      <li><div><b>File par tap karo</b><span>Phone poochega — "Is source se install karne do?" → <b>Allow</b> ya <b>Settings</b> → on kar do.</span></div></li>
      <li><div><b>Install</b><span>Ho gaya. Ab AutoLoom home screen par milega.</span></div></li>
    </ol>
  </section>

  <!-- iPHONE, in Safari -->
  <section id="ios" class="card hidden">
    <h2>iPhone</h2>
    <p class="lede">iPhone par app store waali app nahi — seedha home screen par lagti hai.</p>
    <ol>
      <li><div><b>Neeche Share ka button dabao</b><span>Teer wala nishaan (⬆️), screen ke neeche beech mein.</span></div></li>
      <li><div><b>Neeche scroll karke "Add to Home Screen"</b><span>Hindi phone par "होम स्क्रीन में जोड़ें".</span></div></li>
      <li><div><b>Add dabao</b><span>AutoLoom ka icon home screen par aa jayega — poori screen mein khulega.</span></div></li>
    </ol>
  </section>

  <!-- iPHONE, wrong browser -->
  <section id="ios-wrong" class="card hidden">
    <h2>iPhone — Safari mein kholo</h2>
    <div class="warn">
      <b>Ye Chrome hai.</b>
      iPhone par sirf Safari home screen par app laga sakta hai. Chrome mein ye option aata hi nahi.
    </div>
    <p class="lede">Neeche ka link copy karke <b>Safari</b> mein kholo, phir Share → Add to Home Screen.</p>
    <a class="btn ghost" href="${SITE}/install">${SITE.replace('https://', '')}/install</a>
  </section>

  <!-- DESKTOP -->
  <section id="desktop" class="card">
    <h2>Phone par kholo</h2>
    <p class="lede">Ye app phone ke liye hai. Neeche wala QR apne phone ke camera se scan karo.</p>
    <div class="qr">
      <img src="${qrDataUri(`${SITE}/install`)}" alt="QR — ${SITE}/install">
      <div class="url">${SITE}/install</div>
    </div>
  </section>

  <section class="card">
    <h2>Computer par chalana hai?</h2>
    <p class="lede">Counter ke computer par kuch install karne ki zaroorat nahi — browser mein hi poora chalta hai.</p>
    <a class="btn ghost" href="${SITE}">AutoLoom kholo</a>
  </section>

  <footer>
    Dikkat aaye to dukaan se poochho.<br>
    <a href="${SITE}">${SITE.replace('https://', '')}</a>
  </footer>

</div>

<script>
  // One set of instructions, picked once. A shopkeeper reading three will
  // follow the wrong one.
  (function () {
    var ua = navigator.userAgent || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) ||
      // iPadOS 13+ reports itself as a Mac; the touch points give it away.
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isAndroid = /Android/.test(ua);
    // On iOS every browser is Safari underneath, so the engine cannot tell them
    // apart — only these vendor tokens can, and only Safari proper can install.
    var iosOtherBrowser = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

    var show = function (id) { document.getElementById(id).classList.remove('hidden'); };
    var hide = function (id) { document.getElementById(id).classList.add('hidden'); };

    if (isAndroid) { show('android'); hide('desktop'); }
    else if (isIOS) { show(iosOtherBrowser ? 'ios-wrong' : 'ios'); hide('desktop'); }

    // Already installed? Then this page has nothing to offer.
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      document.querySelector('.wrap').innerHTML =
        '<header><div class="mark">${MARK.replace(/'/g, "\\'").replace(/\n/g, '')}</div>' +
        '<h1>Lag chuki hai</h1><div class="tag">HAR GAADI KA MAAL</div></header>' +
        '<section class="card"><h2>App pehle se lagi hai</h2>' +
        '<p class="lede">Aap isi app ke andar ho.</p>' +
        '<a class="btn" href="${SITE}">Aage badho</a></section>';
    }

    // If the APK has not been uploaded yet, say so instead of handing over a
    // link that downloads a 404 page named autoloom.apk.
    var apk = document.getElementById('apk');
    var meta = document.getElementById('apk-meta');
    if (apk) {
      fetch('${APK}', { method: 'HEAD' }).then(function (r) {
        if (!r.ok) {
          apk.textContent = 'APK abhi taiyaar ho rahi hai';
          apk.setAttribute('aria-disabled', 'true');
          apk.removeAttribute('href');
          return;
        }
        var mb = Number(r.headers.get('content-length') || 0) / 1048576;
        var when = r.headers.get('last-modified');
        var bits = [];
        if (mb > 0.5) bits.push(mb.toFixed(0) + ' MB');
        if (when) {
          var d = new Date(when);
          if (!isNaN(d)) bits.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
        }
        if (bits.length) { meta.textContent = bits.join('  ·  '); meta.classList.remove('hidden'); }
      }).catch(function () {});
    }
  })();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(out, 'index.html'), html, 'utf8');
console.log(`✓ ${path.relative(process.cwd(), path.join(out, 'index.html'))}  (${(html.length / 1024).toFixed(1)} KB)`);

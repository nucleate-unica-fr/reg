// Generates the whole site into ./dist from links.json (pages + QR codes).
// Run by GitHub Actions on every push and every ~10 minutes.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';

const dist = join(process.cwd(), 'dist');
const data = JSON.parse(readFileSync('links.json', 'utf8'));
const site = data.site || {};
const base = site.base || '';
const links = data.links || [];
const now = Date.now();

// ---------- validation (fails the build with a clear message) ----------
if (!/^https:\/\/[^/]+(\/.*)?$/.test(site.url || '')) throw new Error('site.url must be the public address of the site, e.g. "https://nucleate-unica-fr.github.io/reg"');
const siteUrl = site.url.replace(/\/+$/, '');
const seen = new Set();
for (const l of links) {
  const where = `link "${l.slug ?? '?'}"`;
  if (!/^[A-Za-z0-9_-]+$/.test(l.slug || '')) throw new Error(`${where}: slug may only contain letters, digits, - and _`);
  if (seen.has(l.slug)) throw new Error(`${where}: duplicate slug`);
  seen.add(l.slug);
  if (!/^https:\/\//.test(l.url || '')) throw new Error(`${where}: url must start with https://`);
  if (isNaN(Date.parse(l.deadline))) throw new Error(`${where}: invalid deadline "${l.deadline}" (use e.g. 2026-12-03T23:59:00+01:00)`);
  if (!l.title) throw new Error(`${where}: missing title`);
}

// ---------- helpers ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const js = v => JSON.stringify(v).replace(/</g, '\\u003c');
const fmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
const when = l => fmt.format(new Date(l.deadline));
const isOpen = l => now <= Date.parse(l.deadline);
const shortUrl = l => `${siteUrl}/${l.slug}/`;
const shortLabel = l => `${siteUrl.replace(/^https:\/\//, '')}/${l.slug}`;

// ---------- QR code: rounded dots, rounded "eyes", gradient ink ----------
function rr(x, y, w, r) { // rounded-square path
  const k = w - 2 * r;
  return `M${x + r} ${y}h${k}a${r} ${r} 0 0 1 ${r} ${r}v${k}a${r} ${r} 0 0 1 ${-r} ${r}h${-k}a${r} ${r} 0 0 1 ${-r} ${-r}v${-k}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}
function qrSvg(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size, m = 10, q = 4, size = (n + 2 * q) * m;
  const inEye = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  let dots = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (qr.modules.get(r, c) && !inEye(r, c))
      dots += `<circle cx="${(c + q + .5) * m}" cy="${(r + q + .5) * m}" r="${m * .5}"/>`;
  let eyes = '', pupils = '';
  for (const [er, ec] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = (ec + q) * m, y = (er + q) * m;
    eyes += `<path fill-rule="evenodd" d="${rr(x, y, 7 * m, 1.7 * m)}${rr(x + m, y + m, 5 * m, 0.9 * m)}"/>`;
    pupils += `<path d="${rr(x + 2 * m, y + 2 * m, 3 * m, 0.85 * m)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1024" height="1024" role="img" aria-label="QR code">
<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${size}" y2="${size}"><stop offset="0" stop-color="#1b2d9c"/><stop offset="1" stop-color="#0a7a8a"/></linearGradient></defs>
<rect width="${size}" height="${size}" rx="${2.4 * m}" fill="#fff"/>
<g fill="url(#g)">${dots}${eyes}</g><g fill="#0e1b33">${pupils}</g></svg>`;
}

// ---------- shared page shell ----------
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&display=swap" rel="stylesheet">`;
const CSS = `
:root{--bg:#f4f6fb;--surface:#fff;--ink:#0e1b33;--muted:#5d6b82;--line:#e1e7f2;--accent:#1f46d6;--accent2:#0a8a9a;--chip:#e9efff;--ok:#0c7a52;--okbg:#e2f6ee;--shadow:0 1px 2px rgba(14,27,51,.05),0 12px 32px -12px rgba(14,27,51,.18)}
@media(prefers-color-scheme:dark){:root{--bg:#080e1b;--surface:#101a2e;--ink:#e9eef9;--muted:#93a0b8;--line:#1f2b45;--accent:#86a6ff;--accent2:#4fd1d9;--chip:#1a2848;--ok:#4fd6a0;--okbg:#10332a;--shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px -12px rgba(0,0,0,.6)}}
*{box-sizing:border-box}
body{margin:0;color:var(--ink);font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);
 background-image:radial-gradient(60rem 28rem at 85% -10%,color-mix(in srgb,var(--accent) 16%,transparent),transparent),radial-gradient(40rem 22rem at -10% 0%,color-mix(in srgb,var(--accent2) 14%,transparent),transparent);background-repeat:no-repeat}
a{color:var(--accent)}
main{max-width:860px;margin:0 auto;padding:72px 20px 96px}
header{margin-bottom:44px}
.eyebrow{display:inline-block;font-size:.8rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);background:var(--chip);padding:5px 12px;border-radius:99px;margin-bottom:18px}
h1{font:700 clamp(2.3rem,7vw,3.6rem)/1.04 "Bricolage Grotesque",system-ui,sans-serif;letter-spacing:-.03em;margin:0 0 10px;
 background:linear-gradient(100deg,var(--ink) 30%,var(--accent) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--muted);margin:0;font-size:1.1rem}
ul.cards{list-style:none;margin:0;padding:0;display:grid;gap:22px}
.card{display:grid;grid-template-columns:200px 1fr;gap:28px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:26px;padding:24px;box-shadow:var(--shadow)}
.qr{background:#fff;border-radius:20px;padding:6px;box-shadow:0 0 0 1px #e6ebf5,0 10px 24px -10px rgba(27,45,156,.35)}
.qr img{display:block;width:100%;height:auto;border-radius:16px}
.badge{display:inline-flex;align-items:center;gap:7px;font-size:.82rem;font-weight:600;color:var(--ok);background:var(--okbg);padding:4px 11px;border-radius:99px}
.badge::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
h2{font:700 1.4rem/1.2 "Bricolage Grotesque",system-ui,sans-serif;letter-spacing:-.015em;margin:12px 0 8px}
.desc{color:var(--muted);font-size:.97rem;margin:0 0 14px;white-space:pre-line;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.link{display:flex;align-items:center;gap:8px;max-width:100%;margin-bottom:16px}
.link code{font:.86rem ui-monospace,Menlo,Consolas,monospace;color:var(--muted);background:var(--bg);border:1px solid var(--line);padding:6px 10px;border-radius:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.actions{display:flex;flex-wrap:wrap;gap:10px}
.btn{font:600 .92rem system-ui,sans-serif;display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);text-decoration:none;cursor:pointer;transition:transform .12s,border-color .12s,background .12s}
.btn:hover{border-color:var(--accent);transform:translateY(-1px)}
.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.btn.primary{background:linear-gradient(100deg,var(--accent),var(--accent2));color:#fff;border-color:transparent}
.btn.sm{padding:6px 11px;font-size:.82rem;border-radius:10px;flex:none}
.closed-card{opacity:.62;display:block;padding:18px 24px;border-radius:20px;box-shadow:none}
.closed-card .badge{color:var(--muted);background:var(--chip)}
.closed-card h2{font-size:1.1rem;margin:8px 0 2px;text-decoration:line-through;text-decoration-thickness:1px}
.closed-card p{margin:0;color:var(--muted);font-size:.9rem}
.empty{color:var(--muted);text-align:center;padding:40px 0}
.center{min-height:100vh;display:grid;place-items:center;text-align:center;padding:20px}
.center h1{font-size:1.8rem;-webkit-text-fill-color:var(--ink);background:none;color:var(--ink)}.center p{color:var(--muted);margin:0 0 20px}
@media(max-width:640px){.card{grid-template-columns:1fr;gap:20px;padding:20px}.qr{max-width:230px;margin:0 auto}}
`;
const page = ({ title, head = '', body, noindex = false }) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<title>${esc(title)}</title>${FONTS}${head}<style>${CSS}</style></head>
<body>${body}</body></html>`;
const write = (path, content) => { mkdirSync(join(dist, ...path.split('/').slice(0, -1)), { recursive: true }); writeFileSync(join(dist, path), content); };

// ---------- build ----------
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, '.nojekyll'), '');

// Landing page
const sorted = [...links].sort((a, b) => (isOpen(b) - isOpen(a)) || (Date.parse(a.deadline) - Date.parse(b.deadline)));
const cards = sorted.map(l => {
  if (!isOpen(l)) return `<li class="card closed-card"><span class="badge">Closed</span><h2>${esc(l.title)}</h2><p>Registration closed on ${esc(when(l))}</p></li>`;
  const fileBase = `${site.fileName || 'nucleate'}-${l.slug}-qr`;
  return `<li class="card">
<div class="qr"><img src="${esc(l.slug)}/qr.svg" alt="QR code for ${esc(l.title)}" width="400" height="400" loading="lazy"></div>
<div>
<span class="badge">Open until ${esc(when(l))}</span>
<h2>${esc(l.title)}</h2>
${l.description ? `<p class="desc">${esc(l.description)}</p>` : ''}
<div class="link"><code>${esc(shortLabel(l))}</code><button class="btn sm" data-copy="${esc(shortUrl(l))}">Copy</button></div>
<div class="actions">
<a class="btn primary" href="${esc(l.slug)}/">Register →</a>
<button class="btn" data-png="${esc(l.slug)}/qr.svg" data-name="${esc(fileBase)}">⬇ QR as PNG</button>
<a class="btn" href="${esc(l.slug)}/qr.svg" download="${esc(fileBase)}.svg">⬇ QR as SVG</a>
</div></div></li>`;
}).join('\n');

write('index.html', page({
  title: `${site.title || 'Registration'} – Registration`,
  body: `<main><header><span class="eyebrow">${esc(site.subtitle || 'Registration')}</span><h1>${esc(site.title || 'Registration')}</h1>
<p class="sub">Scan a code or tap a link to register.</p></header>
<ul class="cards">${cards || '<li class="empty">No registrations at the moment.</li>'}</ul></main>
<script>
document.addEventListener('click', async function (e) {
  var c = e.target.closest('[data-copy]');
  if (c) {
    var old = c.textContent;
    try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = 'Copied ✓'; setTimeout(function () { c.textContent = old; }, 1600); }
    catch (err) { window.prompt('Copy this link:', c.dataset.copy); }
    return;
  }
  var d = e.target.closest('[data-png]');
  if (d) {
    var img = new Image();
    img.onload = function () {
      var S = 1600, cv = document.createElement('canvas'); cv.width = cv.height = S;
      cv.getContext('2d').drawImage(img, 0, 0, S, S);
      cv.toBlob(function (b) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = d.dataset.name + '.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
      }, 'image/png');
    };
    img.src = d.dataset.png;
  }
});
</script>`
}));

// One folder per link (+ its QR code)
const closedBody = l => `<div class="center"><div><h1>Registration closed</h1>
<p>“${esc(l.title)}” closed on ${esc(when(l))}.</p><a href="../">See all registration links</a></div></div>`;
for (const l of links) {
  if (!isOpen(l)) { write(`${l.slug}/index.html`, page({ title: 'Registration closed', body: closedBody(l), noindex: true })); continue; }
  write(`${l.slug}/qr.svg`, qrSvg(shortUrl(l)));
  write(`${l.slug}/index.html`, page({
    title: 'Redirecting…', noindex: true,
    head: `<noscript><meta http-equiv="refresh" content="0;url=${esc(l.url)}"></noscript>`,
    body: `<div class="center"><div><h1 id="h">Redirecting…</h1><p id="p">${esc(l.title)}</p>
<a id="go" href="${esc(l.url)}">Continue to the form</a></div></div>
<script>
(async function () {
  var deadline = ${js(Date.parse(l.deadline))}, url = ${js(l.url)}, now = Date.now();
  try {
    var r = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' });
    var d = Date.parse(r.headers.get('Date'));
    if (!isNaN(d)) now = d + (parseInt(r.headers.get('Age') || '0', 10) || 0) * 1000;
  } catch (e) {}
  if (now > deadline) {
    document.getElementById('h').textContent = 'Registration closed';
    document.getElementById('p').textContent = ${js(`“${l.title}” closed on ${when(l)}.`)};
    document.getElementById('go').href = '../';
    document.getElementById('go').textContent = 'See all registration links';
  } else { location.replace(url); }
})();
</script>`
  }));
}

write('404.html', page({
  title: 'Link not found', noindex: true,
  body: `<div class="center"><div><h1>Link not found</h1><p>This registration link does not exist.</p>
<a href="${esc(base)}/">See all registration links</a></div></div>`
}));

console.log(`Built ${links.length} link(s): ${links.filter(isOpen).length} open, ${links.filter(l => !isOpen(l)).length} closed.`);

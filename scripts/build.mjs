// Generates the whole site into ./dist from links.json.
// Run by GitHub Actions on every push and every ~10 minutes.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const data = JSON.parse(readFileSync('links.json', 'utf8'));
const site = data.site || {};
const base = site.base || '';
const links = data.links || [];
const now = Date.now();

// ---------- validation (fails the build with a clear message) ----------
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

const CSS = `
:root{--bg:#f6f8fb;--ink:#0e1b33;--muted:#5d6b82;--line:#d9e0ec;--accent:#1f4fd8;--closed:#98a3b6}
@media(prefers-color-scheme:dark){:root{--bg:#0b1220;--ink:#e8edf7;--muted:#93a0b8;--line:#243049;--accent:#7fa2ff;--closed:#5b6780}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
main{max-width:640px;margin:0 auto;padding:64px 20px 80px}
h1{font-size:clamp(2rem,6vw,2.8rem);line-height:1.1;margin:0 0 6px;letter-spacing:-.02em}
.sub{color:var(--muted);margin:0 0 40px}
ul{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
li{border-bottom:1px solid var(--line)}
.row{display:grid;grid-template-columns:1fr auto;gap:4px 16px;padding:20px 4px;color:inherit;text-decoration:none}
a.row:hover .name,a.row:focus-visible .name{color:var(--accent)}
a.row:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.name{font-weight:650;font-size:1.1rem}
.path{color:var(--muted);font-size:.9rem;font-family:ui-monospace,Menlo,Consolas,monospace}
.desc{grid-column:1;color:var(--muted);font-size:.95rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.when{grid-row:1/span 2;grid-column:2;text-align:right;font-size:.88rem;color:var(--muted);align-self:center}
.closed .name,.closed .desc,.closed .path{color:var(--closed)}
.closed .name{text-decoration:line-through;text-decoration-thickness:1px}
.empty{color:var(--muted);padding:24px 4px}
.center{min-height:100vh;display:grid;place-items:center;text-align:center;padding:20px}
.center h1{font-size:1.6rem}.center p{color:var(--muted);margin:0 0 20px}
`;

const page = ({ title, head = '', body, noindex = false }) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<title>${esc(title)}</title>${head}<style>${CSS}</style></head>
<body>${body}</body></html>`;

const write = (path, html) => { mkdirSync(join(dist, ...path.split('/').slice(0, -1)), { recursive: true }); writeFileSync(join(dist, path), html); };

// ---------- build ----------
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, '.nojekyll'), '');

// Landing page
const sorted = [...links].sort((a, b) => (isOpen(b) - isOpen(a)) || (Date.parse(a.deadline) - Date.parse(b.deadline)));
const rows = sorted.map(l => {
  const open = isOpen(l);
  const inner = `<div><span class="name">${esc(l.title)}</span><br><span class="path">${esc((site.pathLabel || 'nucleate-unica-fr') + '/' + l.slug)}</span></div>` +
    (l.description ? `<span class="desc">${esc(l.description)}</span>` : '') +
    `<span class="when">${open ? 'Open until ' + esc(when(l)) : 'Closed'}</span>`;
  return open ? `<li><a class="row" href="${esc(l.slug)}/">${inner}</a></li>`
              : `<li><div class="row closed">${inner}</div></li>`;
}).join('\n');
write('index.html', page({
  title: `${site.title || 'Registration'} – Registration`,
  body: `<main><h1>${esc(site.title || 'Registration')}</h1><p class="sub">${esc(site.subtitle || '')}</p>
<ul>${rows || '<li class="empty">No registrations at the moment.</li>'}</ul></main>`
}));

// One folder per link
const closedBody = l => `<div class="center"><div><h1>Registration closed</h1>
<p>“${esc(l.title)}” closed on ${esc(when(l))}.</p><a href="../">See all registration links</a></div></div>`;

for (const l of links) {
  if (!isOpen(l)) {
    write(`${l.slug}/index.html`, page({ title: 'Registration closed', body: closedBody(l), noindex: true }));
    continue;
  }
  // Still open at build time: redirect, but re-check the deadline against SERVER time
  // (Date header), so the link also closes exactly on time between two rebuilds.
  write(`${l.slug}/index.html`, page({
    title: 'Redirecting…',
    noindex: true,
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

// Unknown links
write('404.html', page({
  title: 'Link not found', noindex: true,
  body: `<div class="center"><div><h1>Link not found</h1><p>This registration link does not exist.</p>
<a href="${esc(base)}/">See all registration links</a></div></div>`
}));

console.log(`Built ${links.length} link(s): ${links.filter(isOpen).length} open, ${links.filter(l => !isOpen(l)).length} closed.`);

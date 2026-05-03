#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'meta', 'projects.json');
const CSS = path.join(ROOT, 'styles', 'landing.css');
const PROJECTS_DIR = path.join(ROOT, 'projects');
const OUTPUT = path.join(ROOT, 'index.html');

const SITE_NAME = 'Batty.Dev';
const TAGLINE = 'Building small things on the side.';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d)) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function validateEntry(p, i, warnings) {
  const required = ['slug', 'title', 'description', 'date'];
  for (const k of required) {
    if (typeof p[k] !== 'string' || !p[k].trim()) {
      throw new Error(`projects[${i}] missing or invalid "${k}"`);
    }
  }
  if (p.tags !== undefined && !Array.isArray(p.tags)) {
    throw new Error(`projects[${i}] "tags" must be an array`);
  }
  if (p.url !== undefined) {
    if (typeof p.url !== 'string' || !/^https?:\/\//i.test(p.url)) {
      throw new Error(`projects[${i}] "url" must be an http(s) URL`);
    }
    return;
  }
  const file = path.join(PROJECTS_DIR, p.slug, 'index.html');
  if (!fs.existsSync(file)) {
    warnings.push(`missing: projects/${p.slug}/index.html`);
    return;
  }
  const html = fs.readFileSync(file, 'utf8');
  if (!html.trim()) {
    warnings.push(`empty: projects/${p.slug}/index.html`);
  } else if (!/<html[\s>]/i.test(html) || !/<\/html\s*>/i.test(html)) {
    warnings.push(`malformed (missing <html> tags): projects/${p.slug}/index.html`);
  }
}

function renderTags(tags) {
  if (!tags || !tags.length) return '';
  const chips = tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  return `<div class="tags">${chips}</div>`;
}

function renderCard(p) {
  const isExt = !!p.url;
  const href = isExt ? p.url : `projects/${encodeURIComponent(p.slug)}/index.html`;
  const attrs = isExt ? ' target="_blank" rel="noopener"' : '';
  const mark = isExt ? ' <span class="ext-mark" aria-hidden="true">↗</span>' : '';
  return `      <a class="card" href="${escapeHtml(href)}"${attrs}>
        <h2>${escapeHtml(p.title)}${mark}</h2>
        <p class="desc">${escapeHtml(p.description)}</p>
        <div class="meta">
          <time datetime="${escapeHtml(p.date)}">${escapeHtml(formatDate(p.date))}</time>
          ${renderTags(p.tags)}
        </div>
      </a>`;
}

function buildHtml(projects, css) {
  const cards = projects.map(renderCard).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(SITE_NAME)}</title>
  <meta name="description" content="${escapeHtml(TAGLINE)}">
  <style>
${css}
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(SITE_NAME)}</h1>
    <p class="tagline">${escapeHtml(TAGLINE)}</p>
  </header>
  <main>
${cards}
  </main>
</body>
</html>
`;
}

function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.error(`error: ${path.relative(ROOT, MANIFEST)} not found`);
    process.exit(1);
  }
  let projects;
  try {
    projects = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    console.error(`error: failed to parse ${path.relative(ROOT, MANIFEST)}: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(projects)) {
    console.error(`error: ${path.relative(ROOT, MANIFEST)} must be a JSON array`);
    process.exit(1);
  }

  const warnings = [];
  projects.forEach((p, i) => validateEntry(p, i, warnings));

  projects.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  let css = '';
  if (fs.existsSync(CSS)) {
    css = fs.readFileSync(CSS, 'utf8').replace(/\s+$/, '');
  } else {
    warnings.push(`missing: styles/landing.css (using empty styles)`);
  }

  fs.writeFileSync(OUTPUT, buildHtml(projects, css));

  console.log(`Wrote index.html with ${projects.length} project${projects.length === 1 ? '' : 's'}.`);
  for (const w of warnings) console.log(`  warning: ${w}`);
}

main();

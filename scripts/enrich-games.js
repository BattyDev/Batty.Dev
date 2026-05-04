#!/usr/bin/env node
// Enriches projects/games/games.js with Steam genres and review % per appid.
// Run: node scripts/enrich-games.js
//
// Manual override: if a record's `genres` array has been edited away from the
// last auto-fetched value (tracked in meta/games-enrichment.json), the script
// preserves the edit. `rating` and `reviewDesc` are always refreshed.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const GAMES_JS = path.join(ROOT, 'projects', 'games', 'games.js');
const CACHE_FILE = path.join(ROOT, 'meta', 'games-enrichment.json');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_DELAY_MS = 1500;
const MAX_RETRIES = 5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function fetchJSON(url, attempt = 1) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'batty-dev-enrich/1.0 (+https://batty.dev)' },
  });
  if (res.status === 429) {
    if (attempt > MAX_RETRIES) throw new Error('HTTP 429 after retries');
    const wait = Math.min(60000, 2000 * Math.pow(2, attempt - 1));
    console.warn(`    HTTP 429, backing off ${wait}ms (retry ${attempt}/${MAX_RETRIES})`);
    await sleep(wait);
    return fetchJSON(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchSteam(appid) {
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=genres`;
  const reviewsUrl = `https://store.steampowered.com/appreviews/${appid}?json=1&num_per_page=0&purchase_type=all&language=all`;
  const out = { genres: null, rating: null, reviewDesc: null, ok: false };

  try {
    const d = await fetchJSON(detailsUrl);
    const entry = d && d[appid];
    if (entry && entry.success && entry.data && Array.isArray(entry.data.genres)) {
      out.genres = entry.data.genres.map(g => g.description).filter(Boolean);
    }
    out.ok = true; // We got *some* response, even if no genres
  } catch (e) {
    console.warn(`    appdetails error: ${e.message}`);
  }

  await sleep(REQUEST_DELAY_MS);

  try {
    const r = await fetchJSON(reviewsUrl);
    const qs = r && r.query_summary;
    if (qs && qs.total_reviews > 0) {
      out.rating = Math.round((qs.total_positive / qs.total_reviews) * 100);
      out.reviewDesc = qs.review_score_desc || null;
    }
    out.ok = true;
  } catch (e) {
    console.warn(`    reviews error: ${e.message}`);
  }

  return out;
}

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { return {}; }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

function extractArray(src) {
  const m = src.match(/\/\* ENRICH:START \*\/([\s\S]*?)\/\* ENRICH:END \*\//);
  if (!m) throw new Error('ENRICH:START/END markers not found in games.js');
  // Wrap as expression so vm can return the array literal.
  const script = new vm.Script('(' + m[1] + ')');
  return script.runInContext(vm.createContext({}));
}

function serializeArray(records) {
  const lines = ['['];
  for (const r of records) {
    const parts = [];
    parts.push(`name: ${JSON.stringify(r.name)}`);
    parts.push(`sources: [${r.sources.map(s => JSON.stringify(s)).join(', ')}]`);
    parts.push(`tier: ${JSON.stringify(r.tier)}`);
    parts.push(`appid: ${r.appid == null ? 'null' : r.appid}`);
    if (r.genres && r.genres.length) {
      parts.push(`genres: [${r.genres.map(s => JSON.stringify(s)).join(', ')}]`);
    }
    if (r.rating != null) parts.push(`rating: ${r.rating}`);
    if (r.reviewDesc) parts.push(`reviewDesc: ${JSON.stringify(r.reviewDesc)}`);
    if (r.note) parts.push(`note: ${JSON.stringify(r.note)}`);
    lines.push(`  { ${parts.join(', ')} },`);
  }
  lines.push(']');
  return lines.join('\n');
}

function writeBack(src, newArrayText) {
  return src.replace(
    /\/\* ENRICH:START \*\/[\s\S]*?\/\* ENRICH:END \*\//,
    `/* ENRICH:START */ ${newArrayText} /* ENRICH:END */`
  );
}

async function main() {
  const src = fs.readFileSync(GAMES_JS, 'utf8');
  const records = extractArray(src);
  const cache = loadCache();
  const now = Date.now();

  const uniqueIds = Array.from(new Set(records.map(r => r.appid).filter(Boolean)));
  const toFetch = uniqueIds.filter(id => {
    const c = cache[id];
    return !c || now - (c.fetchedAt || 0) > CACHE_TTL_MS;
  });

  console.log(`Total records:    ${records.length}`);
  console.log(`Unique appids:    ${uniqueIds.length}`);
  console.log(`Cache hits:       ${uniqueIds.length - toFetch.length}`);
  console.log(`Need to fetch:    ${toFetch.length}`);
  if (toFetch.length) {
    const eta = Math.ceil((toFetch.length * REQUEST_DELAY_MS * 2) / 1000);
    console.log(`Est time:         ~${eta}s\n`);
  }

  let i = 0;
  let skippedNoData = 0;
  for (const id of toFetch) {
    i++;
    process.stdout.write(`[${i}/${toFetch.length}] appid ${id} ... `);
    const data = await fetchSteam(id);
    if (!data.ok) {
      console.log('failed (will retry next run)');
      skippedNoData++;
      await sleep(REQUEST_DELAY_MS);
      continue;
    }
    const { ok, ...rest } = data;
    cache[id] = { ...rest, fetchedAt: Date.now() };
    const r = data.rating != null ? `${data.rating}%` : '—';
    const g = (data.genres || []).join(', ') || '—';
    console.log(`${r} · ${g}`);
    if (i % 25 === 0) saveCache(cache);
    await sleep(REQUEST_DELAY_MS);
  }
  saveCache(cache);
  if (skippedNoData) console.log(`(${skippedNoData} appids failed and were not cached)`);

  // Merge cached enrichment into records
  let manuallyOverridden = 0;
  let updated = 0;
  for (const r of records) {
    if (!r.appid) continue;
    const c = cache[r.appid];
    if (!c) continue;

    if (c.rating != null) {
      r.rating = c.rating;
      r.reviewDesc = c.reviewDesc || undefined;
    } else {
      delete r.rating;
      delete r.reviewDesc;
    }

    if (c.genres && c.genres.length) {
      // Preserve manual edits: if existing genres differ from previously cached value, leave alone.
      const prev = c.lastWrittenGenres;
      if (r.genres && prev && !arraysEqual(r.genres, prev)) {
        manuallyOverridden++;
      } else {
        r.genres = c.genres.slice();
      }
      // Track what the script most recently wrote, so future runs can detect manual edits.
      c.lastWrittenGenres = r.genres ? r.genres.slice() : c.genres.slice();
    }
    updated++;
  }
  saveCache(cache);

  const out = writeBack(src, serializeArray(records));
  fs.writeFileSync(GAMES_JS, out, 'utf8');
  console.log(`\nUpdated ${updated} records (${manuallyOverridden} manual genre overrides preserved).`);
  console.log(`Wrote ${path.relative(ROOT, GAMES_JS)} and ${path.relative(ROOT, CACHE_FILE)}.`);
}

main().catch(e => { console.error(e); process.exit(1); });

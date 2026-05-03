# Batty.Dev

Personal project hosting site. Auto-deploys from `main` to Vercel.

## Add a local HTML project

1. Drop your HTML file at `projects/<slug>/index.html`
2. Add an entry to `meta/projects.json`
3. Run: `node scripts/build-index.js`
4. `git add . && git commit -m "add <slug>" && git push`
5. Vercel auto-deploys in ~30 seconds.

## Add an external link

Same as above, but skip step 1 and add a `url` field to the entry:

```json
{
  "slug": "tennotrove",
  "title": "Tenno Trove",
  "description": "Warframe loadout sharing platform.",
  "date": "2026-05-03",
  "tags": ["webapp", "warframe"],
  "url": "https://tennotrove.com"
}
```

External cards open in a new tab and show a `↗` next to the title.

## First-time setup on a fresh clone

```sh
sh scripts/install-hooks.sh
```

This installs the pre-commit hook, which auto-regenerates `index.html` from `meta/projects.json` on every commit.

## Files

- `meta/projects.json` — manifest, hand-edited
- `scripts/build-index.js` — generator (zero deps, Node built-ins only)
- `styles/landing.css` — palette + grid
- `index.html` — generated, do not hand-edit
- `projects/<slug>/index.html` — your project files

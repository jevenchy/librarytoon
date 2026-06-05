# Contributing to Librarytoon

## Quick Start

Requires Node.js 20+.

```bash
git clone https://github.com/jevenchy/librarytoon.git
cd librarytoon
npm install
npm run dev                 # development
npm run build && npm start  # production
```

Server runs at `http://localhost:4000`.

## Ways to Contribute

- Add a new source
- Fix a broken source
- Improve an adapter (html, wordpress, api)
- Bug fixes and performance improvements

## Adding a New Source

Create `server/sources/<id>.json` using this template:

```json
{
  "$schema":       "../../shared/sources.schema.json",
  "id":            "yoursource",
  "baseUrl":       "https://example.com",
  "method":        "html | wordpress | api",
  "urlFormat":     "slug | numeric | uuid",
  "seriesUrl":     "/series/",
  "chapterUrl":    "/chapter/",
  "apiBase":       "https://api.example.com",
  "proxyImages":   true,
  "color":         "#000000",
  "contentRating": "sfw | nsfw",
  "language":      "id",
  "enabled":       false
}
```

Read the full [TEMPLATE](https://github.com/jevenchy/librarytoon/blob/main/server/sources/template.jsonc) for all annotated options.

## Commit Format

```
type(scope): short description
```

Valid types: `fix`, `feat`, `docs`, `chore`, `refactor`, `style`, `test`, `perf`

Common scopes: `sources`, `adapters`, `ui`, `server`, `client`

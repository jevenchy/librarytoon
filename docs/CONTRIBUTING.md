# Contributing to Librarytoon

## Ways to Contribute

- Add a new source
- Fix a broken source
- Improve an adapter (html.ts, api.ts, wordpress.ts)
- Bug fixes and performance improvements

---

## Adding a New Source

Create `server/sources/{id}.json` using this template:

```json
{
  "id":            "yoursource",
  "baseUrl":       "https://example.com",
  "method":        "html | wordpress | api | graphql | nextjs | nuxtjs",
  "urlFormat":     "slug | numeric",
  "seriesUrl":     "https://example.com/series/example-title/",
  "chapterUrl":    "https://example.com/chapter/example-1/",
  "apiBase":       "https://api.example.com",
  "language":      "id",
  "contentRating": "sfw | nsfw | mixed",
  "color":         "#000000",
  "proxyImages":   true,
  "enabled":       false
}
```

Read the full [TEMPLATE](../server/sources/TEMPLATE.jsonc) for all annotated options.

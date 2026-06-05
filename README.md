<h1 align="center">
  <br>
  <a href="https://github.com/jevenchy/librarytoon">
    <picture>
      <img src="client/public/logo-black.png" width="250" height="250" alt="Librarytoon">
    </picture>
  </a>
  <br>
  Librarytoon
  <br>
</h1>

<p align="center">Read manhwa and manga from multiple sources in one place.</p>

<p align="center">
  <img src="https://img.shields.io/github/package-json/v/jevenchy/librarytoon?style=for-the-badge&color=black" alt="Version"/>
  <img src="https://img.shields.io/github/license/jevenchy/librarytoon?style=for-the-badge&color=black" alt="License"/>
  <img src="https://img.shields.io/github/stars/jevenchy/librarytoon?style=for-the-badge&color=black" alt="Stars"/>
</p>

## Overview

Multi-source manhwa and manga reader. No ads, no pop-ups, no trackers, no accounts required. Librarytoon pulls content from multiple sources into one clean interface. Bookmarks and reading progress stay in your browser.

> [!IMPORTANT]
> Librarytoon does not host any content and all rights belong to their respective owners. Some sources may contain 18+ content.

## How it Works

<p align="center">
  <img src="client/public/architecture.png" alt="Architecture" width="800"/>
</p>

- **Scraper Service**: orchestrates search / chapters / pages (cache + request de-dup)
- **Adapter Engine**: adapter per source (HTML / WordPress / REST API)
- **Fetch Service**: handles retry, rate limiting, headers, and DoH DNS per source
- **Image Proxy**: serves images from blocked origins via `/api/img`
- **Source Registry**: in-memory registry of active source adapters
- **Source Config**: per-source configuration via JSON (loaded + validated)
- **Cache**: LRU cache for search results and chapter lists

## Contributing

Got something to add? Read [CONTRIBUTING.md](docs/CONTRIBUTING.md)

- Add a source or fix a bug: [pull request](https://github.com/jevenchy/librarytoon/pulls)
- Request a source or report a bug: [open an issue](https://github.com/jevenchy/librarytoon/issues)

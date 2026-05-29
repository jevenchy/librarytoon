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

<p align="center">Self-hosted manhwa/manga aggregator</p>

<p align="center">
  <img src="https://img.shields.io/github/package-json/v/jevenchy/librarytoon?style=for-the-badge&color=black" alt="Version"/>
  <img src="https://img.shields.io/github/stars/jevenchy/librarytoon?style=for-the-badge&color=black" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/jevenchy/librarytoon?style=for-the-badge&color=black" alt="Forks"/>
</p>

## Overview

Read manhwa/manga from multiple sites in one place. No ads, no broken links, no pop-ups.

> [!IMPORTANT]
> Create this for anyone who might need it. A star means it helped.

## How it Works

<p align="center">
  <img src="client/public/architecture.png" alt="Architecture" width="800"/>
</p>

> [!WARNING]
> 18+ Content Warning

- **Adapter Engine** : picks the right adapter per source (HTML / WordPress / REST API)
- **Fetch Service**  : handles retry, rate limiting, and headers per source
- **Image Proxy**    : serves images from blocked origins via `/api/img`
- **Source Registry**: per-source configuration via JSON, no code changes needed
- **Cache**          : LRU cache for search results and chapter lists

## Contributing

Got something to add?

- Add a source or fix a bug: [pull request](https://github.com/jevenchy/librarytoon/pulls).
- Request a source or report a bug: [open an issue](https://github.com/jevenchy/librarytoon/issues).

<a href="https://github.com/jevenchy/librarytoon/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=jevenchy/librarytoon" />
</a>

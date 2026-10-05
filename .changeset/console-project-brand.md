---
'@pikku/code-edit': patch
'@pikku/addon-console': patch
---

addon-console extracts a design profile from a site, crawls it, generates a favicon, fetches stock images and lists placeholder brands (`extractDesign`, `crawlSite`, `generateFavicon`, `fetchStockImages`, `getPlaceholderBrands`, `getDesignServer`) through `@pikku/code-edit/brand`, behind the `pikku:console:design` scopes.

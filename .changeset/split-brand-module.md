---
'@pikku/cli': patch
'@pikku/code-edit': patch
'@pikku/addon-console': patch
---

`pikku validate` now warns when an app still carries a starter template's name (the `app__name` wordmark, the tab title, the emails' sender name). The check moved out of `@pikku/code-edit/brand`: `BrandWorkspace.placeholders()`, `placeholderBrands`, `productBrand`, `isPlaceholderName`, the `PLACEHOLDER_*` constants and the `PlaceholderBrand` and `BrandApp` types are gone. Stock-image search (Unsplash) and site crawling (Cloudflare) are removed: `BrandWorkspace.stockImages()` and `BrandWorkspace.crawl()`, the `unsplashAccessKey`, `cloudflare` and `fetch` options, `StockImagesResult`, `CrawlResult`, `CloudflareCredentials`, `StockImageOrientation`, `searchUnsplash`, `crawlSite`, `CloudflareCrawler` and `extractImages`. The console addon no longer exposes the `getPlaceholderBrands`, `fetchStockImages` and `crawlSite` functions, and stops reading `UNSPLASH_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for brand use.

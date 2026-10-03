---
'@pikku/code-edit': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
---

Brand tooling moves from fabric into pikku. `@pikku/code-edit/brand` renders a favicon set from a logo or an emoji or letter and links it from the document head, finds starter-template names an app still carries, reads a design off a live site or a W3C tokens file into a `composeTheme` input, and saves Unsplash photos or a Cloudflare site crawl into a frontend's public/ on the project's own keys. New `pikku design placeholders|favicon|extract|images|crawl` commands, and `getPlaceholderBrands`, `generateFavicon`, `extractDesign`, `fetchStockImages` and `crawlSite` console RPCs.

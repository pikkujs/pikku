# @pikku/browser

Browser automation service for Pikku, backed by `puppeteer-core`. Manages
pooled browser sessions with a concurrency cap.

`puppeteer-core` is a peer dependency and ships no browser binary, so you point
it at an executable you already have.

## Install

```bash
npm install @pikku/browser puppeteer-core
```

## Usage

```typescript
import { LocalBrowserService } from '@pikku/browser'

const browser = new LocalBrowserService({
  executablePath: '/path/to/chrome',
  maxConcurrentSessions: 4,
})
```

## Docs

https://pikku.dev/docs

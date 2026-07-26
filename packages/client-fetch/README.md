# @pikku/fetch

Type-safe fetch client for Pikku. Routes, params and response bodies are
checked against your generated HTTP wirings, so a typo is a compile error.

## Install

```bash
npm install @pikku/fetch
```

## Usage

```typescript
import { pikkuFetch } from './.pikku/pikku-fetch.gen.js'

pikkuFetch.setServerUrl('https://api.example.com')

const todo = await pikkuFetch.get('/todo/:id', { id: '123' })
```

Generate the client with `npx pikku`. `PikkuFetchError` carries the status and
parsed error payload.

## Docs

https://pikku.dev/docs

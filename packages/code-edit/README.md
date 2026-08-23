# @pikku/code-edit

Surgical edits to developer-owned Pikku source. Locates a `pikkuFunc`,
`pikkuSessionlessFunc` or agent declaration with the TypeScript compiler API,
then splices the original text — so formatting, comments and everything the
edit did not touch survive exactly as written.

This is the opposite of code generation: generated `*.gen.ts` files are owned by
the tool and rewritten wholesale, while these files are owned by you and are
only ever patched in place.

Most users get this transitively via the Pikku CLI or `@pikku/addon-console`;
install it directly only if you are building your own tooling that edits Pikku
declarations.

## Install

```bash
npm install @pikku/code-edit
```

## Usage

```typescript
import { CodeEditService } from '@pikku/code-edit'

const codeEdit = new CodeEditService(rootDir)

await codeEdit.updateFunctionConfig(
  'src/functions/get-book.function.ts',
  'getBook',
  {
    title: 'Get a book',
    tags: ['books'],
  }
)
```

Paths are resolved against `rootDir` and may not escape it. Change-set values
are `T | null`, where `null` removes the property.

## Docs

https://pikku.dev/docs

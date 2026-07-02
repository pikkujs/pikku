---
'@pikku/cli': patch
---

feat(cli): `pikku validate` now checks that `packages/functions` declares
`zod` v4. pikku's generated schemas and the auth scaffold (auth-secrets.gen.ts)
both `import { z } from 'zod'`; a missing or non-v4 zod fails codegen (PKU489)
or type-checking, so surface it as a validation error with a fix hint.

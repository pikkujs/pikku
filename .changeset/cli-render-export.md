---
"@pikku/cli": patch
"@pikku/inspector": patch
---

Add bootstrap command, performance optimizations, and CLI improvements

**New Features:**
- Add `pikku bootstrap` command for type-only generation (~13.5% faster than `pikku all`)
- Add configurable `ignoreFiles` option to pikku.config.json with sensible defaults (*.gen.ts, *.test.ts, *.spec.ts)
- Export pikkuCLIRender helper from serialize-cli-types.ts with JSDoc documentation

**Performance Improvements:**
- Add aggressive TypeScript compiler options (skipDefaultLibCheck, types: []) - ~37% faster TypeScript setup
- Add detailed performance timing to inspector phases (--logLevel=debug)
- Optimize file inspection with ignore patterns - ~10-20% faster overall

**Enhancements:**
- Fix --logLevel flag to properly apply log level to logger
- Update middleware logging to use structured log format
- Improve CLI renderers to consistently use destructured logger service
- Fix middleware file generation when middleware groups exist

//! Port of Go `internal/schemas` (+ `internal/tsjg`, `internal/schemas/zodjs`):
//! `schema-generator.ts` `generateAllSchemas`, the vendored
//! ts-json-schema-generator and the Zod vendor converter hook.
//!
//! Status: NOT PORTED. `analyze::run` skips schema generation and logs nothing;
//! `state.schemas` stays empty (see PORTING.md, Known gaps).

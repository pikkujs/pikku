// Package tsjg is a vendored copy of vega's ts-json-schema-generator-go, the
// typescript-go port of ts-json-schema-generator that the TS inspector uses.
//
// Provenance:
//
//	module   github.com/vega/ts-json-schema-generator-go
//	version  v3.0.0-native.6
//	commit   49014215857dcb1f890c130e605efd95e09b6eec
//	license  MIT, see LICENSE in this directory
//
// Upstream keeps everything under internal/, so it cannot be imported and is
// copied here instead. What was copied: the non-test files of internal/{config,
// formatter,generator,parser,schema,tsutils,types} and internal/factory/wiring.go
// (CreateParser, CreateFormatter). factory/program.go and factory/factory.go
// are left out: they build their own program from a glob (and pull in
// doublestar), while pikku builds the schema program itself. Imports were
// rewritten from github.com/vega/ts-json-schema-generator-go/internal/ to
// github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/. Upstream pins
// the same typescript-go commit and the same shim API as this module.
//
// Local changes, all in generator/generator.go and marked "pikku:":
//   - findNamedNode builds its project and all-files indexes once per
//     generator instead of rescanning every source file for each lookup, as
//     IndexedSchemaGenerator does in packages/inspector/src/utils/schema-generator.ts.
//   - a missing root type returns *RootlessError, so callers can tell it apart
//     from other failures the way the TS code checks `instanceof RootlessError`.
//
// To update: copy the same set of files from a newer upstream tag, rewrite the
// imports, reapply the two changes above and update the version and commit here.
package tsjg

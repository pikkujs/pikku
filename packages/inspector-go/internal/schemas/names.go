package schemas

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// primitiveTypes are the names generateTSSchemas never asks the generator for.
var primitiveTypes = map[string]bool{
	"boolean": true, "string": true, "number": true, "null": true, "undefined": true,
	"void": true, "any": true, "unknown": true, "never": true,
}

// SchemaNames is generateTSSchemas' schemasSet, in its iteration order: every
// custom type, the unique name of every function input and output, and
// schemasFromTypes. Primitives are kept, as in the TS set; the caller skips
// them.
//
// The TS also walks http.meta for each route's `inputTypes`, but add-http-route
// always records `inputTypes: undefined` (body/query/params keys go to
// http.metaInputTypes, and those are property names, not type names), so that
// loop never adds anything and has no counterpart here.
func SchemaNames(st *state.State, schemasFromTypes []string) []string {
	var names orderedSet
	tm := st.Functions.TypesMap
	for _, k := range tm.CustomTypeKeys() {
		names.add(k)
	}
	st.Functions.Meta.Each(func(_ string, fm *state.FunctionMeta) {
		if fm == nil {
			return
		}
		for _, list := range [][]string{fm.Inputs, fm.Outputs} {
			for _, typ := range list {
				// Types missing from the typesMap (inline types in generated
				// workflow workers) are skipped, as the TS catch does.
				if unique, err := tm.GetUniqueName(typ); err == nil && unique != "" {
					names.add(unique)
				}
			}
		}
	})
	for _, typ := range schemasFromTypes {
		names.add(typ)
	}
	return names.items
}

package schemas

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Hole is a place in a schema that admits anything ("unknown") or nothing
// ("never"). Path names properties with `.name`, array items with `[]` and
// open-map values with `[*]`; anyOf/allOf/$ref hops add nothing, so the same
// path is reachable from the TypeScript type or the Zod schema it came from.
type Hole struct {
	Path string
	Kind string
}

// FindSchemaHoles lists the holes of one JSON Schema, without repeats.
func FindSchemaHoles(schema state.Raw) []Hole {
	var root any
	if err := json.Unmarshal(schema, &root); err != nil {
		return nil
	}
	obj, ok := root.(map[string]any)
	if !ok {
		return nil
	}
	definitions, _ := obj["definitions"].(map[string]any)
	body := map[string]any{}
	for k, v := range obj {
		if k != "definitions" {
			body[k] = v
		}
	}
	var holes []Hole
	seen := map[string]bool{}
	add := func(path, kind string) {
		if path == "" {
			path = "$"
		}
		if !seen[kind+":"+path] {
			seen[kind+":"+path] = true
			holes = append(holes, Hole{Path: path, Kind: kind})
		}
	}
	var visit func(node any, path string, refs []string)
	visit = func(node any, path string, refs []string) {
		n, ok := node.(map[string]any)
		if !ok {
			return
		}
		if len(n) == 0 {
			add(path, "unknown")
			return
		}
		if not, ok := n["not"].(map[string]any); ok && len(not) == 0 {
			add(path, "never")
			return
		}
		if ref, ok := n["$ref"].(string); ok {
			name, err := url.PathUnescape(strings.TrimPrefix(ref, "#/definitions/"))
			if err != nil {
				name = ref
			}
			for _, r := range refs {
				if r == name {
					return
				}
			}
			if target, ok := definitions[name]; ok {
				visit(target, path, append(append([]string{}, refs...), name))
			}
		}
		if props, ok := n["properties"].(map[string]any); ok {
			for _, name := range sortedKeys(props) {
				visit(props[name], path+"."+name, refs)
			}
		}
		switch items := n["items"].(type) {
		case map[string]any:
			visit(items, path+"[]", refs)
		case []any:
			for _, child := range items {
				visit(child, path+"[]", refs)
			}
		}
		if ap, ok := n["additionalProperties"].(map[string]any); ok {
			visit(ap, path+"[*]", refs)
		}
		for _, key := range []string{"anyOf", "oneOf", "allOf"} {
			if members, ok := n[key].([]any); ok {
				for _, m := range members {
					visit(m, path, refs)
				}
			}
		}
	}
	visit(body, "", nil)
	return holes
}

// CheckGenerated fails a function whose generated input or output schema
// admits anything or nothing at a place its source did not say `unknown`: that
// is a type the generator could not follow, and the schema validating the wire
// is looser than the TypeScript the caller sees. declared maps a schema name to
// the paths its source wrote as unknown/any.
func CheckGenerated(log *diag.Logger, st *state.State, declared map[string]map[string]bool) {
	tm := st.Functions.TypesMap
	st.Functions.Meta.Each(func(_ string, fm *state.FunctionMeta) {
		if fm == nil {
			return
		}
		for _, side := range []struct {
			label string
			names []string
		}{{"input", fm.Inputs}, {"output", fm.Outputs}} {
			for _, typeName := range side.names {
				schemaName, err := tm.GetUniqueName(typeName)
				if err != nil || schemaName == "" {
					continue
				}
				schema, ok := st.Schemas.Get(schemaName)
				if !ok {
					continue
				}
				for _, hole := range FindSchemaHoles(schema) {
					if hole.Kind == "unknown" && declared[schemaName][hole.Path] {
						continue
					}
					what := "admits anything (unknown)"
					if hole.Kind == "never" {
						what = "admits nothing (never)"
					}
					log.Diagnostic(diag.Error, diag.GeneratedSchemaHasUnknown, fmt.Sprintf(
						"'%s' %s schema '%s' %s at '%s', which its source does not declare as unknown. "+
							"The generator could not follow a type there, so the schema is looser than the TypeScript type. "+
							"Declare the type fully, or write `unknown` explicitly if that is the intent.",
						fm.PikkuFuncId, side.label, schemaName, what, hole.Path))
				}
			}
		}
	})
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

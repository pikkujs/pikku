package formatter

import (
	"slices"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
)

// makeNullable mutates the definition so that it also allows null
// (makeNullable in src/TypeFormatter/AnnotatedTypeFormatter.ts).
func makeNullable(def *schema.Definition) *schema.Definition {
	union := def.OneOf
	if union == nil {
		union = def.AnyOf
	}

	switch {
	case union != nil && !unionHasNull(union):
		if def.OneOf != nil {
			def.OneOf = append(def.OneOf, &schema.Definition{Type: "null"})
		} else {
			def.AnyOf = append(def.AnyOf, &schema.Definition{Type: "null"})
		}

	case def.Type != nil && def.Type != "object":
		switch t := def.Type.(type) {
		case []string:
			if !slices.Contains(t, "null") {
				def.Type = append(append([]string(nil), t...), "null")
			}
		case []any:
			if !slices.Contains(t, "null") {
				def.Type = append(append([]any(nil), t...), "null")
			}
		default:
			if def.Type != "null" {
				typeStr, _ := def.Type.(string)
				def.Type = []string{typeStr, "null"}
			}
		}

		// Enums need null as an option.
		if def.Enum != nil && !slices.Contains(def.Enum, nil) {
			def.Enum = append(def.Enum, nil)
		}

	default:
		if unionHasNull(def.AnyOf) {
			return def
		}

		// Move every key except description, title, and default into a
		// sub-definition and wrap it in an anyOf with null.
		subdef := def.Clone()
		subdef.Title = ""
		if subdef.Extra != nil {
			delete(subdef.Extra, "description")
			delete(subdef.Extra, "default")
		}

		keptExtra := map[string]any{}
		for _, key := range []string{"description", "default"} {
			if v, ok := def.Extra[key]; ok {
				keptExtra[key] = v
			}
		}
		if len(keptExtra) == 0 {
			keptExtra = nil
		}

		*def = schema.Definition{Title: def.Title, Extra: keptExtra}
		def.AnyOf = []*schema.Definition{subdef, {Type: "null"}}
	}

	return def
}

func unionHasNull(list []*schema.Definition) bool {
	return slices.ContainsFunc(list, func(d *schema.Definition) bool { return d.Type == "null" })
}

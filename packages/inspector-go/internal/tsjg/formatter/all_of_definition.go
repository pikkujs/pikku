package formatter

import (
	"sort"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// getAllOfDefinitionReducer folds a base type's definition into the given
// definition, combining objects instead of using allOf because allOf does not
// work well with additional properties (src/Utils/allOfDefinition.ts).
func getAllOfDefinitionReducer(childTypeFormatter TypeFormatter) func(*schema.Definition, types.Type) *schema.Definition {
	return func(definition *schema.Definition, baseType types.Type) *schema.Definition {
		other := childTypeFormatter.GetDefinition(types.DerefType(baseType))

		if definition.Properties == nil {
			definition.Appended = appendKey(definition.Appended, "properties")
		}
		definition.Properties = deepMergeProperties(other.Properties, definition.Properties)

		if isPropsDefinition(definition.AdditionalProperties) && isPropsDefinition(other.AdditionalProperties) {
			// Additional properties is false only if all children also set
			// additional properties to false. Collect additional properties
			// and merge into a single definition.
			var additionalProps []*schema.Definition
			var additionalTypes []string

			addAdditionalProps := func(addProps any) {
				def, ok := addProps.(*schema.Definition)
				if !ok || def == nil {
					// false (or nil) is falsy in the TypeScript source.
					return
				}
				if def.AnyOf != nil {
					for _, prop := range def.AnyOf {
						if prop.Type != nil {
							additionalTypes = append(additionalTypes, castTypeArray(prop.Type)...)
						} else {
							additionalProps = append(additionalProps, prop)
						}
					}
				} else if def.Type != nil {
					additionalTypes = append(additionalTypes, castTypeArray(def.Type)...)
				} else {
					additionalProps = append(additionalProps, def)
				}
			}

			addAdditionalProps(definition.AdditionalProperties)
			addAdditionalProps(other.AdditionalProperties)

			additionalTypes = unique(additionalTypes)
			additionalProps = unique(additionalProps)

			if len(additionalTypes) > 1 {
				additionalProps = append(additionalProps, &schema.Definition{Type: additionalTypes})
			} else if len(additionalTypes) == 1 {
				additionalProps = append(additionalProps, &schema.Definition{Type: additionalTypes[0]})
			}

			if len(additionalProps) > 1 {
				definition.AdditionalProperties = &schema.Definition{AnyOf: additionalProps}
			} else if len(additionalProps) == 1 {
				if additionalProps[0].IsEmpty() {
					definition.AdditionalProperties = nil
				} else {
					definition.AdditionalProperties = additionalProps[0]
				}
			} else {
				definition.AdditionalProperties = false
			}
		}

		if other.Required != nil {
			if len(definition.Required) == 0 {
				definition.Appended = appendKey(definition.Appended, "required")
			}
			required := unique(append(append([]string(nil), definition.Required...), other.Required...))
			sort.Strings(required)
			definition.Required = required
		}

		if other.AdditionalProperties != false && definition.AdditionalProperties == false {
			definition.AdditionalProperties = nil
		}

		return definition
	}
}

// deepMergeProperties merges two property maps, with b taking precedence, and
// intersects enums/consts of common properties that share the same type
// (src/Utils/deepMerge.ts).
func deepMergeProperties(a, b *schema.Properties) *schema.Properties {
	out := schema.NewProperties()
	if a != nil {
		out = a.Clone()
	}
	for k, v := range b.All() {
		out.Set(k, v)
	}
	if a == nil || b == nil {
		return out
	}
	for k, av := range a.All() {
		bv, ok := b.Get(k)
		if !ok || av == nil || bv == nil || av.Type == nil || bv.Type == nil {
			continue
		}
		if !rawTypeEqual(av.Type, bv.Type) {
			continue
		}
		enums, ok := mergeConstsAndEnums(av, bv)
		if !ok {
			continue
		}
		merged := bv.Clone()
		if len(enums) == 1 {
			merged.Const = new(enums[0])
			merged.Enum = nil
		} else {
			merged.Enum = enums
			merged.Const = nil
		}
		out.Set(k, merged)
	}
	return out
}

// mergeConstsAndEnums treats const as an enum with a single element and
// intersects when both sides constrain values (src/Utils/deepMerge.ts).
func mergeConstsAndEnums(a, b *schema.Definition) ([]any, bool) {
	var enumA, enumB []any
	hasA, hasB := false, false
	if a.Const != nil {
		enumA, hasA = []any{*a.Const}, true
	} else if a.Enum != nil {
		enumA, hasA = a.Enum, true
	}
	if b.Const != nil {
		enumB, hasB = []any{*b.Const}, true
	} else if b.Enum != nil {
		enumB, hasB = b.Enum, true
	}

	switch {
	case !hasA && hasB:
		return enumB, true
	case hasA && !hasB:
		return enumA, true
	case hasA && hasB:
		return intersectionOfArrays(enumA, enumB), true
	default:
		return nil, false
	}
}

// intersectionOfArrays keeps the values of b that also occur in a, comparing
// by stable stringification (src/Utils/intersectionOfArrays.ts).
func intersectionOfArrays(a, b []any) []any {
	inA := make(map[string]bool, len(a))
	for _, v := range a {
		inA[types.StableStringify(v)] = true
	}
	out := []any{}
	for _, v := range b {
		if inA[types.StableStringify(v)] {
			out = append(out, v)
		}
	}
	return out
}

// rawTypeEqual mirrors the loose `elementA.type == elementB.type` comparison:
// equal strings compare equal; distinct array instances do not.
func rawTypeEqual(a, b any) bool {
	as, okA := a.(string)
	bs, okB := b.(string)
	return okA && okB && as == bs
}

// castTypeArray normalizes a definition's type (string or slice of strings)
// into a slice (src/Utils/castArray.ts usage in allOfDefinition.ts).
func castTypeArray(t any) []string {
	switch v := t.(type) {
	case string:
		return []string{v}
	case []string:
		return v
	case []any:
		out := make([]string, 0, len(v))
		for _, e := range v {
			if s, ok := e.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

// isPropsDefinition mirrors additionalPropsDefinition in the TypeScript
// source: anything that is neither undefined nor true (false or a definition).
func isPropsDefinition(props any) bool {
	return props != nil && props != true
}

// appendKey records key as added after creation, unless it already was.
func appendKey(keys []string, key string) []string {
	for _, k := range keys {
		if k == key {
			return keys
		}
	}
	return append(keys, key)
}

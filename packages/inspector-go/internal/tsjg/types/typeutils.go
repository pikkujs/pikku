package types

import (
	"errors"
	"fmt"
	"strconv"
)

// NotNever reports whether t is not a NeverType (src/Utils/notNever.ts).
// Note: HiddenType counts as never here, matching `instanceof NeverType`
// in spirit; the TypeScript check also matches HiddenType via inheritance.
func NotNever(t Type) bool {
	return !IsNeverLike(t)
}

// PreserveAnnotation wraps newType with originalType's annotations if the
// original was annotated (src/Utils/preserveAnnotation.ts).
func PreserveAnnotation(originalType, newType Type) Type {
	if annotated, ok := originalType.(*AnnotatedType); ok {
		return &AnnotatedType{Type: newType, Annotations: annotated.Annotations, Nullable: annotated.Nullable}
	}
	return newType
}

// RemoveUndefined removes undefined member types from a union, returning how
// many were removed and the resulting type (src/Utils/removeUndefined.ts).
func RemoveUndefined(propertyType *UnionType) (numRemoved int, newType Type) {
	var kept []Type
	for _, t := range propertyType.Types() {
		derefed := DerefAnnotatedType(t)
		switch d := derefed.(type) {
		case *UndefinedType:
			numRemoved++
		case *UnionType:
			removed, sub := RemoveUndefined(d)
			numRemoved += removed
			kept = append(kept, PreserveAnnotation(t, sub))
		default:
			kept = append(kept, t)
		}
	}
	switch len(kept) {
	case 0:
		return numRemoved, &UndefinedType{}
	case 1:
		return numRemoved, kept[0]
	default:
		return numRemoved, NewUnionType(kept)
	}
}

// UnknownLiteralTypeError reports a type that cannot be reduced to literals,
// mirroring UnknownTypeError in the TypeScript implementation.
type UnknownLiteralTypeError struct {
	Type Type
}

func (e *UnknownLiteralTypeError) Error() string {
	return fmt.Sprintf("unknown type %T while extracting literals", e.Type)
}

// ExtractLiterals collects the string forms of all literals in a type
// (src/Utils/extractLiterals.ts). Panics with *UnknownLiteralTypeError on
// non-literal types.
func ExtractLiterals(t Type) []string {
	var out []string
	extractLiterals(t, &out)
	return out
}

func extractLiterals(t Type, out *[]string) {
	if t == nil {
		return
	}
	switch d := DerefAnnotatedType(t).(type) {
	case *LiteralType:
		*out = append(*out, JSValueToString(d.Value))
	case *UnionType:
		for _, m := range d.Types() {
			extractLiterals(m, out)
		}
	case *EnumType:
		for _, m := range d.Types {
			extractLiterals(m, out)
		}
	case *AliasType:
		extractLiterals(d.Type, out)
	case *DefinitionType:
		extractLiterals(d.Type, out)
	case *BooleanType:
		*out = append(*out, "true", "false")
	default:
		panic(&UnknownLiteralTypeError{Type: d})
	}
}

// JSValueToString mirrors JavaScript's String(value) for the JSON scalar
// values that flow through literals, enums, and annotations.
func JSValueToString(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case string:
		return x
	case bool:
		return strconv.FormatBool(x)
	case float64:
		return NumberToString(x)
	default:
		return fmt.Sprintf("%v", x)
	}
}

// IsLiteralUnion reports whether every flattened member of the union is a
// literal, null, string, or enum type (src/TypeFormatter/LiteralUnionTypeFormatter.ts).
func IsLiteralUnion(t *UnionType) bool {
	for _, item := range t.FlattenedTypes(nil) {
		switch item.(type) {
		case *LiteralType, *NullType, *StringType, *EnumType:
		default:
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// Intersection translation (src/NodeParser/IntersectionNodeParser.ts)

func derefAndFlattenUnions(t Type) []Type {
	if union, ok := DerefType(t).(*UnionType); ok {
		var out []Type
		for _, m := range union.Types() {
			out = append(out, derefAndFlattenUnions(m)...)
		}
		return out
	}
	return []Type{t}
}

// Translate distributes an intersection over unions so `A & (B | C)` becomes
// `(A & B) | (A & C)`. Returns the sole type if no combination is needed.
func Translate(memberTypes []Type) Type {
	memberTypes = UniqueTypes(memberTypes)
	if len(memberTypes) == 1 {
		return memberTypes[0]
	}

	unions := make([][]Type, len(memberTypes))
	for i, t := range memberTypes {
		unions[i] = derefAndFlattenUnions(t)
	}

	var result []Type
	var process func(i int, current []Type)
	process = func(i int, current []Type) {
		for _, t := range unions[i] {
			combination := append(append([]Type(nil), current...), t)
			if i < len(unions)-1 {
				process(i+1, combination)
				continue
			}
			combination = UniqueTypes(combination)

			hasUndefined := false
			var primitives []Type
			for _, c := range combination {
				if _, ok := c.(*UndefinedType); ok {
					hasUndefined = true
				}
				if IsPrimitive(c) {
					primitives = append(primitives, c)
				}
			}
			switch {
			case hasUndefined:
				result = append(result, &UndefinedType{})
			case len(primitives) == 1:
				result = append(result, primitives[0])
			case len(primitives) > 1:
				// conflicting primitives -> drop the combination
			case len(combination) == 1:
				result = append(result, combination[0])
			default:
				result = append(result, NewIntersectionType(combination))
			}
		}
	}
	process(0, nil)

	switch len(result) {
	case 0:
		panic(errors.New("could not translate intersection to union"))
	case 1:
		return result[0]
	default:
		return NewUnionType(result)
	}
}

// ---------------------------------------------------------------------------
// Type keys (src/Utils/typeKeys.ts)

// GetTypeKeys returns the literal keys of a type.
func GetTypeKeys(t Type) []*LiteralType {
	switch d := DerefType(t).(type) {
	case *IntersectionType:
		return getCompositeTypeKeys(d.Types())
	case *UnionType:
		return getCompositeTypeKeys(d.Types())
	case *TupleType:
		keys := make([]*LiteralType, len(d.Types()))
		for i := range d.Types() {
			keys[i] = &LiteralType{Value: float64(i)}
		}
		return keys
	case *ObjectType:
		var keys []*LiteralType
		for _, p := range d.Properties {
			keys = append(keys, &LiteralType{Value: p.Name()})
		}
		for _, parent := range d.BaseTypes {
			keys = append(keys, GetTypeKeys(parent)...)
		}
		return UniqueTypes(keys)
	}
	return nil
}

func getCompositeTypeKeys(memberTypes []Type) []*LiteralType {
	var keys []*LiteralType
	for _, sub := range memberTypes {
		keys = append(keys, GetTypeKeys(sub)...)
	}
	return UniqueTypes(keys)
}

// GetTypeByKey resolves the type of the property named by index (a
// LiteralType, StringType, or NumberType). Returns nil when not found.
func GetTypeByKey(t Type, index Type) Type {
	switch d := DerefType(t).(type) {
	case *IntersectionType:
		return getCompositeTypeByKey(d, d.Types(), index)
	case *UnionType:
		return getCompositeTypeByKey(d, d.Types(), index)
	case *TupleType:
		if lit, ok := index.(*LiteralType); ok {
			if idx, ok := lit.Value.(float64); ok {
				members := d.Types()
				if i := int(idx); i >= 0 && i < len(members) {
					return members[i]
				}
			}
		}
		return nil
	case *ArrayType:
		if _, ok := index.(*NumberType); ok {
			return d.Item
		}
		return nil
	case *ObjectType:
		if lit, ok := index.(*LiteralType); ok {
			// Strict equality in the original: only string literals can
			// match property names.
			if name, isString := lit.Value.(string); isString {
				for _, p := range d.Properties {
					if p.Name() != name {
						continue
					}
					if p.Type == nil {
						return nil
					}
					newPropType := DerefAnnotatedType(p.Type)
					if !p.Required {
						newPropType = optionalPropertyType(newPropType)
					}
					return PreserveAnnotation(p.Type, newPropType)
				}
			}
		}
		for _, sub := range d.BaseTypes {
			if subKeyType := GetTypeByKey(sub, index); subKeyType != nil {
				return subKeyType
			}
		}
		switch ap := d.AdditionalProperties.(type) {
		case Type:
			return ap
		case bool:
			if ap {
				return &AnyType{}
			}
		}
		return nil
	}
	return nil
}

// optionalPropertyType adds undefined to the type of an optional property
// unless it is already a union that includes undefined.
func optionalPropertyType(t Type) Type {
	union, ok := t.(*UnionType)
	if !ok {
		return NewUnionType([]Type{t, &UndefinedType{}})
	}
	for _, sub := range union.Types() {
		if _, ok := sub.(*UndefinedType); ok {
			return union
		}
	}
	return NewUnionType(append(append([]Type(nil), union.Types()...), &UndefinedType{}))
}

func getCompositeTypeByKey(composite Type, memberTypes []Type, index Type) Type {
	var subTypes []Type
	for _, sub := range memberTypes {
		if subKeyType := GetTypeByKey(sub, index); subKeyType != nil {
			subTypes = append(subTypes, subKeyType)
		}
	}
	subTypes = UniqueTypes(subTypes)

	switch len(subTypes) {
	case 0:
		return nil
	case 1:
		return subTypes[0]
	}
	firstType := subTypes[0]
	if _, isUnion := composite.(*UnionType); isUnion {
		return PreserveAnnotation(firstType, NewUnionType(subTypes))
	}
	return PreserveAnnotation(firstType, Translate(subTypes))
}

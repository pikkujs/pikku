package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// EnumTypeFormatter mirrors src/TypeFormatter/EnumTypeFormatter.ts.
type EnumTypeFormatter struct{}

func NewEnumTypeFormatter() *EnumTypeFormatter { return &EnumTypeFormatter{} }

func (f *EnumTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.EnumType](t)
}

func (f *EnumTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	enumType := t.(*types.EnumType)
	values := unique(enumType.Values)
	names := make([]string, len(values))
	for i, v := range values {
		names[i] = typeName(v)
	}
	names = unique(names)

	// NOTE: We want to use "const" when referencing an enum member.
	// However, this formatter is used both for enum members and enum types,
	// so the side effect is that an enum type that contains just a single
	// value is represented as "const" too.
	if len(values) == 1 {
		return &schema.Definition{Type: names[0], Const: new(values[0])}
	}
	return &schema.Definition{Type: toEnumType(names), Enum: values}
}

func (f *EnumTypeFormatter) GetChildren(t types.Type) []types.Type { return nil }

package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// StringTypeFormatter mirrors src/TypeFormatter/StringTypeFormatter.ts.
type StringTypeFormatter struct{}

func NewStringTypeFormatter() *StringTypeFormatter { return &StringTypeFormatter{} }

func (f *StringTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.StringType](t)
}

func (f *StringTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	return &schema.Definition{Type: "string"}
}

func (f *StringTypeFormatter) GetChildren(t types.Type) []types.Type { return nil }

package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// LiteralTypeFormatter mirrors src/TypeFormatter/LiteralTypeFormatter.ts.
type LiteralTypeFormatter struct{}

func NewLiteralTypeFormatter() *LiteralTypeFormatter { return &LiteralTypeFormatter{} }

func (f *LiteralTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.LiteralType](t)
}

func (f *LiteralTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	value := t.(*types.LiteralType).Value
	return &schema.Definition{
		Type:  typeName(value),
		Const: new(value),
	}
}

func (f *LiteralTypeFormatter) GetChildren(t types.Type) []types.Type { return nil }

package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// BooleanTypeFormatter mirrors src/TypeFormatter/BooleanTypeFormatter.ts.
type BooleanTypeFormatter struct{}

func NewBooleanTypeFormatter() *BooleanTypeFormatter { return &BooleanTypeFormatter{} }

func (f *BooleanTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.BooleanType](t)
}

func (f *BooleanTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	return &schema.Definition{Type: "boolean"}
}

func (f *BooleanTypeFormatter) GetChildren(t types.Type) []types.Type { return nil }

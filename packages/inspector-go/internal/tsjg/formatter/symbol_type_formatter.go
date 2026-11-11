package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// SymbolTypeFormatter mirrors src/TypeFormatter/SymbolTypeFormatter.ts.
type SymbolTypeFormatter struct{}

func NewSymbolTypeFormatter() *SymbolTypeFormatter { return &SymbolTypeFormatter{} }

func (f *SymbolTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.SymbolType](t)
}

func (f *SymbolTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	return &schema.Definition{}
}

func (f *SymbolTypeFormatter) GetChildren(t types.Type) []types.Type { return nil }

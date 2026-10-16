package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// NeverTypeFormatter mirrors src/TypeFormatter/NeverTypeFormatter.ts.
//
// In the TypeScript implementation HiddenType subclasses NeverType, so
// `instanceof NeverType` also matches hidden types; IsNeverLike mirrors
// that here. The Hidden formatter is registered first, so it wins for
// HiddenType instances.
type NeverTypeFormatter struct{}

func NewNeverTypeFormatter() *NeverTypeFormatter { return &NeverTypeFormatter{} }

func (f *NeverTypeFormatter) SupportsType(t types.Type) bool {
	return types.IsNeverLike(t)
}

func (f *NeverTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	return &schema.Definition{Not: &schema.Definition{}}
}

func (f *NeverTypeFormatter) GetChildren(t types.Type) []types.Type { return nil }

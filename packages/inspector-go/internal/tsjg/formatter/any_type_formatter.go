package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// AnyTypeFormatter mirrors src/TypeFormatter/AnyTypeFormatter.ts.
type AnyTypeFormatter struct{}

func NewAnyTypeFormatter() *AnyTypeFormatter { return &AnyTypeFormatter{} }

func (f *AnyTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.AnyType](t)
}

func (f *AnyTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	return &schema.Definition{}
}

func (f *AnyTypeFormatter) GetChildren(t types.Type) []types.Type { return nil }

package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// UndefinedTypeFormatter mirrors src/TypeFormatter/UndefinedTypeFormatter.ts.
type UndefinedTypeFormatter struct{}

func NewUndefinedTypeFormatter() *UndefinedTypeFormatter { return &UndefinedTypeFormatter{} }

func (f *UndefinedTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.UndefinedType](t)
}

func (f *UndefinedTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	return &schema.Definition{Not: &schema.Definition{}}
}

func (f *UndefinedTypeFormatter) GetChildren(t types.Type) []types.Type { return nil }

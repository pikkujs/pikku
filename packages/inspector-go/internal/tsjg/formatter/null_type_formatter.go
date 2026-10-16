package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// NullTypeFormatter mirrors src/TypeFormatter/NullTypeFormatter.ts.
type NullTypeFormatter struct{}

func NewNullTypeFormatter() *NullTypeFormatter { return &NullTypeFormatter{} }

func (f *NullTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.NullType](t)
}

func (f *NullTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	return &schema.Definition{Type: "null"}
}

func (f *NullTypeFormatter) GetChildren(t types.Type) []types.Type { return nil }

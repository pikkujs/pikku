package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// HiddenTypeFormatter mirrors src/TypeFormatter/HiddenTypeFormatter.ts.
type HiddenTypeFormatter struct{}

func NewHiddenTypeFormatter() *HiddenTypeFormatter { return &HiddenTypeFormatter{} }

func (f *HiddenTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.HiddenType](t)
}

func (f *HiddenTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	return &schema.Definition{AdditionalProperties: false}
}

func (f *HiddenTypeFormatter) GetChildren(t types.Type) []types.Type { return nil }

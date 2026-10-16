package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// ArrayTypeFormatter mirrors src/TypeFormatter/ArrayTypeFormatter.ts.
type ArrayTypeFormatter struct {
	childTypeFormatter TypeFormatter
}

func NewArrayTypeFormatter(childTypeFormatter TypeFormatter) *ArrayTypeFormatter {
	return &ArrayTypeFormatter{childTypeFormatter: childTypeFormatter}
}

func (f *ArrayTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.ArrayType](t)
}

func (f *ArrayTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	return &schema.Definition{
		Type:  "array",
		Items: f.childTypeFormatter.GetDefinition(t.(*types.ArrayType).Item),
	}
}

func (f *ArrayTypeFormatter) GetChildren(t types.Type) []types.Type {
	return f.childTypeFormatter.GetChildren(t.(*types.ArrayType).Item)
}

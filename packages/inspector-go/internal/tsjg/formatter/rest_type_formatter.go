package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// RestTypeFormatter mirrors src/TypeFormatter/RestTypeFormatter.ts.
type RestTypeFormatter struct {
	childTypeFormatter TypeFormatter
}

func NewRestTypeFormatter(childTypeFormatter TypeFormatter) *RestTypeFormatter {
	return &RestTypeFormatter{childTypeFormatter: childTypeFormatter}
}

func (f *RestTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.RestType](t)
}

func (f *RestTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	restType := t.(*types.RestType)
	definition := f.childTypeFormatter.GetDefinition(restType.Type)
	title := restType.Title

	if title != "" {
		if items, ok := definition.Items.(*schema.Definition); ok {
			clone := definition.Clone()
			itemsClone := items.Clone()
			itemsClone.Title = title
			clone.Items = itemsClone
			return clone
		}
	}

	return definition
}

func (f *RestTypeFormatter) GetChildren(t types.Type) []types.Type {
	return f.childTypeFormatter.GetChildren(t.(*types.RestType).Type)
}

package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// DefinitionTypeFormatter mirrors src/TypeFormatter/DefinitionTypeFormatter.ts.
type DefinitionTypeFormatter struct {
	childTypeFormatter TypeFormatter
	encodeRefs         bool
}

func NewDefinitionTypeFormatter(childTypeFormatter TypeFormatter, encodeRefs bool) *DefinitionTypeFormatter {
	return &DefinitionTypeFormatter{childTypeFormatter: childTypeFormatter, encodeRefs: encodeRefs}
}

func (f *DefinitionTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.DefinitionType](t)
}

func (f *DefinitionTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	return definitionRef(t.(*types.DefinitionType).Name(), f.encodeRefs)
}

func (f *DefinitionTypeFormatter) GetChildren(t types.Type) []types.Type {
	definitionType := t.(*types.DefinitionType)
	children := append([]types.Type{definitionType}, f.childTypeFormatter.GetChildren(definitionType.Type)...)
	return unique(children)
}

// definitionRef builds the $ref to a named definition, shared by the
// definition and reference type formatters.
func definitionRef(name string, encodeRefs bool) *schema.Definition {
	if encodeRefs {
		name = schema.EncodeRef(name)
	}
	return &schema.Definition{Ref: "#/definitions/" + name}
}

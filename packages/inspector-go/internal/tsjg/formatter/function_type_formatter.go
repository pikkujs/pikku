package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/config"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/schema"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// FunctionTypeFormatter mirrors src/TypeFormatter/FunctionTypeFormatter.ts.
type FunctionTypeFormatter struct {
	childTypeFormatter TypeFormatter
	functions          config.FunctionOptions
}

func NewFunctionTypeFormatter(childTypeFormatter TypeFormatter, functions config.FunctionOptions) *FunctionTypeFormatter {
	return &FunctionTypeFormatter{childTypeFormatter: childTypeFormatter, functions: functions}
}

func (f *FunctionTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.FunctionType](t)
}

func (f *FunctionTypeFormatter) GetDefinition(t types.Type) *schema.Definition {
	comment, namedArgs := functionParts(t)
	if namedArgs != nil {
		properties := schema.NewProperties()
		properties.Set("namedArgs", f.childTypeFormatter.GetDefinition(namedArgs))
		return &schema.Definition{
			Comment:    comment,
			Type:       "object",
			Properties: properties,
		}
	}

	return &schema.Definition{Comment: comment}
}

func (f *FunctionTypeFormatter) GetChildren(t types.Type) []types.Type {
	_, namedArgs := functionParts(t)
	if namedArgs != nil {
		return f.childTypeFormatter.GetChildren(namedArgs)
	}
	return nil
}

// functionParts extracts the comment and named arguments from a function or
// constructor type (ConstructorType subclasses FunctionType in TypeScript).
// NamedArguments is typed types.Type to admit InferType (see the parser),
// so it flows through as the general interface here.
func functionParts(t types.Type) (comment string, namedArgs types.Type) {
	switch ft := t.(type) {
	case *types.FunctionType:
		return ft.Comment, ft.NamedArguments
	case *types.ConstructorType:
		return ft.Comment, ft.NamedArguments
	}
	return "", nil
}

package formatter

import (
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/config"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// ConstructorTypeFormatter mirrors src/TypeFormatter/ConstructorTypeFormatter.ts,
// which subclasses FunctionTypeFormatter and only overrides supportsType.
type ConstructorTypeFormatter struct {
	*FunctionTypeFormatter
}

func NewConstructorTypeFormatter(childTypeFormatter TypeFormatter, functions config.FunctionOptions) *ConstructorTypeFormatter {
	return &ConstructorTypeFormatter{FunctionTypeFormatter: NewFunctionTypeFormatter(childTypeFormatter, functions)}
}

func (f *ConstructorTypeFormatter) SupportsType(t types.Type) bool {
	return isType[*types.ConstructorType](t)
}

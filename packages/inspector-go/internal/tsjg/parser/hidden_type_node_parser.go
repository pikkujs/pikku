package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/tsutils"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// HiddenNodeParser turns nodes annotated with the @hidden JSDoc tag into
// HiddenType (src/NodeParser/HiddenTypeNodeParser.ts).
type HiddenNodeParser struct{}

func NewHiddenNodeParser() *HiddenNodeParser {
	return &HiddenNodeParser{}
}

func (p *HiddenNodeParser) SupportsNode(node *ast.Node) bool {
	return tsutils.IsNodeHidden(node)
}

func (p *HiddenNodeParser) CreateType(_ *ast.Node, _ *Context, _ *types.ReferenceType) types.Type {
	return &types.HiddenType{}
}

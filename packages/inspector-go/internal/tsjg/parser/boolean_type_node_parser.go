package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// BooleanTypeNodeParser handles the `boolean` keyword
// (src/NodeParser/BooleanTypeNodeParser.ts).
type BooleanTypeNodeParser struct{}

func NewBooleanTypeNodeParser() *BooleanTypeNodeParser {
	return &BooleanTypeNodeParser{}
}

func (p *BooleanTypeNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindBooleanKeyword
}

func (p *BooleanTypeNodeParser) CreateType(_ *ast.Node, _ *Context, _ *types.ReferenceType) types.Type {
	return &types.BooleanType{}
}

package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// NeverTypeNodeParser handles the `never` keyword
// (src/NodeParser/NeverTypeNodeParser.ts).
type NeverTypeNodeParser struct{}

func NewNeverTypeNodeParser() *NeverTypeNodeParser {
	return &NeverTypeNodeParser{}
}

func (p *NeverTypeNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindNeverKeyword
}

func (p *NeverTypeNodeParser) CreateType(_ *ast.Node, _ *Context, _ *types.ReferenceType) types.Type {
	return &types.NeverType{}
}

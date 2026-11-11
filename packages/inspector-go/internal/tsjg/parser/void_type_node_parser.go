package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// VoidTypeNodeParser handles the `void` keyword
// (src/NodeParser/VoidTypeNodeParser.ts).
type VoidTypeNodeParser struct{}

func NewVoidTypeNodeParser() *VoidTypeNodeParser {
	return &VoidTypeNodeParser{}
}

func (p *VoidTypeNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindVoidKeyword
}

func (p *VoidTypeNodeParser) CreateType(_ *ast.Node, _ *Context, _ *types.ReferenceType) types.Type {
	return &types.VoidType{}
}

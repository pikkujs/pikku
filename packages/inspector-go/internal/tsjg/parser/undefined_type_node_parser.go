package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// UndefinedTypeNodeParser handles the `undefined` keyword
// (src/NodeParser/UndefinedTypeNodeParser.ts).
type UndefinedTypeNodeParser struct{}

func NewUndefinedTypeNodeParser() *UndefinedTypeNodeParser {
	return &UndefinedTypeNodeParser{}
}

func (p *UndefinedTypeNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindUndefinedKeyword
}

func (p *UndefinedTypeNodeParser) CreateType(_ *ast.Node, _ *Context, _ *types.ReferenceType) types.Type {
	return &types.UndefinedType{}
}

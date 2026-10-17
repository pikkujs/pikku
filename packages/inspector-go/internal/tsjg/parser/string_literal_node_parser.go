package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// StringLiteralNodeParser handles string literals
// (src/NodeParser/StringLiteralNodeParser.ts).
type StringLiteralNodeParser struct{}

func NewStringLiteralNodeParser() *StringLiteralNodeParser {
	return &StringLiteralNodeParser{}
}

func (p *StringLiteralNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindStringLiteral
}

func (p *StringLiteralNodeParser) CreateType(node *ast.Node, _ *Context, _ *types.ReferenceType) types.Type {
	return &types.LiteralType{Value: node.Text()}
}

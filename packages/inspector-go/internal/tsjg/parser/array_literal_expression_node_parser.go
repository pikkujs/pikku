package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// ArrayLiteralExpressionNodeParser handles array literal expressions like
// `[1, 2, 3]` (src/NodeParser/ArrayLiteralExpressionNodeParser.ts).
type ArrayLiteralExpressionNodeParser struct {
	childNodeParser NodeParser
}

func NewArrayLiteralExpressionNodeParser(childNodeParser NodeParser) *ArrayLiteralExpressionNodeParser {
	return &ArrayLiteralExpressionNodeParser{childNodeParser: childNodeParser}
}

func (p *ArrayLiteralExpressionNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindArrayLiteralExpression
}

func (p *ArrayLiteralExpressionNodeParser) CreateType(node *ast.Node, ctx *Context, _ *types.ReferenceType) types.Type {
	return types.NewTupleType(createTypes(p.childNodeParser, node.AsArrayLiteralExpression().Elements.Nodes, ctx))
}

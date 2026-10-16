package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// NumberTypeNodeParser handles the `number` and `bigint` keywords
// (src/NodeParser/NumberTypeNodeParser.ts).
type NumberTypeNodeParser struct{}

func NewNumberTypeNodeParser() *NumberTypeNodeParser {
	return &NumberTypeNodeParser{}
}

func (p *NumberTypeNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindNumberKeyword || node.Kind == ast.KindBigIntKeyword
}

func (p *NumberTypeNodeParser) CreateType(_ *ast.Node, _ *Context, _ *types.ReferenceType) types.Type {
	return &types.NumberType{}
}

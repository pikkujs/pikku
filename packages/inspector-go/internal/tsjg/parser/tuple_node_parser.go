package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// TupleNodeParser parses tuple type nodes (src/NodeParser/TupleNodeParser.ts).
type TupleNodeParser struct {
	childNodeParser NodeParser
}

func NewTupleNodeParser(childNodeParser NodeParser) *TupleNodeParser {
	return &TupleNodeParser{childNodeParser: childNodeParser}
}

func (p *TupleNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindTupleType
}

func (p *TupleNodeParser) CreateType(node *ast.Node, ctx *Context, _ *types.ReferenceType) types.Type {
	return types.NewTupleType(createTypes(p.childNodeParser, node.AsTupleTypeNode().Elements.Nodes, ctx))
}

package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// SymbolTypeNodeParser handles the `symbol` keyword
// (src/NodeParser/SymbolTypeNodeParser.ts).
type SymbolTypeNodeParser struct{}

func NewSymbolTypeNodeParser() *SymbolTypeNodeParser {
	return &SymbolTypeNodeParser{}
}

func (p *SymbolTypeNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindSymbolKeyword
}

func (p *SymbolTypeNodeParser) CreateType(_ *ast.Node, _ *Context, _ *types.ReferenceType) types.Type {
	return &types.SymbolType{}
}

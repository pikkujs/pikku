package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/tsutils"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// ImportTypeNodeParser resolves `import("./module").MyType` type nodes
// (src/NodeParser/ImportTypeNodeParser.ts).
type ImportTypeNodeParser struct {
	typeChecker     *checker.Checker
	childNodeParser NodeParser
}

func NewImportTypeNodeParser(typeChecker *checker.Checker, childNodeParser NodeParser) *ImportTypeNodeParser {
	return &ImportTypeNodeParser{typeChecker: typeChecker, childNodeParser: childNodeParser}
}

func (p *ImportTypeNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindImportType
}

func (p *ImportTypeNodeParser) CreateType(node *ast.Node, ctx *Context, _ *types.ReferenceType) types.Type {
	// Resolve the symbol from the qualifier (e.g., `MyType` in
	// `import("./module").MyType`).
	symbolLocation := node.AsImportTypeNode().Qualifier
	if symbolLocation == nil {
		symbolLocation = node
	}
	typeSymbol := tsutils.GetSymbolAtLocation(p.typeChecker, symbolLocation)

	// Handle transitive re-exports.
	if typeSymbol.Flags&ast.SymbolFlagsAlias != 0 {
		aliasedSymbol := p.typeChecker.GetAliasedSymbol(typeSymbol)
		return p.childNodeParser.CreateType(aliasedSymbol.Declarations[0], newTypeArgumentContext(p.childNodeParser, node, ctx), nil)
	}

	return p.childNodeParser.CreateType(typeSymbol.Declarations[0], newTypeArgumentContext(p.childNodeParser, node, ctx), nil)
}

package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// NewExpressionParser parses `new Foo()` expressions via the constructed type
// (src/NodeParser/NewExpressionParser.ts).
type NewExpressionParser struct {
	typeChecker     *checker.Checker
	childNodeParser NodeParser
	synth           *SynthesizedSymbols
}

func NewNewExpressionParser(typeChecker *checker.Checker, childNodeParser NodeParser, synth *SynthesizedSymbols) *NewExpressionParser {
	return &NewExpressionParser{typeChecker: typeChecker, childNodeParser: childNodeParser, synth: synth}
}

func (p *NewExpressionParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindNewExpression
}

func (p *NewExpressionParser) CreateType(node *ast.Node, context *Context, _ *types.ReferenceType) types.Type {
	t := p.typeChecker.GetTypeAtLocation(node)

	decl := expressionDeclaration(p.typeChecker, t, node, p.synth)
	return p.childNodeParser.CreateType(decl, newCallArgumentContext(p.childNodeParser, node, context), nil)
}

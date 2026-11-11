package parser

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// PromiseNodeParser unwraps Promise<T> (src/NodeParser/PromiseNodeParser.ts).
//
// It must be registered before the InterfaceDeclaration, ClassDeclaration,
// ExpressionWithTypeArguments and TypeAliasDeclaration parsers (the chain
// wiring is responsible for that).
type PromiseNodeParser struct {
	typeChecker     *checker.Checker
	childNodeParser NodeParser
	synth           *SynthesizedSymbols
}

func NewPromiseNodeParser(typeChecker *checker.Checker, childNodeParser NodeParser, synth *SynthesizedSymbols) *PromiseNodeParser {
	return &PromiseNodeParser{typeChecker: typeChecker, childNodeParser: childNodeParser, synth: synth}
}

func (p *PromiseNodeParser) SupportsNode(node *ast.Node) bool {
	if !ast.IsInterfaceDeclaration(node) && // interface PromiseInterface extends Promise<T>
		!ast.IsClassDeclaration(node) && // class PromiseClass implements Promise<T>
		!ast.IsExpressionWithTypeArguments(node) && // Promise<T> in a heritage clause
		!ast.IsTypeAliasDeclaration(node) { // type PromiseAlias = Promise<T>
		return false
	}

	t := p.typeChecker.GetTypeAtLocation(node)
	awaitedType := checker.Checker_getAwaitedType(p.typeChecker, t)

	// Ignore non-awaitable types.
	if awaitedType == nil {
		return false
	}

	// If the awaited type differs from the original type, the type extends
	// promise: Awaited<Promise<T>> -> T (Promise<T> !== T);
	// Awaited<Y> -> Y (Y === Y).
	if awaitedType == t {
		return false
	}

	// In types like: A<T> = T, type C = A<1>, C has the same type as A<1> and
	// 1; the awaited type is not the same reference as the type, so an
	// assignability check is needed.
	return !p.typeChecker.IsTypeAssignableTo(t, awaitedType) &&
		!p.typeChecker.IsTypeAssignableTo(awaitedType, t)
}

func (p *PromiseNodeParser) CreateType(node *ast.Node, context *Context, _ *types.ReferenceType) types.Type {
	t := p.typeChecker.GetTypeAtLocation(node)
	awaitedType := checker.Checker_getAwaitedType(p.typeChecker, t)
	awaitedNode := tsutil.TypeToTypeNode(p.typeChecker, awaitedType, nil, nodeBuilderFlagsIgnoreErrors, p.synth.Map())

	if awaitedNode == nil {
		panic(fmt.Errorf("could not find awaited node %s", DescribeNode(node)))
	}

	// A fresh context: type arguments are not propagated.
	baseNode := p.childNodeParser.CreateType(awaitedNode, NewContext(node), nil)

	name := p.getNodeName(node)

	// Nodes without a name should just be their awaited type:
	// export class extends Promise<T> {} -> T
	// export class A extends Promise<T> {} -> A (ref to T)
	if name == "" {
		return baseNode
	}

	return types.NewDefinitionType(name, types.NewAliasType("promise-"+GetNodeKey(node, context), baseNode))
}

func (p *PromiseNodeParser) getNodeName(node *ast.Node) string {
	if ast.IsExpressionWithTypeArguments(node) {
		if node.Parent == nil || !ast.IsHeritageClause(node.Parent) {
			panic(fmt.Errorf("expected ExpressionWithTypeArguments to have a HeritageClause parent %s", DescribeNode(node.Parent)))
		}
		if name := node.Parent.Parent.Name(); name != nil {
			return nodeText(name)
		}
		return ""
	}
	if name := node.Name(); name != nil {
		return nodeText(name)
	}
	return ""
}

package parser

// Helpers that several node parsers use. The TypeScript implementation
// repeats them as private methods in each of the corresponding files.

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/tsutils"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// createTypes parses each node in the given context.
func createTypes(child NodeParser, nodes []*ast.Node, ctx *Context) []types.Type {
	result := make([]types.Type, len(nodes))
	for i, node := range nodes {
		result[i] = child.CreateType(node, ctx, nil)
	}
	return result
}

// singleOrUnion returns the only element of ts, or a union of all elements.
func singleOrUnion(ts []types.Type) types.Type {
	if len(ts) == 1 {
		return ts[0]
	}
	return types.NewUnionType(ts)
}

// joinTypes renders each type with render and joins the results with commas.
// A nil type renders as the empty string.
func joinTypes(ts []types.Type, render func(types.Type) string) string {
	rendered := make([]string, len(ts))
	for i, t := range ts {
		if t != nil {
			rendered[i] = render(t)
		}
	}
	return strings.Join(rendered, ",")
}

// newArgumentContext builds a sub context for node whose arguments are the
// given nodes, each parsed in the parent context.
func newArgumentContext(child NodeParser, node *ast.Node, arguments []*ast.Node, parentContext *Context) *Context {
	subContext := NewContext(node)
	for _, argument := range createTypes(child, arguments, parentContext) {
		subContext.PushArgument(argument)
	}
	return subContext
}

// newTypeArgumentContext builds the sub context for a node's explicit type
// arguments, each parsed in the parent context.
func newTypeArgumentContext(child NodeParser, node *ast.Node, parentContext *Context) *Context {
	return newArgumentContext(child, node, node.TypeArguments(), parentContext)
}

// newCallArgumentContext builds the sub context for the value arguments of a
// call or new expression, each parsed in the parent context.
func newCallArgumentContext(child NodeParser, node *ast.Node, parentContext *Context) *Context {
	return newArgumentContext(child, node, node.Arguments(), parentContext)
}

// inheritParameters copies every type parameter of parentContext except skip,
// with its resolved argument, into subContext.
func inheritParameters(subContext, parentContext *Context, skip string) {
	for _, parentParameter := range parentContext.Parameters() {
		if parentParameter == skip {
			continue
		}
		subContext.PushParameter(parentParameter)
		subContext.PushArgument(parentContext.GetArgument(parentParameter))
	}
}

// pushTypeParameters pushes the names (and defaults) of a declaration's type
// parameters onto ctx, zipping them positionally with the arguments the
// caller already pushed. Defaults are parsed in ctx itself.
func pushTypeParameters(typeChecker *checker.Checker, child NodeParser, node *ast.Node, ctx *Context) {
	for _, typeParam := range node.TypeParameters() {
		nameSymbol := tsutils.GetSymbolAtLocation(typeChecker, typeParam.Name())
		ctx.PushParameter(nameSymbol.Name)

		if defaultType := typeParam.AsTypeParameterDeclaration().DefaultType; defaultType != nil {
			ctx.SetDefault(nameSymbol.Name, child.CreateType(defaultType, ctx, nil))
		}
	}
}

// expressionDeclaration resolves the declaration standing behind the type of a
// call or new expression. For generic signatures such as <T>(type: T) => T
// there is no reference to the original type, so the checker's synthesized
// type node is preferred over the symbol's declaration.
func expressionDeclaration(typeChecker *checker.Checker, t *checker.Type, node *ast.Node, synth *SynthesizedSymbols) *ast.Node {
	symbol := t.Symbol()
	if symbol == nil && t.Alias() != nil {
		symbol = t.Alias().Symbol()
	}

	decl := tsutil.TypeToTypeNode(typeChecker, t, node, nodeBuilderFlagsIgnoreErrors, synth.Map())
	if decl == nil && symbol != nil {
		decl = symbol.ValueDeclaration
		if decl == nil && len(symbol.Declarations) > 0 {
			decl = symbol.Declarations[0]
		}
	}

	if decl == nil {
		panic(NewUnknownNodeError(node))
	}
	return decl
}

// memberAdditionalProperties resolves the additionalProperties value implied
// by a member list's index signature, falling back to the parser's default.
func memberAdditionalProperties(child NodeParser, node *ast.Node, context *Context, fallback any) any {
	for _, member := range node.Members() {
		if ast.IsIndexSignatureDeclaration(member) {
			if t := child.CreateType(member.Type(), context, nil); t != nil {
				return t
			}
			return fallback
		}
	}
	return fallback
}

// memberPropertyName renders a member's name, resolving computed names through
// the checker. nodeText falls back to the text property for synthesized nodes,
// mirroring the try/catch with escapedText/text upstream.
func memberPropertyName(typeChecker *checker.Checker, propertyName *ast.Node) string {
	if propertyName.Kind == ast.KindComputedPropertyName {
		if symbol := tsutils.GetSymbolAtLocation(typeChecker, propertyName); symbol != nil {
			return symbol.Name
		}
	}
	return nodeText(propertyName)
}

package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/jsnum"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// CallExpressionParser parses call expressions by evaluating the call's
// return type (src/NodeParser/CallExpressionParser.ts).
type CallExpressionParser struct {
	typeChecker     *checker.Checker
	childNodeParser NodeParser
	synth           *SynthesizedSymbols
}

func NewCallExpressionParser(typeChecker *checker.Checker, childNodeParser NodeParser, synth *SynthesizedSymbols) *CallExpressionParser {
	return &CallExpressionParser{typeChecker: typeChecker, childNodeParser: childNodeParser, synth: synth}
}

func (p *CallExpressionParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindCallExpression
}

func (p *CallExpressionParser) CreateType(node *ast.Node, context *Context, _ *types.ReferenceType) types.Type {
	t := p.typeChecker.GetTypeAtLocation(node)

	// FIXME(upstream): remove special case. The upstream implementation pokes
	// at the internal `type.typeArguments[0].types` fields of a resolved type
	// reference whose first type argument is a union, and maps the union
	// constituents to literal types.
	if t != nil && t.Flags()&checker.TypeFlagsObject != 0 && t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		typeArguments := p.typeChecker.GetTypeArguments(t)
		if len(typeArguments) > 0 && typeArguments[0] != nil &&
			typeArguments[0].Flags()&checker.TypeFlagsUnionOrIntersection != 0 {
			var members []types.Type
			for _, member := range typeArguments[0].Types() {
				members = append(members, &types.LiteralType{Value: checkerLiteralValue(member)})
			}
			return types.NewTupleType([]types.Type{types.NewUnionType(members)})
		}
	}

	// A call expression like Symbol("entity") that resulted in a
	// `unique symbol`. Note the strict equality (not a bitmask test),
	// mirroring the upstream code.
	if t.Flags() == checker.TypeFlagsUniqueESSymbol {
		return &types.SymbolType{}
	}

	decl := expressionDeclaration(p.typeChecker, t, node, p.synth)
	return p.childNodeParser.CreateType(decl, newCallArgumentContext(p.childNodeParser, node, context), nil)
}

// checkerLiteralValue extracts the literal value of a checker type, mirroring
// the internal `.value` property read upstream (undefined - here nil - for
// non-literal types such as intrinsic boolean literals).
func checkerLiteralValue(t *checker.Type) any {
	if t == nil {
		return nil
	}
	if t.Flags()&(checker.TypeFlagsStringLiteral|checker.TypeFlagsNumberLiteral) != 0 {
		value := t.AsLiteralType().Value()
		if number, isNumber := value.(jsnum.Number); isNumber {
			return float64(number)
		}
		return value
	}
	return nil
}

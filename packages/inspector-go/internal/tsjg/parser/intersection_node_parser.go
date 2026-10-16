package parser

import (
	"slices"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// IntersectionNodeParser parses intersection type nodes
// (src/NodeParser/IntersectionNodeParser.ts). The translate() helper lives in
// types.Translate.
type IntersectionNodeParser struct {
	childNodeParser NodeParser
}

func NewIntersectionNodeParser(childNodeParser NodeParser) *IntersectionNodeParser {
	return &IntersectionNodeParser{childNodeParser: childNodeParser}
}

func (p *IntersectionNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindIntersectionType
}

func (p *IntersectionNodeParser) CreateType(node *ast.Node, ctx *Context, _ *types.ReferenceType) types.Type {
	memberTypes := createTypes(p.childNodeParser, node.AsIntersectionTypeNode().Types.Nodes, ctx)

	// If any type is never, the intersection type resolves to never.
	if slices.ContainsFunc(memberTypes, types.IsNeverLike) {
		return &types.NeverType{}
	}

	// Handle autocomplete hacks like `string & {}`.
	if len(memberTypes) == 2 && (isEmptyObject(memberTypes[0]) || isEmptyObject(memberTypes[1])) {
		for _, typ := range memberTypes {
			if _, isString := typ.(*types.StringType); isString {
				return &types.StringType{PreserveLiterals: true}
			}
		}
		var nonObject types.Type
		for _, typ := range memberTypes {
			if !isEmptyObject(typ) {
				nonObject = typ
				break
			}
		}
		if _, isLiteral := nonObject.(*types.LiteralType); isLiteral {
			return nonObject
		}
		if union, isUnion := nonObject.(*types.UnionType); isUnion && types.IsLiteralUnion(union) {
			return nonObject
		}
	}

	return types.Translate(memberTypes)
}

func isEmptyObject(x types.Type) bool {
	object, isObject := types.DerefType(x).(*types.ObjectType)
	if !isObject {
		return false
	}
	additionalProperties := object.AdditionalProperties
	return (additionalProperties == nil || additionalProperties == false) && len(object.Properties) == 0
}

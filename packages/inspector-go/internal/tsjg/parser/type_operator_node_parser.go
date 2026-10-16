package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// TypeOperatorNodeParser parses `keyof`/`readonly`/`unique` type operator
// nodes (src/NodeParser/TypeOperatorNodeParser.ts).
type TypeOperatorNodeParser struct {
	childNodeParser NodeParser
}

func NewTypeOperatorNodeParser(childNodeParser NodeParser) *TypeOperatorNodeParser {
	return &TypeOperatorNodeParser{childNodeParser: childNodeParser}
}

// hasTypedAdditionalProperties reports whether the object or any of its base
// types carries a typed index signature. The TypeScript implementation only
// checks the object's own additionalProperties; since TypeScript 7's lib
// files moved several index signatures onto base interfaces (for example
// CSSStyleDeclaration), the inherited case must count too for `keyof` to keep
// producing `string`.
func hasTypedAdditionalProperties(object *types.ObjectType) bool {
	if _, ok := object.AdditionalProperties.(types.Type); ok {
		return true
	}
	for _, base := range object.BaseTypes {
		if parent, ok := types.DerefType(base).(*types.ObjectType); ok && hasTypedAdditionalProperties(parent) {
			return true
		}
	}
	return false
}

func (p *TypeOperatorNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindTypeOperator
}

func (p *TypeOperatorNodeParser) CreateType(node *ast.Node, ctx *Context, _ *types.ReferenceType) types.Type {
	operatorNode := node.AsTypeOperatorNode()
	typ := p.childNodeParser.CreateType(operatorNode.Type, ctx, nil)
	derefed := types.DerefType(typ)

	// Remove readonly modifier from type.
	if operatorNode.Operator == ast.KindReadonlyKeyword && derefed != nil {
		return derefed
	}

	if _, isArray := derefed.(*types.ArrayType); isArray {
		return &types.NumberType{}
	}

	keys := types.GetTypeKeys(typ)
	keyTypes := make([]types.Type, len(keys))
	for i, key := range keys {
		keyTypes[i] = key
	}

	if object, isObject := derefed.(*types.ObjectType); isObject && hasTypedAdditionalProperties(object) {
		return types.NewUnionType(append(keyTypes, &types.StringType{}))
	}

	return singleOrUnion(keyTypes)
}

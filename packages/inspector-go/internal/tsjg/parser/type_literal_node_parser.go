package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/tsutils"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// TypeLiteralNodeParser parses inline object type literals
// (src/NodeParser/TypeLiteralNodeParser.ts).
type TypeLiteralNodeParser struct {
	typeChecker          *checker.Checker
	childNodeParser      NodeParser
	additionalProperties bool
}

func NewTypeLiteralNodeParser(typeChecker *checker.Checker, childNodeParser NodeParser, additionalProperties bool) *TypeLiteralNodeParser {
	return &TypeLiteralNodeParser{
		typeChecker:          typeChecker,
		childNodeParser:      childNodeParser,
		additionalProperties: additionalProperties,
	}
}

func (p *TypeLiteralNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindTypeLiteral
}

func (p *TypeLiteralNodeParser) CreateType(node *ast.Node, context *Context, reference *types.ReferenceType) types.Type {
	id := p.getTypeId(node, context)
	if reference != nil {
		reference.SetID(id)
		reference.SetName(id)
	}

	properties, hasRequiredNever := p.getProperties(node, context)
	if hasRequiredNever {
		return &types.NeverType{}
	}

	return types.NewObjectType(id, nil, properties, memberAdditionalProperties(p.childNodeParser, node, context, p.additionalProperties), false)
}

func (p *TypeLiteralNodeParser) getProperties(node *ast.Node, context *Context) ([]*types.ObjectProperty, bool) {
	hasRequiredNever := false
	var properties []*types.ObjectProperty

	for _, member := range node.Members() {
		if !ast.IsPropertySignatureDeclaration(member) && !ast.IsMethodSignatureDeclaration(member) {
			continue
		}
		if tsutils.IsNodeHidden(member) {
			continue
		}

		property := types.NewObjectProperty(
			memberPropertyName(p.typeChecker, member.Name()),
			p.childNodeParser.CreateType(member.Type(), context, nil),
			member.QuestionToken() == nil,
		)

		if types.IsNeverLike(property.Type) {
			if property.Required {
				hasRequiredNever = true
			}
			continue
		}
		properties = append(properties, property)
	}

	if hasRequiredNever {
		return nil, true
	}
	return properties, false
}

func (p *TypeLiteralNodeParser) getTypeId(node *ast.Node, context *Context) string {
	return "structure-" + GetNodeKey(node, context)
}

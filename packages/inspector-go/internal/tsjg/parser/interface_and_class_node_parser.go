package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/tsutils"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// InterfaceAndClassNodeParser parses interface and class declarations into
// object types (src/NodeParser/InterfaceAndClassNodeParser.ts).
type InterfaceAndClassNodeParser struct {
	typeChecker          *checker.Checker
	childNodeParser      NodeParser
	additionalProperties bool
	synth                *SynthesizedSymbols
}

func NewInterfaceAndClassNodeParser(typeChecker *checker.Checker, childNodeParser NodeParser, additionalProperties bool, synth *SynthesizedSymbols) *InterfaceAndClassNodeParser {
	return &InterfaceAndClassNodeParser{
		typeChecker:          typeChecker,
		childNodeParser:      childNodeParser,
		additionalProperties: additionalProperties,
		synth:                synth,
	}
}

func (p *InterfaceAndClassNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindInterfaceDeclaration || node.Kind == ast.KindClassDeclaration
}

func (p *InterfaceAndClassNodeParser) CreateType(node *ast.Node, context *Context, reference *types.ReferenceType) types.Type {
	// Note: this mutates the caller's context, zipping parameter names onto
	// the type arguments already pushed by TypeReferenceNodeParser.
	pushTypeParameters(p.typeChecker, p.childNodeParser, node, context)

	id := p.getTypeId(node, context)
	if reference != nil {
		reference.SetID(id)
		reference.SetName(id)
	}

	properties, hasRequiredNever := p.getProperties(node, context)
	if hasRequiredNever {
		return &types.NeverType{}
	}

	additionalProperties := memberAdditionalProperties(p.childNodeParser, node, context, p.additionalProperties)

	// When the type only extends Array or ReadonlyArray then create an array
	// type instead of an object type.
	if len(properties) == 0 {
		if apBool, ok := additionalProperties.(bool); ok && !apBool {
			if arrayItemType := p.getArrayItemType(node); arrayItemType != nil {
				return &types.ArrayType{Item: p.childNodeParser.CreateType(arrayItemType, context, nil)}
			}
		}
	}

	return types.NewObjectType(id, p.getBaseTypes(node, context), properties, additionalProperties, false)
}

// getArrayItemType returns the array item type if the node extends Array or
// ReadonlyArray and nothing else, nil otherwise.
func (p *InterfaceAndClassNodeParser) getArrayItemType(node *ast.Node) *ast.Node {
	clauses := heritageClausesOf(node)
	if len(clauses) != 1 {
		return nil
	}
	clauseTypes := clauses[0].AsHeritageClause().Types.Nodes
	if len(clauseTypes) != 1 {
		return nil
	}
	expr := clauseTypes[0]
	symbol := tsutils.GetSymbolAtLocation(p.typeChecker, expr.AsExpressionWithTypeArguments().Expression)
	if symbol == nil || (symbol.Name != "Array" && symbol.Name != "ReadonlyArray") {
		return nil
	}
	typeArguments := expr.TypeArguments()
	if len(typeArguments) != 1 {
		return nil
	}
	return typeArguments[0]
}

func (p *InterfaceAndClassNodeParser) getBaseTypes(node *ast.Node, context *Context) []types.Type {
	var result []types.Type
	for _, clause := range heritageClausesOf(node) {
		for _, expression := range clause.AsHeritageClause().Types.Nodes {
			result = append(result, p.childNodeParser.CreateType(expression, context, nil))
		}
	}
	return result
}

// getProperties returns the parsed object properties. The second return value
// reports whether a required property resolved to never, which makes the
// whole type never (the upstream implementation returns undefined then).
func (p *InterfaceAndClassNodeParser) getProperties(node *ast.Node, context *Context) ([]*types.ObjectProperty, bool) {
	var members []*ast.Node
	for _, member := range node.Members() {
		if ast.IsConstructorDeclaration(member) {
			for _, param := range member.Parameters() {
				if ast.IsParameterPropertyDeclaration(param, param.Parent) {
					members = append(members, param)
				}
			}
		} else if ast.IsPropertySignatureDeclaration(member) || ast.IsPropertyDeclaration(member) {
			members = append(members, member)
		}
	}

	hasRequiredNever := false
	var properties []*types.ObjectProperty
	for _, member := range members {
		if !tsutils.IsPublic(member) || tsutils.IsStatic(member) || tsutils.IsNodeHidden(member) {
			continue
		}

		memberType := member.Type()

		// Use the type checker if the member has no explicit type.
		// Ignore members without an initializer; they have no useful type.
		if memberType == nil && member.Initializer() != nil {
			t := p.typeChecker.GetTypeAtLocation(member)
			memberType = tsutil.TypeToTypeNode(p.typeChecker, t, node, nodeBuilderFlagsNoTruncation, p.synth.Map())

			// TypeToTypeNode returns a node that is detached from the AST, so
			// AnnotatedNodeParser cannot walk up to the member to read its
			// JSDoc. Point the synthesized node at the original declaration so
			// annotations such as the property description are preserved.
			// See upstream issue #1531.
			if memberType != nil {
				memberType.Parent = member
			}
		}

		if memberType == nil {
			continue
		}

		property := types.NewObjectProperty(
			memberPropertyName(p.typeChecker, member.Name()),
			p.childNodeParser.CreateType(memberType, context, nil),
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

func (p *InterfaceAndClassNodeParser) getTypeId(node *ast.Node, context *Context) string {
	nodeType := "class"
	if ast.IsInterfaceDeclaration(node) {
		nodeType = "interface"
	}
	return nodeType + "-" + GetNodeKey(node, context)
}

// heritageClausesOf returns the heritage clauses of an interface or class
// declaration (empty otherwise).
func heritageClausesOf(node *ast.Node) []*ast.Node {
	var list *ast.NodeList
	switch node.Kind {
	case ast.KindInterfaceDeclaration:
		list = node.AsInterfaceDeclaration().HeritageClauses
	case ast.KindClassDeclaration:
		list = node.AsClassDeclaration().HeritageClauses
	}
	if list == nil {
		return nil
	}
	return list.Nodes
}

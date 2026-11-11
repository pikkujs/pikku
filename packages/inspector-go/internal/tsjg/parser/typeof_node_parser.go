package parser

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/tsutils"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// TypeofNodeParser parses `typeof X` type query nodes
// (src/NodeParser/TypeofNodeParser.ts).
type TypeofNodeParser struct {
	typeChecker     *checker.Checker
	childNodeParser NodeParser
}

func NewTypeofNodeParser(typeChecker *checker.Checker, childNodeParser NodeParser) *TypeofNodeParser {
	return &TypeofNodeParser{typeChecker: typeChecker, childNodeParser: childNodeParser}
}

func (p *TypeofNodeParser) SupportsNode(node *ast.Node) bool {
	return node.Kind == ast.KindTypeQuery
}

func (p *TypeofNodeParser) CreateType(node *ast.Node, ctx *Context, reference *types.ReferenceType) types.Type {
	symbol := tsutils.GetSymbolAtLocation(p.typeChecker, node.AsTypeQueryNode().ExprName)
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = p.typeChecker.GetAliasedSymbol(symbol)
	}

	valueDec := symbol.ValueDeclaration
	if valueDec == nil {
		if symbol.Name == "globalThis" {
			// Avoids crashes on globalThis, but we really shouldn't try to
			// make a schema for globalThis.
			return &types.NeverType{}
		}
		panic(fmt.Errorf("no value declaration found for symbol %q at node %s", symbol.Name, DescribeNode(node)))
	}

	if ast.IsEnumDeclaration(valueDec) {
		return p.createObjectFromEnum(valueDec, ctx, reference)
	}

	if ast.IsVariableDeclaration(valueDec) || ast.IsPropertySignatureDeclaration(valueDec) || ast.IsPropertyDeclaration(valueDec) {
		if declaredType := valueDec.Type(); declaredType != nil {
			return p.childNodeParser.CreateType(declaredType, ctx, nil)
		}
		if initializer := valueDec.Initializer(); initializer != nil {
			return p.childNodeParser.CreateType(initializer, ctx, nil)
		}
	}

	if ast.IsClassDeclaration(valueDec) {
		return p.childNodeParser.CreateType(valueDec, ctx, nil)
	}

	if ast.IsPropertyAssignment(valueDec) {
		return p.childNodeParser.CreateType(valueDec.AsPropertyAssignment().Initializer, ctx, nil)
	}

	if ast.IsFunctionDeclaration(valueDec) {
		return &types.FunctionType{
			Comment:        signatureComment(valueDec, ""),
			NamedArguments: GetNamedArguments(p.childNodeParser, valueDec, ctx),
			ReturnType:     GetReturnType(p.childNodeParser, valueDec, ctx),
		}
	}

	panic(fmt.Errorf("invalid type query for this declaration. (ts.SyntaxKind = %d) at node %s", valueDec.Kind, DescribeNode(valueDec)))
}

func (p *TypeofNodeParser) createObjectFromEnum(node *ast.Node, ctx *Context, reference *types.ReferenceType) types.Type {
	id := "typeof-enum-" + GetNodeKey(node, ctx)
	if reference != nil {
		reference.SetID(id)
		reference.SetName(id)
	}

	var current types.Type
	members := node.Members()
	properties := make([]*types.ObjectProperty, 0, len(members))
	for _, member := range members {
		name := scanner.GetTextOfNode(member.Name())

		if initializer := member.AsEnumMember().Initializer; initializer != nil {
			current = p.childNodeParser.CreateType(initializer, ctx, nil)
		} else if current == nil {
			current = &types.LiteralType{Value: float64(0)}
		} else if literal, isLiteral := current.(*types.LiteralType); isLiteral {
			if value, isNumber := literal.Value.(float64); isNumber {
				current = &types.LiteralType{Value: value + 1}
			} else {
				panic(fmt.Errorf("enum initializer missing for %q at node %s", name, DescribeNode(member.Name())))
			}
		} else {
			panic(fmt.Errorf("enum initializer missing for %q at node %s", name, DescribeNode(member.Name())))
		}

		properties = append(properties, types.NewObjectProperty(name, current, true))
	}

	return types.NewObjectType(id, nil, properties, false, false)
}

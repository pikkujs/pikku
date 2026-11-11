package tsutil

import (
	"slices"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/jsnum"
	"github.com/microsoft/typescript-go/shim/printer"
)

// Union constituent and mapped-type property order.
//
// Strada keeps a union's constituents sorted by type id, which is creation
// order: `z.enum(['low', 'medium', 'high'])` prints as
// `"low" | "medium" | "high"`. typescript-go sorts them by value instead, so
// the same type prints as `"high" | "low" | "medium"`, and every type string
// (typesMap, custom types) and the schema enums generated from them come out
// reordered. Literal and keyword types are interned per checker and their ids
// are still allocated in creation order, so sorting a printed union's members
// by those ids gives back Strada's order.
//
// A mapped type over a key union ({ [K in 'b' | 'a']: X }, Pick, Record, the
// Kysely Selection behind `.select(['name', 'email'])`) creates its properties
// in the order it iterates that union, so its members print in value order
// too, and with them a schema's `required`. Their Strada order is the ids of
// the key literals, carried through homomorphic mapped types ({ [K in keyof
// T]: X }) unchanged.

// nodeBuilderFlagsIgnoreErrors is nodebuilder.FlagsIgnoreErrors, which
// typeToStringEx always adds; the internal package cannot be imported.
const nodeBuilderFlagsIgnoreErrors = 1<<15 | 1<<16 | 1<<17 | 1<<18 | 1<<19 | 1<<21 | 1<<26

// noTruncationMaxLength is typeToStringEx's cut-off with NoTruncation set
// (noTruncationMaximumTruncationLength * 2).
const noTruncationMaxLength = 1_000_000 * 2

// TypeToString is checker.TypeToStringEx(t, nil, flags, nil) with union
// members printed in Strada's (type id) order.
func TypeToString(c *checker.Checker, t *checker.Type, flags checker.TypeFormatFlags) string {
	return TypeToStringAt(c, t, nil, flags)
}

// TypeToStringAt is checker.TypeToStringEx(t, enclosing, flags, nil) with
// union members and mapped-type properties in Strada's order.
func TypeToStringAt(c *checker.Checker, t *checker.Type, enclosing *ast.Node, flags checker.TypeFormatFlags) string {
	ec := printer.NewEmitContext()
	nb := checker.NewNodeBuilder(c, ec)
	builderFlags := uint32(flags&checker.TypeFormatFlagsNodeBuilderFlagsMask) | nodeBuilderFlagsIgnoreErrors
	noTruncation := flags&checker.TypeFormatFlagsNoTruncation != 0
	if noTruncation {
		builderFlags |= 1 // nodebuilder.FlagsNoTruncation
	}
	node := buildTypeNode(nb.TypeToTypeNode, t, enclosing, builderFlags)
	if node == nil {
		panic("should always get typenode")
	}
	ReorderTypeNode(c, t, node)
	newLine := ""
	if flags&checker.TypeFormatFlagsMultilineObjectLiterals != 0 {
		newLine = "\n"
	}
	writer := printer.NewTextWriter(newLine, 0)
	p := printer.NewPrinter(printer.PrinterOptions{RemoveComments: true}, printer.PrintHandlers{}, ec)
	p.Write(node, nil, writer, nil)
	result := writer.String()
	maxLength := 160 * 2 // defaultMaximumTruncationLength * 2
	if noTruncation {
		maxLength = noTruncationMaxLength
	}
	if result != "" && len(result) >= maxLength {
		return result[0:maxLength-len("...")] + "..."
	}
	return result
}

// TypeToTypeNode is checker.TypeToTypeNode with union members in Strada's
// (type id) order.
func TypeToTypeNode(c *checker.Checker, t *checker.Type, enclosing *ast.Node, flags uint32, idToSymbol map[*ast.IdentifierNode]*ast.Symbol) *ast.Node {
	nb := checker.NewNodeBuilderEx(c, printer.NewEmitContext(), idToSymbol)
	node := buildTypeNode(nb.TypeToTypeNode, t, enclosing, flags)
	if node != nil {
		ReorderTypeNode(c, t, node)
	}
	return node
}

// buildTypeNode calls NodeBuilder.TypeToTypeNode, whose flag and tracker
// parameter types live in typescript-go's unshimmed nodebuilder package.
func buildTypeNode[F ~uint32, I ~int32, T any](
	typeToTypeNode func(*checker.Type, *ast.Node, F, I, T) *ast.Node,
	t *checker.Type, enclosing *ast.Node, flags uint32,
) *ast.Node {
	var noTracker T
	return typeToTypeNode(t, enclosing, F(flags), 0, noTracker)
}

// ReorderUnionTypeNodes sorts, in place, the members of every synthesized
// union type node under node by the id of the type each member denotes. Only
// unions whose members are all literal or keyword types are touched: those
// are the members whose type can be recovered from the node alone. Null and
// undefined keep their place at the end, where formatUnionTypes puts them in
// both compilers. Nodes taken from source text are left alone.
func ReorderUnionTypeNodes(c *checker.Checker, node *ast.Node) {
	var visit func(n *ast.Node) bool
	visit = func(n *ast.Node) bool {
		if n.Kind == ast.KindUnionType && n.Flags&ast.NodeFlagsSynthesized != 0 {
			reorderUnion(c, n.AsUnionTypeNode().Types)
		}
		n.ForEachChild(visit)
		return false
	}
	visit(node)
}

func reorderUnion(c *checker.Checker, list *ast.NodeList) {
	if list == nil {
		return
	}
	nodes := list.Nodes
	// formatUnionTypes appends null and undefined after the rest.
	end := len(nodes)
	for end > 0 && isNullish(nodes[end-1]) {
		end--
	}
	if end < 2 {
		return
	}
	keys := make(map[*ast.Node]checker.TypeId, end)
	for _, n := range nodes[:end] {
		t := typeOfLiteralOrKeywordNode(c, n)
		if t == nil {
			return
		}
		keys[n] = t.Id()
	}
	slices.SortStableFunc(nodes[:end], func(a, b *ast.Node) int {
		return int(keys[a]) - int(keys[b])
	})
}

func isNullish(n *ast.Node) bool {
	switch n.Kind {
	case ast.KindUndefinedKeyword:
		return true
	case ast.KindLiteralType:
		return n.AsLiteralTypeNode().Literal.Kind == ast.KindNullKeyword
	}
	return false
}

// typeOfLiteralOrKeywordNode is the interned type a synthesized literal or
// keyword type node stands for, or nil for any other node.
func typeOfLiteralOrKeywordNode(c *checker.Checker, n *ast.Node) *checker.Type {
	switch n.Kind {
	case ast.KindStringKeyword:
		return c.GetStringType()
	case ast.KindNumberKeyword:
		return c.GetNumberType()
	case ast.KindBigIntKeyword:
		return c.GetBigIntType()
	case ast.KindSymbolKeyword:
		return c.GetESSymbolType()
	case ast.KindVoidKeyword:
		return c.GetVoidType()
	case ast.KindBooleanKeyword:
		// `boolean` stands for false | true; the union holds it at false's place.
		return booleanLiteral(c, false)
	case ast.KindLiteralType:
		lit := n.AsLiteralTypeNode().Literal
		switch lit.Kind {
		case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
			return checker.Checker_getStringLiteralType(c, lit.Text())
		case ast.KindNumericLiteral:
			return checker.Checker_getNumberLiteralType(c, jsnum.FromString(lit.Text()))
		case ast.KindPrefixUnaryExpression:
			u := lit.AsPrefixUnaryExpression()
			if u.Operator == ast.KindMinusToken && u.Operand.Kind == ast.KindNumericLiteral {
				return checker.Checker_getNumberLiteralType(c, -jsnum.FromString(u.Operand.Text()))
			}
		case ast.KindTrueKeyword:
			return booleanLiteral(c, true)
		case ast.KindFalseKeyword:
			return booleanLiteral(c, false)
		}
	}
	return nil
}

// booleanLiteral is the regular true or false type: boolean's constituents,
// which typescript-go keeps as [false, true].
func booleanLiteral(c *checker.Checker, value bool) *checker.Type {
	members := c.GetBooleanType().Types()
	if len(members) != 2 {
		return nil
	}
	if value {
		return members[1]
	}
	return members[0]
}

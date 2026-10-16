package tsutil

import (
	"slices"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// maxReorderDepth bounds the type/node walk; printed types are trees, but a
// pathological one should not be walked forever.
const maxReorderDepth = 64

// ReorderTypeNode puts the unions and mapped-type members under node, which
// the node builder printed from t, into Strada's order. It walks t and node
// together so every union member and property signature is matched to the
// type it was printed from; where the two cannot be matched up (a union
// printed from its origin, a construct the walk does not follow), it falls
// back to ReorderUnionTypeNodes for that subtree.
func ReorderTypeNode(c *checker.Checker, t *checker.Type, node *ast.Node) {
	reorderTyped(c, t, node, 0)
}

func reorderTyped(c *checker.Checker, t *checker.Type, n *ast.Node, depth int) {
	if n == nil {
		return
	}
	if t == nil || depth > maxReorderDepth || n.Flags&ast.NodeFlagsSynthesized == 0 {
		ReorderUnionTypeNodes(c, n)
		return
	}
	depth++
	switch n.Kind {
	case ast.KindParenthesizedType:
		reorderTyped(c, t, n.AsParenthesizedTypeNode().Type, depth)
	case ast.KindTypeOperator:
		reorderTyped(c, t, n.AsTypeOperatorNode().Type, depth)
	case ast.KindArrayType:
		var elem *checker.Type
		if c.IsArrayType(t) {
			if args := c.GetTypeArguments(t); len(args) > 0 {
				elem = args[0]
			}
		}
		reorderTyped(c, elem, n.AsArrayTypeNode().ElementType, depth)
	case ast.KindTypeReference:
		nodes := n.TypeArguments()
		var args []*checker.Type
		if alias := t.Alias(); alias != nil && len(alias.TypeArguments()) == len(nodes) {
			args = alias.TypeArguments()
		} else if t.Flags()&checker.TypeFlagsObject != 0 && t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
			args = c.GetTypeArguments(t)
		}
		for i, arg := range nodes {
			var at *checker.Type
			if i < len(args) {
				at = args[i]
			}
			reorderTyped(c, at, arg, depth)
		}
	case ast.KindIntersectionType:
		nodes := n.AsIntersectionTypeNode().Types.Nodes
		var types []*checker.Type
		if t.Flags()&checker.TypeFlagsIntersection != 0 && len(t.Types()) == len(nodes) {
			types = t.Types()
		}
		for i, m := range nodes {
			var mt *checker.Type
			if types != nil {
				mt = types[i]
			}
			reorderTyped(c, mt, m, depth)
		}
	case ast.KindUnionType:
		reorderTypedUnion(c, t, n, depth)
	case ast.KindTypeLiteral:
		reorderTypeLiteral(c, t, n, depth)
	default:
		ReorderUnionTypeNodes(c, n)
	}
}

// reorderTypedUnion pairs a union node's members with the constituents the
// node builder printed them from (formatUnionTypes of t's types) and sorts
// them by those constituents' ids. Null and undefined stay at the end.
func reorderTypedUnion(c *checker.Checker, t *checker.Type, n *ast.Node, depth int) {
	nodes := n.AsUnionTypeNode().Types.Nodes
	var types []*checker.Type
	if t.Flags()&checker.TypeFlagsUnion != 0 {
		types = checker.Checker_formatUnionTypes(c, t.Types(), false)
	}
	end := len(nodes)
	for end > 0 && isNullish(nodes[end-1]) {
		end--
	}
	typeEnd := len(types)
	for typeEnd > 0 && types[typeEnd-1].Flags()&checker.TypeFlagsNullable != 0 {
		typeEnd--
	}
	if end != typeEnd || !unionMembersMatch(c, nodes[:end], types[:typeEnd]) {
		// Printed from the union's origin, or otherwise not one-to-one.
		ReorderUnionTypeNodes(c, n)
		return
	}
	keys := make(map[*ast.Node]checker.TypeId, end)
	for i, m := range nodes[:end] {
		reorderTyped(c, types[i], m, depth)
		keys[m] = unionPosition(types[i])
	}
	slices.SortStableFunc(nodes[:end], func(a, b *ast.Node) int {
		return int(keys[a]) - int(keys[b])
	})
}

// UnionTypesInIdOrder is t's constituents in Strada's order, by type id;
// typescript-go keeps them sorted by value.
func UnionTypesInIdOrder(t *checker.Type) []*checker.Type {
	types := slices.Clone(t.Types())
	slices.SortStableFunc(types, func(a, b *checker.Type) int { return int(a.Id()) - int(b.Id()) })
	return types
}

// unionPosition is the id Strada sorts a printed union member by. A member
// formatUnionTypes collapsed (boolean, an enum) stands where its first
// constituent stood.
func unionPosition(t *checker.Type) checker.TypeId {
	if t.Flags()&checker.TypeFlagsUnion != 0 && len(t.Types()) > 0 {
		return t.Types()[0].Id()
	}
	return t.Id()
}

// unionMembersMatch checks that each node could have been printed from the
// type at the same position: literals and keywords must be that very type and
// references must name it. Anything else is taken on trust.
func unionMembersMatch(c *checker.Checker, nodes []*ast.Node, types []*checker.Type) bool {
	for i, n := range nodes {
		t := types[i]
		if n.Kind == ast.KindBooleanKeyword {
			if t != c.GetBooleanType() {
				return false
			}
			continue
		}
		if want := typeOfLiteralOrKeywordNode(c, n); want != nil {
			got := t
			if t.Flags()&checker.TypeFlagsLiteral != 0 {
				got = t.AsLiteralType().RegularType()
			}
			if got != want {
				return false
			}
			continue
		}
		if n.Kind == ast.KindTypeReference && !referenceNames(n, t) {
			return false
		}
	}
	return true
}

func referenceNames(n *ast.Node, t *checker.Type) bool {
	name := n.AsTypeReferenceNode().TypeName
	if name.Kind == ast.KindQualifiedName {
		name = name.AsQualifiedName().Right
	}
	text := name.Text()
	if alias := t.Alias(); alias != nil && alias.Symbol() != nil && alias.Symbol().Name == text {
		return true
	}
	return t.Symbol() != nil && t.Symbol().Name == text
}

// reorderTypeLiteral walks each property signature with its property's type
// and then sorts the signatures into Strada's property order.
func reorderTypeLiteral(c *checker.Checker, t *checker.Type, n *ast.Node, depth int) {
	members := n.AsTypeLiteralNode().Members
	if members == nil {
		return
	}
	isObject := t.Flags()&(checker.TypeFlagsObject|checker.TypeFlagsIntersection) != 0
	for _, m := range members.Nodes {
		var mt *checker.Type
		if isObject && m.Kind == ast.KindPropertySignature {
			if name := memberName(m); name != "" {
				if prop := c.GetPropertyOfType(t, name); prop != nil {
					mt = c.GetTypeOfSymbol(prop)
				}
			}
		}
		if m.Kind == ast.KindPropertySignature {
			reorderTyped(c, mt, m.Type(), depth)
		} else {
			ReorderUnionTypeNodes(c, m)
		}
	}
	if !isObject {
		return
	}
	rank := make(map[string]int)
	for i, name := range propertyOrder(c, t, 0) {
		if _, seen := rank[name]; !seen {
			rank[name] = i
		}
	}
	position := func(m *ast.Node) int {
		if r, ok := rank[memberName(m)]; ok && m.Kind == ast.KindPropertySignature {
			return r
		}
		return len(rank)
	}
	slices.SortStableFunc(members.Nodes, func(a, b *ast.Node) int {
		return position(a) - position(b)
	})
}

func memberName(m *ast.Node) string {
	name := m.Name()
	if name == nil {
		return ""
	}
	switch name.Kind {
	case ast.KindIdentifier, ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return name.Text()
	}
	return ""
}

func isMapped(t *checker.Type) bool {
	return t.Flags()&checker.TypeFlagsObject != 0 && t.ObjectFlags()&checker.ObjectFlagsMapped != 0
}

// propertyOrder is the order Strada lays out t's properties in.
//   - A homomorphic mapped type ({ [K in keyof T]: X }) iterates T's
//     properties, so it keeps T's order.
//   - Any other mapped type iterates its key union, which Strada keeps in id
//     order and typescript-go in value order; the keys are string literals,
//     interned, so their ids give back Strada's order.
//   - An intersection lists its constituents' properties in turn.
//   - A widened object literal lists its own properties, then the ones it
//     gained as `?: undefined` from the other literals in its union;
//     typescript-go sorts them all by declaration position.
//   - Every other object type keeps declaration order in both compilers.
func propertyOrder(c *checker.Checker, t *checker.Type, depth int) []string {
	props := c.GetPropertiesOfType(t)
	names := make([]string, len(props))
	for i, p := range props {
		names[i] = p.Name
	}
	if depth > maxReorderDepth {
		return names
	}
	switch {
	case isMapped(t) && checker.Checker_isMappedTypeWithKeyofConstraintDeclaration(c, t):
		modifiers := c.GetApparentType(checker.Checker_getModifiersTypeFromMappedType(c, t))
		return orderBy(names, propertyOrder(c, modifiers, depth+1))
	case isMapped(t):
		keys := make(map[string]checker.TypeId, len(names))
		for _, name := range names {
			keys[name] = checker.Checker_getStringLiteralType(c, name).Id()
		}
		slices.SortStableFunc(names, func(a, b string) int { return int(keys[a]) - int(keys[b]) })
		return names
	case t.Flags()&checker.TypeFlagsIntersection != 0:
		var order []string
		for _, m := range t.Types() {
			order = append(order, propertyOrder(c, m, depth+1)...)
		}
		return orderBy(names, order)
	}
	if literal := objectLiteralDeclaration(t); literal != nil {
		var own, gained []string
		for _, p := range props {
			if slices.ContainsFunc(p.Declarations, func(d *ast.Node) bool { return d.Parent == literal }) {
				own = append(own, p.Name)
			} else {
				gained = append(gained, p.Name)
			}
		}
		return append(own, gained...)
	}
	return names
}

func objectLiteralDeclaration(t *checker.Type) *ast.Node {
	if t.Flags()&checker.TypeFlagsObject == 0 || t.Symbol() == nil {
		return nil
	}
	for _, d := range t.Symbol().Declarations {
		if d.Kind == ast.KindObjectLiteralExpression {
			return d
		}
	}
	return nil
}

// orderBy sorts names by their first position in order; names order does not
// mention keep their place after the rest.
func orderBy(names, order []string) []string {
	rank := make(map[string]int, len(order))
	for i, name := range order {
		if _, seen := rank[name]; !seen {
			rank[name] = i
		}
	}
	position := func(name string) int {
		if r, ok := rank[name]; ok {
			return r
		}
		return len(order)
	}
	slices.SortStableFunc(names, func(a, b string) int { return position(a) - position(b) })
	return names
}

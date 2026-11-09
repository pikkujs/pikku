package tsutil

import (
	"slices"
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
)

func WalkSelf(n *ast.Node, visit func(*ast.Node)) {
	visit(n)
	Walk(n, visit)
}

func SortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// InvokedRpcs is collectInvokedRpcNames: the names a handler passes as a
// literal to rpc.invoke / rpc.mesh, and the source text of the calls whose
// name is computed.
type InvokedRpcs struct {
	// DynamicArgs holds the name argument of each Dynamic call, so the caller
	// can still accept one the type checker resolves to a single literal.
	DynamicArgs []*ast.Node
	Names       []string
	Dynamic     []string
}

func CollectInvokedRpcNames(body *ast.Node) InvokedRpcs {
	names := map[string]bool{}
	var dynamic []string
	var dynamicArgs []*ast.Node
	WalkSelf(body, func(n *ast.Node) {
		if !ast.IsCallExpression(n) || !ast.IsPropertyAccessExpression(n.Expression()) {
			return
		}
		pa := n.Expression()
		m := pa.Name().Text()
		if (m == "invoke" || m == "mesh") && IsRpcExpr(pa.Expression()) {
			if args := n.Arguments(); len(args) > 0 {
				if isLiteralName(args[0]) {
					names[args[0].Text()] = true
				} else {
					dynamic = append(dynamic, NodeText(n))
					dynamicArgs = append(dynamicArgs, args[0])
				}
			}
		}
	})
	return InvokedRpcs{Names: SortedKeys(names), Dynamic: dynamic, DynamicArgs: dynamicArgs}
}

// StartedWorkflows is collectStartedWorkflows: literal rpc.startWorkflow
// names, the source text of the calls whose name is computed, and the plain
// functions the handler hands rpc to, whose calls go unseen.
type StartedWorkflows struct {
	Names       []string
	Dynamic     []string
	DynamicArgs []*ast.Node
	RpcHandoffs []string
}

func CollectStartedWorkflows(body *ast.Node) StartedWorkflows {
	names := map[string]bool{}
	handoffs := map[string]bool{}
	var dynamic []string
	var dynamicArgs []*ast.Node
	WalkSelf(body, func(n *ast.Node) {
		if !ast.IsCallExpression(n) {
			return
		}
		callee := n.Expression()
		args := n.Arguments()
		if ast.IsPropertyAccessExpression(callee) && IsRpcExpr(callee.Expression()) && callee.Name().Text() == "startWorkflow" {
			if len(args) > 0 {
				if isLiteralName(args[0]) {
					names[args[0].Text()] = true
				} else {
					dynamic = append(dynamic, NodeText(n))
					dynamicArgs = append(dynamicArgs, args[0])
				}
			}
		} else if ast.IsIdentifier(callee) && slices.ContainsFunc(args, passesRpc) {
			handoffs[callee.Text()] = true
		}
	})
	return StartedWorkflows{Names: SortedKeys(names), Dynamic: dynamic, DynamicArgs: dynamicArgs, RpcHandoffs: SortedKeys(handoffs)}
}

func isLiteralName(arg *ast.Node) bool {
	return ast.IsStringLiteral(arg) || ast.IsNoSubstitutionTemplateLiteral(arg)
}

// passesRpc: `rpc`, `wire.rpc`, `{ rpc }` or `{ rpc: wire.rpc }`.
func passesRpc(arg *ast.Node) bool {
	if IsRpcExpr(arg) {
		return true
	}
	inner := UnwrapNonNullParens(arg)
	if !ast.IsObjectLiteralExpression(inner) {
		return false
	}
	return slices.ContainsFunc(inner.Properties(), func(p *ast.Node) bool {
		return (ast.IsShorthandPropertyAssignment(p) && p.Name().Text() == "rpc") ||
			(ast.IsPropertyAssignment(p) && IsRpcExpr(p.Initializer()))
	})
}

// wireKeys are the PikkuWire members a function can destructure or alias.
// capKeys are the ones that are capability objects (or functions bound to the
// invocation): handing one to another function hands over the wire. session,
// workflowStep, logger, traceId and the like are plain data.
var wireKeys = map[string]bool{
	"rpc": true, "setSession": true, "getSession": true, "clearSession": true,
	"setInitialSession": true, "http": true, "channel": true, "queue": true, "scheduledTask": true,
	"workflow": true, "graph": true, "mcp": true, "cli": true, "trigger": true,
	"gateway": true, "getCredential": true, "getCredentials": true, "setCredential": true,
}

// dataMembers are the data fields of the capability objects that have any: a
// chain that continues into one of them (wire.http.request.body,
// wire.channel.channelId) is data. Any other member of a capability (rpc.invoke
// as a value, wire.http.response) is still the capability.
var dataMembers = map[string]bool{
	"request": true, "authInfo": true, "depth": true, "channelId": true, "openingData": true, "state": true,
}

// WireArg is a call that takes a wire as an argument: the callee's text
// (`helper`, `svc.run`, `new Foo`) and what was handed over (a wire key, or
// `wire` for the whole object).
type WireArg struct {
	Callee string
	Wire   string
	// Expr is the callee expression, so the caller can ask the checker who
	// declares it.
	Expr *ast.Node
}

func isFunctionLike(n *ast.Node) bool {
	return ast.IsArrowFunction(n) || ast.IsFunctionExpression(n) || ast.IsClassExpression(n)
}

// CollectWireArgs reads a handler (fn) for calls that take the wire itself as
// an argument. A wire is the third parameter, a key of it (`wire.rpc`, a
// destructured `rpc`) or a direct alias of either, matched by symbol: declsOf
// returns the declarations of the symbol an identifier refers to, so a local
// that happens to be called `rpc` is not a wire. The wire is an argument when
// the argument expression is one, directly or inside an object, array, spread,
// ternary, `??`/`||`, template or `as`. Not reported: a method of a wire
// (`rpc.invoke(...)`, the wire is the callee); a call or closure inside the
// argument (a nested call is judged on its own, and a closure that merely calls
// the wire keeps it bound); plain data (`wire.session.userId`,
// `wire.http.request.body`).
func CollectWireArgs(fn *ast.Node, declsOf func(*ast.Node) []*ast.Node, localFnOf func(callee *ast.Node) (*ast.Node, bool)) []WireArg {
	body := fn.Body()
	if body == nil {
		return nil
	}
	whole := map[*ast.Node]bool{}
	keys := map[*ast.Node]string{}
	bindKeys := func(pattern *ast.Node) {
		for _, e := range pattern.Elements() {
			if e.Name() == nil || !ast.IsIdentifier(e.Name()) {
				continue
			}
			key := e.Name().Text()
			if pn := e.PropertyName(); pn != nil && ast.IsIdentifier(pn) {
				key = pn.Text()
			}
			if wireKeys[key] {
				keys[e] = key
			}
		}
	}
	if p := ParamAt(fn, 2); p != nil {
		switch {
		case ast.IsIdentifier(p.Name()):
			whole[p] = true
		case ast.IsObjectBindingPattern(p.Name()):
			bindKeys(p.Name())
		}
	}
	// rootOf peels a reference chain: the root identifier and the member names
	// from the root outward. A computed member that is not a literal is "*".
	rootOf := func(n *ast.Node) (*ast.Node, []string) {
		var names []string
		n = UnwrapNonNullParens(n)
		for {
			switch {
			case ast.IsPropertyAccessExpression(n):
				names = append([]string{n.Name().Text()}, names...)
			case ast.IsElementAccessExpression(n):
				name := "*"
				if a := n.AsElementAccessExpression().ArgumentExpression; a != nil && ast.IsStringLiteralLike(a) {
					name = a.Text()
				}
				names = append([]string{name}, names...)
			default:
				if ast.IsIdentifier(n) {
					return n, names
				}
				return nil, nil
			}
			n = UnwrapNonNullParens(n.Expression())
		}
	}
	// refKey is the wire key an identifier's symbol stands for ("wire" for the
	// whole object), or "".
	refKey := func(id *ast.Node) string {
		for _, d := range declsOf(id) {
			if whole[d] {
				return "wire"
			}
			if k, ok := keys[d]; ok {
				return k
			}
		}
		return ""
	}
	// direct is a reference to a wire or one of its keys, with whatever chain
	// follows it, as (key, rest).
	direct := func(n *ast.Node) (string, []string) {
		root, names := rootOf(n)
		if root == nil {
			return "", nil
		}
		k := refKey(root)
		if k == "wire" {
			if len(names) == 0 {
				return "wire", nil
			}
			if wireKeys[names[0]] {
				return names[0], names[1:]
			}
			return "", nil
		}
		return k, names
	}
	// Aliases in source order: `const r = rpc`, `const { rpc } = wire`.
	WalkSelf(body, func(n *ast.Node) {
		if !ast.IsVariableDeclaration(n) || n.Initializer() == nil {
			return
		}
		k, rest := direct(n.Initializer())
		switch {
		case k == "" || len(rest) > 0:
		case ast.IsIdentifier(n.Name()):
			if k == "wire" {
				whole[n] = true
			} else {
				keys[n] = k
			}
		case ast.IsObjectBindingPattern(n.Name()) && k == "wire":
			bindKeys(n.Name())
		}
	})
	// capability is the wire key an argument reference hands over, or "".
	capability := func(n *ast.Node) string {
		k, rest := direct(n)
		switch {
		case k == "":
			return ""
		case len(rest) == 0 || !dataMembers[rest[0]]:
			return k
		}
		return ""
	}
	// scan finds the capability an argument expression carries. It does not
	// enter calls, `new` or function-like nodes.
	var scan func(n *ast.Node) string
	scan = func(n *ast.Node) string {
		if ast.IsCallExpression(n) || ast.IsNewExpression(n) || ast.IsFunctionLike(n) || isFunctionLike(n) || ast.IsClassLike(n) {
			return ""
		}
		if ast.IsIdentifier(n) || ast.IsPropertyAccessExpression(n) || ast.IsElementAccessExpression(n) {
			return capability(n)
		}
		if ast.IsConditionalExpression(n) {
			// The condition is only read; either branch can carry the wire.
			c := n.AsConditionalExpression()
			if w := scan(c.WhenTrue); w != "" {
				return w
			}
			return scan(c.WhenFalse)
		}
		if ast.IsBinaryExpression(n) {
			b := n.AsBinaryExpression()
			switch b.OperatorToken.Kind {
			case ast.KindBarBarToken, ast.KindQuestionQuestionToken:
				if w := scan(b.Left); w != "" {
					return w
				}
				return scan(b.Right)
			case ast.KindAmpersandAmpersandToken, ast.KindCommaToken, ast.KindEqualsToken:
				return scan(b.Right)
			}
			return ""
		}
		var found string
		n.ForEachChild(func(c *ast.Node) bool {
			if ast.IsPropertyAssignment(n) && c == n.Name() {
				return false
			}
			if w := scan(c); w != "" {
				found = w
				return true
			}
			return false
		})
		return found
	}
	// A call to a function declared in the handler keeps the wire bound. Its
	// parameter becomes the wire, so a forward to an outside function is
	// reported where it happens. Repeated until no parameter is added.
	for changed := true; changed; {
		changed = false
		WalkSelf(body, func(n *ast.Node) {
			if !(ast.IsCallExpression(n) || ast.IsNewExpression(n)) || n.Arguments() == nil {
				return
			}
			local, ok := localFnOf(UnwrapNonNullParens(n.Expression()))
			if !ok || local == nil {
				return
			}
			for i, a := range n.Arguments() {
				p := ParamAt(local, i)
				if p == nil || ast.IsSpreadElement(a) || !ast.IsIdentifier(p.Name()) {
					continue
				}
				k, rest := direct(a)
				if k == "" || len(rest) > 0 {
					continue
				}
				if k == "wire" && !whole[p] {
					whole[p], changed = true, true
				} else if k != "wire" && keys[p] != k {
					keys[p], changed = k, true
				}
			}
		})
	}
	var out []WireArg
	seen := map[string]bool{}
	WalkSelf(body, func(n *ast.Node) {
		if !(ast.IsCallExpression(n) || ast.IsNewExpression(n)) || n.Arguments() == nil {
			return
		}
		callee := UnwrapNonNullParens(n.Expression())
		if k, _ := direct(callee); k != "" {
			return // rpc.invoke(...), wire.http.response.json(...): the wire is the callee
		}
		if _, ok := localFnOf(callee); ok {
			return
		}
		label := NodeText(callee)
		if ast.IsNewExpression(n) {
			label = "new " + label
		}
		for _, a := range n.Arguments() {
			if w := scan(a); w != "" {
				k := label + "|" + w
				if !seen[k] {
					seen[k] = true
					out = append(out, WireArg{Callee: label, Wire: w, Expr: callee})
				}
				break
			}
		}
	})
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Callee != b.Callee {
			return a.Callee < b.Callee
		}
		return a.Wire < b.Wire
	})
	return out
}

// Walk visits node's descendants in pre-order, the order recursive
// ts.forEachChild gives; node itself is not visited.
func Walk(node *ast.Node, visit func(*ast.Node)) {
	node.ForEachChild(func(child *ast.Node) bool {
		visit(child)
		Walk(child, visit)
		return false
	})
}

// Dedupe keeps the first occurrence of each string, in order.
func Dedupe(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

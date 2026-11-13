package visit

import (
	"fmt"
	"slices"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/scanner"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// classifiedField is check-pii-output.ts ClassifiedField.
type classifiedField struct {
	path           string
	classification string
}

// findPiiPaths is check-pii-output.ts findPiiPaths: every __classification__
// brand reachable from t, with its dotted path.
func (s *Context) findPiiPaths(t *checker.Type, path string, depth int, seen map[*checker.Type]bool) []classifiedField {
	if depth > 8 || seen[t] {
		return nil
	}
	seen[t] = true

	if t.IsIntersection() {
		for _, member := range t.Types() {
			for _, prop := range s.Checker.GetPropertiesOfType(member) {
				if prop.Name != "__classification__" {
					continue
				}
				classification := "private"
				if decl := firstDeclaration(prop); decl != nil {
					if level, ok := literalString(s.Checker.GetTypeOfSymbolAtLocation(prop, decl)); ok {
						classification = level
					}
				}
				if path == "" {
					path = "<return value>"
				}
				return []classifiedField{{path, classification}}
			}
		}
	}

	var violations []classifiedField
	if t.IsUnion() {
		for _, branch := range tsutil.UnionTypesInIdOrder(t) {
			violations = append(violations, s.findPiiPaths(branch, path, depth, seen)...)
		}
		return violations
	}

	if t.Flags()&checker.TypeFlagsObject != 0 {
		if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
			for _, arg := range s.Checker.GetTypeArguments(t) {
				violations = append(violations, s.findPiiPaths(arg, path, depth+1, seen)...)
			}
		}

		if info := s.Checker.GetIndexInfoOfType(t, s.Checker.GetNumberType()); info != nil {
			violations = append(violations, s.findPiiPaths(info.ValueType(), path+"[]", depth+1, seen)...)
		}
		if info := s.Checker.GetIndexInfoOfType(t, s.Checker.GetStringType()); info != nil {
			violations = append(violations, s.findPiiPaths(info.ValueType(), path+"[*]", depth+1, seen)...)
		}

		// tsPropertyNames, not GetPropertiesOfType: the paths are printed, so
		// they have to come out in TypeScript's order.
		for _, key := range s.tsPropertyNames(t) {
			prop := s.Checker.GetPropertyOfType(t, key)
			if prop == nil {
				continue
			}
			name := ast.SymbolName(prop)
			if strings.HasPrefix(name, "__") {
				continue
			}
			decl := firstDeclaration(prop)
			if decl == nil {
				continue
			}
			subPath := name
			if path != "" {
				subPath = path + "." + name
			}
			violations = append(violations, s.findPiiPaths(s.Checker.GetTypeOfSymbolAtLocation(prop, decl), subPath, depth+1, seen)...)
		}
	}
	return violations
}

// literalString is check-pii-output.ts literalString: the marker is optional,
// so its resolved type is usually `'pii' | undefined`, not a bare literal.
func literalString(t *checker.Type) (string, bool) {
	if t.Flags()&checker.TypeFlagsStringLiteral != 0 {
		v, ok := t.AsLiteralType().Value().(string)
		return v, ok
	}
	if t.IsUnion() {
		for _, member := range t.Types() {
			if v, ok := literalString(member); ok {
				return v, true
			}
		}
	}
	return "", false
}

// typeExtendsCore is does-type-extend-core-type.ts doesTypeExtendsCore.
func (s *Context) typeExtendsCore(t *checker.Type, visited map[*checker.Type]bool, coreType string) bool {
	if t == nil || visited[t] {
		return false
	}
	visited[t] = true

	if sym := t.Symbol(); sym != nil {
		if ast.SymbolName(sym) == coreType {
			return true
		}
		if t.ObjectFlags()&checker.ObjectFlagsClassOrInterface != 0 {
			for _, base := range s.Checker.GetBaseTypes(t) {
				if s.typeExtendsCore(base, visited, coreType) {
					return true
				}
			}
		}
	}
	if a := t.Alias(); a != nil {
		if s.typeExtendsCore(s.Checker.GetDeclaredTypeOfSymbol(a.Symbol()), visited, coreType) {
			return true
		}
	}
	if t.IsUnion() || t.IsIntersection() {
		for _, member := range t.Types() {
			if s.typeExtendsCore(member, visited, coreType) {
				return true
			}
		}
	}
	return false
}

// classifiedSink is check-classified-sinks.ts SINKS. A nil methods means every
// method on the type is a sink.
type classifiedSink struct {
	coreType string
	methods  []string
	rejects  []string
}

var classifiedSinks = []classifiedSink{
	{"Logger", nil, []string{"secret", "pii"}},
	{"WebhookService", []string{"send"}, []string{"secret", "pii"}},
	{"QueueService", []string{"add"}, []string{"secret"}},
	{"EmailService", []string{"send"}, []string{"secret"}},
	{"AuditService", []string{"audit", "write"}, []string{"secret"}},
	{"AuditLog", []string{"write"}, []string{"secret"}},
}

var consoleRejects = []string{"secret", "pii"}

type sinkViolation struct {
	sink, path     string
	line           int
	classification string
}

// findClassifiedSinks is check-classified-sinks.ts findClassifiedSinks.
func (s *Context) findClassifiedSinks(handler *ast.Node) []sinkViolation {
	var violations []sinkViolation
	var visit func(n *ast.Node)
	visit = func(n *ast.Node) {
		if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) {
			if name, rejects, ok := s.describeSink(n.Expression()); ok {
				for _, arg := range n.Arguments() {
					if found, classification := s.findClassifiedExpression(arg, rejects, false); found != nil {
						sf := ast.GetSourceFileOfNode(found)
						violations = append(violations, sinkViolation{
							sink:           name,
							path:           tsutil.NodeText(found),
							line:           scanner.GetECMALineOfPosition(sf, tsutil.NodeStart(found)) + 1,
							classification: classification,
						})
					}
				}
			}
		}
		n.ForEachChild(func(c *ast.Node) bool { visit(c); return false })
	}
	visit(handler)
	return violations
}

// findClassifiedExpression is check-classified-sinks.ts
// findClassifiedExpression. The TS walk uses getChildren and this ForEachChild;
// what that omits (punctuation, SyntaxLists, JSDoc) is never an expression.
func (s *Context) findClassifiedExpression(n *ast.Node, rejects []string, isReceiver bool) (*ast.Node, string) {
	var found *ast.Node
	var classification string
	n.ForEachChild(func(c *ast.Node) bool {
		if ast.IsPropertyAssignment(n) && c == n.Name() {
			return false
		}
		childIsReceiver := (ast.IsPropertyAccessExpression(n) || ast.IsElementAccessExpression(n)) && c == n.Expression()
		found, classification = s.findClassifiedExpression(c, rejects, childIsReceiver)
		return found != nil
	})
	if found != nil {
		return found, classification
	}

	if !isReceiver && ast.IsExpression(n) && !ast.IsStringLiteralLike(n) {
		t := s.Checker.GetTypeAtLocation(n)
		// secret outranks pii when a value somehow carries both.
		for _, level := range []string{"secret", "pii"} {
			if !slices.Contains(rejects, level) {
				continue
			}
			for _, f := range s.findPiiPaths(t, "", 0, map[*checker.Type]bool{}) {
				if f.classification == level {
					return n, level
				}
			}
		}
	}
	return nil, ""
}

// describeSink is check-classified-sinks.ts describeSink.
func (s *Context) describeSink(callee *ast.Node) (string, []string, bool) {
	method := callee.Name().Text()
	receiver := callee.Expression()
	if ast.IsIdentifier(receiver) && receiver.Text() == "console" {
		return "console." + method, consoleRejects, true
	}
	receiverType := s.Checker.GetTypeAtLocation(receiver)
	for _, sink := range classifiedSinks {
		if sink.methods != nil && !slices.Contains(sink.methods, method) {
			continue
		}
		if s.typeExtendsCore(receiverType, map[*checker.Type]bool{}, sink.coreType) {
			return tsutil.NodeText(receiver) + "." + method, sink.rejects, true
		}
	}
	return "", nil, false
}

// checkClassification is add-functions.ts's classificationCheck block: PKU953
// and PKU954 for values written to a sink, PKU910 for values returned. Opt-in
// (`pikku all --security`), because inferring every handler's return type is
// the most expensive checker operation in the sweep.
func (s *Context) checkClassification(name string, handler *ast.Node, sessionless bool) {
	for _, v := range s.findClassifiedSinks(handler) {
		if v.classification == "secret" {
			s.Log.Diagnostic(diag.Error, diag.SecretRevealedIntoSink, fmt.Sprintf(
				"Function '%s' passes a revealed secret to '%s' at line %d (path '%s').\n  "+
					"A vault secret must not be written to a log, an audit, a queue, an email or a webhook. "+
					"Pass the value only to the client that needs it, and reveal it there.",
				name, v.sink, v.line, v.path))
			continue
		}
		s.Log.Diagnostic(diag.Error, diag.PiiIntoSink, fmt.Sprintf(
			"Function '%s' passes personal data to '%s' at line %d (path '%s').\n  "+
				"A log, the console and a webhook all leave your control — they are shipped to third parties and retained "+
				"long past the request. Log an id instead, or narrow the value to a non-identifying field. "+
				"An email to the data subject, an audit in your own database and a queue on your own infrastructure are fine.",
			name, v.sink, v.line, v.path))
	}

	sig := s.Checker.GetSignatureFromDeclaration(handler)
	if sig == nil {
		return
	}
	ret := s.unwrapPromise(s.Checker.GetReturnTypeOfSignature(sig))
	var secretPaths, privatePaths []string
	for _, f := range s.findPiiPaths(ret, "", 0, map[*checker.Type]bool{}) {
		switch f.classification {
		case "secret":
			secretPaths = append(secretPaths, "'"+f.path+"'")
		case "private", "pii":
			privatePaths = append(privatePaths, "'"+f.path+"'")
		}
	}
	if len(secretPaths) > 0 {
		s.Log.Diagnostic(diag.Error, diag.PiiInOutput, fmt.Sprintf(
			"Function '%s' exposes secret-classified field(s) in its return type: %s.\n  "+
				"Secret fields must never appear in function output. "+
				"Strip these fields before returning or change the column classification.",
			name, strings.Join(secretPaths, ", ")))
	}
	if sessionless && len(privatePaths) > 0 {
		s.Log.Diagnostic(diag.Error, diag.PiiInOutput, fmt.Sprintf(
			"Sessionless function '%s' exposes private-classified field(s) in its return type: %s.\n  "+
				"Private fields are only safe to return from authenticated (sessioned) functions. "+
				"Either require a session (use pikkuFunc) or set security: 'public' on the column in db/tables.ts if it is safe to expose publicly.",
			name, strings.Join(privatePaths, ", ")))
	}
}

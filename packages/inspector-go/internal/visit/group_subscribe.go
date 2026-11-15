package visit

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// pikkuSubscribeFunc: the only way to subscribe a stream to an event hub topic.
// The helper's second type argument is the topic shape; it becomes the
// function's topicPattern, the string the runtime checks every publish against.

func init() {
	Register(Visitor{Name: "checkEventHubImports", Phase: PhaseRoutes, Order: OrderCheckEventHubImports, Visit: (*Context).checkEventHubImports})
}

const eventHubInternalPath = "@pikku/core/internal/event-hub"

const subscribeWiringHint = "A subscribe function is wired only as an `sse: true` HTTP route or a channel `onMessageWiring` action, because only those streams can be subscribed to a topic."

// checkEventHubImports refuses an import of the full hub. The distributor is
// held by the runtime alone; functions get the publisher (services.eventHub).
func (s *Context) checkEventHubImports(node *ast.Node) {
	var spec *ast.Node
	switch {
	case ast.IsImportDeclaration(node):
		spec = node.AsImportDeclaration().ModuleSpecifier
	case ast.IsExportDeclaration(node):
		spec = node.AsExportDeclaration().ModuleSpecifier
	case ast.IsCallExpression(node) && node.Expression().Kind == ast.KindImportKeyword:
		if a := node.Arguments(); len(a) > 0 {
			spec = a[0]
		}
	}
	if spec == nil || !ast.IsStringLiteralLike(spec) || !strings.HasPrefix(spec.Text(), eventHubInternalPath) {
		return
	}
	s.Log.Critical(diag.EventHubInternalAccess, fmt.Sprintf(
		"'%s' imports '%s', the event hub's internal path. Functions get only the publisher (services.eventHub); subscribing is a pikkuSubscribeFunc.",
		filepath.Base(ast.GetSourceFileOfNode(node).FileName()), spec.Text()))
}

// checkSubscribeWiring refuses a subscribe function wired where nothing can
// subscribe a stream (a plain route, a cron, a queue, a CLI command, ...).
func (s *Context) checkSubscribeWiring(funcId, description string) bool {
	m := s.resolveFunctionMeta(funcId)
	if m == nil || m.Subscribe == nil {
		return true
	}
	s.Log.Critical(diag.SubscribeWiringNotStreaming, fmt.Sprintf("Subscribe function '%s' is wired as %s. %s", funcId, description, subscribeWiringHint))
	return false
}

// subscribeTopicPattern reads the topic shape out of pikkuSubscribeFunc<Input, Topic>.
// Only a string literal or a template literal of `${string}` / `${number}` holes
// names a shape; anything wider (string, a union, no type argument) is refused.
func (s *Context) subscribeTopicPattern(call *ast.Node, funcId string) (string, bool) {
	var typeNode *ast.Node
	shown := "(inferred)"
	if ta := call.TypeArguments(); len(ta) >= 2 {
		typeNode = ta[1]
		shown = strings.TrimSpace(tsutil.NodeText(typeNode))
	}
	if pattern, ok := s.topicShapeOf(typeNode, 0); ok {
		return pattern, true
	}
	s.Log.Critical(diag.SubscribeTopicNotDeclared, fmt.Sprintf(
		"Subscribe function '%s' declares the topic type '%s', which names no shape. Declare a string literal or a template literal such as `order:${string}` as its second type argument, so publish can refuse topics no subscribe function returns.",
		funcId, shown))
	return "", false
}

func (s *Context) topicShapeOf(n *ast.Node, depth int) (string, bool) {
	if n == nil || depth > 8 {
		return "", false
	}
	switch n.Kind {
	case ast.KindParenthesizedType:
		return s.topicShapeOf(n.AsParenthesizedTypeNode().Type, depth+1)
	case ast.KindTypeReference:
		ref := n.AsTypeReferenceNode()
		if ref.TypeArguments != nil && len(ref.TypeArguments.Nodes) > 0 {
			return "", false
		}
		for _, d := range s.declsOf(ref.TypeName) {
			if ast.IsTypeAliasDeclaration(d) {
				return s.topicShapeOf(d.AsTypeAliasDeclaration().Type, depth+1)
			}
		}
		return "", false
	}
	return parseTopicShape(strings.TrimSpace(tsutil.NodeText(n)))
}

// parseTopicShape accepts 'literal', "literal" and `text${string}text${number}`.
func parseTopicShape(text string) (string, bool) {
	if len(text) < 2 {
		return "", false
	}
	q := text[0]
	if q != text[len(text)-1] || (q != '\'' && q != '"' && q != '`') {
		return "", false
	}
	body := text[1 : len(text)-1]
	if strings.ContainsRune(body, '\\') {
		return "", false
	}
	if q != '`' {
		if strings.ContainsRune(body, rune(q)) || body == "" {
			return "", false
		}
		return body, true
	}
	rest := body
	for {
		i := strings.Index(rest, "${")
		if i < 0 {
			break
		}
		j := strings.Index(rest[i:], "}")
		if j < 0 {
			return "", false
		}
		if hole := rest[i+2 : i+j]; hole != "string" && hole != "number" {
			return "", false
		}
		rest = rest[i+j+1:]
	}
	if body == "" || strings.Contains(rest, "$") && strings.Contains(rest, "{") {
		return "", false
	}
	return body, true
}

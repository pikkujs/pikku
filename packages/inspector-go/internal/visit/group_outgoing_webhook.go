package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Port of add/add-outgoing-webhook.ts.

func init() {
	Register(Visitor{Name: "addOutgoingWebhook", Phase: PhaseSetup, Order: OrderAddOutgoingWebhook, Visit: (*Context).addOutgoingWebhook})
}

// webhookString is add-outgoing-webhook.ts stringProperty: the first
// property named key decides, and only a plain string literal reads.
func webhookString(obj *ast.Node, key string) (string, bool) {
	p := literalNamedProperty(obj, key)
	if p == nil {
		return "", false
	}
	if v := p.Initializer(); ast.IsStringLiteral(v) || ast.IsNoSubstitutionTemplateLiteral(v) {
		return v.Text(), true
	}
	return "", false
}

func (s *Context) addOutgoingWebhook(node *ast.Node) {
	call, name := s.definerDeclaration(node, "defineOutgoingWebhook")
	if call == nil {
		return
	}
	file := ast.GetSourceFileOfNode(node).FileName()
	args := call.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		s.Log.Error("defineOutgoingWebhook in " + file + " must be called with an object literal: { event, title, payload }.")
		return
	}
	arg := args[0]
	event, _ := webhookString(arg, "event")
	title, _ := webhookString(arg, "title")
	if event == "" || title == "" {
		s.Log.Error("defineOutgoingWebhook '" + name.Text() + "' in " + file +
			" needs 'event' and 'title' as string literals, so they can be listed without running the app.")
		return
	}
	variable, ok := s.moduleExportedName(node, name)
	if !ok {
		s.Log.Error("defineOutgoingWebhook '" + event + "' in " + file + " is assigned to '" + name.Text() +
			"', which the module does not export. The generated webhook types import it by name, so export it.")
		return
	}

	entry := &state.OutgoingWebhook{File: file, Variable: variable, Event: event, Title: title}
	if d, ok := webhookString(arg, "description"); ok {
		entry.Description = &d
	}
	if p := literalNamedProperty(arg, "payload"); p != nil {
		entry.Payload = readEventShape(p.Initializer())
	}

	existing := -1
	for i, w := range s.State.OutgoingWebhooks {
		if w.File == file && w.Variable == variable {
			existing = i
			break
		}
	}
	for i, w := range s.State.OutgoingWebhooks {
		if w.Event == event && i != existing {
			s.Log.Error("Webhook event '" + event + "' is declared twice: " + w.File + " and " + file +
				". An event belongs to one defineOutgoingWebhook.")
			return
		}
	}
	if existing >= 0 {
		s.State.OutgoingWebhooks[existing] = entry
	} else {
		s.State.OutgoingWebhooks = append(s.State.OutgoingWebhooks, entry)
	}
}

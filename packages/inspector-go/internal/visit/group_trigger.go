package visit

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-trigger.ts.

func init() {
	Register(Visitor{Name: "addTrigger", Phase: PhaseRoutes, Order: OrderAddTrigger, Visit: (*Context).addTrigger})
}

func (s *Context) addTrigger(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) {
		return
	}
	var obj *ast.Node
	if args := node.Arguments(); len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
		obj = args[0]
	}
	if obj == nil {
		return
	}
	switch node.Expression().Text() {
	case "wireTrigger":
		s.addWireTrigger(node, obj)
	case "wireTriggerSource":
		s.addWireTriggerSource(node, obj)
	case "wireTriggerWebhookSource":
		s.addWireTriggerWebhookSource(node, obj)
	}
}

func (s *Context) addWireTrigger(node, obj *ast.Node) {
	name := tsutil.GetPropertyValue(obj, "name").AsString()
	cm := s.wireMetaData(obj, "Trigger", name)
	if cm.disabled {
		return
	}
	funcInit := s.getPropertyAssignmentInitializer(obj, "func", true)
	if funcInit == nil {
		s.Log.Critical(diag.MissingFunc, fmt.Sprintf("No valid 'func' property for trigger '%s'.", orNull(name)))
		return
	}
	pikkuFuncId, isHelper := s.wiringFuncId(funcInit, "trigger", name)
	if name == "" {
		return
	}
	s.ensureInlineWiringFunction(pikkuFuncId, name, funcInit, isHelper)
	middleware := s.resolveMiddleware(obj, cm.tagsOrNil())
	s.State.ServiceAggregation.UsedFunctions.Add(pikkuFuncId)
	s.addUsedWires(&FunctionMeta{Middleware: middleware})

	s.State.Triggers.Files.Add(ast.GetSourceFileOfNode(node).FileName())
	var o jsObject
	o.set("pikkuFuncId", pikkuFuncId)
	o.set("name", name)
	o.setCommon(cm)
	o.set("middleware", middlewareValue(middleware))
	s.State.Triggers.Meta.Set(name, o.raw())
}

func (s *Context) addWireTriggerSource(node, obj *ast.Node) {
	name := tsutil.GetPropertyValue(obj, "name").AsString()
	if name == "" {
		return
	}
	funcInit := s.getPropertyAssignmentInitializer(obj, "func", true)
	if funcInit == nil {
		s.Log.Critical(diag.MissingFunc, fmt.Sprintf("No valid 'func' property for trigger source '%s'.", name))
		return
	}
	if ast.IsIdentifier(funcInit) {
		var o jsObject
		o.set("name", name)
		o.set("pikkuFuncId", funcInit.Text())
		if pkg := s.resolveAddonName(funcInit); pkg != "" {
			o.set("packageName", pkg)
		}
		s.State.Triggers.SourceMeta.Set(name, o.raw())
	}
	s.State.Triggers.Files.Add(ast.GetSourceFileOfNode(node).FileName())
}

// refTarget is the "<addon>:<function>" of `ref('<addon>:<function>')`.
func refTarget(n *ast.Node) string {
	if !ast.IsCallExpression(n) || !ast.IsIdentifier(n.Expression()) || n.Expression().Text() != "ref" {
		return ""
	}
	args := n.Arguments()
	if len(args) > 0 && ast.IsStringLiteral(args[0]) && strings.Contains(args[0].Text(), ":") {
		return args[0].Text()
	}
	return ""
}

var webhookSecretRe = regexp.MustCompile(`(?i)[-_]+([a-z0-9])`)

// webhookSecretCredentialName is @pikku/core/trigger's.
func webhookSecretCredentialName(source string) string {
	return webhookSecretRe.ReplaceAllStringFunc(source, func(m string) string {
		return strings.ToUpper(m[len(m)-1:])
	}) + "WebhookSecret"
}

func (s *Context) addWireTriggerWebhookSource(node, obj *ast.Node) {
	file := ast.GetSourceFileOfNode(node).FileName()
	name := tsutil.GetPropertyValue(obj, "name").AsString()
	if name == "" {
		s.Log.Critical(diag.MissingName, fmt.Sprintf("wireTriggerWebhookSource in %s needs 'name' as a string literal.", file))
		return
	}
	var method any = "post"
	if arr, ok := tsutil.GetArrayPropertyValue(obj, "method"); ok {
		method = arr
	} else if v := tsutil.GetPropertyValue(obj, "method"); v.Present {
		method = propValue(v)
	}
	var route any = "/webhooks/" + name
	if v := tsutil.GetPropertyValue(obj, "route"); v.Present {
		route = propValue(v)
	}
	events := []string{}
	if init := s.getPropertyAssignmentInitializer(obj, "events", false); init != nil {
		for _, p := range s.Checker.GetPropertiesOfType(s.Checker.GetTypeAtLocation(init)) {
			events = append(events, p.Name)
		}
		sort.Strings(events)
	}

	var o jsObject
	o.set("name", name)
	o.set("method", method)
	o.set("route", route)
	o.set("events", events)
	for _, step := range webhookSourceSteps {
		init := s.getPropertyAssignmentInitializer(obj, step, true)
		if init == nil {
			continue
		}
		if target := refTarget(init); target != "" {
			if s.resolveFunctionMeta(target) == nil {
				s.Log.Warn(fmt.Sprintf("Webhook source '%s': addon function metadata for '%s' is not available yet.", name, target))
			}
			o.set(step, target)
			s.State.ServiceAggregation.UsedFunctions.Add(target)
			continue
		}
		extracted := s.extractFunctionName(init)
		id := extracted.pikkuFuncId
		if strings.HasPrefix(id, "__temp_") {
			id = makeContextBasedId("trigger-webhook", name, step)
		}
		s.ensureInlineWiringFunction(id, name+":"+step, init, extracted.isHelper)
		if m := s.State.Functions.Meta.At(id); m != nil && m.Sessionless == nil {
			m.Sessionless = tsutil.BoolPtr(true)
		}
		o.set(step, id)
		s.State.ServiceAggregation.UsedFunctions.Add(id)
	}
	s.State.Triggers.WebhookSourceMeta.Set(name, o.raw())
	s.State.Triggers.Files.Add(file)

	if s.getPropertyAssignmentInitializer(obj, "verify", false) == nil {
		return
	}
	credential := webhookSecretCredentialName(name)
	if v := tsutil.GetPropertyValue(obj, "credential"); v.Present {
		credential = v.AsString()
	}
	var c jsObject
	c.set("name", credential)
	c.set("displayName", name+" webhook secret")
	if v := tsutil.GetPropertyValue(obj, "credentialDescription"); v.Present {
		c.set("description", propValue(v))
	}
	c.set("type", "singleton")
	c.set("schema", state.Raw(`{"type":"string"}`))
	c.set("sourceFile", file)
	s.State.Credentials.Files.Add(file)
	s.State.Credentials.Definitions = append(s.State.Credentials.Definitions, c.raw())
}

type webhookSourceView struct {
	Name    string   `json:"name"`
	Receive string   `json:"receive"`
	Events  []string `json:"events"`
}

// ValidateWebhookSourceTriggers is validateWebhookSourceTriggers, run after
// the routes sweep.
func (s *Context) ValidateWebhookSourceTriggers() {
	sources := map[string]webhookSourceView{}
	s.State.Triggers.WebhookSourceMeta.Each(func(key string, raw state.Raw) {
		var v webhookSourceView
		_ = json.Unmarshal(raw, &v)
		sources[key] = v
		if v.Receive == "" {
			return
		}
		if m := s.State.Functions.Meta.At(v.Receive); m != nil && m.FuncWrapper != "" && (m.WebhookReceive == nil || !*m.WebhookReceive) {
			s.Log.Error(fmt.Sprintf("Webhook source '%s' receives with '%s', a %s. Declare it with pikkuWebhookReceive so it is never callable as an RPC.", v.Name, v.Receive, m.FuncWrapper))
		}
	})
	for _, trigger := range s.State.Triggers.Meta.Keys() {
		colon := strings.Index(trigger, ":")
		if colon < 0 {
			continue
		}
		source, ok := sources[trigger[:colon]]
		if !ok || len(source.Events) == 0 {
			continue
		}
		event := trigger[colon+1:]
		found := false
		for _, e := range source.Events {
			found = found || e == event
		}
		if !found {
			s.Log.Error(fmt.Sprintf("Trigger '%s' listens for '%s', which webhook source '%s' does not declare. Declared: %s.", trigger, event, source.Name, strings.Join(source.Events, ", ")))
		}
	}
}

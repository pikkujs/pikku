package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-define-screens.ts.

func init() {
	Register(Visitor{Name: "addDefineScreens", Phase: PhaseSetup, Order: OrderAddDefineScreens, Visit: (*Context).addDefineScreens})
}

// lazyImportSpecifier is the specifier of `() => import('<literal>')`.
func lazyImportSpecifier(n *ast.Node) string {
	if !ast.IsArrowFunction(n) {
		return ""
	}
	body := n.Body()
	if body == nil || !ast.IsCallExpression(body) || body.Expression().Kind != ast.KindImportKeyword {
		return ""
	}
	if args := body.Arguments(); len(args) > 0 && ast.IsStringLiteral(args[0]) {
		return args[0].Text()
	}
	return ""
}

func (s *Context) addDefineScreens(node *ast.Node) {
	obj := wiringCall(node, "defineScreens")
	if obj == nil {
		return
	}
	fail := func(msg string) { s.Log.Critical(diag.AddonScreensNotStatic, msg) }
	var title, icon string
	screens := []state.Raw{}
	for _, p := range obj.Properties() {
		key, ok := propKey(p)
		if !ok || key == "" {
			continue
		}
		init := p.Initializer()
		switch {
		case key == "title" && ast.IsStringLiteral(init):
			title = init.Text()
		case key == "icon" && ast.IsStringLiteral(init):
			icon = init.Text()
		case key == "screens":
			if !ast.IsArrayLiteralExpression(init) {
				fail("defineScreens's screens must be an array literal, got: " + tsutil.NodeText(init))
				continue
			}
			for _, el := range init.Elements() {
				if sc, ok := s.readScreen(el, fail); ok {
					screens = append(screens, sc.raw())
				}
			}
		}
	}
	if title == "" {
		fail("defineScreens needs a literal title")
		return
	}
	s.Log.Debugf("• Found defineScreens: %s (%d screens)", title, len(screens))
	var o jsObject
	o.set("title", title)
	if icon != "" {
		o.set("icon", icon)
	}
	o.set("file", ast.GetSourceFileOfNode(node).FileName())
	o.set("screens", screens)
	s.State.ScreensManifest = o.raw()
}

func (s *Context) readScreen(el *ast.Node, fail func(string)) (jsObject, bool) {
	var o jsObject
	if !ast.IsObjectLiteralExpression(el) {
		fail("A defineScreens screen must be an object literal, got: " + tsutil.NodeText(el))
		return o, false
	}
	var path, title, component, app string
	var nav *bool
	var scopes []string
	for _, f := range el.Properties() {
		key, ok := propKey(f)
		if !ok || key == "" {
			continue
		}
		v := f.Initializer()
		switch {
		case key == "path" && ast.IsStringLiteral(v):
			path = v.Text()
		case key == "title" && ast.IsStringLiteral(v):
			title = v.Text()
		case key == "nav" && (v.Kind == ast.KindTrueKeyword || v.Kind == ast.KindFalseKeyword):
			nav = tsutil.BoolPtr(v.Kind == ast.KindTrueKeyword)
		case key == "scopes":
			var ok bool
			if scopes, ok = parseStringArray(v); !ok {
				fail("A screen's scopes must be an array of string literals, got: " + tsutil.NodeText(v))
			}
		case key == "component":
			if component = lazyImportSpecifier(v); component == "" {
				fail("A screen's component must be () => import('<literal>'), got: " + tsutil.NodeText(v))
			}
		case key == "app" && ast.IsStringLiteral(v):
			app = v.Text()
		}
	}
	if path == "" || title == "" || (component == "" && app == "") {
		fail("A defineScreens screen needs a literal path and title, and either a lazy component or an app: " + tsutil.NodeText(el))
		return o, false
	}
	if component != "" && app != "" {
		fail(fmt.Sprintf("Screen '%s' sets both component and app; a screen is one or the other", path))
		return o, false
	}
	o.set("path", path)
	o.set("title", title)
	if nav != nil {
		o.set("nav", *nav)
	}
	if scopes != nil {
		o.set("scopes", scopes)
	}
	if component != "" {
		o.set("component", component)
	} else {
		o.set("app", app)
	}
	return o, true
}

package visit

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-pikku-studio.ts.

func init() {
	Register(Visitor{Name: "addPikkuStudio", Phase: PhaseSetup, Order: OrderAddPikkuStudio, Visit: (*Context).addPikkuStudio})
}

var studioScopes = []string{"studio", "team", "project"}
var studioNavAreas = []string{"rail", "team", "project", "account"}

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

func studioOneOf(n *ast.Node, values []string) (string, bool) {
	if !ast.IsStringLiteral(n) {
		return "", false
	}
	for _, v := range values {
		if v == n.Text() {
			return v, true
		}
	}
	return "", false
}

func studioBool(n *ast.Node) (bool, bool) {
	switch n.Kind {
	case ast.KindTrueKeyword:
		return true, true
	case ast.KindFalseKeyword:
		return false, true
	}
	return false, false
}

func studioNumber(n *ast.Node) (float64, bool) {
	parse := func(text string) (float64, bool) {
		f, err := strconv.ParseFloat(text, 64)
		return f, err == nil
	}
	if ast.IsNumericLiteral(n) {
		return parse(n.Text())
	}
	if ast.IsPrefixUnaryExpression(n) && n.AsPrefixUnaryExpression().Operator == ast.KindMinusToken && ast.IsNumericLiteral(n.AsPrefixUnaryExpression().Operand) {
		f, ok := parse(n.AsPrefixUnaryExpression().Operand.Text())
		return -f, ok
	}
	return 0, false
}

func quotedList(values []string) string {
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = "'" + v + "'"
	}
	return strings.Join(quoted, ", ")
}

func (s *Context) addPikkuStudio(node *ast.Node) {
	obj := wiringCall(node, "pikkuStudio")
	if obj == nil {
		return
	}
	fail := func(msg string) { s.Log.Critical(diag.AddonScreensNotStatic, msg) }
	var title string
	screens := []jsObject{}
	paths := []string{}
	for _, p := range obj.Properties() {
		key, ok := propKey(p)
		if !ok || key == "" {
			fail("A pikkuStudio field must be a literal, got: " + tsutil.NodeText(p))
			continue
		}
		init := p.Initializer()
		switch key {
		case "title":
			if ast.IsStringLiteral(init) {
				title = init.Text()
			} else {
				fail("pikkuStudio's title must be a literal, got: " + tsutil.NodeText(init))
			}
		case "screens":
			if !ast.IsArrayLiteralExpression(init) {
				fail("pikkuStudio's screens must be an array literal, got: " + tsutil.NodeText(init))
				continue
			}
			for _, el := range init.Elements() {
				if sc, path, ok := s.readStudioScreen(el, fail); ok {
					screens = append(screens, sc)
					paths = append(paths, path)
				}
			}
		}
	}
	if title == "" {
		fail("pikkuStudio needs a literal title")
		return
	}
	seen := map[string]bool{}
	for _, path := range paths {
		if seen[path] {
			s.Log.Critical(diag.StudioScreenPathDuplicate, fmt.Sprintf(
				"pikkuStudio declares two screens at '%s'; each screen needs its own path", path))
		}
		seen[path] = true
	}
	s.Log.Debugf("• Found pikkuStudio: %s (%d screens)", title, len(screens))
	raws := make([]state.Raw, len(screens))
	for i := range screens {
		raws[i] = screens[i].raw()
	}
	var o jsObject
	o.set("title", title)
	o.set("file", ast.GetSourceFileOfNode(node).FileName())
	o.set("screens", raws)
	s.State.Studio = o.raw()
}

func (s *Context) readStudioNav(n *ast.Node, fail func(string)) (jsObject, bool) {
	var o jsObject
	if !ast.IsObjectLiteralExpression(n) {
		fail("A screen's nav must be an object literal, got: " + tsutil.NodeText(n))
		return o, false
	}
	var area, icon string
	var badge *string
	var order *float64
	ok := true
	for _, f := range n.Properties() {
		key, isProp := propKey(f)
		if !isProp || key == "" {
			fail("A screen's nav field must be a literal, got: " + tsutil.NodeText(f))
			ok = false
			continue
		}
		v := f.Initializer()
		read := false
		switch key {
		case "area":
			area, read = studioOneOf(v, studioNavAreas)
		case "icon":
			if read = ast.IsStringLiteral(v); read {
				icon = v.Text()
			}
		case "order":
			var num float64
			if num, read = studioNumber(v); read {
				order = &num
			}
		case "badge":
			if read = ast.IsStringLiteral(v); read {
				text := v.Text()
				badge = &text
			}
		default:
			continue
		}
		if !read {
			expected := "a literal"
			if key == "area" {
				expected = "one of " + quotedList(studioNavAreas)
			}
			fail(fmt.Sprintf("A screen's nav %s must be %s, got: %s", key, expected, tsutil.NodeText(v)))
			ok = false
		}
	}
	if !ok {
		return o, false
	}
	if area == "" || !hasStringLiteralProp(n, "icon") || order == nil {
		fail("A screen's nav needs a literal area, icon and order: " + tsutil.NodeText(n))
		return o, false
	}
	o.set("area", area)
	o.set("icon", icon)
	o.set("order", *order)
	if badge != nil {
		o.set("badge", *badge)
	}
	return o, true
}

// hasStringLiteralProp: the object sets key to a string literal (which may be empty).
func hasStringLiteralProp(obj *ast.Node, key string) bool {
	for _, f := range obj.Properties() {
		if k, ok := propKey(f); ok && k == key && ast.IsStringLiteral(f.Initializer()) {
			return true
		}
	}
	return false
}

func (s *Context) readStudioScreen(el *ast.Node, fail func(string)) (jsObject, string, bool) {
	var o jsObject
	if !ast.IsObjectLiteralExpression(el) {
		fail("A pikkuStudio screen must be an object literal, got: " + tsutil.NodeText(el))
		return o, "", false
	}
	var path, title, scope, layout, component, app string
	var nav *jsObject
	var replaces, needsApp *bool
	var scopes []string
	ok := true
	for _, f := range el.Properties() {
		key, isProp := propKey(f)
		if !isProp || key == "" {
			fail("A screen's field must be a literal, got: " + tsutil.NodeText(f))
			ok = false
			continue
		}
		v := f.Initializer()
		read := false
		switch key {
		case "path":
			if read = ast.IsStringLiteral(v); read {
				path = v.Text()
			}
		case "title":
			if read = ast.IsStringLiteral(v); read {
				title = v.Text()
			}
		case "scope":
			scope, read = studioOneOf(v, studioScopes)
		case "nav":
			n, navOK := s.readStudioNav(v, fail)
			if !navOK {
				ok = false
			} else {
				nav = &n
			}
			continue
		case "replaces":
			var b bool
			if b, read = studioBool(v); read {
				replaces = &b
			}
		case "needsApp":
			var b bool
			if b, read = studioBool(v); read {
				needsApp = &b
			}
		case "layout":
			layout, read = studioOneOf(v, []string{"bare"})
		case "scopes":
			var arrOK bool
			if scopes, arrOK = parseStringArray(v); !arrOK {
				fail("A screen's scopes must be an array of string literals, got: " + tsutil.NodeText(v))
				ok = false
			}
			continue
		case "component":
			if component = lazyImportSpecifier(v); component == "" {
				fail("A screen's component must be () => import('<literal>'), got: " + tsutil.NodeText(v))
				ok = false
			}
			continue
		case "app":
			if read = ast.IsStringLiteral(v); read {
				app = v.Text()
			}
		default:
			continue
		}
		if !read {
			expected := "a literal"
			switch key {
			case "scope":
				expected = "one of " + quotedList(studioScopes)
			case "layout":
				expected = "'bare'"
			}
			fail(fmt.Sprintf("A screen's %s must be %s, got: %s", key, expected, tsutil.NodeText(v)))
			ok = false
		}
	}
	if !ok {
		return o, "", false
	}
	if path == "" || title == "" || scope == "" || (component == "" && app == "") {
		fail("A pikkuStudio screen needs a literal path, title and scope, and either a lazy component or an app: " + tsutil.NodeText(el))
		return o, "", false
	}
	if component != "" && app != "" {
		fail(fmt.Sprintf("Screen '%s' sets both component and app; a screen is one or the other", path))
		return o, "", false
	}
	o.set("path", path)
	o.set("title", title)
	o.set("scope", scope)
	if nav != nil {
		o.set("nav", nav.raw())
	}
	if replaces != nil {
		o.set("replaces", *replaces)
	}
	if needsApp != nil {
		o.set("needsApp", *needsApp)
	}
	if layout != "" {
		o.set("layout", layout)
	}
	if scopes != nil {
		o.set("scopes", scopes)
	}
	if component != "" {
		o.set("component", component)
	} else {
		o.set("app", app)
	}
	return o, path, true
}

type studioView struct {
	Title   string `json:"title"`
	File    string `json:"file"`
	Screens []struct {
		Path  string `json:"path"`
		Title string `json:"title"`
		Nav   *struct {
			Badge *string `json:"badge"`
		} `json:"nav"`
	} `json:"screens"`
}

// studioPackageRoot is the directory of the nearest package.json above file.
func studioPackageRoot(file string) string {
	dir := filepath.Dir(file)
	for {
		if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func readStudioCatalog(file string) (map[string]json.RawMessage, bool) {
	b, err := os.ReadFile(file)
	if err != nil {
		return nil, false
	}
	var catalog map[string]json.RawMessage
	if json.Unmarshal(b, &catalog) != nil {
		return nil, false
	}
	return catalog, true
}

// ValidatePikkuStudio is add-pikku-studio.ts validatePikkuStudio.
func (s *Context) ValidatePikkuStudio() {
	if len(s.State.Studio) == 0 || string(s.State.Studio) == "null" {
		return
	}
	var studio studioView
	if json.Unmarshal(s.State.Studio, &studio) != nil {
		return
	}
	keys := []string{}
	seen := map[string]bool{}
	for _, key := range append([]string{studio.Title}, func() []string {
		titles := make([]string, len(studio.Screens))
		for i, screen := range studio.Screens {
			titles[i] = screen.Title
		}
		return titles
	}()...) {
		if !seen[key] {
			seen[key] = true
			keys = append(keys, key)
		}
	}
	messagesDir := ""
	if root := studioPackageRoot(studio.File); root != "" {
		messagesDir = filepath.Join(root, "messages")
	}
	var en map[string]json.RawMessage
	if messagesDir != "" {
		en, _ = readStudioCatalog(filepath.Join(messagesDir, "en.json"))
	}
	for _, key := range keys {
		if _, ok := en[key]; !ok {
			s.Log.Critical(diag.StudioMessageKeyMissing, fmt.Sprintf(
				"pikkuStudio uses the message key '%s', which is missing from the addon's messages/en.json", key))
		}
	}
	if messagesDir != "" {
		if entries, err := os.ReadDir(messagesDir); err == nil {
			names := []string{}
			for _, e := range entries {
				if strings.HasSuffix(e.Name(), ".json") && e.Name() != "en.json" {
					names = append(names, e.Name())
				}
			}
			sort.Strings(names)
			for _, name := range names {
				catalog, _ := readStudioCatalog(filepath.Join(messagesDir, name))
				for _, key := range keys {
					if _, ok := catalog[key]; !ok {
						s.Log.Warn(fmt.Sprintf(
							"pikkuStudio uses the message key '%s', which is missing from the addon's messages/%s", key, name))
					}
				}
			}
		}
	}
	for _, screen := range studio.Screens {
		if screen.Nav == nil || screen.Nav.Badge == nil {
			continue
		}
		if !s.State.Functions.Meta.Has(*screen.Nav.Badge) {
			s.Log.Critical(diag.StudioBadgeFunctionNotFound, fmt.Sprintf(
				"Screen '%s' has the nav badge '%s', which names no function in this addon", screen.Path, *screen.Nav.Badge))
		}
	}
}

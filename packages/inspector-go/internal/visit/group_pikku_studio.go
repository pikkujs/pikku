package visit

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/jsjson"
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

// studioConst is the initializer of `const <name> = ...` declared at the top
// of n's file, or nil.
func studioConst(n *ast.Node, name string) *ast.Node {
	sf := ast.GetSourceFileOfNode(n)
	if sf == nil {
		return nil
	}
	for _, st := range sf.Statements.Nodes {
		if !ast.IsVariableStatement(st) {
			continue
		}
		list := st.AsVariableStatement().DeclarationList
		if list == nil || list.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		for _, d := range list.AsVariableDeclarationList().Declarations.Nodes {
			if ast.IsIdentifier(d.Name()) && d.Name().Text() == name && d.Initializer() != nil {
				return d.Initializer()
			}
		}
	}
	return nil
}

// studioLit is n seen through parentheses, `as`, `satisfies` and identifiers
// naming a const declared at the top of the same file, so a declaration can
// share copy through consts. Anything else is returned as it is.
func studioLit(n *ast.Node) *ast.Node {
	for i := 0; n != nil && i < 32; i++ {
		switch {
		case ast.IsParenthesizedExpression(n), ast.IsAsExpression(n), ast.IsSatisfiesExpression(n):
			n = n.Expression()
		case ast.IsIdentifier(n):
			init := studioConst(n, n.Text())
			if init == nil {
				return n
			}
			n = init
		default:
			return n
		}
	}
	return n
}

// studioProp is one field of an object literal: its key, whether the key is
// a literal, the node to quote when it is not, and its value through studioLit.
type studioProp struct {
	key  string
	ok   bool
	node *ast.Node
	init *ast.Node
}

// studioProps is an object literal's fields, keyed by identifiers, string or
// number literals, with each `...spread` of a same-file const object put in
// its place. A later field of the same key wins, as in JavaScript.
func studioProps(obj *ast.Node) []studioProp {
	return studioPropsAt(obj, 0)
}

func studioPropsAt(obj *ast.Node, depth int) []studioProp {
	out := []studioProp{}
	for _, p := range obj.Properties() {
		switch {
		case ast.IsSpreadAssignment(p):
			if src := studioLit(p.Expression()); depth < 32 && ast.IsObjectLiteralExpression(src) {
				out = append(out, studioPropsAt(src, depth+1)...)
			} else {
				out = append(out, studioProp{node: p})
			}
		case ast.IsShorthandPropertyAssignment(p):
			name := p.Name().Text()
			out = append(out, studioProp{key: name, ok: name != "", node: p, init: studioLit(p.Name())})
		case ast.IsPropertyAssignment(p) && (ast.IsIdentifier(p.Name()) || ast.IsStringLiteral(p.Name()) || ast.IsNumericLiteral(p.Name())):
			out = append(out, studioProp{key: p.Name().Text(), ok: true, node: p, init: studioLit(p.Initializer())})
		default:
			out = append(out, studioProp{node: p})
		}
	}
	return out
}

// studioElements is an array literal's elements through studioLit.
func studioElements(arr *ast.Node) []*ast.Node {
	out := []*ast.Node{}
	for _, el := range arr.Elements() {
		out = append(out, studioLit(el))
	}
	return out
}

// pluginManifest is the object literal passed to definePlugin, seen through
// `as`, `satisfies`, parentheses and a same-file const.
func pluginManifest(node *ast.Node) *ast.Node {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != "definePlugin" {
		return nil
	}
	args := node.Arguments()
	if len(args) == 0 {
		return nil
	}
	arg := studioLit(args[0])
	if !ast.IsObjectLiteralExpression(arg) {
		return nil
	}
	return arg
}

// studioSlot is a slot read from an arranged screen or a thing's parts; own is
// set once every widget the addon declares is known.
type studioSlot struct {
	widget, from, span, compact string
	copy                        *jsObject
}

func (sl studioSlot) raw(own map[string]bool) state.Raw {
	var o jsObject
	o.set("widget", sl.widget)
	o.set("from", sl.from)
	if sl.span != "" {
		o.set("span", sl.span)
	}
	if sl.compact != "" {
		o.set("compact", sl.compact)
	}
	if sl.copy != nil {
		o.set("copy", sl.copy.raw())
	}
	o.set("own", own[sl.widget])
	return o.raw()
}

// studioEntry is one widget, thing or arranged screen: its fields in output
// order, with its slots kept apart until `own` can be decided.
type studioEntry struct {
	head     jsObject
	slotsKey string
	slots    []studioSlot
	tail     jsObject
	path     string
}

func (e studioEntry) raw(own map[string]bool) state.Raw {
	var o jsObject
	for _, k := range e.head.rec.Keys() {
		v, _ := e.head.rec.Get(k)
		o.rec.Set(k, v)
	}
	if e.slotsKey != "" {
		raws := make([]state.Raw, len(e.slots))
		for i, sl := range e.slots {
			raws[i] = sl.raw(own)
		}
		o.set(e.slotsKey, raws)
	}
	for _, k := range e.tail.rec.Keys() {
		v, _ := e.tail.rec.Get(k)
		o.rec.Set(k, v)
	}
	return o.raw()
}

func (s *Context) addPikkuStudio(node *ast.Node) {
	obj := pluginManifest(node)
	if obj == nil {
		return
	}
	fail := func(msg string) { s.Log.Critical(diag.AddonScreensNotStatic, msg) }
	var title string
	screens := []jsObject{}
	paths := []string{}
	var widgets, things, arranged []studioEntry
	var hasWidgets, hasThings, hasArranged bool
	for _, p := range studioProps(obj) {
		key, ok := p.key, p.ok
		if !ok || key == "" {
			fail("A definePlugin field must be a literal, got: " + tsutil.NodeText(p.node))
			continue
		}
		init := p.init
		switch key {
		case "title":
			if ast.IsStringLiteral(init) {
				title = init.Text()
			} else {
				fail("definePlugin's title must be a literal, got: " + tsutil.NodeText(init))
			}
		case "screens":
			if !ast.IsArrayLiteralExpression(init) {
				fail("definePlugin's screens must be an array literal, got: " + tsutil.NodeText(init))
				continue
			}
			for _, el := range studioElements(init) {
				if sc, path, ok := s.readStudioScreen(el, false, fail); ok {
					screens = append(screens, sc.head)
					paths = append(paths, path)
				}
			}
		case "widgets":
			hasWidgets = true
			widgets = studioReadMap(init, "widgets", "id", fail, readStudioWidget)
		case "things":
			hasThings = true
			things = studioReadMap(init, "things", "kind", fail, readStudioThing)
		case "arrangedScreens":
			hasArranged = true
			arranged = studioReadMap(init, "arrangedScreens", "id", fail, func(n *ast.Node, fail func(string)) (studioEntry, bool) {
				e, _, ok := s.readStudioScreen(n, true, fail)
				return e, ok
			})
			for _, e := range arranged {
				paths = append(paths, e.path)
			}
		}
	}
	if title == "" {
		fail("definePlugin needs a literal title")
		return
	}
	seen := map[string]bool{}
	for _, path := range paths {
		if seen[path] {
			s.Log.Critical(diag.StudioScreenPathDuplicate, fmt.Sprintf(
				"definePlugin declares two screens at '%s'; each screen needs its own path", path))
		}
		seen[path] = true
	}
	own := map[string]bool{}
	for _, w := range widgets {
		if id, ok := w.head.rec.Get("id"); ok {
			var text string
			_ = json.Unmarshal(id, &text)
			own[text] = true
		}
	}
	s.Log.Debugf("• Found definePlugin: %s (%d screens)", title, len(screens))
	raws := make([]state.Raw, len(screens))
	for i := range screens {
		raws[i] = screens[i].raw()
	}
	entries := func(list []studioEntry) []state.Raw {
		out := make([]state.Raw, len(list))
		for i, e := range list {
			out[i] = e.raw(own)
		}
		return out
	}
	var o jsObject
	o.set("title", title)
	o.set("file", ast.GetSourceFileOfNode(node).FileName())
	o.set("screens", raws)
	if hasWidgets {
		o.set("widgets", entries(widgets))
	}
	if hasThings {
		o.set("things", entries(things))
	}
	if hasArranged {
		o.set("arrangedScreens", entries(arranged))
	}
	s.State.Studio = o.raw()
}

// studioReadMap reads a map of literal entries keyed by identifiers or string
// literals; the key is written first, as idKey.
func studioReadMap(init *ast.Node, field, idKey string, fail func(string), read func(*ast.Node, func(string)) (studioEntry, bool)) []studioEntry {
	out := []studioEntry{}
	if !ast.IsObjectLiteralExpression(init) {
		fail(fmt.Sprintf("definePlugin's %s must be an object literal, got: %s", field, tsutil.NodeText(init)))
		return out
	}
	for _, p := range studioProps(init) {
		key, ok := p.key, p.ok
		if !ok || key == "" {
			fail(fmt.Sprintf("A definePlugin %s entry must be keyed by a literal, got: %s", field, tsutil.NodeText(p.node)))
			continue
		}
		e, ok := read(p.init, fail)
		if !ok {
			continue
		}
		var head jsObject
		head.set(idKey, key)
		for _, k := range e.head.rec.Keys() {
			v, _ := e.head.rec.Get(k)
			head.rec.Set(k, v)
		}
		e.head = head
		out = append(out, e)
	}
	return out
}

var studioWidgetStates = []string{"full", "tile", "chip"}
var studioWidgetActions = []string{"open", "run", "scope", "submit", "link", "input", "event"}
var studioSkins = []string{"desk", "headset"}
var studioSpans = []string{"full", "wide", "half"}
var studioCompacts = []string{"full", "tile", "hide"}
var studioMeasures = []string{"narrow", "normal", "fill"}

// studioOneOfArray is an array literal of string literals, each one of values.
func studioOneOfArray(n *ast.Node, values []string) ([]string, bool) {
	list, ok := parseStringArray(n)
	if !ok {
		return nil, false
	}
	for _, v := range list {
		found := false
		for _, allowed := range values {
			found = found || v == allowed
		}
		if !found {
			return nil, false
		}
	}
	return list, true
}

// studioRPCRef is the shape of a project RPC, `<namespace>:<function>`.
var studioRPCRef = regexp.MustCompile(`^[a-z][a-zA-Z0-9-]*:[A-Za-z_$][A-Za-z0-9_$]*$`)

// studioFunctionRef is a string literal naming a function of the addon or,
// with a colon, a project RPC of the right shape.
func studioFunctionRef(n *ast.Node) (string, bool) {
	if !ast.IsStringLiteral(n) {
		return "", false
	}
	text := n.Text()
	if strings.Contains(text, ":") && !studioRPCRef.MatchString(text) {
		return "", false
	}
	return text, text != ""
}

const studioFunctionRefExpected = "a function of the addon or a project RPC '<namespace>:<function>'"

// studioGoRef is the shape of an action that opens another screen or thing
// by its path, `go:/<path>`, instead of running a function.
var studioGoRef = regexp.MustCompile(`^go:/\S*$`)

// studioActionRun is what an action runs: a function reference, or
// `go:/<path>`.
func studioActionRun(n *ast.Node) (string, bool) {
	if ast.IsStringLiteral(n) && studioGoRef.MatchString(n.Text()) {
		return n.Text(), true
	}
	return studioFunctionRef(n)
}

const studioActionRunExpected = "a function of the addon, a project RPC '<namespace>:<function>' or 'go:/<path>'"

// studioWholeMs is a positive whole number literal of milliseconds.
func studioWholeMs(n *ast.Node) (float64, bool) {
	num, ok := studioNumber(n)
	return num, ok && num > 0 && num == float64(int64(num))
}

// readStudioPoll is a number of milliseconds or { fast, slow }.
func readStudioPoll(n *ast.Node) (any, bool) {
	if ms, ok := studioWholeMs(n); ok {
		return ms, true
	}
	if !ast.IsObjectLiteralExpression(n) {
		return nil, false
	}
	var fast, slow float64
	var hasFast, hasSlow bool
	for _, f := range studioProps(n) {
		key, ok := f.key, f.ok
		if !ok {
			return nil, false
		}
		switch key {
		case "fast":
			fast, hasFast = studioWholeMs(f.init)
			if !hasFast {
				return nil, false
			}
		case "slow":
			slow, hasSlow = studioWholeMs(f.init)
			if !hasSlow {
				return nil, false
			}
		default:
			return nil, false
		}
	}
	if !hasFast || !hasSlow {
		return nil, false
	}
	var o jsObject
	o.set("fast", fast)
	o.set("slow", slow)
	return o.raw(), true
}

// readStudioActions is `{ [id]: { run, label, confirm?, destructive? } }`,
// as an array of actions with their id first.
func readStudioActions(n *ast.Node, fail func(string)) ([]state.Raw, bool) {
	if !ast.IsObjectLiteralExpression(n) {
		fail("A definePlugin actions must be an object literal, got: " + tsutil.NodeText(n))
		return nil, false
	}
	out := []state.Raw{}
	ok := true
	for _, p := range studioProps(n) {
		id, isProp := p.key, p.ok
		v := p.init
		if !isProp || id == "" || !ast.IsObjectLiteralExpression(v) {
			fail("An action must be an object literal keyed by a literal, got: " + tsutil.NodeText(p.node))
			ok = false
			continue
		}
		var run, label, confirm string
		var destructive *bool
		actionOK := true
		for _, f := range studioProps(v) {
			key, isField := f.key, f.ok
			if !isField || key == "" {
				fail("An action's field must be a literal, got: " + tsutil.NodeText(f.node))
				actionOK = false
				continue
			}
			fv := f.init
			read := false
			expected := "a literal"
			switch key {
			case "run":
				run, read = studioActionRun(fv)
				expected = studioActionRunExpected
			case "label":
				if read = ast.IsStringLiteral(fv); read {
					label = fv.Text()
				}
			case "confirm":
				if read = ast.IsStringLiteral(fv); read {
					confirm = fv.Text()
				}
			case "destructive":
				var b bool
				if b, read = studioBool(fv); read {
					destructive = &b
				}
			default:
				continue
			}
			if !read {
				fail(fmt.Sprintf("An action's %s must be %s, got: %s", key, expected, tsutil.NodeText(fv)))
				actionOK = false
			}
		}
		if actionOK && (run == "" || label == "") {
			fail(fmt.Sprintf("Action '%s' needs a literal run and label", id))
			actionOK = false
		}
		if actionOK && destructive != nil && *destructive && confirm == "" {
			fail(fmt.Sprintf("Action '%s' is destructive, so it needs a confirm message key", id))
			actionOK = false
		}
		if !actionOK {
			ok = false
			continue
		}
		var o jsObject
		o.set("id", id)
		o.set("run", run)
		o.set("label", label)
		if confirm != "" {
			o.set("confirm", confirm)
		}
		if destructive != nil {
			o.set("destructive", *destructive)
		}
		out = append(out, o.raw())
	}
	return out, ok
}

func readStudioWidget(n *ast.Node, fail func(string)) (studioEntry, bool) {
	var e studioEntry
	if !ast.IsObjectLiteralExpression(n) {
		fail("A definePlugin widget must be an object literal, got: " + tsutil.NodeText(n))
		return e, false
	}
	var title, description, component string
	var states, actions, skins []string
	ok := true
	for _, f := range studioProps(n) {
		key, isProp := f.key, f.ok
		if !isProp || key == "" {
			fail("A widget's field must be a literal, got: " + tsutil.NodeText(f.node))
			ok = false
			continue
		}
		v := f.init
		read := false
		expected := "a literal"
		switch key {
		case "title":
			if read = ast.IsStringLiteral(v); read {
				title = v.Text()
			}
		case "description":
			if read = ast.IsStringLiteral(v); read {
				description = v.Text()
			}
		case "states":
			states, read = studioOneOfArray(v, studioWidgetStates)
			expected = "an array of " + quotedList(studioWidgetStates)
		case "actions":
			actions, read = studioOneOfArray(v, studioWidgetActions)
			expected = "an array of " + quotedList(studioWidgetActions)
		case "skins":
			skins, read = studioOneOfArray(v, studioSkins)
			expected = "an array of " + quotedList(studioSkins)
		case "component":
			component = lazyImportSpecifier(v)
			read = component != ""
			expected = "() => import('<literal>')"
		default:
			continue
		}
		if !read {
			fail(fmt.Sprintf("A widget's %s must be %s, got: %s", key, expected, tsutil.NodeText(v)))
			ok = false
		}
	}
	if !ok {
		return e, false
	}
	if title == "" || description == "" || states == nil || actions == nil || component == "" {
		fail("A definePlugin widget needs a literal title, description, states and actions, and a lazy component: " + tsutil.NodeText(n))
		return e, false
	}
	e.head.set("title", title)
	e.head.set("description", description)
	e.head.set("states", states)
	e.head.set("actions", actions)
	if skins != nil {
		e.head.set("skins", skins)
	}
	e.head.set("component", component)
	return e, true
}

// readStudioStringRecord is an object literal whose values are string
// literals, in declaration order.
func readStudioStringRecord(n *ast.Node) (*jsObject, bool) {
	if !ast.IsObjectLiteralExpression(n) {
		return nil, false
	}
	var o jsObject
	for _, f := range studioProps(n) {
		key, ok := f.key, f.ok
		if !ok || key == "" || !ast.IsStringLiteral(f.init) {
			return nil, false
		}
		o.set(key, f.init.Text())
	}
	return &o, true
}

// readStudioCopy is `{ [variant]: <entry> }`, each entry a variant's wording.
func readStudioCopy(n *ast.Node) (*jsObject, bool) {
	if !ast.IsObjectLiteralExpression(n) {
		return nil, false
	}
	var o jsObject
	for _, f := range studioProps(n) {
		if !f.ok || f.key == "" {
			return nil, false
		}
		v, ok := readStudioCopyEntry(f.init)
		if !ok {
			return nil, false
		}
		o.set(f.key, v.raw())
	}
	return &o, true
}

// readStudioCopyEntry is one variant's wording: each text the widget shows,
// by its name, to a message key, nested for deeper texts (`status: { text }`,
// `tags: { 0: ... }`). `$` words a value that names this variant.
func readStudioCopyEntry(n *ast.Node) (*jsObject, bool) {
	if !ast.IsObjectLiteralExpression(n) {
		return nil, false
	}
	var o jsObject
	for _, f := range studioProps(n) {
		if !f.ok || f.key == "" {
			return nil, false
		}
		if ast.IsStringLiteral(f.init) {
			o.set(f.key, f.init.Text())
			continue
		}
		inner, ok := readStudioCopyEntry(f.init)
		if !ok {
			return nil, false
		}
		o.set(f.key, inner.raw())
	}
	return &o, true
}

const studioCopyExpected = "an object literal of variants, each mapping texts (nested for deeper ones) to message keys"

func readStudioSlots(n *ast.Node, field string, fail func(string)) ([]studioSlot, bool) {
	if !ast.IsArrayLiteralExpression(n) {
		fail(fmt.Sprintf("A definePlugin %s must be an array literal, got: %s", field, tsutil.NodeText(n)))
		return nil, false
	}
	slots := []studioSlot{}
	ok := true
	for _, el := range studioElements(n) {
		if sl, slotOK := readStudioSlot(el, fail); slotOK {
			slots = append(slots, sl)
		} else {
			ok = false
		}
	}
	return slots, ok
}

func readStudioSlot(n *ast.Node, fail func(string)) (studioSlot, bool) {
	var sl studioSlot
	if !ast.IsObjectLiteralExpression(n) {
		fail("A definePlugin slot must be an object literal, got: " + tsutil.NodeText(n))
		return sl, false
	}
	ok := true
	for _, f := range studioProps(n) {
		key, isProp := f.key, f.ok
		if !isProp || key == "" {
			fail("A slot's field must be a literal, got: " + tsutil.NodeText(f.node))
			ok = false
			continue
		}
		v := f.init
		read := false
		expected := "a literal"
		switch key {
		case "widget":
			if read = ast.IsStringLiteral(v); read {
				sl.widget = v.Text()
			}
		case "from":
			if read = ast.IsStringLiteral(v); read {
				sl.from = v.Text()
			}
		case "span":
			sl.span, read = studioOneOf(v, studioSpans)
			expected = "one of " + quotedList(studioSpans)
		case "compact":
			sl.compact, read = studioOneOf(v, studioCompacts)
			expected = "one of " + quotedList(studioCompacts)
		case "copy":
			sl.copy, read = readStudioCopy(v)
			expected = studioCopyExpected
		default:
			continue
		}
		if !read {
			fail(fmt.Sprintf("A slot's %s must be %s, got: %s", key, expected, tsutil.NodeText(v)))
			ok = false
		}
	}
	if !ok {
		return sl, false
	}
	if sl.widget == "" || sl.from == "" {
		fail("A definePlugin slot needs a literal widget and from: " + tsutil.NodeText(n))
		return sl, false
	}
	return sl, true
}

func readStudioThing(n *ast.Node, fail func(string)) (studioEntry, bool) {
	var e studioEntry
	if !ast.IsObjectLiteralExpression(n) {
		fail("A definePlugin thing must be an object literal, got: " + tsutil.NodeText(n))
		return e, false
	}
	var label, source, measure string
	var copy *jsObject
	var parts []studioSlot
	var related []string
	var actions []state.Raw
	var alwaysFull *bool
	hasParts := false
	ok := true
	for _, f := range studioProps(n) {
		key, isProp := f.key, f.ok
		if !isProp || key == "" {
			fail("A thing's field must be a literal, got: " + tsutil.NodeText(f.node))
			ok = false
			continue
		}
		v := f.init
		read := false
		expected := "a literal"
		switch key {
		case "label":
			if read = ast.IsStringLiteral(v); read {
				label = v.Text()
			}
		case "source":
			source, read = studioFunctionRef(v)
			expected = studioFunctionRefExpected
		case "actions":
			var actionsOK bool
			actions, actionsOK = readStudioActions(v, fail)
			ok = ok && actionsOK
			continue
		case "copy":
			copy, read = readStudioCopy(v)
			expected = studioCopyExpected
		case "parts":
			var slotsOK bool
			parts, slotsOK = readStudioSlots(v, "thing's parts", fail)
			hasParts = true
			ok = ok && slotsOK
			continue
		case "related":
			related, read = parseStringArray(v)
			expected = "an array of string literals"
		case "alwaysFull":
			var b bool
			if b, read = studioBool(v); read {
				alwaysFull = &b
			}
		case "measure":
			measure, read = studioOneOf(v, studioMeasures)
			expected = "one of " + quotedList(studioMeasures)
		default:
			continue
		}
		if !read {
			fail(fmt.Sprintf("A thing's %s must be %s, got: %s", key, expected, tsutil.NodeText(v)))
			ok = false
		}
	}
	if !ok {
		return e, false
	}
	if label == "" || source == "" || copy == nil || !hasParts {
		fail("A definePlugin thing needs a literal label, source, copy and parts: " + tsutil.NodeText(n))
		return e, false
	}
	e.head.set("label", label)
	e.head.set("source", source)
	e.head.set("copy", copy.raw())
	e.slotsKey = "parts"
	e.slots = parts
	if related != nil {
		e.tail.set("related", related)
	}
	if actions != nil {
		e.tail.set("actions", actions)
	}
	if alwaysFull != nil {
		e.tail.set("alwaysFull", *alwaysFull)
	}
	if measure != "" {
		e.tail.set("measure", measure)
	}
	return e, true
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
	for _, f := range studioProps(n) {
		key, isProp := f.key, f.ok
		if !isProp || key == "" {
			fail("A screen's nav field must be a literal, got: " + tsutil.NodeText(f.node))
			ok = false
			continue
		}
		v := f.init
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
	for _, f := range studioProps(obj) {
		if k, ok := f.key, f.ok; ok && k == key && ast.IsStringLiteral(f.init) {
			return true
		}
	}
	return false
}

// readStudioScreen reads a screen of `screens`, or with arranged an entry of
// `arrangedScreens`: the same routing fields, with source and slots in place
// of a component or an app.
func (s *Context) readStudioScreen(el *ast.Node, arranged bool, fail func(string)) (studioEntry, string, bool) {
	var e studioEntry
	what := "A definePlugin screen"
	if arranged {
		what = "A definePlugin arranged screen"
	}
	if !ast.IsObjectLiteralExpression(el) {
		fail(what + " must be an object literal, got: " + tsutil.NodeText(el))
		return e, "", false
	}
	var path, title, scope, layout, component, app, about, source, chat string
	var agent *string
	var nav *jsObject
	var replaces, needsApp, defaultChat, scoped *bool
	var lanes *float64
	var scopes, shows []string
	var actions []state.Raw
	var redirect *jsObject
	var poll any
	var slots []studioSlot
	hasSlots := false
	ok := true
	for _, f := range studioProps(el) {
		key, isProp := f.key, f.ok
		if !isProp || key == "" {
			fail("A screen's field must be a literal, got: " + tsutil.NodeText(f.node))
			ok = false
			continue
		}
		v := f.init
		read := false
		expected := "a literal"
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
			expected = "one of " + quotedList(studioScopes)
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
		case "defaultChat":
			var b bool
			if b, read = studioBool(v); read {
				defaultChat = &b
			}
		case "agent":
			if read = ast.IsStringLiteral(v); read {
				text := v.Text()
				agent = &text
			}
		case "layout":
			layout, read = studioOneOf(v, []string{"bare"})
			expected = "'bare'"
		case "scopes":
			var arrOK bool
			if scopes, arrOK = parseStringArray(v); !arrOK {
				fail("A screen's scopes must be an array of string literals, got: " + tsutil.NodeText(v))
				ok = false
			}
			continue
		case "component":
			if arranged {
				fail(fmt.Sprintf("An arranged screen has slots, not a component: %s", tsutil.NodeText(el)))
				ok = false
				continue
			}
			if component = lazyImportSpecifier(v); component == "" {
				fail("A screen's component must be () => import('<literal>'), got: " + tsutil.NodeText(v))
				ok = false
			}
			continue
		case "app":
			if arranged {
				fail(fmt.Sprintf("An arranged screen has slots, not an app: %s", tsutil.NodeText(el)))
				ok = false
				continue
			}
			if read = ast.IsStringLiteral(v); read {
				app = v.Text()
			}
		default:
			if !arranged {
				continue
			}
			switch key {
			case "about":
				if read = ast.IsStringLiteral(v); read {
					about = v.Text()
				}
			case "source":
				source, read = studioFunctionRef(v)
				expected = studioFunctionRefExpected
			case "actions":
				var actionsOK bool
				actions, actionsOK = readStudioActions(v, fail)
				ok = ok && actionsOK
				continue
			case "redirect":
				redirect, read = readStudioStringRecord(v)
				expected = "an object literal of variants, each naming an arranged screen or a path"
			case "poll":
				poll, read = readStudioPoll(v)
				expected = "a positive whole number of milliseconds or { fast, slow }"
			case "slots":
				var slotsOK bool
				slots, slotsOK = readStudioSlots(v, "arranged screen's slots", fail)
				hasSlots = true
				ok = ok && slotsOK
				continue
			case "shows":
				shows, read = parseStringArray(v)
				expected = "an array of string literals"
			case "lanes":
				var num float64
				if num, read = studioNumber(v); read {
					read = num == float64(int(num)) && num >= 1 && num <= 6
					lanes = &num
				}
				expected = "a whole number from 1 to 6"
			case "chat":
				chat, read = studioOneOf(v, []string{"collapse"})
				expected = "'collapse'"
			case "scoped":
				var b bool
				if b, read = studioBool(v); read {
					scoped = &b
				}
			default:
				continue
			}
		}
		if !read {
			fail(fmt.Sprintf("A screen's %s must be %s, got: %s", key, expected, tsutil.NodeText(v)))
			ok = false
		}
	}
	if !ok {
		return e, "", false
	}
	if arranged {
		if path == "" || title == "" || scope == "" || source == "" || !hasSlots {
			fail("A definePlugin arranged screen needs a literal path, title, scope and source, and slots: " + tsutil.NodeText(el))
			return e, "", false
		}
	} else {
		if path == "" || title == "" || scope == "" || (component == "" && app == "") {
			fail("A definePlugin screen needs a literal path, title and scope, and either a lazy component or an app: " + tsutil.NodeText(el))
			return e, "", false
		}
		if component != "" && app != "" {
			fail(fmt.Sprintf("Screen '%s' sets both component and app; a screen is one or the other", path))
			return e, "", false
		}
	}
	o := &e.head
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
	if agent != nil {
		o.set("agent", *agent)
	}
	if defaultChat != nil {
		o.set("defaultChat", *defaultChat)
	}
	e.path = path
	if !arranged {
		if component != "" {
			o.set("component", component)
		} else {
			o.set("app", app)
		}
		return e, path, true
	}
	if about != "" {
		o.set("about", about)
	}
	o.set("source", source)
	e.slotsKey = "slots"
	e.slots = slots
	if shows != nil {
		e.tail.set("shows", shows)
	}
	if lanes != nil {
		e.tail.set("lanes", *lanes)
	}
	if chat != "" {
		e.tail.set("chat", chat)
	}
	if scoped != nil {
		e.tail.set("scoped", *scoped)
	}
	if actions != nil {
		e.tail.set("actions", actions)
	}
	if redirect != nil {
		e.tail.set("redirect", redirect.raw())
	}
	if poll != nil {
		e.tail.set("poll", poll)
	}
	return e, path, true
}

type studioActionView struct {
	Label   string `json:"label"`
	Confirm string `json:"confirm"`
}

// studioActionKeys is the message keys of the actions, label then confirm.
func studioActionKeys(actions []studioActionView) []string {
	keys := []string{}
	for _, a := range actions {
		keys = append(keys, a.Label)
		if a.Confirm != "" {
			keys = append(keys, a.Confirm)
		}
	}
	return keys
}

type studioScreenView struct {
	Actions []studioActionView `json:"actions"`
	Path    string             `json:"path"`
	Title   string             `json:"title"`
	About   string             `json:"about"`
	Agent   *string            `json:"agent"`
	Nav     *struct {
		Badge *string `json:"badge"`
	} `json:"nav"`
	Slots []studioSlotView `json:"slots"`
}

type studioSlotView struct {
	Copy json.RawMessage `json:"copy"`
}

// studioCopyKeys is every message key a copy names, walking nested texts in
// declaration order.
func studioCopyKeys(copy json.RawMessage) []string {
	keys := []string{}
	var text string
	if json.Unmarshal(copy, &text) == nil {
		return append(keys, text)
	}
	var rec state.Record[json.RawMessage]
	if json.Unmarshal(copy, &rec) != nil {
		return keys
	}
	rec.Each(func(_ string, v json.RawMessage) { keys = append(keys, studioCopyKeys(v)...) })
	return keys
}

type studioView struct {
	Title   string             `json:"title"`
	File    string             `json:"file"`
	Screens []studioScreenView `json:"screens"`
	Widgets []struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	} `json:"widgets"`
	Things []struct {
		Label   string             `json:"label"`
		Copy    json.RawMessage    `json:"copy"`
		Parts   []studioSlotView   `json:"parts"`
		Actions []studioActionView `json:"actions"`
	} `json:"things"`
	ArrangedScreens []studioScreenView `json:"arrangedScreens"`
}

// studioSlotKeys is the message keys of the slots' copy, in declaration order.
func studioSlotKeys(slots []studioSlotView) []string {
	keys := []string{}
	for _, sl := range slots {
		if sl.Copy != nil {
			keys = append(keys, studioCopyKeys(sl.Copy)...)
		}
	}
	return keys
}

// messageKeys is every message key the declaration uses: the title, each
// screen's, then the widgets', the things' and the arranged screens'.
func (studio studioView) messageKeys() []string {
	keys := []string{studio.Title}
	for _, screen := range studio.Screens {
		keys = append(keys, screen.Title)
	}
	for _, w := range studio.Widgets {
		keys = append(keys, w.Title, w.Description)
	}
	for _, t := range studio.Things {
		keys = append(keys, t.Label)
		if t.Copy != nil {
			keys = append(keys, studioCopyKeys(t.Copy)...)
		}
		keys = append(keys, studioSlotKeys(t.Parts)...)
		keys = append(keys, studioActionKeys(t.Actions)...)
	}
	for _, screen := range studio.ArrangedScreens {
		keys = append(keys, screen.Title)
		if screen.About != "" {
			keys = append(keys, screen.About)
		}
		keys = append(keys, studioSlotKeys(screen.Slots)...)
		keys = append(keys, studioActionKeys(screen.Actions)...)
	}
	return keys
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

// studioPackageFiles is the package's "files" list; ok is false when it has
// none: what npm then publishes depends on .npmignore or .gitignore, which are
// not read here.
func studioPackageFiles(root string) (files []string, ok bool) {
	pkg, found := readStudioCatalog(filepath.Join(root, "package.json"))
	if !found {
		return nil, false
	}
	var entries []json.RawMessage
	if json.Unmarshal(pkg["files"], &entries) != nil || entries == nil {
		return nil, false
	}
	files = []string{}
	for _, e := range entries {
		var entry string
		if json.Unmarshal(e, &entry) == nil {
			files = append(files, entry)
		}
	}
	return files, true
}

func studioFilesInclude(files []string, dir string) bool {
	for _, entry := range files {
		if entry == dir || strings.HasPrefix(entry, dir+"/") {
			return true
		}
	}
	return false
}

// studioHasSkills is whether the package has a skills/<name>/SKILL.md.
func studioHasSkills(root string) bool {
	dir := filepath.Join(root, "skills")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if _, err := os.Stat(filepath.Join(dir, e.Name(), "SKILL.md")); err == nil {
			return true
		}
	}
	return false
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
	for _, key := range studio.messageKeys() {
		if !seen[key] {
			seen[key] = true
			keys = append(keys, key)
		}
	}
	root := studioPackageRoot(studio.File)
	messagesDir := ""
	var files []string
	hasFiles := false
	if root != "" {
		messagesDir = filepath.Join(root, "messages")
		files, hasFiles = studioPackageFiles(root)
	}
	var en map[string]json.RawMessage
	if messagesDir != "" {
		en, _ = readStudioCatalog(filepath.Join(messagesDir, "en.json"))
	}
	for _, key := range keys {
		if _, ok := en[key]; !ok {
			s.Log.Critical(diag.StudioMessageKeyMissing, fmt.Sprintf(
				"definePlugin uses the message key '%s', which is missing from the addon's messages/en.json", key))
		}
	}
	var rawStudio state.Record[state.Raw]
	_ = json.Unmarshal(s.State.Studio, &rawStudio)
	for _, list := range []struct {
		field   string
		screens []studioScreenView
	}{{"screens", studio.Screens}, {"arrangedScreens", studio.ArrangedScreens}} {
		var raws []json.RawMessage
		if raw, has := rawStudio.Get(list.field); has {
			_ = json.Unmarshal(raw, &raws)
		}
		patched := false
		for i, screen := range list.screens {
			if screen.Agent != nil {
				extra, agentKeys, agentValid := s.validateStudioAgent(screen.Path, *screen.Agent, root, en)
				for _, key := range agentKeys {
					if !seen[key] {
						seen[key] = true
						keys = append(keys, key)
					}
				}
				if extra != "" && i < len(raws) {
					raw := string(raws[i])
					raws[i] = json.RawMessage(strings.TrimSuffix(raw, "}") + extra + "}")
					patched = true
				}
				if agentValid && !strings.HasPrefix(*screen.Agent, "studio:") && hasFiles && !studioFilesInclude(files, "agents") {
					s.Log.Critical(diag.StudioPackageFilesMissing, fmt.Sprintf(
						"Screen '%s' has the agent '%s', but package.json \"files\" does not list agents/; add \"agents\" to it so the published addon ships the agent", screen.Path, *screen.Agent))
				}
			}
			if screen.Nav == nil || screen.Nav.Badge == nil {
				continue
			}
			if !s.State.Functions.Meta.Has(*screen.Nav.Badge) {
				s.Log.Critical(diag.StudioBadgeFunctionNotFound, fmt.Sprintf(
					"Screen '%s' has the nav badge '%s', which names no function in this addon", screen.Path, *screen.Nav.Badge))
			}
		}
		if patched {
			out := make([]state.Raw, len(raws))
			for i, r := range raws {
				out[i] = state.Raw(r)
			}
			rawStudio.Set(list.field, state.Raw(jsjson.MustMarshal(out)))
			s.State.Studio = state.Raw(jsjson.MustMarshal(&rawStudio))
		}
	}
	if root != "" && hasFiles && !studioFilesInclude(files, "skills") && studioHasSkills(root) {
		s.Log.Critical(diag.StudioPackageFilesMissing,
			"The addon ships skills/ but package.json \"files\" does not list it; add \"skills\" to it so the published addon ships its skills")
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
							"definePlugin uses the message key '%s', which is missing from the addon's messages/%s", key, name))
					}
				}
			}
		}
	}
}

var studioAgentRef = regexp.MustCompile(`^studio:[a-z][a-z0-9-]*$`)
var studioAgentName = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
var studioFrontmatter = regexp.MustCompile(`(?s)^---\r?\n(.*?)\r?\n---(?:\r?\n|$)`)
var studioFrontmatterLine = regexp.MustCompile(`^([A-Za-z][\w-]*):\s*(.*?)\s*$`)

// validateStudioAgent is the agent branch of validatePikkuStudio. It returns
// the `,"agentTitle":..,"agentDescription":..` fields to append to the screen
// (each one only when its key is in en.json), the frontmatter's message keys,
// for the other-locale check, and whether the agent drew no PKU365.
func (s *Context) validateStudioAgent(screenPath, agent, root string, en map[string]json.RawMessage) (string, []string, bool) {
	invalid := func(reason string) (string, []string, bool) {
		s.Log.Critical(diag.StudioScreenAgentInvalid, fmt.Sprintf(
			"Screen '%s' has the agent '%s', %s", screenPath, agent, reason))
		return "", nil, false
	}
	if strings.HasPrefix(agent, "studio:") {
		// An agent Studio ships: only the format can be checked.
		if !studioAgentRef.MatchString(agent) {
			return invalid("which is not a valid agent: use a name for an agent the addon ships (lowercase letters, digits and hyphens, starting with a letter) or 'studio:<name>' for one Studio ships")
		}
		return "", nil, true
	}
	if !studioAgentName.MatchString(agent) {
		return invalid("which is not a valid agent: use a name for an agent the addon ships (lowercase letters, digits and hyphens, starting with a letter) or 'studio:<name>' for one Studio ships")
	}
	var text string
	if root != "" {
		if b, err := os.ReadFile(filepath.Join(root, "agents", agent+".md")); err == nil {
			text = string(b)
		}
	}
	if strings.TrimSpace(text) == "" {
		return invalid(fmt.Sprintf("but the addon has no non-empty agents/%s.md", agent))
	}
	m := studioFrontmatter.FindStringSubmatch(text)
	if m == nil {
		return invalid(fmt.Sprintf("whose agents/%s.md has no frontmatter; it needs a title and a description", agent))
	}
	fields := map[string]string{}
	for _, line := range strings.Split(m[1], "\n") {
		if pair := studioFrontmatterLine.FindStringSubmatch(strings.TrimRight(line, "\r")); pair != nil {
			v := pair[2]
			if len(v) >= 2 && (v[0] == '"' || v[0] == '\'') && v[len(v)-1] == v[0] {
				v = v[1 : len(v)-1]
			}
			fields[pair[1]] = v
		}
	}
	out := ""
	keys := []string{}
	valid := true
	for _, field := range []string{"title", "description"} {
		key := fields[field]
		if key == "" {
			invalid(fmt.Sprintf("whose agents/%s.md frontmatter has no %s; it must be a message key", agent, field))
			valid = false
			continue
		}
		keys = append(keys, key)
		if _, has := en[key]; !has {
			s.Log.Critical(diag.StudioMessageKeyMissing, fmt.Sprintf(
				"definePlugin uses the message key '%s', which is missing from the addon's messages/en.json", key))
			continue
		}
		name := "agentTitle"
		if field == "description" {
			name = "agentDescription"
		}
		b, _ := json.Marshal(key)
		out += fmt.Sprintf(`,"%s":%s`, name, b)
	}
	return out, keys, valid
}

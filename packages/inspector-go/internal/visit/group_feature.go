package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-feature.ts.

func init() {
	Register(Visitor{Name: "addFeature", Phase: PhaseRoutes, Order: OrderAddFeature, Visit: (*Context).addFeature})
}

// literalValue reads a fully literal expression into a JSON value; ok=false
// for anything computed.
func literalValue(n *ast.Node) (any, bool) {
	switch {
	case ast.IsStringLiteralLike(n):
		return n.Text(), true
	case n.Kind == ast.KindTrueKeyword:
		return true, true
	case n.Kind == ast.KindFalseKeyword:
		return false, true
	case n.Kind == ast.KindNullKeyword:
		return state.Raw("null"), true
	case ast.IsNumericLiteral(n), ast.IsPrefixUnaryExpression(n):
		f, ok := tsutil.NumericValue(n)
		if f == 0 {
			f = 0 // JSON.stringify(-0) is "0"
		}
		return f, ok
	case ast.IsArrayLiteralExpression(n):
		values := []any{}
		for _, el := range n.Elements() {
			v, ok := literalValue(el)
			if !ok {
				return nil, false
			}
			values = append(values, v)
		}
		return values, true
	case ast.IsObjectLiteralExpression(n):
		rec := state.NewRecord[any]()
		for _, p := range n.Properties() {
			if !ast.IsPropertyAssignment(p) {
				return nil, false
			}
			k := p.Name()
			if !ast.IsIdentifier(k) && !ast.IsStringLiteralLike(k) {
				return nil, false
			}
			v, ok := literalValue(p.Initializer())
			if !ok {
				return nil, false
			}
			rec.Set(k.Text(), v)
		}
		return rec, true
	}
	return nil, false
}

// scenarioName resolves a scenario reference to its declared name, following
// an import alias back to the original export.
func (s *Context) scenarioName(n *ast.Node) (string, bool) {
	if !ast.IsIdentifier(n) {
		return "", false
	}
	sym := s.Checker.GetSymbolAtLocation(n)
	if sym == nil {
		return n.Text(), true
	}
	if sym.Flags&ast.SymbolFlagsAlias != 0 {
		if r := s.Checker.GetAliasedSymbol(sym); r != nil {
			sym = r
		}
	}
	if name := tsutil.SymbolName(sym); name != "" {
		return name, true
	}
	return n.Text(), n.Text() != ""
}

// featureProperty is add-feature.ts getProperty (identifier names only).
func featureProperty(obj *ast.Node, name string) *ast.Node {
	if p := tsutil.FindPropertyAssignment(obj, name); p != nil {
		return p.Initializer()
	}
	return nil
}

func featureHasProperty(obj *ast.Node, name string) bool {
	for _, p := range obj.Properties() {
		if (ast.IsPropertyAssignment(p) || ast.IsMethodDeclaration(p) || ast.IsShorthandPropertyAssignment(p)) &&
			ast.IsIdentifier(p.Name()) && p.Name().Text() == name {
			return true
		}
	}
	return false
}

func featureString(obj *ast.Node, name string) (string, bool) {
	if v := featureProperty(obj, name); v != nil && ast.IsStringLiteralLike(v) {
		return v.Text(), true
	}
	return "", false
}

func (s *Context) mentionedScenario(el *ast.Node) (string, bool) {
	if ast.IsIdentifier(el) {
		return s.scenarioName(el)
	}
	if ast.IsObjectLiteralExpression(el) {
		if ref := featureProperty(el, "scenario"); ref != nil {
			return s.scenarioName(ref)
		}
	}
	return "", false
}

func (s *Context) readFeatureEntry(el *ast.Node) (state.Raw, bool) {
	if ast.IsIdentifier(el) {
		scenario, ok := s.scenarioName(el)
		if !ok || scenario == "" {
			return nil, false
		}
		var o jsObject
		o.set("scenario", scenario)
		return o.raw(), true
	}
	if !ast.IsObjectLiteralExpression(el) {
		return nil, false
	}
	ref := featureProperty(el, "scenario")
	if ref == nil {
		return nil, false
	}
	scenario, ok := s.scenarioName(ref)
	if !ok || scenario == "" {
		return nil, false
	}
	var o jsObject
	o.set("scenario", scenario)
	if dataNode := featureProperty(el, "data"); dataNode != nil {
		data, ok := literalValue(dataNode)
		if !ok {
			return nil, false
		}
		o.set("data", data)
	}
	return o.raw(), true
}

func (s *Context) addFeature(node *ast.Node) {
	if !ast.IsCallExpression(node) {
		return
	}
	expr := node.Expression()
	if !ast.IsIdentifier(expr) || expr.Text() != "pikkuFeature" {
		return
	}
	exportedName := s.extractFunctionName(node).exportedName
	if exportedName == "" {
		s.Log.Critical(diag.MissingName, "A pikkuFeature() must be assigned to an export — the export identifier is the feature's id.")
		return
	}

	entries := []state.Raw{}
	mentions := state.Strings{}
	unresolved, unnamed := 0, 0
	hasBefore, hasAfter := false, false
	var document, name, description, tags any

	if args := node.Arguments(); len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
		config := args[0]
		if v, ok := featureString(config, "name"); ok {
			name = v
		}
		if v, ok := featureString(config, "description"); ok {
			description = v
		}
		if v := featureProperty(config, "tags"); v != nil && ast.IsArrayLiteralExpression(v) {
			out := state.Strings{}
			for _, e := range v.Elements() {
				if ast.IsStringLiteralLike(e) {
					out = append(out, e.Text())
				}
			}
			if len(out) == len(v.Elements()) {
				tags = out
			}
		}
		if v := featureProperty(config, "document"); v != nil {
			switch v.Kind {
			case ast.KindTrueKeyword:
				document = true
			case ast.KindFalseKeyword:
				document = false
			}
		}
		hasBefore = featureHasProperty(config, "before")
		hasAfter = featureHasProperty(config, "after")

		if scenarios := featureProperty(config, "scenarios"); scenarios != nil && ast.IsArrayLiteralExpression(scenarios) {
			for _, el := range scenarios.Elements() {
				if mention, ok := s.mentionedScenario(el); ok && mention != "" {
					mentions = append(mentions, mention)
				} else {
					unnamed++
				}
				if entry, ok := s.readFeatureEntry(el); ok {
					entries = append(entries, entry)
				} else {
					unresolved++
				}
			}
		}
	}

	var f jsObject
	f.set("path", ast.GetSourceFileOfNode(node).FileName())
	f.set("exportedName", exportedName)
	f.set("entries", entries)
	f.set("unresolvedEntries", unresolved)
	f.set("mentions", mentions)
	f.set("unnamedEntries", unnamed)
	f.set("hasBefore", hasBefore)
	f.set("hasAfter", hasAfter)
	f.set("document", document)
	f.set("name", name)
	f.set("description", description)
	f.set("tags", tags)
	s.State.Workflows.FeatureFiles.Set(exportedName, f.raw())
}

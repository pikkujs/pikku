package visit

import (
	"slices"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

func init() {
	Register(Visitor{Name: "addProvider", Phase: PhaseSetup, Order: OrderAddProvider, Visit: (*Context).addProvider})
}

var providerVariants = []string{"dev", "deploy", "common"}

// addProvider records `export const name = defineProvider(...)`: the
// variants it has, the keys each factory destructures from `services` (needs),
// and the keys of each factory's return type (provides). The exported name is
// the name a wireAddon({ providers }) opts in by.
func (s *Context) addProvider(node *ast.Node) {
	if ast.IsCallExpression(node) && s.callsImportedDefiner(node.Expression(), "defineProvider") {
		parent := node.Parent
		if parent == nil || !ast.IsVariableDeclaration(parent) || parent.Initializer() != node {
			s.Log.Critical(diag.ProviderNotStatic, "defineProvider must be assigned to an exported const so a host can import it, got: "+tsutil.NodeText(node))
		}
		return
	}
	call, nameNode := s.definerDeclaration(node, "defineProvider")
	if call == nil {
		return
	}
	local := nameNode.Text()
	notStatic := func(msg string) { s.Log.Critical(diag.ProviderNotStatic, "Provider '"+local+"': "+msg) }

	module := ast.GetSourceFileOfNode(node).FileName()
	export, ok := s.moduleExportedName(node, nameNode)
	if !ok {
		notStatic("'" + local + "' is not exported by " + module + ", so a host cannot import it")
		return
	}

	args := call.Arguments()
	if len(args) != 1 {
		notStatic("defineProvider takes one argument, a factory function or an object with dev, deploy or common")
		return
	}
	arg := args[0]

	variants := newOObject()
	valid := true
	hasStart := false
	refModules := map[string]string{}
	read := func(variant string, fn *ast.Node, ref *providerVariantRef) {
		meta, ok := s.readProviderVariant(local, variant, fn)
		if !ok {
			valid = false
			return
		}
		if ref != nil {
			meta.set("module", ojsonString(ref.module))
			meta.set("export", ojsonString(ref.export))
		}
		variants.set(variant, meta)
	}

	switch {
	case ast.IsArrowFunction(arg) || ast.IsFunctionExpression(arg):
		read("common", arg, nil)
	case ast.IsObjectLiteralExpression(arg):
		for _, p := range arg.Properties() {
			key, isKey := "", false
			if ast.IsPropertyAssignment(p) || ast.IsMethodDeclaration(p) {
				key, isKey = literalKeyName(p.Name())
			}
			if !isKey {
				notStatic("defineProvider takes only dev, deploy, common and onServerStart as plain entries, got: " + tsutil.NodeText(p))
				valid = false
				continue
			}
			if key == "onServerStart" {
				hasStart = true
				continue
			}
			if !containsString(providerVariants, key) {
				notStatic("defineProvider takes only dev, deploy, common and onServerStart, got: " + key)
				valid = false
				continue
			}
			fn := p
			if ast.IsPropertyAssignment(p) {
				fn = p.Initializer()
			}
			if ast.IsIdentifier(fn) {
				ref, decl, problem := s.resolveProviderVariant(fn)
				if problem != "" {
					notStatic(key + " " + problem)
					valid = false
					continue
				}
				init := decl.Initializer()
				if init == nil || !(ast.IsArrowFunction(init) || ast.IsFunctionExpression(init)) {
					notStatic(key + " '" + fn.Text() + "' must be a const initialized with a function written inline")
					valid = false
					continue
				}
				if other, taken := refModules[ref.module]; taken {
					s.Log.Critical(diag.ProviderVariantsShareModule, "Provider '"+local+"': "+other+" and "+key+" are both exported from "+ref.module+". Each variant lives in its own module, so a build imports only the variant it runs.")
					valid = false
					continue
				}
				refModules[ref.module] = key
				read(key, init, &ref)
				continue
			}
			if !ast.IsArrowFunction(fn) && !ast.IsFunctionExpression(fn) && !ast.IsMethodDeclaration(fn) {
				notStatic(key + " must be a function written inline or a reference to an exported const, got: " + tsutil.NodeText(fn))
				valid = false
				continue
			}
			read(key, fn, nil)
		}
		if valid && !variants.has("dev") && !variants.has("deploy") && !variants.has("common") {
			notStatic("an object declares none of dev, deploy or common")
			valid = false
		}
	default:
		notStatic("defineProvider takes a factory function or an object with dev, deploy or common, got: " + tsutil.NodeText(arg))
		return
	}
	if !valid {
		return
	}

	meta := newOObject()
	meta.set("module", ojsonString(module))
	meta.set("export", ojsonString(export))
	meta.set("variants", variants)
	if hasStart {
		meta.set("onServerStart", &ojson{scalar: true})
	}

	manifest := newOObject()
	if len(s.State.Providers) > 0 && string(s.State.Providers) != "null" {
		if existing, err := parseOJSON(s.State.Providers); err == nil && existing.isObject() {
			manifest = existing
		}
	}
	if manifest.has(export) {
		s.Log.Critical(diag.ProviderNameDuplicated, "Provider '"+export+"' is declared twice. A provider name belongs to one export.")
		return
	}
	s.Log.Debugf("• Found defineProvider: %s", export)
	manifest.set(export, meta)
	s.State.Providers = manifest.raw()
}

type providerVariantRef struct{ module, export string }

// resolveProviderVariant is the module and export a host imports a variant by,
// with the const declaration that holds its factory, or the reason it has
// none.
func (s *Context) resolveProviderVariant(value *ast.Node) (ref providerVariantRef, decl *ast.Node, problem string) {
	sym := s.resolveAlias(s.Checker.GetSymbolAtLocation(value))
	if sym != nil {
		decl = sym.ValueDeclaration
		if decl == nil && len(sym.Declarations) > 0 {
			decl = sym.Declarations[0]
		}
	}
	if decl == nil || !ast.IsVariableDeclaration(decl) || !ast.IsIdentifier(decl.Name()) {
		return ref, nil, "'" + value.Text() + "' does not resolve to a const declaration"
	}
	file := ast.GetSourceFileOfNode(decl).FileName()
	exported, ok := s.moduleExportedName(decl, decl.Name())
	if !ok {
		return ref, nil, "'" + value.Text() + "' is not exported by " + file + ", so a host cannot import it"
	}
	return providerVariantRef{module: file, export: exported}, decl, ""
}

// readProviderVariant reads one factory: needs from the destructured
// `services` parameter, provides from the return type.
func (s *Context) readProviderVariant(provider, variant string, fn *ast.Node) (*ojson, bool) {
	where := "Provider '" + provider + "' " + variant + " "
	needs := []string{}
	if param := tsutil.ParamAt(fn, 0); param != nil {
		pattern := param.Name()
		if !ast.IsObjectBindingPattern(pattern) {
			s.Log.Critical(diag.ProviderNeedsNotStatic, where+"must destructure its services parameter, so the build can read what it depends on, got: "+tsutil.NodeText(pattern))
			return nil, false
		}
		for _, e := range pattern.Elements() {
			if e.AsBindingElement().DotDotDotToken != nil {
				s.Log.Critical(diag.ProviderNeedsNotStatic, where+"cannot collect services with a rest element, got: "+tsutil.NodeText(e))
				return nil, false
			}
			key := e.PropertyName()
			if key == nil {
				key = e.Name()
			}
			name, ok := literalKeyName(key)
			if !ok {
				s.Log.Critical(diag.ProviderNeedsNotStatic, where+"can only destructure services by plain name, got: "+tsutil.NodeText(e))
				return nil, false
			}
			if !slices.Contains(needs, name) {
				needs = append(needs, name)
			}
		}
	}

	sig := s.Checker.GetSignatureFromDeclaration(fn)
	if sig == nil {
		s.Log.Critical(diag.ProviderProvidesNotStatic, where+"has no signature the build can read")
		return nil, false
	}
	ret := s.unwrapPromise(s.Checker.GetReturnTypeOfSignature(sig))
	provides := []string{}
	switch {
	case ret == nil:
	case tsutil.IsVoidLikeType(ret):
	case ret.Flags()&(checker.TypeFlagsAny|checker.TypeFlagsUnknown|checker.TypeFlagsNever) != 0,
		ret.Flags()&checker.TypeFlagsUnion != 0,
		ret.Flags()&(checker.TypeFlagsObject|checker.TypeFlagsIntersection) == 0,
		len(s.Checker.GetIndexInfosOfType(ret)) > 0:
		if s.Options.DeferProviderProvides {
			break
		}
		s.Log.Critical(diag.ProviderProvidesNotStatic, where+"must return an object type with known keys, so the build can read what it provides, got: "+tsutil.TypeToString(s.Checker, ret, checker.TypeFormatFlagsNoTruncation))
		return nil, false
	default:
		for _, p := range s.Checker.GetPropertiesOfType(ret) {
			provides = append(provides, p.Name)
		}
		// Sorted because typescript-go lists inherited members before own ones,
		// TS the reverse.
		slices.Sort(provides)
	}

	meta := newOObject()
	meta.set("needs", ojsonStringArray(needs))
	meta.set("provides", ojsonStringArray(provides))
	return meta, true
}

func ojsonStringArray(items []string) *ojson {
	out := &ojson{isArr: true, arr: []*ojson{}}
	for _, item := range items {
		out.arr = append(out.arr, ojsonString(item))
	}
	return out
}

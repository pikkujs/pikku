package visit

import (
	"slices"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

func init() {
	Register(Visitor{Name: "addProvider", Phase: PhaseSetup, Order: OrderAddProvider, Visit: (*Context).addProvider})
}

var providerVariants = []string{"dev", "deploy", "deploy:standalone", "deploy:cloudflare-worker", "deploy:cloudflare-container", "deploy:server", "common"}

const providerVariantList = "dev, deploy, deploy:standalone, deploy:cloudflare-worker, deploy:cloudflare-container, deploy:server, common"

var providerDefiners = []string{"defineProvider", "defineWireProvider"}

// addProvider records `export const name = defineProvider(...)` and
// `defineWireProvider(...)`: the variants it has, the keys each factory
// destructures from `services` (needs), the keys of each factory's return type
// (provides), and the optional, replaces, addTo and onServerStart entries. The
// exported name is the name a wireAddon({ providers }) opts in by.
func (s *Context) addProvider(node *ast.Node) {
	if ast.IsCallExpression(node) {
		for _, definer := range providerDefiners {
			if !s.callsImportedDefiner(node.Expression(), definer) {
				continue
			}
			parent := node.Parent
			if parent == nil || !ast.IsVariableDeclaration(parent) || parent.Initializer() != node {
				s.Log.Critical(diag.ProviderNotStatic, definer+" must be assigned to an exported const so a host can import it, got: "+tsutil.NodeText(node))
			}
			return
		}
		return
	}
	var call, nameNode *ast.Node
	definer := ""
	for _, d := range providerDefiners {
		if call, nameNode = s.definerDeclaration(node, d); call != nil {
			definer = d
			break
		}
	}
	if call == nil {
		return
	}
	wire := definer == "defineWireProvider"
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
		notStatic(definer + " takes one argument, a factory function or an object with a variant")
		return
	}
	arg := tsutil.UnwrapAs(args[0])

	type variantSource struct {
		key string
		fn  *ast.Node
		ref *providerVariantRef
	}
	var sources []variantSource
	valid := true
	hasStart := false
	var optional, replaces []string
	var addTo *ast.Node
	refModules := map[string]string{}

	switch {
	case ast.IsArrowFunction(arg) || ast.IsFunctionExpression(arg):
		sources = append(sources, variantSource{key: "common", fn: arg})
	case ast.IsObjectLiteralExpression(arg):
		for _, p := range arg.Properties() {
			key, isKey := "", false
			if ast.IsPropertyAssignment(p) || ast.IsMethodDeclaration(p) {
				key, isKey = literalKeyName(p.Name())
			}
			if !isKey {
				notStatic(definer + " takes only variants, optional, replaces, addTo and onServerStart as plain entries, got: " + tsutil.NodeText(p))
				valid = false
				continue
			}
			switch key {
			case "onServerStart":
				if wire {
					notStatic("defineWireProvider takes no onServerStart")
					valid = false
					continue
				}
				hasStart = true
				continue
			case "optional":
				names, ok := stringLiteralArray(p)
				if !ok {
					s.Log.Critical(diag.ProviderOptionalInvalid, "Provider '"+local+"': optional must be an array of string literals, got: "+tsutil.NodeText(p))
					valid = false
					continue
				}
				optional = names
				continue
			case "replaces":
				names, ok := stringLiteralArray(p)
				if !ok {
					s.Log.Critical(diag.ProviderReplacesInvalid, "Provider '"+local+"': replaces must be an array of string literals, got: "+tsutil.NodeText(p))
					valid = false
					continue
				}
				replaces = names
				continue
			case "addTo":
				if wire {
					s.Log.Critical(diag.WireProviderAddsToCollection, "Wire provider '"+local+"' cannot addTo a collection: collections are built once, per process.")
					valid = false
					continue
				}
				if ast.IsPropertyAssignment(p) {
					addTo = tsutil.UnwrapAs(p.Initializer())
				} else {
					s.Log.Critical(diag.ProviderCollectionInvalid, "Provider '"+local+"': addTo must be a collection declared with defineProviderCollection, got: "+tsutil.NodeText(p))
					valid = false
				}
				continue
			}
			if !containsString(providerVariants, key) {
				if strings.HasPrefix(key, "deploy:") {
					s.Log.Critical(diag.ProviderProfileUnknown, "Provider '"+local+"': '"+key+"' is not a variant. Variants: "+providerVariantList+".")
				} else {
					notStatic(definer + " takes only dev, deploy, deploy:<profile>, common, optional, replaces, addTo and onServerStart, got: " + key)
				}
				valid = false
				continue
			}
			fn := p
			if ast.IsPropertyAssignment(p) {
				fn = tsutil.UnwrapAs(p.Initializer())
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
				sources = append(sources, variantSource{key: key, fn: init, ref: &ref})
				continue
			}
			if !ast.IsArrowFunction(fn) && !ast.IsFunctionExpression(fn) && !ast.IsMethodDeclaration(fn) {
				notStatic(key + " must be a function written inline or a reference to an exported const, got: " + tsutil.NodeText(fn))
				valid = false
				continue
			}
			sources = append(sources, variantSource{key: key, fn: fn})
		}
		if valid && len(sources) == 0 {
			notStatic("an object declares no variant")
			valid = false
		}
	default:
		notStatic(definer + " takes a factory function or an object with a variant, got: " + tsutil.NodeText(arg))
		return
	}

	collection := ""
	if addTo != nil {
		name, shown := s.collectionNameOf(addTo)
		if name == "" {
			s.Log.Critical(diag.ProviderCollectionInvalid, "Provider '"+local+"': addTo must be a collection declared with defineProviderCollection, got: "+shown)
			valid = false
		}
		collection = name
	}
	if !valid {
		return
	}

	variants := newOObject()
	type read struct {
		needs, provides []string
		deferred        bool
	}
	reads := map[string]read{}
	for _, src := range sources {
		meta, needs, provides, deferred, ok := s.readProviderVariant(local, src.key, src.fn, collection != "", optional)
		if !ok {
			valid = false
			continue
		}
		reads[src.key] = read{needs, provides, deferred}
		if src.ref != nil {
			meta.set("module", ojsonString(src.ref.module))
			meta.set("export", ojsonString(src.ref.export))
		}
		variants.set(src.key, meta)
	}
	if !valid {
		return
	}

	used := map[string]bool{}
	provided := map[string]bool{}
	anyDeferred := false
	for _, src := range sources {
		r := reads[src.key]
		anyDeferred = anyDeferred || r.deferred
		for _, n := range r.needs {
			used[n] = true
		}
		for _, p := range r.provides {
			provided[p] = true
		}
		if collection == "" && len(r.provides) == 0 && !r.deferred {
			s.Log.Critical(diag.ProviderProvidesNothing, "Provider '"+local+"' "+src.key+" provides no key and adds to no collection, so nothing could ever select it. Return an object of the keys it provides, or give it addTo.")
			valid = false
		}
	}
	for _, k := range optional {
		if !used[k] {
			s.Log.Critical(diag.ProviderOptionalInvalid, "Provider '"+local+"': optional lists '"+k+"', which no variant destructures")
			valid = false
		}
	}
	for _, k := range replaces {
		if !provided[k] && !anyDeferred {
			s.Log.Critical(diag.ProviderReplacesInvalid, "Provider '"+local+"': replaces lists '"+k+"', which no variant provides")
			valid = false
		}
	}
	if !valid {
		return
	}

	meta := newOObject()
	meta.set("kind", ojsonString(map[bool]string{false: "singleton", true: "wire"}[wire]))
	meta.set("module", ojsonString(module))
	meta.set("export", ojsonString(export))
	meta.set("variants", variants)
	if collection != "" {
		meta.set("addTo", ojsonString(collection))
	}
	if len(replaces) > 0 {
		meta.set("replaces", ojsonStringArray(replaces))
	}
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
	s.Log.Debugf("• Found %s: %s", definer, export)
	manifest.set(export, meta)
	s.State.Providers = manifest.raw()
}

// stringLiteralArray is the sorted, de-duplicated strings of `name: ['a', 'b']`.
func stringLiteralArray(prop *ast.Node) ([]string, bool) {
	if !ast.IsPropertyAssignment(prop) {
		return nil, false
	}
	names, ok := parseStringArray(tsutil.UnwrapAs(prop.Initializer()))
	if !ok {
		return nil, false
	}
	names = tsutil.Dedupe(names)
	slices.Sort(names)
	return names, true
}

// collectionNameOf is the name in the type of an addTo value,
// `ProviderCollection<'name', Item>`, so a collection declared in a .d.ts
// reads the same as one declared in source. It returns the type's text when
// the value is not one.
func (s *Context) collectionNameOf(expr *ast.Node) (name, shown string) {
	t := s.Checker.GetTypeAtLocation(expr)
	if t == nil {
		return "", tsutil.NodeText(expr)
	}
	if t.Flags()&checker.TypeFlagsObject != 0 && t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		if sym := t.Symbol(); sym != nil && sym.Name == "ProviderCollection" {
			if args := s.Checker.GetTypeArguments(t); len(args) > 0 && args[0].Flags()&checker.TypeFlagsStringLiteral != 0 {
				if v, ok := args[0].AsLiteralType().Value().(string); ok {
					return v, ""
				}
			}
		}
	}
	return "", tsutil.TypeToString(s.Checker, t, checker.TypeFormatFlagsNoTruncation)
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
// `services` parameter, provides from the return type. A collection item has
// no provides: its return value is the item. deferred is true when the return
// type is not readable yet and the pass defers it.
func (s *Context) readProviderVariant(provider, variant string, fn *ast.Node, item bool, optional []string) (meta *ojson, needs, provides []string, deferred, ok bool) {
	where := "Provider '" + provider + "' " + variant + " "
	needs = []string{}
	if param := tsutil.ParamAt(fn, 0); param != nil {
		pattern := param.Name()
		switch {
		case ast.IsIdentifier(pattern) && s.parameterUnused(fn, pattern):
		case !ast.IsObjectBindingPattern(pattern):
			s.Log.Critical(diag.ProviderNeedsNotStatic, where+"must destructure its services parameter, so the build can read what it depends on, got: "+tsutil.NodeText(pattern))
			return nil, nil, nil, false, false
		default:
			for _, e := range pattern.Elements() {
				if e.AsBindingElement().DotDotDotToken != nil {
					s.Log.Critical(diag.ProviderNeedsNotStatic, where+"cannot collect services with a rest element, got: "+tsutil.NodeText(e))
					return nil, nil, nil, false, false
				}
				key := e.PropertyName()
				if key == nil {
					key = e.Name()
				}
				name, isKey := literalKeyName(key)
				if !isKey {
					s.Log.Critical(diag.ProviderNeedsNotStatic, where+"can only destructure services by plain name, got: "+tsutil.NodeText(e))
					return nil, nil, nil, false, false
				}
				if !slices.Contains(needs, name) {
					needs = append(needs, name)
				}
			}
		}
	}

	provides = []string{}
	optionalProvides := []string{}
	if !item {
		sig := s.Checker.GetSignatureFromDeclaration(fn)
		if sig == nil {
			s.Log.Critical(diag.ProviderProvidesNotStatic, where+"has no signature the build can read")
			return nil, nil, nil, false, false
		}
		ret := s.unwrapPromise(s.Checker.GetReturnTypeOfSignature(sig))
		var readable bool
		provides, optionalProvides, readable = s.returnedKeys(ret)
		if !readable {
			if !s.Options.DeferProviderProvides {
				s.Log.Critical(diag.ProviderProvidesNotStatic, where+"must return an object type with known keys (or a union of them), so the build can read what it provides, got: "+tsutil.TypeToString(s.Checker, ret, checker.TypeFormatFlagsNoTruncation))
				return nil, nil, nil, false, false
			}
			provides, optionalProvides, deferred = []string{}, []string{}, true
		}
	}

	needsOptional := []string{}
	for _, n := range needs {
		if slices.Contains(optional, n) {
			needsOptional = append(needsOptional, n)
		}
	}
	slices.Sort(needsOptional)

	meta = newOObject()
	meta.set("needs", ojsonStringArray(needs))
	meta.set("optional", ojsonStringArray(needsOptional))
	meta.set("provides", ojsonStringArray(provides))
	meta.set("optionalProvides", ojsonStringArray(optionalProvides))
	return meta, needs, provides, deferred, true
}

// returnedKeys reads the keys of a factory's return type: an object with known
// keys, or a union whose members all are. A key is optional when it is
// declared `?:` or missing from a member. Everything else is unreadable.
func (s *Context) returnedKeys(ret *checker.Type) (provides, optional []string, ok bool) {
	provides, optional = []string{}, []string{}
	if ret == nil || tsutil.IsVoidLikeType(ret) {
		return provides, optional, true
	}
	members := []*checker.Type{ret}
	if ret.Flags()&checker.TypeFlagsUnion != 0 {
		members = ret.Types()
	}
	for _, m := range members {
		if m.Flags()&(checker.TypeFlagsAny|checker.TypeFlagsUnknown|checker.TypeFlagsNever) != 0 ||
			m.Flags()&(checker.TypeFlagsObject|checker.TypeFlagsIntersection) == 0 ||
			len(s.Checker.GetIndexInfosOfType(m)) > 0 {
			return nil, nil, false
		}
	}
	seen := map[string]int{}
	optionalIn := map[string]bool{}
	for _, m := range members {
		for _, p := range s.Checker.GetPropertiesOfType(m) {
			seen[p.Name]++
			if p.Flags&ast.SymbolFlagsOptional != 0 {
				optionalIn[p.Name] = true
			}
		}
	}
	for name, count := range seen {
		provides = append(provides, name)
		if optionalIn[name] || count < len(members) {
			optional = append(optional, name)
		}
	}
	// Sorted because typescript-go lists inherited members before own ones,
	// TS the reverse.
	slices.Sort(provides)
	slices.Sort(optional)
	return provides, optional, true
}

// factoryProvided is { keys, optional } of a factory's return type, or nil
// when the type has no readable keys.
func (s *Context) factoryProvided(fn *ast.Node) state.Raw {
	sig := s.Checker.GetSignatureFromDeclaration(fn)
	if sig == nil {
		return nil
	}
	keys, optional, ok := s.returnedKeys(s.unwrapPromise(s.Checker.GetReturnTypeOfSignature(sig)))
	if !ok {
		return nil
	}
	out := newOObject()
	out.set("keys", ojsonStringArray(keys))
	out.set("optional", ojsonStringArray(optional))
	return out.raw()
}

// parameterUnused is whether nothing in fn's body refers to the parameter
// named by name.
func (s *Context) parameterUnused(fn, name *ast.Node) bool {
	body := fn.Body()
	if body == nil {
		return true
	}
	sym := s.Checker.GetSymbolAtLocation(name)
	used := false
	tsutil.WalkSelf(body, func(n *ast.Node) {
		if used || !ast.IsIdentifier(n) || n.Text() != name.Text() {
			return
		}
		var got *ast.Symbol
		if n.Parent != nil && ast.IsShorthandPropertyAssignment(n.Parent) && n.Parent.Name() == n {
			got = s.Checker.GetShorthandAssignmentValueSymbol(n.Parent)
		} else {
			got = s.Checker.GetSymbolAtLocation(n)
		}
		if got == sym {
			used = true
		}
	})
	return !used
}

func ojsonStringArray(items []string) *ojson {
	out := &ojson{isArr: true, arr: []*ojson{}}
	for _, item := range items {
		out.arr = append(out.arr, ojsonString(item))
	}
	return out
}

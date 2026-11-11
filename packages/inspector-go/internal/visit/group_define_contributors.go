package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-define-contributors.ts.

func init() {
	Register(Visitor{Name: "addDefineContributors", Phase: PhaseSetup, Order: OrderAddDefineContributors, Visit: (*Context).addDefineContributors})
}

var contributorVariants = []string{"dev", "deploy"}

// resolveContributorVariant is the module and export a host imports a
// contributor variant by, or the reason it has none.
func (s *Context) resolveContributorVariant(value *ast.Node) (module, export, problem string) {
	if !ast.IsIdentifier(value) {
		return "", "", "must be a reference to an exported const so a host can import just that variant, got: " + tsutil.NodeText(value)
	}
	sym := s.resolveAlias(s.Checker.GetSymbolAtLocation(value))
	var decl *ast.Node
	if sym != nil {
		decl = sym.ValueDeclaration
		if decl == nil && len(sym.Declarations) > 0 {
			decl = sym.Declarations[0]
		}
	}
	if decl == nil || !ast.IsVariableDeclaration(decl) || !ast.IsIdentifier(decl.Name()) {
		return "", "", "'" + value.Text() + "' does not resolve to a const declaration"
	}
	file := ast.GetSourceFileOfNode(decl).FileName()
	exported, ok := s.moduleExportedName(decl, decl.Name())
	if !ok {
		return "", "", "'" + value.Text() + "' is not exported by " + file
	}
	return file, exported, ""
}

func (s *Context) addDefineContributors(node *ast.Node) {
	if !ast.IsCallExpression(node) || !s.callsImportedDefiner(node.Expression(), "defineContributors") {
		return
	}
	notStatic := func(msg string) { s.Log.Critical(diag.ContributorsNotStatic, msg) }

	args := node.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		msg := "defineContributors must be called with an object literal keyed by contributor name"
		if len(args) > 0 {
			msg += ", got: " + tsutil.NodeText(args[0])
		}
		notStatic(msg)
		return
	}

	for _, p := range args[0].Properties() {
		name, ok := "", false
		if ast.IsPropertyAssignment(p) {
			name, ok = literalKeyName(p.Name())
		}
		if !ok || name == "" {
			notStatic("defineContributors takes { name: { dev?, deploy? } } entries, got: " + tsutil.NodeText(p))
			continue
		}
		init := p.Initializer()
		if !ast.IsObjectLiteralExpression(init) {
			notStatic("Contributor '" + name + "' must be an object literal with dev and/or deploy, got: " + tsutil.NodeText(init))
			continue
		}

		variants := newOObject()
		valid := true
		for _, v := range init.Properties() {
			key, ok := "", false
			if ast.IsPropertyAssignment(v) {
				key, ok = literalKeyName(v.Name())
			}
			if !ok || !containsString(contributorVariants, key) {
				notStatic("Contributor '" + name + "' takes only dev and deploy, got: " + tsutil.NodeText(v))
				valid = false
				continue
			}
			module, export, problem := s.resolveContributorVariant(v.Initializer())
			if problem != "" {
				notStatic("Contributor '" + name + "' " + key + " " + problem)
				valid = false
				continue
			}
			ref := newOObject()
			ref.set("module", ojsonString(module))
			ref.set("export", ojsonString(export))
			variants.set(key, ref)
		}
		if !valid {
			continue
		}
		if !variants.has("dev") && !variants.has("deploy") {
			notStatic("Contributor '" + name + "' declares neither dev nor deploy")
			continue
		}

		manifest := newOObject()
		if len(s.State.ContributorsManifest) > 0 && string(s.State.ContributorsManifest) != "null" {
			if existing, err := parseOJSON(s.State.ContributorsManifest); err == nil && existing.isObject() {
				manifest = existing
			}
		}
		if manifest.has(name) {
			s.Log.Critical(diag.ContributorNameDuplicated, "Contributor '"+name+"' is defined twice. A contributor name belongs to one defineContributors entry.")
			continue
		}
		s.Log.Debugf("• Found defineContributors: %s", name)
		manifest.set(name, variants)
		s.State.ContributorsManifest = manifest.raw()
	}
}

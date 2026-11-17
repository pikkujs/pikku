package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

func init() {
	Register(Visitor{Name: "addWireContributors", Phase: PhaseSetup, Order: OrderAddWireContributors, Visit: (*Context).addWireContributors})
}

// addWireContributors records wireContributors({ package, contributors }): an
// opt-in to the contributors a plain package registers with defineContributors.
// It declares no addon, so nothing about it exists at runtime.
func (s *Context) addWireContributors(node *ast.Node) {
	if !ast.IsCallExpression(node) || !s.callsImportedDefiner(node.Expression(), "wireContributors") {
		return
	}
	notStatic := func(msg string) { s.Log.Critical(diag.AddonContributorsNotStatic, msg) }
	args := node.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		msg := "wireContributors must be called with an object literal { package, contributors }"
		if len(args) > 0 {
			msg += ", got: " + tsutil.NodeText(args[0])
		}
		notStatic(msg)
		return
	}
	decl := &addonDecl{contributorsOnly: true, file: ast.GetSourceFileOfNode(node).FileName(), site: s.nodePosition(node)}
	for _, p := range args[0].Properties() {
		key, ok := propKey(p)
		if !ok {
			// A spread, a shorthand or a computed key can set package or
			// contributors to something the build cannot read.
			notStatic("wireContributors' properties must be plain `key: value` entries, got: " + tsutil.NodeText(p))
			continue
		}
		init := p.Initializer()
		switch {
		case key == "package" && ast.IsStringLiteral(init):
			decl.pkg = init.Text()
		case key == "contributors":
			if names, ok := parseStringArray(init); ok {
				decl.contributors = names
			} else {
				notStatic("wireContributors' contributors must be an array of string literals, got: " + tsutil.NodeText(init))
			}
		}
	}
	if decl.pkg == "" {
		notStatic("wireContributors needs a package that is a string literal")
		return
	}
	if len(decl.contributors) == 0 {
		return
	}
	for _, prev := range s.contributorWirings {
		if prev.pkg == decl.pkg {
			s.Log.Critical(diag.AddonContributorsNotStatic, fmt.Sprintf(
				"wireContributors is called twice for package '%s' (%s and %s). Call it once with every contributor to opt in to.",
				decl.pkg, prev.site, decl.site))
			return
		}
	}
	s.Log.Debugf("• Found wireContributors: %s", decl.pkg)
	s.contributorWirings = append(s.contributorWirings, decl)
}

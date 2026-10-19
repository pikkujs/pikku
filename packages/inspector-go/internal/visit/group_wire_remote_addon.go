package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/remotesdk"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-wire-remote-addon.ts.

func init() {
	Register(Visitor{Name: "addWireRemoteAddon", Phase: PhaseSetup, Order: OrderAddWireRemoteAddon, Visit: (*Context).addWireRemoteAddon})
}

func (s *Context) addWireRemoteAddon(node *ast.Node) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != "wireRemoteAddon" {
		return
	}
	args := node.Arguments()
	if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
		return
	}
	var name, pkg string
	var pkgNode *ast.Node
	pkgIsLiteral := false
	var authCredentialId, authSecretId *string
	hasAuth := false
	for _, p := range args[0].Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		init := p.Initializer()
		switch key := p.Name().Text(); {
		case key == "name" && ast.IsStringLiteral(init):
			name = init.Text()
		case key == "package":
			pkgNode = init
			if ast.IsStringLiteralLike(init) {
				pkg = init.Text()
				pkgIsLiteral = true
			}
		case key == "auth" && ast.IsObjectLiteralExpression(init):
			hasAuth = true
			for _, ap := range init.Properties() {
				if !ast.IsPropertyAssignment(ap) || !ast.IsIdentifier(ap.Name()) || !ast.IsStringLiteral(ap.Initializer()) {
					continue
				}
				v := ap.Initializer().Text()
				switch ap.Name().Text() {
				case "credentialId":
					authCredentialId = &v
				case "secretId":
					authSecretId = &v
				}
			}
		}
	}
	file := ast.GetSourceFileOfNode(node).FileName()
	if pkgNode != nil && !pkgIsLiteral {
		label := "…"
		if name != "" {
			label = "'" + name + "'"
		}
		s.Log.Critical(diag.RemoteAddonPackageNotStatic, "wireRemoteAddon("+label+") in "+file+" sets package to '"+tsutil.NodeText(pkgNode)+"', which is not a string literal. Write the package (and its version range) inline, e.g. package: '@scope/addon@^1.0.0', so it can be read without running the file.")
		return
	}
	if name == "" || pkg == "" {
		return
	}
	pkgName, rng, err := remotesdk.ParsePackage(pkg)
	if err != nil {
		s.Log.Critical(diag.RemoteAddonPackageInvalid, "wireRemoteAddon('"+name+"'): "+err.Error())
		return
	}
	if rng != "" {
		s.Log.Debugf("• Found wireRemoteAddon: %s → %s@%s (remote)", name, pkgName, rng)
	} else {
		s.Log.Debugf("• Found wireRemoteAddon: %s → %s (remote)", name, pkgName)
	}
	var o jsObject
	o.set("package", pkgName)
	if rng != "" {
		o.set("range", rng)
	}
	o.set("file", file)
	o.set("remote", true)
	o.set("hasAuth", hasAuth)
	o.set("authCredentialId", nilIfNil(authCredentialId))
	o.set("authSecretId", nilIfNil(authSecretId))
	s.declareAddon(name, &addonDecl{pkg: pkgName, rng: rng, file: file, remote: true}, o.raw())
}

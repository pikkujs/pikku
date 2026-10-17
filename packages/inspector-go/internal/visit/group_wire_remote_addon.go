package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"
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
		case key == "package" && ast.IsStringLiteral(init):
			pkg = init.Text()
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
	if name == "" || pkg == "" {
		return
	}
	file := ast.GetSourceFileOfNode(node).FileName()
	s.Log.Debugf("• Found wireRemoteAddon: %s → %s (remote)", name, pkg)
	var o jsObject
	o.set("package", pkg)
	o.set("file", file)
	o.set("remote", true)
	o.set("hasAuth", hasAuth)
	o.set("authCredentialId", nilIfNil(authCredentialId))
	o.set("authSecretId", nilIfNil(authSecretId))
	s.declareAddon(name, &addonDecl{pkg: pkg, file: file, remote: true}, o.raw())
}

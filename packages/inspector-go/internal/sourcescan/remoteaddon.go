package sourcescan

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
)

// RemoteAddonLiteral is one `wireRemoteAddon({ package: '<literal>' })` call:
// the literal as written, the `name` option when it is a literal, and the
// 1-based line the package literal sits on.
type RemoteAddonLiteral struct {
	Namespace *string `json:"namespace"`
	Spec      string  `json:"spec"`
	Line      int     `json:"line"`
}

// FindWireRemoteAddonLiterals ports the scan in
// utils/find-wire-remote-addon-specs.ts; parsing the package literal stays in
// TypeScript with parseRemoteAddonPackage.
func FindWireRemoteAddonLiterals(fileName, content string) []RemoteAddonLiteral {
	found := []RemoteAddonLiteral{}
	if !strings.Contains(content, "wireRemoteAddon") {
		return found
	}
	sf := Parse(fileName, content, core.ScriptKindUnknown)
	var visit func(n *ast.Node)
	visit = func(n *ast.Node) {
		if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "wireRemoteAddon" {
			args := n.AsCallExpression().Arguments.Nodes
			if len(args) > 0 && ast.IsObjectLiteralExpression(args[0]) {
				var namespace *string
				var literal *ast.Node
				for _, prop := range args[0].AsObjectLiteralExpression().Properties.Nodes {
					if !ast.IsPropertyAssignment(prop) || !ast.IsIdentifier(prop.Name()) {
						continue
					}
					init := prop.Initializer()
					switch {
					case prop.Name().Text() == "name" && isStringLiteralLike(init):
						text := init.Text()
						namespace = &text
					case prop.Name().Text() == "package" && isStringLiteralLike(init):
						literal = init
					}
				}
				if literal != nil {
					found = append(found, RemoteAddonLiteral{
						Namespace: namespace,
						Spec:      literal.Text(),
						Line:      lineOf(sf, start(literal, sf)),
					})
				}
			}
		}
		forEachChild(n, visit)
	}
	visit(sf.AsNode())
	return found
}

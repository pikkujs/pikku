package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

func init() {
	Register(Visitor{Name: "addProviderCollection", Phase: PhaseSetup, Order: OrderAddProviderCollection, Visit: (*Context).addProviderCollection})
}

// addProviderCollection records `export const name =
// defineProviderCollection('name')`: the collection's name, and the module and
// export a host imports it by.
func (s *Context) addProviderCollection(node *ast.Node) {
	const definer = "defineProviderCollection"
	if ast.IsCallExpression(node) && s.callsImportedDefiner(node.Expression(), definer) {
		parent := node.Parent
		if parent == nil || !ast.IsVariableDeclaration(parent) || parent.Initializer() != node {
			s.collectionInvalid(definer + " must be assigned to an exported const with a string literal name, got: " + tsutil.NodeText(node))
		}
		return
	}
	call, nameNode := s.definerDeclaration(node, definer)
	if call == nil {
		return
	}
	module := ast.GetSourceFileOfNode(node).FileName()
	export, ok := s.moduleExportedName(node, nameNode)
	args := call.Arguments()
	if !ok || len(args) != 1 || !ast.IsStringLiteral(tsutil.UnwrapAs(args[0])) {
		s.collectionInvalid(definer + " must be assigned to an exported const with a string literal name, got: " + tsutil.NodeText(call))
		return
	}
	name := tsutil.UnwrapAs(args[0]).Text()

	collections := newOObject()
	if len(s.State.ProviderCollections) > 0 && string(s.State.ProviderCollections) != "null" {
		if existing, err := parseOJSON(s.State.ProviderCollections); err == nil && existing.isObject() {
			collections = existing
		}
	}
	if collections.has(name) {
		first, _ := collections.get(name).get("module").str()
		s.collectionInvalid("Collection '" + name + "' is declared twice: " + first + " and " + module)
		return
	}
	entry := newOObject()
	entry.set("name", ojsonString(name))
	entry.set("module", ojsonString(module))
	entry.set("export", ojsonString(export))
	s.Log.Debugf("• Found defineProviderCollection: %s", name)
	collections.set(name, entry)
	s.State.ProviderCollections = collections.raw()
}

func (s *Context) collectionInvalid(msg string) {
	s.Log.Critical(diag.ProviderCollectionInvalid, msg)
}

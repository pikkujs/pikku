package visit

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Port of add/add-auth.ts: the single `export const X = pikkuBetterAuth(...)`.
// Everything finalize's stampAuthHandlerServices and aggregateRequiredServices
// read comes from auth.definition, recorded here.

func init() {
	Register(Visitor{Name: "addAuth", Phase: PhaseRoutes, Order: OrderAddAuth, Visit: (*Context).addAuth})
}

// Abort is a TS `throw` inside a visitor: it ends the inspection with an
// error. analyze.Run recovers it.
type Abort struct{ Message string }

func (a Abort) Error() string { return a.Message }

const defaultAuthBasePath = "/api/auth"

const betterAuthPluginsModule = "better-auth/plugins"

func unsupportedAdminPlugin(sourceFile string) string {
	return "better-auth's admin() plugin is not supported by pikku (" + sourceFile + `).

It authorizes against a 'user.role' column, while pikku authorizes on scopes —
wiring both means one has to be projected onto the other, and the projection is
coarser than the scopes it stands in for.

Use pikkuBan() instead:

  import { pikkuBan } from '@pikku/better-auth'
  betterAuth({ plugins: [pikkuBan()] })

pikkuBan() keeps the part of admin() that pikku cannot supply from outside
better-auth — the banned/banReason/banExpires columns and the session hook that
refuses a banned user a session. Everything else admin() offered is already
scoped RPCs in @pikku/addon-admin: list, create, ban, remove, revoke sessions
and set password.`
}

// authProp finds a property assignment named by an identifier or a string
// literal (add-auth.ts's readXProp helpers).
func authProp(obj *ast.Node, name string, stringKeys bool) *ast.Node {
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) {
			continue
		}
		n := p.Name()
		if (ast.IsIdentifier(n) || (stringKeys && ast.IsStringLiteral(n))) && n.Text() == name {
			return p
		}
	}
	return nil
}

func authPropInit(obj *ast.Node, name string, is func(*ast.Node) bool) *ast.Node {
	if p := authProp(obj, name, true); p != nil && is(p.Initializer()) {
		return p.Initializer()
	}
	return nil
}

// enabledUnlessFalse is `!enabledProp || enabledProp.initializer.kind !== FalseKeyword`.
func enabledUnlessFalse(obj *ast.Node, stringKeys bool) bool {
	p := authProp(obj, "enabled", stringKeys)
	return p == nil || p.Initializer().Kind != ast.KindFalseKeyword
}

type pluginBindings struct {
	named      map[string]string
	namespaces map[string]bool
}

func readPluginBindings(sf *ast.SourceFile) pluginBindings {
	b := pluginBindings{named: map[string]string{}, namespaces: map[string]bool{}}
	for _, st := range sf.Statements.Nodes {
		if !ast.IsImportDeclaration(st) {
			continue
		}
		decl := st.AsImportDeclaration()
		if !ast.IsStringLiteral(decl.ModuleSpecifier) || decl.ModuleSpecifier.Text() != betterAuthPluginsModule || decl.ImportClause == nil {
			continue
		}
		nb := decl.ImportClause.AsImportClause().NamedBindings
		if nb == nil {
			continue
		}
		if ast.IsNamespaceImport(nb) {
			b.namespaces[nb.Name().Text()] = true
			continue
		}
		for _, el := range nb.Elements() {
			spec := el.AsImportSpecifier()
			exported := el.Name().Text()
			if spec.PropertyName != nil {
				exported = spec.PropertyName.Text()
			}
			b.named[el.Name().Text()] = exported
		}
	}
	return b
}

// readPluginEntry returns the plugin id and the name better-auth exports it
// under ("" when it did not come from better-auth/plugins).
func readPluginEntry(el *ast.Node, b pluginBindings) (id, betterAuthExport string, ok bool) {
	if !ast.IsCallExpression(el) {
		return "", "", false
	}
	callee := el.Expression()
	if ast.IsIdentifier(callee) {
		return callee.Text(), b.named[callee.Text()], true
	}
	if ast.IsPropertyAccessExpression(callee) && ast.IsIdentifier(callee.Expression()) && b.namespaces[callee.Expression().Text()] {
		return callee.Name().Text(), callee.Name().Text(), true
	}
	return "", "", false
}

func (s *Context) addAuth(node *ast.Node) {
	if s.resolveCalleeName(node, isPikkuBetterAuth) == "" {
		return
	}
	sourceFile := fileOf(node)

	varDecl := node.Parent
	if !ast.IsVariableDeclaration(varDecl) || !ast.IsIdentifier(varDecl.Name()) {
		s.Log.Critical(diag.AuthNotExported, "pikkuBetterAuth(...) must be assigned to an exported const, e.g. `export const auth = pikkuBetterAuth((services) => betterAuth({...}))` in "+sourceFile)
		return
	}
	exportName := varDecl.Name().Text()

	declList := varDecl.Parent
	isConst := declList != nil && ast.IsVariableDeclarationList(declList) && declList.Flags&ast.NodeFlagsConst != 0
	isExported := false
	if declList != nil {
		if stmt := declList.Parent; stmt != nil && ast.IsVariableStatement(stmt) && tsutil.HasExportModifier(stmt) {
			isExported = true
		}
	}
	if !isExported || !isConst {
		s.Log.Critical(diag.AuthNotExported, fmt.Sprintf("pikkuBetterAuth(...) must be assigned to an exported const so the CLI can import it. Use `export const %s = pikkuBetterAuth(...)` in %s", exportName, sourceFile))
		return
	}

	if s.State.Auth.Definition != nil {
		s.Log.Critical(diag.DuplicateAuthDefinition, fmt.Sprintf("Only one pikkuBetterAuth(...) is allowed per codebase. Found a second in %s (first: %s).", sourceFile, s.State.Auth.Definition.SourceFile))
		return
	}

	args := node.Arguments()
	if len(args) == 0 || !tsutil.IsFunctionLike(args[0]) {
		s.Log.Critical(diag.MissingName, "pikkuBetterAuth(...) must take a factory function returning betterAuth(...), e.g. `pikkuBetterAuth((services) => betterAuth({...}))` in "+sourceFile)
		return
	}
	factory := args[0]

	s.State.Auth.Files.Add(sourceFile)
	services := servicesOf(factory)

	basePath := defaultAuthBasePath
	hasCredentials, cookieCache := false, false
	var config *ast.Node
	if call := s.findCall(factory, isBetterAuth, "betterAuth"); call != nil && len(call.Arguments()) > 0 {
		config = call.Arguments()[0]
	}

	if config != nil && ast.IsObjectLiteralExpression(config) {
		if p := authPropInit(config, "basePath", ast.IsStringLiteral); p != nil {
			basePath = p.Text()
		}
		if session := authPropInit(config, "session", ast.IsObjectLiteralExpression); session != nil {
			if cc := authPropInit(session, "cookieCache", ast.IsObjectLiteralExpression); cc != nil {
				cookieCache = enabledUnlessFalse(cc, true)
			}
		}
		if ep := authPropInit(config, "emailAndPassword", ast.IsObjectLiteralExpression); ep != nil {
			hasCredentials = enabledUnlessFalse(ep, false)
		}
		if sp := authPropInit(config, "socialProviders", ast.IsObjectLiteralExpression); sp != nil {
			for _, p := range sp.Properties() {
				if !ast.IsPropertyAssignment(p) && !ast.IsShorthandPropertyAssignment(p) {
					continue
				}
				n := p.Name()
				if !ast.IsIdentifier(n) && !ast.IsStringLiteral(n) {
					continue
				}
				if key := n.Text(); key != "" && !contains(s.State.Auth.Providers, key) {
					s.State.Auth.Providers = append(s.State.Auth.Providers, key)
				}
			}
		}
		if plugins := authPropInit(config, "plugins", ast.IsArrayLiteralExpression); plugins != nil {
			bindings := readPluginBindings(ast.GetSourceFileOfNode(node))
			for _, el := range plugins.Elements() {
				id, exported, ok := readPluginEntry(el, bindings)
				if !ok {
					continue
				}
				if exported == "admin" {
					panic(Abort{Message: unsupportedAdminPlugin(sourceFile)})
				}
				if !contains(s.State.Auth.Plugins, id) {
					s.State.Auth.Plugins = append(s.State.Auth.Plugins, id)
				}
			}
		}
	} else {
		s.Log.Warn(fmt.Sprintf("pikkuBetterAuth in %s: could not statically find a betterAuth({...}) call inside the factory — social provider secrets will not be auto-wired.", sourceFile))
	}

	s.State.Auth.Definition = &state.AuthDefinition{
		ExportName: exportName, SourceFile: sourceFile, BasePath: basePath,
		HasCredentials: hasCredentials, CookieCache: cookieCache,
		Plugins:  append(state.Strings{}, s.State.Auth.Plugins...),
		Services: services,
	}
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

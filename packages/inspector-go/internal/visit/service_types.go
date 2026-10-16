package visit

import (
	"slices"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Port of utils/resolve-service-types.ts (with resolve-core-type.ts and
// secret-alias-services.ts): the SingletonServices / Services names finalize
// reads from state.serviceTypes.

// resolveCoreType is resolve-core-type.ts: the declared type of the first
// import-map entry whose type a core-type visitor recorded.
func (s *Context) resolveCoreType(importMap state.PathToNameAndType) *checker.Type {
	var found *checker.Type
	importMap.Each(func(_ string, entries []state.NameAndType) {
		if found != nil {
			return
		}
		for _, e := range entries {
			if e.Type == nil {
				continue
			}
			for _, ct := range s.coreTypes {
				if ct.name == *e.Type && ct.sym != nil {
					found = s.Checker.GetDeclaredTypeOfSymbol(ct.sym)
					return
				}
			}
		}
	})
	return found
}

// tsPropertyNames is `type.getProperties().map((s) => s.getName())` in the
// order TypeScript gives: an interface's own members first, then each base's
// (recursively) that it does not redeclare. typescript-go lists inherited
// members first, so the order is rebuilt from the base types.
func (s *Context) tsPropertyNames(t *checker.Type) []string {
	props := s.Checker.GetPropertiesOfType(t)
	var own []string
	if sym := t.Symbol(); sym != nil {
		for _, p := range props {
			for _, d := range p.Declarations {
				if d.Parent != nil && slices.Contains(sym.Declarations, d.Parent) {
					own = append(own, p.Name)
					break
				}
			}
		}
	}
	names := own
	seen := map[string]bool{}
	for _, n := range own {
		seen[n] = true
	}
	if t.Flags()&checker.TypeFlagsObject != 0 {
		for _, base := range s.Checker.GetBaseTypes(t) {
			for _, n := range s.tsPropertyNames(base) {
				if !seen[n] {
					seen[n] = true
					names = append(names, n)
				}
			}
		}
	}
	for _, p := range props {
		if !seen[p.Name] {
			seen[p.Name] = true
			names = append(names, p.Name)
		}
	}
	return names
}

var secretServiceMethods = []string{"getSecret", "hasSecret", "setSecret", "deleteSecret", "getSecrets"}

func firstDeclaration(sym *ast.Symbol) *ast.Node {
	if sym.ValueDeclaration != nil {
		return sym.ValueDeclaration
	}
	if len(sym.Declarations) > 0 {
		return sym.Declarations[0]
	}
	return nil
}

// isSecretServiceType is secret-alias-services.ts isSecretServiceType.
func (s *Context) isSecretServiceType(t *checker.Type) bool {
	nonNullable := s.Checker.GetNonNullableType(t)
	for _, method := range secretServiceMethods {
		prop := s.Checker.GetPropertyOfType(nonNullable, method)
		if prop == nil {
			return false
		}
		decl := firstDeclaration(prop)
		if decl == nil {
			return false
		}
		if len(s.Checker.GetSignaturesOfType(s.Checker.GetTypeOfSymbolAtLocation(prop, decl), checker.SignatureKindCall)) == 0 {
			return false
		}
	}
	return true
}

// findSecretAliasServices is secret-alias-services.ts findSecretAliasServices.
func (s *Context) findSecretAliasServices(t *checker.Type) state.Strings {
	aliases := state.Strings{}
	for _, p := range s.Checker.GetPropertiesOfType(t) {
		if p.Name == "secrets" {
			continue
		}
		decl := firstDeclaration(p)
		if decl == nil {
			continue
		}
		if s.isSecretServiceType(s.Checker.GetTypeOfSymbolAtLocation(p, decl)) {
			aliases = append(aliases, p.Name)
		}
	}
	slices.Sort(aliases)
	return aliases
}

// FinishServiceTypes is `state.serviceTypes = resolveServiceTypes(state,
// checker)`, run at the end of analysis like the TS analyzeProgram.
func (s *Context) FinishServiceTypes() {
	singleton := s.resolveCoreType(s.State.SingletonServicesTypeImportMap)
	services := s.resolveCoreType(s.State.WireServicesTypeImportMap)
	out := &state.ServiceTypes{SecretAliases: state.Strings{}}
	if singleton != nil {
		names := state.Strings(s.tsPropertyNames(singleton))
		slices.Sort(names)
		out.SingletonServices = &names
		out.SecretAliases = s.findSecretAliasServices(singleton)
	}
	if services != nil {
		names := state.Strings(s.tsPropertyNames(services))
		out.Services = &names
	}
	s.State.ServiceTypes = out
}

package visit

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Type-naming half of add-functions.ts. The TypesMap unique-name machinery is
// not ported: a non-custom type is always recorded under its own symbol name,
// which is what TypesMap.addType does unless an earlier addUniqueType claimed
// the name with a different path.

func (s *Context) typeToString(t *checker.Type) string {
	return tsutil.TypeToString(s.Checker, t, checker.TypeFormatFlagsNoTruncation)
}

func (s *Context) unwrapPromise(t *checker.Type) *checker.Type {
	if t == nil || t.Symbol() == nil {
		return t
	}
	sym := t.Symbol()
	isPromise := sym.Name == "Promise" && strings.Contains(checker.Checker_getFullyQualifiedName(s.Checker, sym, nil), "Promise")
	if !isPromise {
		return t
	}
	if a := t.Alias(); a != nil && len(a.TypeArguments()) == 1 {
		return a.TypeArguments()[0]
	}
	if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		if args := s.Checker.GetTypeArguments(t); len(args) == 1 {
			return args[0]
		}
	}
	return t
}

func (s *Context) resolveTypeImports(t *checker.Type, isCustom bool) []string {
	tm := s.TypesMap()
	var out []string
	var visit func(cur *checker.Type)
	visitNested := func(cur *checker.Type) {
		if a := cur.Alias(); a != nil {
			for _, ta := range a.TypeArguments() {
				visit(ta)
			}
		}
		if cur.Flags()&checker.TypeFlagsUnionOrIntersection != 0 {
			for _, m := range cur.Types() {
				visit(m)
			}
		}
		if cur.Flags()&checker.TypeFlagsObject != 0 && cur.ObjectFlags()&checker.ObjectFlagsReference != 0 {
			for _, ta := range s.Checker.GetTypeArguments(cur) {
				visit(ta)
			}
		}
	}
	visit = func(cur *checker.Type) {
		var sym *ast.Symbol
		if a := cur.Alias(); a != nil {
			sym = a.Symbol()
		}
		if sym == nil {
			sym = cur.Symbol()
		}
		if decl := tsutil.FirstDecl(sym); decl != nil {
			path := ast.GetSourceFileOfNode(decl).FileName()
			name := tsutil.SymbolName(sym)
			if !tsutil.IsLibFile(path) && sym.Name != ast.InternalSymbolNameType && !tsutil.IsPrimitive(cur) && decl.Kind != ast.KindEnumMember {
				unique := tm.Exists(name, path)
				if unique == "" {
					if isCustom {
						unique = tm.AddUniqueType(name, path)
					} else {
						tm.AddType(name, path)
						unique = name
					}
				}
				out = append(out, unique)
			}
		}
		// TS walks the nested types twice for a custom alias (once in its
		// isCustom branch, once unconditionally), so references can repeat.
		if isCustom {
			visitNested(cur)
		}
		visitNested(cur)
		if cur.Flags()&checker.TypeFlagsObject != 0 {
			ts := cur.Symbol()
			if ts == nil || ts.Name == ast.InternalSymbolNameType {
				for _, prop := range s.Checker.GetPropertiesOfType(cur) {
					if prop.ValueDeclaration != nil {
						if pt := s.Checker.GetTypeOfSymbolAtLocation(prop, prop.ValueDeclaration); pt != nil {
							visit(pt)
						}
					}
				}
			}
		}
	}
	visit(t)
	return out
}

func (s *Context) getNamesAndTypes(direction, funcName string, t *checker.Type) ([]string, []*checker.Type) {
	if t == nil || t.Flags()&(checker.TypeFlagsVoidLike|checker.TypeFlagsNull) != 0 {
		return nil, nil
	}
	var types []*checker.Type
	var names []string
	add := func(m *checker.Type) {
		if n := tsutil.NullifyType(s.typeToString(m)); n != "" {
			types = append(types, m)
			names = append(names, n)
		}
	}
	if t.IsUnion() && t.Flags()&checker.TypeFlagsIntersection == 0 {
		for _, m := range tsutil.UnionTypesInIdOrder(t) {
			add(m)
		}
	} else {
		add(t)
	}
	if len(names) > 1 || (len(names) == 1 && !validVarName.MatchString(names[0])) {
		aliasName := tsutil.FuncIdToTypeName(funcName) + direction
		refs := []string{}
		for _, rt := range types {
			refs = append(refs, s.resolveTypeImports(rt, true)...)
		}
		s.TypesMap().AddCustomType(aliasName, strings.Join(names, " | "), refs)
		return []string{aliasName}, types
	}
	var out []string
	for i, n := range names {
		if tsutil.IsPrimitive(types[i]) {
			out = append(out, n)
		} else {
			out = append(out, s.resolveTypeImports(types[i], false)...)
		}
	}
	return out, types
}

// --- ensure-function-metadata.ts flavour of the same helpers ---------------

func (s *Context) isPromiseSym(t *checker.Type) bool {
	sym := t.Symbol()
	return sym != nil && sym.Name == "Promise" && strings.Contains(checker.Checker_getFullyQualifiedName(s.Checker, sym, nil), "Promise")
}

func (s *Context) firstTypeArg(t *checker.Type) *checker.Type {
	if a := t.Alias(); a != nil && len(a.TypeArguments()) > 0 {
		return a.TypeArguments()[0]
	}
	if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		if args := s.Checker.GetTypeArguments(t); len(args) > 0 {
			return args[0]
		}
	}
	return nil
}

// unwrapPromiseOrVoid also drops `void` / `Promise<void>` members of a union.
func (s *Context) unwrapPromiseOrVoid(t *checker.Type) *checker.Type {
	if t.IsUnion() {
		var nonVoid []*checker.Type
		for _, m := range t.Types() {
			if tsutil.IsVoidLikeType(m) {
				continue
			}
			if s.isPromiseSym(m) {
				if inner := s.firstTypeArg(m); inner != nil && tsutil.IsVoidLikeType(inner) {
					continue
				}
			}
			nonVoid = append(nonVoid, m)
		}
		if len(nonVoid) >= 1 {
			return s.unwrapPromiseOrVoid(nonVoid[0])
		}
		return t
	}
	return s.unwrapPromise(t)
}

func (s *Context) resolveTypeName(t *checker.Type, funcName, direction string) string {
	if t.Flags()&(checker.TypeFlagsVoidLike|checker.TypeFlagsNull) != 0 {
		return ""
	}
	str := s.typeToString(t)
	if str == "" || str == "void" || str == "undefined" || str == "null" {
		return ""
	}
	if validVarName.MatchString(str) {
		var sym *ast.Symbol
		if a := t.Alias(); a != nil {
			sym = a.Symbol()
		}
		if sym == nil {
			sym = t.Symbol()
		}
		if decl := tsutil.FirstDecl(sym); decl != nil {
			path := ast.GetSourceFileOfNode(decl).FileName()
			if s.TypesMap().Exists(str, path) == "" {
				s.TypesMap().AddType(str, path)
			}
		}
		return str
	}
	alias := tsutil.FuncIdToTypeName(funcName) + direction
	s.TypesMap().AddCustomType(alias, str, nil)
	return alias
}

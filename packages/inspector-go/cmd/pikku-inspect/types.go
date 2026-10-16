package main

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// Type-naming half of add-functions.ts. The TypesMap unique-name machinery is
// not ported: a non-custom type is always recorded under its own symbol name,
// which is what TypesMap.addType does unless an earlier addUniqueType claimed
// the name with a different path.

func nullifyType(name string) string {
	switch name {
	case "void", "undefined", "unknown", "any", "null":
		return ""
	}
	return name
}

const primitiveFlags = checker.TypeFlagsNumber | checker.TypeFlagsString | checker.TypeFlagsBoolean |
	checker.TypeFlagsBigInt | checker.TypeFlagsESSymbol | checker.TypeFlagsVoid | checker.TypeFlagsUndefined |
	checker.TypeFlagsNull | checker.TypeFlagsUnknown | checker.TypeFlagsVoidLike

func isPrimitive(t *checker.Type) bool { return t.Flags()&primitiveFlags != 0 }

func (s *state) typeToString(t *checker.Type) string {
	return s.c.TypeToStringEx(t, nil, checker.TypeFormatFlagsNoTruncation, nil)
}

func (s *state) unwrapPromise(t *checker.Type) *checker.Type {
	if t == nil || t.Symbol() == nil {
		return t
	}
	sym := t.Symbol()
	isPromise := sym.Name == "Promise" && strings.Contains(checker.Checker_getFullyQualifiedName(s.c, sym, nil), "Promise")
	if !isPromise {
		return t
	}
	if a := t.Alias(); a != nil && len(a.TypeArguments()) == 1 {
		return a.TypeArguments()[0]
	}
	if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		if args := s.c.GetTypeArguments(t); len(args) == 1 {
			return args[0]
		}
	}
	return t
}

func isLibFile(path string) bool {
	// TS checks for node_modules/typescript; typescript-go serves its lib
	// files from an embedded "bundled:///libs/..." filesystem instead.
	return strings.Contains(path, "node_modules/typescript") || strings.HasPrefix(path, "bundled:")
}

func (s *state) resolveTypeImports(t *checker.Type, isCustom bool) []string {
	tm := s.typesMap
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
			for _, ta := range s.c.GetTypeArguments(cur) {
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
		if decl := firstDecl(sym); decl != nil {
			path := ast.GetSourceFileOfNode(decl).FileName()
			name := tsSymbolName(sym)
			if !isLibFile(path) && sym.Name != ast.InternalSymbolNameType && !isPrimitive(cur) && decl.Kind != ast.KindEnumMember {
				unique := tm.exists(name, path)
				if unique == "" {
					if isCustom {
						unique = tm.addUniqueType(name, path)
					} else {
						tm.addType(name, path)
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
				for _, prop := range s.c.GetPropertiesOfType(cur) {
					if prop.ValueDeclaration != nil {
						if pt := s.c.GetTypeOfSymbolAtLocation(prop, prop.ValueDeclaration); pt != nil {
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

func (s *state) getNamesAndTypes(direction, funcName string, t *checker.Type) ([]string, []*checker.Type) {
	if t == nil || t.Flags()&(checker.TypeFlagsVoidLike|checker.TypeFlagsNull) != 0 {
		return nil, nil
	}
	var types []*checker.Type
	var names []string
	add := func(m *checker.Type) {
		if n := nullifyType(s.typeToString(m)); n != "" {
			types = append(types, m)
			names = append(names, n)
		}
	}
	if t.IsUnion() && t.Flags()&checker.TypeFlagsIntersection == 0 {
		for _, m := range t.Types() {
			add(m)
		}
	} else {
		add(t)
	}
	if len(names) > 1 || (len(names) == 1 && !validVarName.MatchString(names[0])) {
		aliasName := funcIdToTypeName(funcName) + direction
		refs := []string{}
		for _, rt := range types {
			refs = append(refs, s.resolveTypeImports(rt, true)...)
		}
		s.typesMap.addCustomType(aliasName, strings.Join(names, " | "), refs)
		return []string{aliasName}, types
	}
	var out []string
	for i, n := range names {
		if isPrimitive(types[i]) {
			out = append(out, n)
		} else {
			out = append(out, s.resolveTypeImports(types[i], false)...)
		}
	}
	return out, types
}

// --- ensure-function-metadata.ts flavour of the same helpers ---------------

func isVoidLikeType(t *checker.Type) bool {
	return t.Flags()&(checker.TypeFlagsVoid|checker.TypeFlagsUndefined|checker.TypeFlagsVoidLike) != 0
}

func (s *state) isPromiseSym(t *checker.Type) bool {
	sym := t.Symbol()
	return sym != nil && sym.Name == "Promise" && strings.Contains(checker.Checker_getFullyQualifiedName(s.c, sym, nil), "Promise")
}

func (s *state) firstTypeArg(t *checker.Type) *checker.Type {
	if a := t.Alias(); a != nil && len(a.TypeArguments()) > 0 {
		return a.TypeArguments()[0]
	}
	if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		if args := s.c.GetTypeArguments(t); len(args) > 0 {
			return args[0]
		}
	}
	return nil
}

// unwrapPromiseOrVoid also drops `void` / `Promise<void>` members of a union.
func (s *state) unwrapPromiseOrVoid(t *checker.Type) *checker.Type {
	if t.IsUnion() {
		var nonVoid []*checker.Type
		for _, m := range t.Types() {
			if isVoidLikeType(m) {
				continue
			}
			if s.isPromiseSym(m) {
				if inner := s.firstTypeArg(m); inner != nil && isVoidLikeType(inner) {
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

func (s *state) resolveTypeName(t *checker.Type, funcName, direction string) string {
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
		if decl := firstDecl(sym); decl != nil {
			path := ast.GetSourceFileOfNode(decl).FileName()
			if s.typesMap.exists(str, path) == "" {
				s.typesMap.addType(str, path)
			}
		}
		return str
	}
	alias := funcIdToTypeName(funcName) + direction
	s.typesMap.addCustomType(alias, str, nil)
	return alias
}

// tsSymbolName spells internal symbol names the way Strada does: tsgo marks
// them with a 0xFE byte ("\xFEobject"), TS with a "__" prefix ("__object").
func tsSymbolName(sym *ast.Symbol) string {
	if strings.HasPrefix(sym.Name, "\xFE") {
		return "__" + sym.Name[1:]
	}
	return sym.Name
}

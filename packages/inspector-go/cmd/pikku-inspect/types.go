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

func (s *state) resolveTypeImports(t *checker.Type) []string {
	var out []string
	var visit func(cur *checker.Type)
	visit = func(cur *checker.Type) {
		var sym *ast.Symbol
		if a := cur.Alias(); a != nil {
			sym = a.Symbol()
		}
		if sym == nil {
			sym = cur.Symbol()
		}
		if sym != nil {
			if decl := firstDecl(sym); decl != nil {
				path := ast.GetSourceFileOfNode(decl).FileName()
				if !isLibFile(path) && sym.Name != ast.InternalSymbolNameType && !isPrimitive(cur) && decl.Kind != ast.KindEnumMember {
					out = append(out, sym.Name)
				}
			}
		}
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

func (s *state) getNamesAndTypes(direction, funcName string, t *checker.Type) []string {
	if t == nil || t.Flags()&(checker.TypeFlagsVoidLike|checker.TypeFlagsNull) != 0 {
		return nil
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
		return []string{funcIdToTypeName(funcName) + direction}
	}
	var out []string
	for i, n := range names {
		if isPrimitive(types[i]) {
			out = append(out, n)
		} else {
			out = append(out, s.resolveTypeImports(types[i])...)
		}
	}
	return out
}

package visit

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

const maxDeclaredUnknownDepth = 12

// DeclaredUnknowns maps a schema name to the paths at which its source wrote
// `unknown` or `any` itself. A path names properties with `.name`, array
// items with `[]` and open-map values with `[*]`.
func (s *Context) DeclaredUnknowns() map[string]map[string]bool {
	return s.declaredUnknowns
}

func (s *Context) declaredUnknownPathsOfType(t *checker.Type) map[string]bool {
	found := map[string]bool{}
	visiting := map[*checker.Type]bool{}
	var visit func(cur *checker.Type, path string, depth int)
	visit = func(cur *checker.Type, path string, depth int) {
		if cur == nil {
			return
		}
		if cur.Flags()&(checker.TypeFlagsAny|checker.TypeFlagsUnknown) != 0 {
			if path == "" {
				path = "$"
			}
			found[path] = true
			return
		}
		if depth > maxDeclaredUnknownDepth {
			return
		}
		if cur.Flags()&checker.TypeFlagsUnionOrIntersection != 0 {
			for _, m := range cur.Types() {
				visit(m, path, depth+1)
			}
			return
		}
		if cur.Flags()&checker.TypeFlagsObject == 0 || visiting[cur] {
			return
		}
		visiting[cur] = true
		defer delete(visiting, cur)
		if s.Checker.IsArrayType(cur) || checker.IsTupleType(cur) {
			for _, el := range s.Checker.GetTypeArguments(cur) {
				visit(el, path+"[]", depth+1)
			}
		} else {
			for _, p := range s.Checker.GetPropertiesOfType(cur) {
				visit(s.Checker.GetTypeOfSymbol(p), path+"."+p.Name, depth+1)
			}
			for _, info := range s.Checker.GetIndexInfosOfType(cur) {
				visit(info.ValueType(), path+"[*]", depth+1)
			}
		}
	}
	visit(t, "", 0)
	return found
}

// recordDeclaredUnknowns records, against the schema names a function's input
// or output will be generated under, the places its source says unknown/any.
func (s *Context) recordDeclaredUnknowns(names []string, types []*checker.Type) {
	paths := map[string]bool{}
	for _, t := range types {
		for p := range s.declaredUnknownPathsOfType(t) {
			paths[p] = true
		}
	}
	if s.declaredUnknowns == nil {
		s.declaredUnknowns = map[string]map[string]bool{}
	}
	for _, n := range names {
		existing := s.declaredUnknowns[n]
		if existing == nil {
			existing = map[string]bool{}
			s.declaredUnknowns[n] = existing
		}
		for p := range paths {
			existing[p] = true
		}
	}
}

func (s *Context) declaredOutputType(isListFunc bool, list *listConfigTypes, generics []*checker.Type, handler *ast.Node) *checker.Type {
	switch {
	case isListFunc && list != nil:
		return list.output
	case isListFunc:
		return nil
	case len(generics) >= 2:
		return generics[1]
	}
	if handler == nil {
		return nil
	}
	sig := s.Checker.GetSignatureFromDeclaration(handler)
	if sig == nil {
		return nil
	}
	return s.unwrapPromise(s.Checker.GetReturnTypeOfSignature(sig))
}

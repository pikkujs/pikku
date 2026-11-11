package visit

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// resolveSchemaRef is add-functions.ts resolveSchemaRef: the schema
// variable's declaring file (through an import) and its vendor, or nil after
// logging when the vendor cannot be determined.
func (s *Context) resolveSchemaRef(ident *ast.Node, context string) *state.SchemaRef {
	sym := s.Checker.GetSymbolAtLocation(ident)
	if sym == nil {
		return nil
	}
	decl := symbolDecl(sym)
	if decl == nil {
		return nil
	}
	if ast.IsImportSpecifier(decl) {
		aliased := s.Checker.GetAliasedSymbol(sym)
		if aliased == nil {
			return nil
		}
		if decl = symbolDecl(aliased); decl == nil {
			return nil
		}
	}
	sourceFile := ast.GetSourceFileOfNode(decl).FileName()
	vendor := s.detectSchemaVendorOrError(ident, context, sourceFile)
	if vendor == "" {
		return nil
	}
	return &state.SchemaRef{VariableName: ident.Text(), SourceFile: sourceFile, Vendor: vendor}
}

func symbolDecl(sym *ast.Symbol) *ast.Node {
	if sym.ValueDeclaration != nil {
		return sym.ValueDeclaration
	}
	if len(sym.Declarations) > 0 {
		return sym.Declarations[0]
	}
	return nil
}

var schemaVendorDirs = []struct{ dir, vendor string }{
	{"node_modules/zod", "zod"},
	{"node_modules/valibot", "valibot"},
	{"node_modules/arktype", "arktype"},
	{"node_modules/@effect/schema", "effect"},
}

// detectSchemaVendor ports utils/detect-schema-vendor.ts: trace the type (its
// bases, then its type arguments) back to the library that declares it.
// "" stands for 'unknown'.
func (s *Context) detectSchemaVendor(ident *ast.Node) string {
	t := s.Checker.GetTypeAtLocation(ident)
	if t == nil {
		return ""
	}
	if v := s.schemaTypeOrigin(t); v != "" {
		return v
	}
	if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		for _, arg := range s.Checker.GetTypeArguments(t) {
			if v := s.schemaTypeOrigin(arg); v != "" {
				return v
			}
		}
	}
	return ""
}

func (s *Context) schemaTypeOrigin(t *checker.Type) string {
	sym := t.Symbol()
	if sym == nil && t.Alias() != nil {
		sym = t.Alias().Symbol()
	}
	if sym != nil {
		for _, decl := range sym.Declarations {
			file := ast.GetSourceFileOfNode(decl).FileName()
			for _, v := range schemaVendorDirs {
				if strings.Contains(file, v.dir) {
					return v.vendor
				}
			}
		}
	}
	if t.ObjectFlags()&checker.ObjectFlagsClassOrInterface != 0 {
		for _, base := range s.Checker.GetBaseTypes(t) {
			if v := s.schemaTypeOrigin(base); v != "" {
				return v
			}
		}
	}
	return ""
}

func (s *Context) detectSchemaVendorOrError(ident *ast.Node, context, sourceFile string) string {
	if v := s.detectSchemaVendor(ident); v != "" {
		return v
	}
	if s.Checker.GetTypeAtLocation(ident).Flags()&(checker.TypeFlagsAny|checker.TypeFlagsUnknown) != 0 {
		s.Log.Critical(diag.InlineSchema, context+" schema '"+ident.Text()+"' could not be TYPED from '"+sourceFile+"' — "+
			"TypeScript resolved it to 'any', so its vendor cannot be traced. This is a "+
			"resolution problem, not a schema problem: the file it is imported from is either "+
			"outside your tsconfig 'include', or has not been generated yet (a schema built "+
			"from '.pikku/db/zod.gen.ts' needs 'pikku db generate' to have run first). "+
			"Fix the import so the type resolves, then re-run.")
		return ""
	}
	s.Log.Critical(diag.InlineSchema, context+" schema vendor could not be determined from '"+sourceFile+"'. "+
		"Supported vendors: zod, valibot, arktype, @effect/schema. "+
		"Ensure your schema is imported from a supported validation library.")
	return ""
}

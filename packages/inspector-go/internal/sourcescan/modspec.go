package sourcescan

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
)

// ReadModuleSpecifiers ports utils/read-module-specifiers.ts: the module
// specifiers a file imports from or re-exports from, in statement order.
func ReadModuleSpecifiers(fileName, content string) []string {
	sf := Parse(fileName, content, core.ScriptKindUnknown)
	found := []string{}
	for _, statement := range sf.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) && !ast.IsExportDeclaration(statement) {
			continue
		}
		specifier := statement.ModuleSpecifier()
		if specifier == nil || !ast.IsStringLiteral(specifier) {
			continue
		}
		found = append(found, specifier.Text())
	}
	return found
}

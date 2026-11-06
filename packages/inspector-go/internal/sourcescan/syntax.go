package sourcescan

import (
	"github.com/microsoft/typescript-go/shim/core"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// SyntaxError is one parse diagnostic: the TypeScript error code and where it
// starts (a UTF-16 offset, as ts.Diagnostic.start is).
type SyntaxError struct {
	Code  int `json:"code"`
	Start int `json:"start"`
}

// ReadSyntaxErrors is the syntactic half of ts.transpileModule(content,
// {fileName, reportDiagnostics: true}).diagnostics: the content parsed the way
// fileName's extension says (module.ts when empty), and every diagnostic the
// parser reported.
func ReadSyntaxErrors(fileName, content string) []SyntaxError {
	if fileName == "" {
		fileName = "module.ts"
	}
	sf := Parse(fileName, content, core.ScriptKindUnknown)
	found := []SyntaxError{}
	for _, d := range sf.Diagnostics() {
		found = append(found, SyntaxError{Code: int(d.Code()), Start: tsutil.UTF16Offset(content, d.Pos())})
	}
	return found
}

package visit

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Helpers shared by the channel and CLI groups (add-channel.ts, add-cli.ts).

// makeContextBasedId is extract-function-name.ts makeContextBasedId.
func makeContextBasedId(wiringType string, segments ...string) string {
	return strings.Join(append([]string{wiringType}, segments...), ":")
}

func isTempId(id string) bool { return strings.HasPrefix(id, "__temp_") }

var workflowHelpers = map[string]bool{"workflow": true, "workflowStart": true, "workflowStatus": true, "graphStart": true}

// exportedVariableNameOf is utils/get-exported-variable-name.ts for a call
// expression: the name of the exported `const x = <node>` in the swept file.
func (s *Context) exportedVariableNameOf(node *ast.Node) string {
	sf := s.SourceFile
	if sf == nil || !ast.IsCallExpression(node) {
		return ""
	}
	for _, stmt := range sf.Statements.Nodes {
		if !ast.IsVariableStatement(stmt) || !tsutil.HasExportModifier(stmt) {
			continue
		}
		list := stmt.AsVariableStatement().DeclarationList
		for _, d := range list.AsVariableDeclarationList().Declarations.Nodes {
			if ast.IsIdentifier(d.Name()) && d.Initializer() == node {
				return d.Name().Text()
			}
		}
	}
	return ""
}

// resolveRefContract is utils/resolve-ref-contract.ts against an addon
// contract section (`exportedContracts.addonChannel` / `addonCli`), whose
// values are `{ [contractName]: contract }` objects.
func resolveRefContract(node *ast.Node, helperName string, addonContracts *state.Record[state.Raw]) (state.Raw, bool) {
	if !ast.IsCallExpression(node) || !ast.IsIdentifier(node.Expression()) || node.Expression().Text() != helperName {
		return nil, false
	}
	args := node.Arguments()
	if len(args) == 0 || !ast.IsStringLiteral(args[0]) {
		return nil, false
	}
	text := args[0].Text()
	sep := strings.Index(text, ":")
	if sep == -1 {
		return nil, false
	}
	nsRaw, ok := addonContracts.Get(text[:sep])
	if !ok || len(nsRaw) == 0 {
		return nil, false
	}
	var contracts state.Record[state.Raw]
	if err := nsRaw.Decode(&contracts); err != nil {
		return nil, false
	}
	c, ok := contracts.Get(text[sep+1:])
	if !ok || len(c) == 0 || string(c) == "null" {
		return nil, false
	}
	return c, true
}

// wireMetaDiagnostics emits what getCommonWireMetaData logs before and while
// reading the metadata (the shared Go port reads the values only).
func (s *Context) wireMetaDiagnostics(obj *ast.Node, wiringType, wiringName string) {
	s.assertStringLiteralProperty(obj, "name", wiringType)
	for _, p := range obj.Properties() {
		if !ast.IsPropertyAssignment(p) || !ast.IsIdentifier(p.Name()) {
			continue
		}
		switch p.Name().Text() {
		case "tags":
			if !ast.IsArrayLiteralExpression(p.Initializer()) {
				s.Log.Critical(diag.InvalidTagsType, fmt.Sprintf("%s '%s' has invalid 'tags' property - must be an array of strings.", wiringType, wiringName))
			}
		case "errors":
			if !ast.IsArrayLiteralExpression(p.Initializer()) {
				s.Log.Critical(diag.InvalidTagsType, fmt.Sprintf("%s '%s' has invalid 'errors' property - must be an array of error identifiers.", wiringType, wiringName))
			}
		}
	}
}

// commonWireMeta is getCommonWireMetaData(obj, wiringType, wiringName, logger, checker).
func (s *Context) commonWireMeta(obj *ast.Node, wiringType, wiringName string) commonMeta {
	s.wireMetaDiagnostics(obj, wiringType, wiringName)
	return s.getCommonWireMetaData(obj)
}

// wireNames is post-process.ts extractWireNames.
func (s *Context) addUsedMiddleware(list []WireRef) {
	for _, w := range list {
		if w.Type == "wire" {
			s.State.ServiceAggregation.UsedMiddleware.Add(w.Name)
		}
	}
}

// lineAndCharacter is `sourceFile.getLineAndCharacterOfPosition(node.getStart())`,
// both zero-based and in UTF-16 code units like TS.
func lineAndCharacter(n *ast.Node) (line, char int) {
	sf := ast.GetSourceFileOfNode(n)
	text := sf.Text()
	pos := tsutil.NodeStart(n)
	if pos > len(text) {
		pos = len(text)
	}
	lineStart := 0
	for i := 0; i < pos; {
		r, size := utf8.DecodeRuneInString(text[i:])
		switch r {
		case '\r':
			if i+1 < len(text) && text[i+1] == '\n' {
				size = 2
			}
			fallthrough
		case '\n', ' ', ' ':
			line++
			lineStart = i + size
		}
		i += size
	}
	return line, tsutil.UTF16Offset(text[lineStart:], pos-lineStart)
}

// rawObject decodes a Raw JSON object into an ordered record.
func rawObject(r state.Raw) (*state.Record[state.Raw], bool) {
	if len(r) == 0 || r[0] != '{' {
		return nil, false
	}
	rec := state.NewRecord[state.Raw]()
	if err := r.Decode(rec); err != nil {
		return nil, false
	}
	return rec, true
}

// rewriteFuncIdRaw replaces the object's pikkuFuncId when it is oldId.
func rewriteFuncIdRaw(r state.Raw, oldId, newId string) state.Raw {
	rec, ok := rawObject(r)
	if !ok {
		return r
	}
	if id, ok := rec.Get("pikkuFuncId"); ok && string(id) == string(state.RawOf(oldId)) {
		rec.Set("pikkuFuncId", state.RawOf(newId))
		return state.RawOf(rec)
	}
	return r
}

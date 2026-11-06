package sourcescan

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// PropertyLocation is where one property of a pikku call's config object sits;
// every offset is a UTF-16 offset into the content, as the TypeScript caller
// slices it.
type PropertyLocation struct {
	Name       string `json:"name"`
	ValueStart int    `json:"valueStart"`
	ValueEnd   int    `json:"valueEnd"`
	PropStart  int    `json:"propStart"`
	PropEnd    int    `json:"propEnd"`
}

// ValueRange is the span of a property's value.
type ValueRange struct {
	ValueStart int `json:"valueStart"`
	ValueEnd   int `json:"valueEnd"`
}

// PikkuCall is the located `export const x = pikkuFunc({...})` call; Found is
// false when the name is not declared with a pikku call.
type PikkuCall struct {
	Found        bool               `json:"found"`
	WrapperName  string             `json:"wrapperName,omitempty"`
	ObjectEnd    int                `json:"objectEnd,omitempty"`
	Properties   []PropertyLocation `json:"properties"`
	FuncProperty *ValueRange        `json:"funcProperty"`
}

func parseTS(content string) *ast.SourceFile {
	return Parse("temp.ts", content, core.ScriptKindTS)
}

// FindPikkuCall ports CodeEditService.findPikkuCall and extractCallInfo.
func FindPikkuCall(content, exportedName string) PikkuCall {
	sf := parseTS(content)
	u16 := func(byteOff int) int { return tsutil.UTF16Offset(content, byteOff) }
	result := PikkuCall{Properties: []PropertyLocation{}}
	var done bool

	extract := func(n *ast.Node) {
		if !ast.IsCallExpression(n) || !ast.IsIdentifier(n.Expression()) {
			return
		}
		wrapper := n.Expression().Text()
		if !strings.HasPrefix(wrapper, "pikku") {
			return
		}
		args := n.AsCallExpression().Arguments.Nodes
		if len(args) == 0 || !ast.IsObjectLiteralExpression(args[0]) {
			return
		}
		object := args[0]
		call := PikkuCall{
			Found:       true,
			WrapperName: wrapper,
			ObjectEnd:   u16(object.End()),
			Properties:  []PropertyLocation{},
		}
		for _, prop := range object.AsObjectLiteralExpression().Properties.Nodes {
			if !ast.IsPropertyAssignment(prop) || !ast.IsIdentifier(prop.Name()) {
				continue
			}
			init := prop.Initializer()
			loc := PropertyLocation{
				Name:       prop.Name().Text(),
				ValueStart: u16(start(init, sf)),
				ValueEnd:   u16(init.End()),
				PropStart:  u16(start(prop, sf)),
				PropEnd:    u16(prop.End()),
			}
			if loc.Name == "func" {
				call.FuncProperty = &ValueRange{ValueStart: loc.ValueStart, ValueEnd: loc.ValueEnd}
			}
			call.Properties = append(call.Properties, loc)
		}
		result = call
		done = true
	}

	var visit func(n *ast.Node)
	visit = func(n *ast.Node) {
		if done {
			return
		}
		if ast.IsVariableStatement(n) {
			for _, decl := range n.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				if ast.IsIdentifier(decl.Name()) && decl.Name().Text() == exportedName && decl.Initializer() != nil {
					extract(decl.Initializer())
					return
				}
			}
		} else if ast.IsVariableDeclaration(n) && ast.IsIdentifier(n.Name()) &&
			n.Name().Text() == exportedName && n.Initializer() != nil {
			extract(n.Initializer())
			return
		}
		forEachChild(n, visit)
	}
	forEachChild(sf.AsNode(), visit)
	return result
}

// ImportClauseInfo is one import declaration as ensureImports reads it.
type ImportClauseInfo struct {
	Module   string   `json:"module"`
	Names    []string `json:"names"`
	InsertAt *int     `json:"insertAt"`
	End      int      `json:"end"`
}

// ImportsInfo is every import declaration in source order, with the offset the
// last of them ends at.
type ImportsInfo struct {
	LastImportEnd int                `json:"lastImportEnd"`
	Imports       []ImportClauseInfo `json:"imports"`
}

// ReadImports ports the scan at the top of CodeEditService.ensureImports.
func ReadImports(content string) ImportsInfo {
	sf := parseTS(content)
	u16 := func(byteOff int) int { return tsutil.UTF16Offset(content, byteOff) }
	info := ImportsInfo{Imports: []ImportClauseInfo{}}
	for _, statement := range sf.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		if end := u16(statement.End()); end > info.LastImportEnd {
			info.LastImportEnd = end
		}
		decl := statement.AsImportDeclaration()
		if !ast.IsStringLiteral(decl.ModuleSpecifier) {
			continue
		}
		entry := ImportClauseInfo{
			Module: decl.ModuleSpecifier.Text(),
			Names:  []string{},
			End:    u16(statement.End()),
		}
		if decl.ImportClause != nil {
			if bindings := decl.ImportClause.AsImportClause().NamedBindings; bindings != nil && ast.IsNamedImports(bindings) {
				elements := bindings.AsNamedImports().Elements.Nodes
				for _, el := range elements {
					entry.Names = append(entry.Names, el.Name().Text())
				}
				var at int
				if len(elements) > 0 {
					at = u16(elements[len(elements)-1].End())
				} else {
					at = u16(bindings.End()) - 1
				}
				entry.InsertAt = &at
			}
		}
		info.Imports = append(info.Imports, entry)
	}
	return info
}

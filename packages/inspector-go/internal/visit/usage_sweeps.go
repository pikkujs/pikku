package visit

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// SweepUsage is the per-file pass inspector.ts runs before visitSetup:
// utils/extract-secret-usage.ts into secrets.usage and
// utils/extract-surface-usage.ts into surfaceUsage.
func (s *Context) SweepUsage(files []*ast.SourceFile) {
	areaCache := map[string]*string{}
	for _, sf := range files {
		if u := ExtractSecretUsage(sf); len(u.Keys) > 0 || len(u.Dynamic) > 0 {
			s.State.Secrets.Usage.Set(sf.FileName(), u)
		}
		rel, _ := filepath.Rel(s.RootDir, sf.FileName())
		accumulateSurfaceUsage(sf, surfaceUsageArea(sf.FileName(), s.RootDir, areaCache), rel, &s.State.SurfaceUsage)
	}
}

var (
	secretSingleKeyMethods = map[string]bool{"getSecret": true, "hasSecret": true}
	secretKeyListMethods   = map[string]bool{"getSecrets": true}
)

func secretLiteralKey(n *ast.Node) (string, bool) {
	if n != nil && (ast.IsStringLiteral(n) || ast.IsNoSubstitutionTemplateLiteral(n)) {
		return n.Text(), true
	}
	return "", false
}

// ExtractSecretUsage is extract-secret-usage.ts extractSecretUsage.
func ExtractSecretUsage(sf *ast.SourceFile) *state.SecretUsage {
	keys := map[string]bool{}
	dynamic := map[string]bool{}
	record := func(call, arg *ast.Node) {
		line := scanner.GetECMALineOfPosition(sf, tsutil.NodeStart(call))
		target := call
		if arg != nil {
			target = arg
		}
		dynamic[strconv.Itoa(line+1)+":"+tsutil.NodeText(target)] = true
	}
	tsutil.WalkSelf(sf.AsNode(), func(n *ast.Node) {
		if !ast.IsCallExpression(n) || !ast.IsPropertyAccessExpression(n.Expression()) {
			return
		}
		method := n.Expression().Name().Text()
		var first *ast.Node
		if args := n.Arguments(); len(args) > 0 {
			first = args[0]
		}
		switch {
		case secretSingleKeyMethods[method]:
			if first == nil {
				record(n, nil)
			} else if key, ok := secretLiteralKey(first); ok {
				keys[key] = true
			} else {
				record(n, first)
			}
		case secretKeyListMethods[method]:
			if first != nil && ast.IsArrayLiteralExpression(first) {
				for _, el := range first.Elements() {
					if key, ok := secretLiteralKey(el); ok {
						keys[key] = true
					} else {
						record(n, el)
					}
				}
			} else {
				record(n, first)
			}
		}
	})
	return &state.SecretUsage{Keys: jsSortedKeys(keys), Dynamic: jsSortedKeys(dynamic)}
}

// jsSortedKeys sorts like Array.prototype.sort's default comparison (UTF-16
// code units).
func jsSortedKeys(m map[string]bool) state.Strings {
	out := make(state.Strings, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return compareUTF16(out[i], out[j]) < 0 })
	return out
}

func compareUTF16(a, b string) int {
	ua, ub := utf16Units(a), utf16Units(b)
	for i := 0; i < len(ua) && i < len(ub); i++ {
		if ua[i] != ub[i] {
			return int(ua[i]) - int(ub[i])
		}
	}
	return len(ua) - len(ub)
}

func utf16Units(s string) []uint16 {
	out := make([]uint16, 0, len(s))
	for _, r := range s {
		if r >= 0x10000 {
			r -= 0x10000
			out = append(out, uint16(0xD800+(r>>10)), uint16(0xDC00+(r&0x3FF)))
		} else {
			out = append(out, uint16(r))
		}
	}
	return out
}

// leafSpecifierOf maps a `#pikku/*` specifier to the leaf it counts against.
func leafSpecifierOf(specifier string) (string, bool) {
	rest, ok := strings.CutPrefix(specifier, "#pikku/")
	if !ok {
		return "", false
	}
	leaf, _, _ := strings.Cut(rest, "/")
	if leaf == "" || strings.HasSuffix(leaf, ".js") {
		return "", false
	}
	return "#pikku/" + leaf, true
}

func packageNameAt(dir string, cache map[string]*string) *string {
	if name, ok := cache[dir]; ok {
		return name
	}
	var name *string
	if b, err := os.ReadFile(filepath.Join(dir, "package.json")); err == nil {
		var pkg struct {
			Name *string `json:"name"`
		}
		if json.Unmarshal(b, &pkg) == nil && pkg.Name != nil && *pkg.Name != "" {
			name = pkg.Name
		}
	}
	cache[dir] = name
	return name
}

// surfaceUsageArea is extract-surface-usage.ts surfaceUsageArea: the
// workspace package a file belongs to (the root package excluded), else its
// top-level source directory.
func surfaceUsageArea(fileName, rootDir string, cache map[string]*string) string {
	dir := filepath.Dir(fileName)
	for strings.HasPrefix(dir, rootDir) && dir != rootDir {
		if name := packageNameAt(dir, cache); name != nil {
			return *name
		}
		dir = filepath.Dir(dir)
	}
	rel, _ := filepath.Rel(rootDir, fileName)
	segment, _, _ := strings.Cut(rel, string(filepath.Separator))
	if segment != "" && segment != filepath.Base(fileName) {
		return segment
	}
	return filepath.Base(rootDir)
}

func bindingNames(clause *ast.Node) []string {
	if clause == nil || (!ast.IsNamedImports(clause) && !ast.IsNamedExports(clause)) {
		return nil
	}
	var out []string
	for _, el := range clause.Elements() {
		n := el.PropertyName()
		if n == nil {
			n = el.Name()
		}
		out = append(out, n.Text())
	}
	return out
}

// accumulateSurfaceUsage is extract-surface-usage.ts accumulateSurfaceUsage.
func accumulateSurfaceUsage(sf *ast.SourceFile, area, file string, into *state.Record[*state.Record[*state.SurfaceUsage]]) {
	for _, stmt := range sf.Statements.Nodes {
		var specifier *ast.Node
		var names []string
		switch {
		case ast.IsImportDeclaration(stmt):
			specifier = stmt.ModuleSpecifier()
			if ic := stmt.ImportClause(); ic != nil {
				names = bindingNames(ic.AsImportClause().NamedBindings)
			}
		case ast.IsExportDeclaration(stmt) && stmt.ModuleSpecifier() != nil:
			specifier = stmt.ModuleSpecifier()
			names = bindingNames(stmt.AsExportDeclaration().ExportClause)
		}
		if specifier == nil || len(names) == 0 || !ast.IsStringLiteral(specifier) {
			continue
		}
		leaf, ok := leafSpecifierOf(specifier.Text())
		if !ok {
			continue
		}
		symbols, ok := into.Get(leaf)
		if !ok {
			symbols = state.NewRecord[*state.SurfaceUsage]()
			into.Set(leaf, symbols)
		}
		for _, name := range names {
			usage, ok := symbols.Get(name)
			if !ok {
				usage = &state.SurfaceUsage{SeenIn: state.Strings{}, Files: state.Strings{}}
				symbols.Set(name, usage)
			}
			usage.Imports++
			if !slices.Contains(usage.SeenIn, area) {
				usage.SeenIn = append(usage.SeenIn, area)
			}
			if !slices.Contains(usage.Files, file) {
				usage.Files = append(usage.Files, file)
			}
		}
	}
}

// Package surface ports @pikku/inspector's surface/collect-surface.ts: the
// public symbols a package (or an application's `#pikku/*` leaves) exports,
// with their kind, documentation, signature and option keys.
package surface

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/sourcescan"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

type Member struct {
	Line string `json:"line"`
	Doc  string `json:"doc,omitempty"`
}

type Symbol struct {
	Name             string   `json:"name"`
	Kind             string   `json:"kind"`
	DeclaredAt       string   `json:"declaredAt"`
	DeclaredIn       *string  `json:"declaredIn"`
	Deprecated       bool     `json:"deprecated"`
	DeprecatedReason string   `json:"deprecatedReason,omitempty"`
	Summary          string   `json:"summary,omitempty"`
	Docs             string   `json:"docs,omitempty"`
	Signature        string   `json:"signature,omitempty"`
	Members          []Member `json:"members,omitempty"`
	Examples         []string `json:"examples,omitempty"`
	Status           *float64 `json:"status,omitempty"`
}

type Entrypoint struct {
	Subpath   string   `json:"subpath"`
	Specifier string   `json:"specifier"`
	EntryFile string   `json:"entryFile"`
	Symbols   []Symbol `json:"symbols"`
}

// Snippet is one entry of the snippets Map, in its insertion order.
type Snippet struct {
	Name string
	Code string
}

type Options struct {
	ImportsSubpath string
	// Subpaths restricts collection when non-nil.
	Subpaths []string
	// Snippets is nil when no map was given.
	Snippets []Snippet
}

// UnknownSnippetError is collect-surface.ts's UnknownSnippetError.
type UnknownSnippetError struct{ Message string }

func (e *UnknownSnippetError) Error() string { return e.Message }

var sourceExtensions = []string{".ts", ".tsx", ".mts", ".cts"}

var moduleExtensions = append(append([]string{}, sourceExtensions...), ".js", ".jsx", ".mjs", ".cjs")

var declarationExt = regexp.MustCompile(`\.d\.(ts|mts|cts)$`)

func exists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func wildcardStem(fileName string) (string, bool) {
	if strings.HasSuffix(fileName, ".map") || declarationExt.MatchString(fileName) {
		return "", false
	}
	for _, ext := range moduleExtensions {
		if strings.HasSuffix(fileName, ext) {
			return fileName[:len(fileName)-len(ext)], true
		}
	}
	return "", false
}

type subpathEntry struct {
	key   string
	value any
}

func subpathMap(exports any) []subpathEntry {
	if s, ok := exports.(string); ok {
		return []subpathEntry{{".", s}}
	}
	if o, ok := exports.(*object); ok {
		for _, k := range o.keys {
			if strings.HasPrefix(k, ".") {
				out := make([]subpathEntry, 0, len(o.keys))
				for _, k := range o.keys {
					out = append(out, subpathEntry{k, o.values[k]})
				}
				return out
			}
		}
	}
	return []subpathEntry{{".", exports}}
}

var nonCodeTarget = regexp.MustCompile(`\.(css|scss|json|svg|png|woff2?|txt|md)$`)

func publishesCode(target string) bool { return !nonCodeTarget.MatchString(target) }

// join is path.join for the relative, '/'-separated paths it is given here.
func join(parts ...string) string { return filepath.ToSlash(filepath.Join(parts...)) }

var (
	dotSlash      = regexp.MustCompile(`^\./`)
	compiledExt   = regexp.MustCompile(`\.(js|jsx|mjs|cjs)$`)
	emittedDeclTS = regexp.MustCompile(`\.d\.([cm]?ts)$`)
)

func sourceForTarget(packageDir, target, outDir string) (string, bool) {
	withoutPrefix := dotSlash.ReplaceAllString(target, "")
	isDeclaration := declarationExt.MatchString(withoutPrefix)
	if !isDeclaration {
		for _, ext := range sourceExtensions {
			if strings.HasSuffix(withoutPrefix, ext) {
				return withoutPrefix, exists(join(packageDir, withoutPrefix))
			}
		}
	}
	stripped := withoutPrefix
	if strings.HasPrefix(withoutPrefix, outDir+"/") {
		stripped = withoutPrefix[len(outDir)+1:]
	}
	base := compiledExt.ReplaceAllString(declarationExt.ReplaceAllString(stripped, ""), "")
	withoutSrc := strings.TrimPrefix(base, "src/")
	for _, ext := range sourceExtensions {
		for _, candidate := range []string{
			join("src", base+ext),
			base + ext,
			join("src", withoutSrc+ext),
			join("src", base, "index"+ext),
			join(base, "index"+ext),
		} {
			if exists(join(packageDir, candidate)) {
				return candidate, true
			}
		}
	}
	return "", false
}

type declaredSubpath struct{ subpath, target string }

func expandWildcard(packageDir, subpath, target, outDir string) []declaredSubpath {
	targetDir := strings.SplitN(dotSlash.ReplaceAllString(target, ""), "*", 2)[0]
	suffix := target[strings.Index(target, "*")+1:]
	suffixStem := suffix
	if stem, ok := wildcardStem(suffix); ok {
		suffixStem = stem
	}
	scanDir := targetDir
	if !exists(join(packageDir, targetDir)) && strings.HasPrefix(targetDir, outDir+"/") {
		scanDir = targetDir[len(outDir)+1:]
	}
	absolute := join(packageDir, scanDir)
	if !exists(absolute) {
		return nil
	}
	var expanded []declaredSubpath
	var walk func(dir, prefix string)
	walk = func(dir, prefix string) {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return
		}
		for _, entry := range entries {
			if entry.IsDir() {
				walk(join(dir, entry.Name()), prefix+entry.Name()+"/")
				continue
			}
			if !entry.Type().IsRegular() {
				continue
			}
			stem, ok := wildcardStem(entry.Name())
			if !ok {
				continue
			}
			relativePath := prefix + entry.Name()
			pathStem := prefix + stem
			if suffixStem != "" && !strings.HasSuffix(pathStem, suffixStem) {
				continue
			}
			captured := pathStem
			if suffixStem != "" {
				captured = pathStem[:len(pathStem)-len(suffixStem)]
			}
			if captured == "" {
				continue
			}
			expanded = append(expanded, declaredSubpath{
				subpath: strings.Replace(subpath, "*", captured, 1),
				target:  scanDir + relativePath,
			})
		}
	}
	walk(absolute, "")
	return expanded
}

func targetOf(value any) (string, bool) {
	switch v := value.(type) {
	case string:
		return v, v != ""
	case []any:
		for _, candidate := range v {
			if t, ok := targetOf(candidate); ok {
				return t, true
			}
		}
		return "", false
	case *object:
		for _, key := range []string{"types", "import", "default", "require"} {
			if c, ok := v.get(key); ok {
				if t, ok := targetOf(c); ok {
					return t, true
				}
			}
		}
	}
	return "", false
}

func newHost() compiler.CompilerHost {
	cwd, _ := os.Getwd()
	return compiler.NewCompilerHost(cwd, bundled.WrapFS(osvfs.FS()), bundled.LibPath(), nil, nil)
}

func readCompilerOptions(packageDir string, host compiler.CompilerHost) (string, *core.CompilerOptions) {
	configPath := join(packageDir, "tsconfig.json")
	if !exists(configPath) {
		return "dist", nil
	}
	parsed, _ := tsoptions.GetParsedCommandLineOfConfigFile(tspath.NormalizePath(configPath), &core.CompilerOptions{}, nil, host, nil)
	if parsed == nil {
		return "dist", nil
	}
	opts := parsed.CompilerOptions()
	outDir := "dist"
	if opts.OutDir != "" {
		if rel, err := filepath.Rel(packageDir, opts.OutDir); err == nil {
			outDir = filepath.ToSlash(rel)
		}
	}
	return outDir, opts
}

// Collect is collectSurface.
func Collect(packageDir string, options Options) ([]Entrypoint, error) {
	root, err := filepath.Abs(packageDir)
	if err != nil {
		return nil, err
	}
	root = filepath.Clean(root)
	data, err := os.ReadFile(join(root, "package.json"))
	if err != nil {
		return []Entrypoint{}, nil
	}
	parsedJSON, err := decodeOrdered(data)
	if err != nil {
		return []Entrypoint{}, nil
	}
	pkg, _ := parsedJSON.(*object)
	if pkg == nil {
		return []Entrypoint{}, nil
	}

	var declaredMap []subpathEntry
	if options.ImportsSubpath != "" {
		if imports, ok := pkg.values["imports"].(*object); ok {
			if v, ok := imports.get(options.ImportsSubpath); ok {
				declaredMap = []subpathEntry{{options.ImportsSubpath, v}}
			}
		}
	} else if exports, ok := pkg.get("exports"); ok && truthy(exports) {
		declaredMap = subpathMap(exports)
	}
	if len(declaredMap) == 0 {
		return []Entrypoint{}, nil
	}

	host := newHost()
	outDir, tsOpts := readCompilerOptions(root, host)
	packageName, _ := pkg.values["name"].(string)

	var entries []Entrypoint
	seenEntryFiles := map[string]bool{}
	for _, decl := range declaredMap {
		if options.ImportsSubpath == "" && !strings.HasPrefix(decl.key, ".") {
			continue
		}
		target, ok := targetOf(decl.value)
		if !ok || !publishesCode(target) {
			continue
		}
		var declared []declaredSubpath
		if strings.Contains(target, "*") {
			declared = expandWildcard(root, decl.key, target, outDir)
		} else {
			declared = []declaredSubpath{{decl.key, target}}
		}
		for _, each := range declared {
			if options.Subpaths != nil && !contains(options.Subpaths, each.subpath) {
				continue
			}
			entryFile, ok := sourceForTarget(root, each.target, outDir)
			if !ok || seenEntryFiles[entryFile] {
				continue
			}
			seenEntryFiles[entryFile] = true
			specifier := each.subpath
			if options.ImportsSubpath == "" {
				if each.subpath == "." {
					specifier = packageName
				} else {
					specifier = packageName + each.subpath[1:]
				}
			}
			entries = append(entries, Entrypoint{Subpath: each.subpath, Specifier: specifier, EntryFile: entryFile})
		}
	}
	if len(entries) == 0 {
		return []Entrypoint{}, nil
	}

	roots := make([]string, len(entries))
	for i, e := range entries {
		roots[i] = tspath.NormalizePath(join(root, e.EntryFile))
	}
	compilerOpts := &core.CompilerOptions{
		Target:              core.ScriptTargetESNext,
		Module:              core.ModuleKindNode16,
		ModuleResolution:    core.ModuleResolutionKindNode16,
		SkipLibCheck:        core.TSTrue,
		SkipDefaultLibCheck: core.TSTrue,
		Types:               []string{},
		AllowJs:             core.TSFalse,
		CheckJs:             core.TSFalse,
	}
	if tsOpts != nil {
		compilerOpts.BaseUrl = tsOpts.BaseUrl
		compilerOpts.Paths = tsOpts.Paths
		compilerOpts.PathsBasePath = tsOpts.PathsBasePath
	}
	cwd, _ := os.Getwd()
	parsed := tsoptions.NewParsedCommandLine(compilerOpts, roots, tspath.ComparePathsOptions{
		UseCaseSensitiveFileNames: host.FS().UseCaseSensitiveFileNames(),
		CurrentDirectory:          cwd,
	})
	prog := compiler.NewProgram(compiler.ProgramOptions{Config: parsed, Host: host})
	prog.BindSourceFiles()
	c, release := prog.GetTypeChecker(context.Background())
	defer release()

	s := &session{c: c, prog: prog, root: root, snippets: options.Snippets}
	statuses := collectErrorStatuses(prog)

	for i := range entries {
		entries[i].Symbols = []Symbol{}
		sf := prog.GetSourceFile(roots[i])
		if sf == nil || sf.Symbol == nil {
			continue
		}
		moduleSymbol := c.GetMergedSymbol(sf.Symbol)
		for _, sym := range s.orderedExports(moduleSymbol) {
			out, err := s.symbol(sym, entries[i].EntryFile)
			if err != nil {
				return nil, err
			}
			if status, ok := statuses[out.Name]; ok {
				st := status
				out.Status = &st
			}
			entries[i].Symbols = append(entries[i].Symbols, out)
		}
	}
	return entries, nil
}

func truthy(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case string:
		return t != ""
	case bool:
		return t
	}
	return true
}

func contains(list []string, s string) bool {
	for _, each := range list {
		if each == s {
			return true
		}
	}
	return false
}

type session struct {
	c        *checker.Checker
	prog     *compiler.Program
	root     string
	snippets []Snippet
}

// orderedExports is checker.getExportsOfModule in Strada's order: a module's
// own exports in declaration order, then what each `export *` adds, in the
// order of the statements. typescript-go keeps symbol tables in Go maps.
func (s *session) orderedExports(moduleSymbol *ast.Symbol) []*ast.Symbol {
	exports := s.c.GetExportsOfModule(moduleSymbol)
	order := map[string]int{}
	for i, name := range s.exportOrder(moduleSymbol, map[*ast.Symbol]bool{}) {
		if _, seen := order[name]; !seen {
			order[name] = i
		}
	}
	rank := func(sym *ast.Symbol) int {
		if i, ok := order[sym.Name]; ok {
			return i
		}
		return math.MaxInt
	}
	sort.SliceStable(exports, func(i, j int) bool {
		ri, rj := rank(exports[i]), rank(exports[j])
		if ri != rj {
			return ri < rj
		}
		return exports[i].Name < exports[j].Name
	})
	return exports
}

func (s *session) exportOrder(mod *ast.Symbol, visited map[*ast.Symbol]bool) []string {
	if mod == nil || mod.Exports == nil || visited[mod] {
		return nil
	}
	visited[mod] = true
	// Strada's binder binds a statement list's function declarations before
	// its other statements (bindEachFunctionsFirst), so they enter the symbol
	// table first.
	type positioned struct {
		name    string
		file    string
		hoisted bool
		pos     int
	}
	var own []positioned
	for name, sym := range mod.Exports {
		if isReserved(name) {
			continue
		}
		p := positioned{name: name, pos: math.MaxInt}
		if len(sym.Declarations) > 0 {
			d := sym.Declarations[0]
			if sf := ast.GetSourceFileOfNode(d); sf != nil {
				p.file = sf.FileName()
			}
			p.pos = d.Pos()
			for _, decl := range sym.Declarations {
				if decl.Kind == ast.KindFunctionDeclaration {
					p.hoisted = true
					p.pos = decl.Pos()
					break
				}
			}
		}
		own = append(own, p)
	}
	sort.Slice(own, func(i, j int) bool {
		if own[i].file != own[j].file {
			return own[i].file < own[j].file
		}
		if own[i].hoisted != own[j].hoisted {
			return own[i].hoisted
		}
		if own[i].pos != own[j].pos {
			return own[i].pos < own[j].pos
		}
		return own[i].name < own[j].name
	})
	names := make([]string, 0, len(own))
	present := map[string]bool{}
	for _, p := range own {
		names = append(names, p.name)
		present[p.name] = true
	}
	if stars := mod.Exports[ast.InternalSymbolNameExportStar]; stars != nil {
		var nested []string
		nestedSeen := map[string]bool{}
		for _, decl := range stars.Declarations {
			spec := decl.ModuleSpecifier()
			if spec == nil {
				continue
			}
			target := s.c.ResolveExternalModuleName(spec)
			for _, name := range s.exportOrder(target, visited) {
				if name == "default" || nestedSeen[name] {
					continue
				}
				nestedSeen[name] = true
				nested = append(nested, name)
			}
		}
		for _, name := range nested {
			if !present[name] {
				present[name] = true
				names = append(names, name)
			}
		}
	}
	return names
}

func isReserved(name string) bool {
	return len(name) >= 2 && name[0] == '\xFE' && name[1] != '@' && name[1] != '#'
}

var kindByFlag = []struct {
	flag ast.SymbolFlags
	kind string
}{
	{ast.SymbolFlagsClass, "class"},
	{ast.SymbolFlagsInterface, "interface"},
	{ast.SymbolFlagsRegularEnum | ast.SymbolFlagsConstEnum, "enum"},
	{ast.SymbolFlagsFunction, "function"},
	{ast.SymbolFlagsTypeAlias, "type"},
	{ast.SymbolFlagsNamespace, "namespace"},
}

func (s *session) aliasTarget(sym *ast.Symbol) *ast.Symbol {
	if sym.Flags&ast.SymbolFlagsAlias != 0 {
		return s.c.GetAliasedSymbol(sym)
	}
	return sym
}

func (s *session) kindOf(sym *ast.Symbol) string {
	target := s.aliasTarget(sym)
	for _, each := range kindByFlag {
		if target.Flags&each.flag != 0 {
			return each.kind
		}
	}
	if target.Flags&ast.SymbolFlagsVariable != 0 && len(target.Declarations) > 0 {
		t := s.c.GetTypeOfSymbolAtLocation(target, target.Declarations[0])
		if len(s.c.GetSignaturesOfType(t, checker.SignatureKindCall)) > 0 {
			return "function"
		}
	}
	return "const"
}

func (s *session) jsDocTagsOf(sym *ast.Symbol) []tagInfo {
	if own := jsDocTagsOfSymbol(sym, s.c); len(own) > 0 {
		return own
	}
	return jsDocTagsOfSymbol(s.aliasTarget(sym), s.c)
}

var snippetReference = regexp.MustCompile(`^snippet:[` + sourcescan.JSWhitespace + `]*([^` + sourcescan.JSWhitespace + `]+)$`)

func (s *session) examplesOf(tags []tagInfo, symbolName string) ([]string, error) {
	var out []string
	for _, tag := range tags {
		if tag.name != "example" {
			continue
		}
		text := sourcescan.JSTrim(tag.text)
		if text == "" {
			continue
		}
		m := snippetReference.FindStringSubmatch(text)
		if m == nil || s.snippets == nil {
			out = append(out, text)
			continue
		}
		found := false
		for _, snippet := range s.snippets {
			if snippet.Name == m[1] {
				out = append(out, snippet.Code)
				found = true
				break
			}
		}
		if !found {
			known := make([]string, len(s.snippets))
			for i, snippet := range s.snippets {
				known[i] = snippet.Name
			}
			return nil, &UnknownSnippetError{Message: fmt.Sprintf(
				`The example on %s names the snippet "%s", which no template declares. Wrap the code you want shown in "// @snippet start %s" / "// @snippet end %s". Declared: %s.`,
				symbolName, m[1], m[1], m[1], strings.Join(known, ", "))}
		}
	}
	return out, nil
}

func (s *session) documentationOf(sym *ast.Symbol) string {
	targets := []*ast.Symbol{sym}
	if sym.Flags&ast.SymbolFlagsAlias != 0 {
		targets = append(targets, s.c.GetAliasedSymbol(sym))
	}
	for _, target := range targets {
		if doc := sourcescan.JSTrim(documentationComment(target, s.c, nil)); doc != "" {
			return doc
		}
	}
	return exportDeclarationDocumentationOf(sym)
}

func exportDeclarationDocumentationOf(sym *ast.Symbol) string {
	for _, decl := range sym.Declarations {
		if decl.Kind != ast.KindExportSpecifier || decl.Parent == nil || decl.Parent.Parent == nil {
			continue
		}
		comments := jsDocCommentsAndTags(decl.Parent.Parent)
		if len(comments) == 0 || comments[0].Kind != ast.KindJSDoc {
			continue
		}
		text, ok := textOfJSDocComment(comments[0].AsJSDoc().Comment)
		if !ok {
			continue
		}
		if doc := sourcescan.JSTrim(text); doc != "" {
			return doc
		}
	}
	return ""
}

var (
	paragraphBreak = regexp.MustCompile(`\n[` + sourcescan.JSWhitespace + `]*\n`)
	whitespaceRun  = regexp.MustCompile(`[` + sourcescan.JSWhitespace + `]+`)
)

func collapseWhitespace(s string) string { return whitespaceRun.ReplaceAllString(s, " ") }

func summaryOf(doc string) string {
	if doc == "" {
		return ""
	}
	first := paragraphBreak.Split(doc, 2)[0]
	return sourcescan.JSTrim(collapseWhitespace(first))
}

func firstDecl(sym *ast.Symbol) *ast.Node {
	if sym != nil && len(sym.Declarations) > 0 {
		return sym.Declarations[0]
	}
	return nil
}

func (s *session) declarationFileOf(sym *ast.Symbol) *string {
	decl := firstDecl(s.aliasTarget(sym))
	if decl == nil {
		decl = firstDecl(sym)
	}
	if decl == nil {
		return nil
	}
	sf := ast.GetSourceFileOfNode(decl)
	if sf == nil {
		return nil
	}
	name := sf.FileName()
	return &name
}

func (s *session) typeOfSymbol(sym *ast.Symbol, kind string) *checker.Type {
	if kind == "interface" || kind == "type" {
		return s.c.GetDeclaredTypeOfSymbol(sym)
	}
	if decl := firstDecl(sym); decl != nil {
		return s.c.GetTypeOfSymbolAtLocation(sym, decl)
	}
	return nil
}

func (s *session) symbol(sym *ast.Symbol, entryFile string) (Symbol, error) {
	file := s.declarationFileOf(sym)
	kind := s.kindOf(sym)
	docs := s.documentationOf(sym)
	tags := s.jsDocTagsOf(sym)
	name := tsutil.SymbolName(sym)
	target := s.aliasTarget(sym)
	t := s.typeOfSymbol(target, kind)
	location := firstDecl(target)
	examples, err := s.examplesOf(tags, name)
	if err != nil {
		return Symbol{}, err
	}
	var members []Member
	if t != nil {
		members = s.membersOf(t, kind)
	}
	declaredAt := entryFile
	if file != nil {
		if rel, err := filepath.Rel(s.root, *file); err == nil {
			declaredAt = filepath.ToSlash(rel)
		}
	}
	out := Symbol{
		Name:       name,
		Kind:       kind,
		DeclaredAt: declaredAt,
		DeclaredIn: file,
		Summary:    summaryOf(docs),
		Docs:       docs,
		Members:    members,
		Examples:   examples,
	}
	for _, tag := range tags {
		if tag.name == "deprecated" {
			out.Deprecated = true
			out.DeprecatedReason = sourcescan.JSTrim(tag.text)
			break
		}
	}
	if t != nil {
		out.Signature = s.signatureOf(name, t, kind, location)
	}
	return out, nil
}

// collectErrorStatuses reads `addError(Name, { status })` and
// `addErrors([[Name, { status }], ...])` registrations, from sources and from
// the emitted .js beside a declaration file that mentions PikkuError.
func collectErrorStatuses(prog *compiler.Program) map[string]float64 {
	statuses := map[string]float64{}
	record := func(name, details *ast.Node, sf *ast.SourceFile) {
		if name.Kind != ast.KindIdentifier || details.Kind != ast.KindObjectLiteralExpression {
			return
		}
		for _, property := range details.AsObjectLiteralExpression().Properties.Nodes {
			if property.Kind != ast.KindPropertyAssignment {
				continue
			}
			if nodeText(property.Name(), sf) != "status" {
				continue
			}
			if status, ok := jsNumber(nodeText(property.Initializer(), sf)); ok {
				statuses[name.Text()] = status
			}
		}
	}
	scan := func(sf *ast.SourceFile) {
		for _, statement := range sf.Statements.Nodes {
			if statement.Kind != ast.KindExpressionStatement {
				continue
			}
			call := statement.Expression()
			if call.Kind != ast.KindCallExpression || call.Expression().Kind != ast.KindIdentifier {
				continue
			}
			args := call.Arguments()
			switch call.Expression().Text() {
			case "addError":
				if len(args) >= 2 {
					record(args[0], args[1], sf)
				}
			case "addErrors":
				if len(args) == 0 || args[0].Kind != ast.KindArrayLiteralExpression {
					continue
				}
				for _, entry := range args[0].AsArrayLiteralExpression().Elements.Nodes {
					if entry.Kind != ast.KindArrayLiteralExpression {
						continue
					}
					elements := entry.AsArrayLiteralExpression().Elements.Nodes
					if len(elements) >= 2 {
						record(elements[0], elements[1], sf)
					}
				}
			}
		}
	}
	for _, sf := range prog.GetSourceFiles() {
		if !sf.IsDeclarationFile {
			scan(sf)
			continue
		}
		if !strings.Contains(sf.Text(), "PikkuError") {
			continue
		}
		emitted := emittedDeclTS.ReplaceAllString(sf.FileName(), ".$1")
		if emitted == sf.FileName() {
			continue
		}
		jsPath := strings.TrimSuffix(emitted, ".ts")
		if jsPath != emitted {
			jsPath += ".js"
		}
		source, err := os.ReadFile(jsPath)
		if err != nil {
			continue
		}
		scan(sourcescan.Parse(emitted, string(source), core.ScriptKindJS))
	}
	return statuses
}

// nodeText is node.getText(): the source from the node's first token.
func nodeText(n *ast.Node, sf *ast.SourceFile) string {
	return sf.Text()[scanner.GetTokenPosOfNode(n, sf, false):n.End()]
}

// jsNumber is Number(text) restricted to finite results.
func jsNumber(text string) (float64, bool) {
	t := sourcescan.JSTrim(text)
	if t == "" {
		return 0, true
	}
	lower := strings.ToLower(t)
	for prefix, base := range map[string]int{"0x": 16, "0o": 8, "0b": 2} {
		if strings.HasPrefix(lower, prefix) {
			n, err := strconv.ParseUint(t[2:], base, 64)
			if err != nil {
				return 0, false
			}
			return float64(n), true
		}
	}
	for _, r := range t {
		if !(r >= '0' && r <= '9' || r == '.' || r == 'e' || r == 'E' || r == '+' || r == '-') {
			return 0, false
		}
	}
	n, err := strconv.ParseFloat(t, 64)
	if err != nil || math.IsInf(n, 0) || math.IsNaN(n) {
		return 0, false
	}
	return n, true
}

package sourcescan

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/module"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
)

// The stub scan of `pikku mocks`: packages/cli/src/functions/mocks/stub-scan.ts
// up to and including scanFrontend. The checks that run on its result stay in
// TypeScript; they never touched the compiler.

var stubHooks = map[string]bool{"usePikkuQueryStub": true, "usePikkuMutationStub": true}
var plainHooks = map[string]bool{"usePikkuQuery": true, "usePikkuMutation": true}

// HookCall is stub-scan.ts's HookCall: a StubCall when Stub, a PlainCall
// otherwise. Fields a JSON.stringify would drop are omitted.
type HookCall struct {
	File    string  `json:"file"`
	Line    int     `json:"line"`
	Hook    string  `json:"hook"`
	Rpc     *string `json:"rpc,omitempty"`
	Flag    string  `json:"flag,omitempty"`
	Problem string  `json:"problem,omitempty"`
	Stub    bool    `json:"stub"`
}

// FrontendCall is a StubCall or PlainCall: a HookCall without `stub`.
type FrontendCall struct {
	File    string  `json:"file"`
	Line    int     `json:"line"`
	Hook    string  `json:"hook"`
	Rpc     *string `json:"rpc,omitempty"`
	Flag    string  `json:"flag,omitempty"`
	Problem string  `json:"problem,omitempty"`
}

type FrontendScan struct {
	StubCalls  []FrontendCall `json:"stubCalls"`
	PlainCalls []FrontendCall `json:"plainCalls"`
}

// ImportCheck says whether `name` imported from `specifier` reaches the client.
type ImportCheck func(specifier, name string) bool

func literalText(n *ast.Node) (string, bool) {
	if isStringLiteralLike(n) {
		return n.Text(), true
	}
	return "", false
}

func propertyNameText(name *ast.Node) (string, bool) {
	if ast.IsIdentifier(name) || ast.IsStringLiteral(name) {
		return name.Text(), true
	}
	return "", false
}

func readFlag(options *ast.Node) (flag, problem string) {
	if options == nil {
		return "", "no-flag"
	}
	if !ast.IsObjectLiteralExpression(options) {
		return "", "flag-not-literal"
	}
	for _, prop := range options.AsObjectLiteralExpression().Properties.Nodes {
		switch {
		case ast.IsPropertyAssignment(prop):
			if name, ok := propertyNameText(prop.Name()); ok && name == "featureFlag" {
				if f, ok := literalText(prop.Initializer()); ok && f != "" {
					return f, ""
				}
				return "", "flag-not-literal"
			}
		case ast.IsShorthandPropertyAssignment(prop):
			if prop.Name().Text() == "featureFlag" {
				return "", "flag-not-literal"
			}
		case ast.IsSpreadAssignment(prop):
			return "", "flag-not-literal"
		}
	}
	return "", "no-flag"
}

type importBinding struct {
	specifier string
	name      string
	hasName   bool
}

func importBindings(sf *ast.SourceFile) map[string]importBinding {
	bindings := map[string]importBinding{}
	for _, node := range sf.Statements.Nodes {
		if !ast.IsImportDeclaration(node) {
			continue
		}
		decl := node.AsImportDeclaration()
		if decl.ImportClause == nil || !ast.IsStringLiteral(decl.ModuleSpecifier) {
			continue
		}
		specifier := decl.ModuleSpecifier.Text()
		clause := decl.ImportClause.AsImportClause()
		if name := decl.ImportClause.Name(); name != nil {
			bindings[name.Text()] = importBinding{specifier: specifier, name: "default", hasName: true}
		}
		named := clause.NamedBindings
		if named == nil {
			continue
		}
		if ast.IsNamespaceImport(named) {
			bindings[named.Name().Text()] = importBinding{specifier: specifier}
			continue
		}
		for _, el := range named.AsNamedImports().Elements.Nodes {
			original := el.Name()
			if pn := el.AsImportSpecifier().PropertyName; pn != nil {
				original = pn
			}
			bindings[el.Name().Text()] = importBinding{specifier: specifier, name: original.Text(), hasName: true}
		}
	}
	return bindings
}

var jsxFileRe = regexp.MustCompile(`\.[jt]sx$`)

type hookRef struct {
	name, hook, specifier string
}

// ScanHooks ports scanHooks. fromClient may be nil.
func ScanHooks(file, text string, fromClient ImportCheck) []HookCall {
	kind := core.ScriptKindTS
	if jsxFileRe.MatchString(file) {
		kind = core.ScriptKindTSX
	}
	sf := Parse(file, text, kind)
	bindings := importBindings(sf)
	hookOf := func(callee *ast.Node) (hookRef, bool) {
		if ast.IsIdentifier(callee) {
			binding, ok := bindings[callee.Text()]
			if !ok {
				return hookRef{name: callee.Text(), hook: callee.Text()}, true
			}
			if binding.hasName {
				return hookRef{name: callee.Text(), hook: binding.name, specifier: binding.specifier}, true
			}
			return hookRef{}, false
		}
		if ast.IsPropertyAccessExpression(callee) {
			name := callee.Name().Text()
			if ast.IsIdentifier(callee.Expression()) {
				if binding, ok := bindings[callee.Expression().Text()]; ok && !binding.hasName {
					return hookRef{name: name, hook: name, specifier: binding.specifier}, true
				}
			}
			return hookRef{name: name, hook: name}, true
		}
		return hookRef{}, false
	}
	calls := []HookCall{}
	var visit func(n *ast.Node)
	visit = func(n *ast.Node) {
		if ast.IsCallExpression(n) {
			found, ok := hookOf(n.Expression())
			stub := ok && stubHooks[found.hook]
			if ok && (stub || plainHooks[found.hook]) &&
				(found.specifier == "" || fromClient == nil || fromClient(found.specifier, found.hook)) {
				args := n.Arguments()
				var rpcArg, options *ast.Node
				if len(args) > 0 {
					rpcArg = args[0]
				}
				if len(args) > 1 {
					options = args[1]
				}
				call := HookCall{File: file, Line: lineOf(sf, start(n, sf)), Hook: found.name, Stub: stub}
				if rpc, ok := literalText(rpcArg); ok {
					call.Rpc = &rpc
				}
				if stub {
					call.Flag, call.Problem = readFlag(options)
				}
				calls = append(calls, call)
			}
		}
		forEachChild(n, visit)
	}
	visit(sf.AsNode())
	return calls
}

var extensionRe = regexp.MustCompile(`(\.d)?\.[cm]?[jt]sx?$`)

func withoutExtension(file string) string { return extensionRe.ReplaceAllString(file, "") }

// realPath is fs.realpathSync, falling back to path.resolve.
func realPath(file string) string {
	abs, _ := filepath.Abs(file)
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		return resolved
	}
	return abs
}

// ClientImports ports clientImports: whether an import resolves, through any
// chain of re-exports, to the generated client module.
type ClientImports struct {
	target    string
	host      compiler.CompilerHost
	configs   map[string]*core.CompilerOptions
	resolved  map[string]*string
	reaches   map[string]bool
	resolvers map[*core.CompilerOptions]*module.Resolver
	bundler   map[*core.CompilerOptions]*core.CompilerOptions
}

func NewClientImports(client string) *ClientImports {
	return &ClientImports{
		target:    withoutExtension(realPath(client)),
		host:      newHost(),
		configs:   map[string]*core.CompilerOptions{},
		resolved:  map[string]*string{},
		reaches:   map[string]bool{},
		resolvers: map[*core.CompilerOptions]*module.Resolver{},
		bundler:   map[*core.CompilerOptions]*core.CompilerOptions{},
	}
}

// findConfigFile is ts.findConfigFile(dir, fileExists): the nearest
// tsconfig.json at or above dir.
func (c *ClientImports) findConfigFile(dir string) string {
	dir = tspath.NormalizePath(dir)
	for {
		candidate := tspath.CombinePaths(dir, "tsconfig.json")
		if c.host.FS().FileExists(candidate) {
			return candidate
		}
		parent := tspath.GetDirectoryPath(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func (c *ClientImports) optionsFor(dir string) *core.CompilerOptions {
	configPath := c.findConfigFile(dir)
	if options, ok := c.configs[configPath]; ok {
		return options
	}
	options := &core.CompilerOptions{}
	if configPath != "" {
		if parsed, _ := tsoptions.GetParsedCommandLineOfConfigFile(configPath, &core.CompilerOptions{}, nil, c.host, nil); parsed != nil {
			options = parsed.CompilerOptions()
		}
	}
	c.configs[configPath] = options
	return options
}

func (c *ClientImports) lookup(specifier, from string, options *core.CompilerOptions) string {
	resolver := c.resolvers[options]
	if resolver == nil {
		resolver = module.NewResolver(c.host, options, "", "")
		c.resolvers[options] = resolver
	}
	resolvedModule, _ := resolver.ResolveModuleName(specifier, tspath.NormalizePath(from), core.ResolutionModeNone, nil)
	if !resolvedModule.IsResolved() {
		return ""
	}
	return resolvedModule.ResolvedFileName
}

// bundlerOptions is `{ ...options, ...BUNDLER_OPTIONS }`, kept per options so
// its resolver cache is reused.
func (c *ClientImports) bundlerOptions(options *core.CompilerOptions) *core.CompilerOptions {
	if b, ok := c.bundler[options]; ok {
		return b
	}
	b := options.Clone()
	b.Module = core.ModuleKindESNext
	b.ModuleResolution = core.ModuleResolutionKindBundler
	b.AllowJs = core.TSTrue
	c.bundler[options] = b
	return b
}

func (c *ClientImports) resolveFrom(from, specifier string) (string, bool) {
	key := filepath.Dir(from) + "\x00" + specifier
	if r, ok := c.resolved[key]; ok {
		if r == nil {
			return "", false
		}
		return *r, true
	}
	options := c.optionsFor(filepath.Dir(from))
	found := c.lookup(specifier, from, options)
	if found == "" {
		found = c.lookup(specifier, from, c.bundlerOptions(options))
	}
	if found == "" {
		c.resolved[key] = nil
		return "", false
	}
	real := realPath(found)
	c.resolved[key] = &real
	return real, true
}

func (c *ClientImports) reachesClient(file, name string) bool {
	if withoutExtension(file) == c.target {
		return true
	}
	key := file + "\x00" + name
	if v, ok := c.reaches[key]; ok {
		return v
	}
	c.reaches[key] = false
	text, err := os.ReadFile(file)
	if err != nil {
		return false
	}
	sf := Parse(file, string(text), core.ScriptKindUnknown)
	found := false
	for _, node := range sf.Statements.Nodes {
		if !ast.IsExportDeclaration(node) {
			continue
		}
		decl := node.AsExportDeclaration()
		if decl.ModuleSpecifier == nil || !ast.IsStringLiteral(decl.ModuleSpecifier) {
			continue
		}
		original := ""
		if decl.ExportClause == nil {
			original = name
		} else if ast.IsNamedExports(decl.ExportClause) {
			for _, el := range decl.ExportClause.AsNamedExports().Elements.Nodes {
				if el.Name().Text() == name {
					if pn := el.AsExportSpecifier().PropertyName; pn != nil {
						original = pn.Text()
					} else {
						original = el.Name().Text()
					}
					break
				}
			}
		}
		if original == "" {
			continue
		}
		next, ok := c.resolveFrom(file, decl.ModuleSpecifier.Text())
		if !ok || c.reachesClient(next, original) {
			found = true
			break
		}
	}
	c.reaches[key] = found
	return found
}

// For returns the ImportCheck for imports made by `from`.
func (c *ClientImports) For(from string) ImportCheck {
	return func(specifier, name string) bool {
		file, ok := c.resolveFrom(from, specifier)
		return !ok || c.reachesClient(file, name)
	}
}

// ScanFrontend ports scanFrontend.
func ScanFrontend(rootDir string, files []string, client string) FrontendScan {
	scan := FrontendScan{StubCalls: []FrontendCall{}, PlainCalls: []FrontendCall{}}
	var imports *ClientImports
	if client != "" {
		imports = NewClientImports(resolvePath(rootDir, client))
	}
	absRoot := resolvePath(rootDir)
	for _, file := range files {
		text, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		if !strings.Contains(string(text), "usePikku") {
			continue
		}
		var check ImportCheck
		if imports != nil {
			check = imports.For(file)
		}
		rel, err := filepath.Rel(absRoot, resolvePath(file))
		if err != nil || rel == "." {
			rel = ""
		}
		for _, call := range ScanHooks(rel, string(text), check) {
			entry := FrontendCall{File: call.File, Line: call.Line, Hook: call.Hook, Rpc: call.Rpc, Flag: call.Flag, Problem: call.Problem}
			if call.Stub {
				scan.StubCalls = append(scan.StubCalls, entry)
			} else {
				scan.PlainCalls = append(scan.PlainCalls, entry)
			}
		}
	}
	return scan
}

// resolvePath is node's path.resolve.
func resolvePath(segments ...string) string {
	out := ""
	for _, s := range segments {
		if filepath.IsAbs(s) {
			out = s
		} else {
			out = filepath.Join(out, s)
		}
	}
	abs, _ := filepath.Abs(out)
	return abs
}

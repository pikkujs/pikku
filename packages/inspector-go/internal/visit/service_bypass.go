package visit

import (
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// contentStorageModules is extract-service-bypass.ts CONTENT_STORAGE_MODULES:
// the modules whose use means "storing or reading content without the
// `content` service". Add object-storage SDKs here to widen the policy.
var contentStorageModules = map[string]bool{
	"fs": true, "node:fs": true, "fs/promises": true, "node:fs/promises": true,
}

var testFileRe = regexp.MustCompile(`\.(test|spec)\.[cm]?[jt]sx?$`)

// IsServiceBypassExempt is extract-service-bypass.ts isServiceBypassExempt:
// generated code, declaration files and tests are outside both policies.
// The `.pikku` output directory is matched against the path relative to the
// project's rootDir, so a project that merely sits under a parent directory
// named `.pikku` is still inspected. Files outside rootDir (workspace
// packages) have no relative path, so their full path is checked.
func IsServiceBypassExempt(rootDir, fileName string) bool {
	n := strings.ReplaceAll(fileName, "\\", "/")
	if strings.HasSuffix(n, ".gen.ts") || strings.HasSuffix(n, ".d.ts") || testFileRe.MatchString(n) {
		return true
	}
	rel := n
	if rootDir != "" {
		if r, err := filepath.Rel(rootDir, fileName); err == nil && r != ".." && !strings.HasPrefix(r, ".."+string(filepath.Separator)) {
			rel = "/" + strings.ReplaceAll(r, "\\", "/")
		}
	}
	return strings.Contains(rel, "/.pikku/")
}

func isBypassStringLike(n *ast.Node) bool {
	return n != nil && (ast.IsStringLiteral(n) || ast.IsNoSubstitutionTemplateLiteral(n))
}

// isProcessRef matches `process`, `globalThis.process` and `global.process`.
func isProcessRef(n *ast.Node) bool {
	if n == nil {
		return false
	}
	if ast.IsIdentifier(n) {
		return n.Text() == "process"
	}
	return ast.IsPropertyAccessExpression(n) && n.Name().Text() == "process" &&
		ast.IsIdentifier(n.Expression()) && (n.Expression().Text() == "globalThis" || n.Expression().Text() == "global")
}

func isProcessEnv(n *ast.Node) bool {
	if ast.IsPropertyAccessExpression(n) {
		return isProcessRef(n.Expression()) && n.Name().Text() == "env"
	}
	return ast.IsElementAccessExpression(n) && isProcessRef(n.Expression()) && isBypassStringLike(n.AsElementAccessExpression().ArgumentExpression) &&
		n.AsElementAccessExpression().ArgumentExpression.Text() == "env"
}

// ExtractServiceBypass is extract-service-bypass.ts extractServiceBypass.
func ExtractServiceBypass(sf *ast.SourceFile) *state.ServiceBypass {
	content := state.Strings{}
	variables := state.Strings{}
	seenContent := map[string]bool{}
	seenVariables := map[string]bool{}
	add := func(list *state.Strings, seen map[string]bool, n *ast.Node, snippet string) {
		entry := strconv.Itoa(scanner.GetECMALineOfPosition(sf, tsutil.NodeStart(n))+1) + ":" + snippet
		if !seen[entry] {
			seen[entry] = true
			*list = append(*list, entry)
		}
	}
	storageModule := func(n *ast.Node) (string, bool) {
		if isBypassStringLike(n) && contentStorageModules[n.Text()] {
			return n.Text(), true
		}
		return "", false
	}

	tsutil.WalkSelf(sf.AsNode(), func(n *ast.Node) {
		switch {
		case ast.IsImportDeclaration(n):
			if m, ok := storageModule(n.ModuleSpecifier()); ok {
				if ic := n.ImportClause(); ic == nil || !ic.AsImportClause().IsTypeOnly() {
					add(&content, seenContent, n, "import '"+m+"'")
				}
			}
		case ast.IsExportDeclaration(n):
			if m, ok := storageModule(n.ModuleSpecifier()); ok && !n.AsExportDeclaration().IsTypeOnly {
				add(&content, seenContent, n, "export from '"+m+"'")
			}
		case ast.IsImportEqualsDeclaration(n):
			d := n.AsImportEqualsDeclaration()
			if !d.IsTypeOnly && ast.IsExternalModuleReference(d.ModuleReference) {
				if m, ok := storageModule(d.ModuleReference.AsExternalModuleReference().Expression); ok {
					add(&content, seenContent, n, "require('"+m+"')")
				}
			}
		case ast.IsCallExpression(n):
			var first *ast.Node
			if args := n.Arguments(); len(args) > 0 {
				first = args[0]
			}
			if ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "require" {
				if m, ok := storageModule(first); ok {
					add(&content, seenContent, n, "require('"+m+"')")
				}
			} else if n.Expression().Kind == ast.KindImportKeyword {
				if m, ok := storageModule(first); ok {
					add(&content, seenContent, n, "import('"+m+"')")
				}
			}
		case isProcessEnv(n):
			snippet := "process.env"
			if p := n.Parent; p != nil {
				if ast.IsPropertyAccessExpression(p) && p.Expression() == n {
					snippet = "process.env." + p.Name().Text()
				} else if ast.IsElementAccessExpression(p) && p.Expression() == n && isBypassStringLike(p.AsElementAccessExpression().ArgumentExpression) {
					snippet = "process.env['" + p.AsElementAccessExpression().ArgumentExpression.Text() + "']"
				}
			}
			add(&variables, seenVariables, n, snippet)
		case ast.IsVariableDeclaration(n) && ast.IsObjectBindingPattern(n.Name()) && n.Initializer() != nil &&
			isProcessRef(n.Initializer()):
			for _, el := range n.Name().Elements() {
				key := el.PropertyName()
				if key == nil {
					key = el.Name()
				}
				if el.AsBindingElement().DotDotDotToken == nil && (ast.IsIdentifier(key) || isBypassStringLike(key)) && key.Text() == "env" {
					add(&variables, seenVariables, n, "const { env } = process")
				}
			}
		}
	})
	return &state.ServiceBypass{Content: content, Variables: variables}
}

// Package parser turns TypeScript AST nodes into the intermediate type
// model, mirroring src/NodeParser* of the TypeScript implementation.
//
// Error convention: parsers report failures by panicking with an error
// (the TypeScript implementation throws). The public entry points in the
// generator package recover panics and return them as errors.
package parser

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// Context tracks type parameters and arguments while descending through
// generic instantiations (src/NodeParser.ts).
type Context struct {
	cacheKey        string
	arguments       []types.Type
	parameters      []string
	reference       *ast.Node
	defaultArgument map[string]types.Type
}

func NewContext(reference *ast.Node) *Context {
	return &Context{reference: reference, defaultArgument: map[string]types.Type{}}
}

func (c *Context) PushArgument(argumentType types.Type) {
	c.arguments = append(c.arguments, argumentType)
	c.cacheKey = ""
}

func (c *Context) PushParameter(parameterName string) {
	c.parameters = append(c.parameters, parameterName)
}

func (c *Context) SetDefault(parameterName string, argumentType types.Type) {
	c.defaultArgument[parameterName] = argumentType
}

func (c *Context) CacheKey() string {
	if c.cacheKey == "" {
		ref := ""
		if c.reference != nil {
			ref = GetNodeKey(c.reference, c)
		}
		c.cacheKey = fmt.Sprintf("[%q,[%s]]", ref, joinTypes(c.arguments, types.Type.ID))
	}
	return c.cacheKey
}

func (c *Context) GetArgument(parameterName string) types.Type {
	index := -1
	for i, p := range c.parameters {
		if p == parameterName {
			index = i
			break
		}
	}
	if index < 0 || index >= len(c.arguments) || c.arguments[index] == nil {
		if def, ok := c.defaultArgument[parameterName]; ok {
			return def
		}
	}
	if index >= 0 && index < len(c.arguments) {
		return c.arguments[index]
	}
	return nil
}

func (c *Context) Parameters() []string    { return c.parameters }
func (c *Context) Arguments() []types.Type { return c.arguments }

// NodeParser creates a type from an AST node. reference is non-nil when the
// node is being parsed to back a circular ReferenceType.
type NodeParser interface {
	CreateType(node *ast.Node, ctx *Context, reference *types.ReferenceType) types.Type
}

// SubNodeParser is a NodeParser that can announce which nodes it handles.
type SubNodeParser interface {
	NodeParser
	SupportsNode(node *ast.Node) bool
}

// ---------------------------------------------------------------------------
// Node keys (src/Utils/nodeKey.ts)

// baseDir is the prefix stripped from source file names before they enter a
// node key. The TypeScript implementation replaces process.cwd() in the file
// name unconditionally; this port strips it only when the name actually starts
// with it, so an unrelated absolute path keeps its full name. Symlinks are
// resolved because the file names the compiler reports are resolved too — on
// macOS, /tmp and /private/tmp would otherwise not match.
var baseDir = sync.OnceValue(func() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}
	return resolveSymlinks(cwd)
})

// resolveSymlinks returns the symlink-free form of path with forward slashes,
// falling back to the input when the path cannot be resolved.
func resolveSymlinks(path string) string {
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return filepath.ToSlash(path)
	}
	return filepath.ToSlash(resolved)
}

// nodeKeyFileName renders a source file name the way node keys spell it:
// relative to the working directory, with slashes flattened.
func nodeKeyFileName(filename string) string {
	if base := baseDir(); base != "" && strings.HasPrefix(filename, base+"/") {
		filename = filename[len(base)+1:]
	}
	return strings.ReplaceAll(filename, "/", "_")
}

// GetNodeKey builds a key identifying a node (and its generic arguments)
// across parses.
func GetNodeKey(node *ast.Node, ctx *Context) string {
	var ids []string
	// A node and its ancestors normally share one source file, but a
	// synthesized parent can come from another, so the hash is cached per
	// file rather than computed once.
	var (
		hashedSource *ast.SourceFile
		fileHash     string
	)
	for node != nil {
		source := ast.GetSourceFileOfNode(node)
		if source == nil {
			// Sourceless (synthesized) nodes have no positions to build an
			// identity from. The TypeScript implementation uses Math.random()
			// here, which defeats caching and would leak nondeterminism into
			// definition ids; the node's address is equally unique but stable
			// for the lifetime of the run.
			ids = append(ids, fmt.Sprintf("%p", node))
		} else {
			if source != hashedSource {
				hashedSource = source
				fileHash = types.Hash(nodeKeyFileName(source.FileName()))
			}
			ids = append(ids, fileHash, strconv.Itoa(node.Pos()), strconv.Itoa(node.End()))
		}
		node = node.Parent
	}
	id := strings.Join(ids, "-")
	args := ctx.Arguments()
	if len(args) == 0 {
		return id
	}
	return id + "<" + joinTypes(args, types.Type.ID) + ">"
}

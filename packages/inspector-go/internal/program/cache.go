package program

import (
	"sync"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/compiler"
)

// Cache keeps parsed (and, once a program binds them, bound) SourceFiles
// across programs: the inspector's own program, the schema generator's second
// program, and every re-inspection in `serve` mode. A file is reused when its
// path, parse options and text are all unchanged, so a re-inspect re-parses
// only the files that changed. Checkers are never cached.
//
// Sharing bound files is safe: binding in typescript-go depends only on the
// file, and checker state lives in the checker, not on nodes.
type Cache struct {
	mu      sync.Mutex
	entries map[cacheKey]*cacheEntry
	gen     int
}

type cacheKey struct {
	path string
	opts ast.ExternalModuleIndicatorOptions
}

type cacheEntry struct {
	file *ast.SourceFile
	gen  int
}

func NewCache() *Cache { return &Cache{entries: map[cacheKey]*cacheEntry{}} }

// Begin starts a request: Prune afterwards drops every file that the request's
// programs did not use.
func (c *Cache) Begin() {
	c.mu.Lock()
	c.gen++
	c.mu.Unlock()
}

// Prune drops files no program has asked for since the last Begin, so a
// deleted or renamed file does not stay alive in a long-running serve process.
func (c *Cache) Prune() {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, e := range c.entries {
		if e.gen != c.gen {
			delete(c.entries, k)
		}
	}
}

func (c *Cache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

// Host wraps a compiler host so its programs share this cache.
func (c *Cache) Host(inner compiler.CompilerHost) compiler.CompilerHost { return c.wrap(inner) }

func (c *Cache) wrap(inner compiler.CompilerHost) *cachingHost {
	return &cachingHost{CompilerHost: inner, cache: c}
}

type cachingHost struct {
	compiler.CompilerHost
	cache  *Cache
	mu     sync.Mutex
	reused int
}

func (h *cachingHost) GetSourceFile(opts ast.SourceFileParseOptions) *ast.SourceFile {
	text, ok := h.FS().ReadFile(opts.FileName)
	if !ok {
		return nil
	}
	key := cacheKey{path: string(opts.Path), opts: opts.ExternalModuleIndicatorOptions}
	c := h.cache
	c.mu.Lock()
	if e := c.entries[key]; e != nil && e.file.FileName() == opts.FileName && e.file.Text() == text {
		e.gen = c.gen
		c.mu.Unlock()
		h.mu.Lock()
		h.reused++
		h.mu.Unlock()
		return e.file
	}
	c.mu.Unlock()
	sf := h.CompilerHost.GetSourceFile(opts)
	if sf == nil {
		return nil
	}
	c.mu.Lock()
	c.entries[key] = &cacheEntry{file: sf, gen: c.gen}
	c.mu.Unlock()
	return sf
}

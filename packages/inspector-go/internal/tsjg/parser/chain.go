package parser

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsjg/types"
)

// ChainNodeParser delegates to the first sub-parser supporting a node and
// caches results per node and context (src/ChainNodeParser.ts).
type ChainNodeParser struct {
	TypeChecker *checker.Checker
	parsers     []SubNodeParser
	typeCaches  map[*ast.Node]map[string]types.Type
}

func NewChainNodeParser(typeChecker *checker.Checker, parsers []SubNodeParser) *ChainNodeParser {
	return &ChainNodeParser{
		TypeChecker: typeChecker,
		parsers:     parsers,
		typeCaches:  map[*ast.Node]map[string]types.Type{},
	}
}

func (p *ChainNodeParser) AddNodeParser(parser SubNodeParser) *ChainNodeParser {
	p.parsers = append(p.parsers, parser)
	return p
}

func (p *ChainNodeParser) SupportsNode(node *ast.Node) bool {
	for _, sub := range p.parsers {
		if sub.SupportsNode(node) {
			return true
		}
	}
	return false
}

func (p *ChainNodeParser) CreateType(node *ast.Node, ctx *Context, reference *types.ReferenceType) types.Type {
	// Unresolvable type references and import types hand over a nil
	// declaration; report that instead of dereferencing it.
	if node == nil {
		panic(NewUnknownNodeError(nil))
	}
	typeCache, ok := p.typeCaches[node]
	if !ok {
		typeCache = map[string]types.Type{}
		p.typeCaches[node] = typeCache
	}
	cacheKey := ctx.CacheKey()
	typ, ok := typeCache[cacheKey]
	if !ok {
		typ = p.parserFor(node).CreateType(node, ctx, reference)
		if _, isRef := typ.(*types.ReferenceType); !isRef {
			typeCache[cacheKey] = typ
		}
	}
	if typ == nil {
		panic(NewUnknownNodeError(node))
	}
	return typ
}

func (p *ChainNodeParser) parserFor(node *ast.Node) SubNodeParser {
	for _, sub := range p.parsers {
		if sub.SupportsNode(node) {
			return sub
		}
	}
	panic(NewUnknownNodeError(node))
}

// CircularReferenceNodeParser breaks cycles by handing out ReferenceTypes
// while a node is being parsed (src/CircularReferenceNodeParser.ts).
type CircularReferenceNodeParser struct {
	child    SubNodeParser
	circular map[string]types.Type
}

func NewCircularReferenceNodeParser(child SubNodeParser) *CircularReferenceNodeParser {
	return &CircularReferenceNodeParser{child: child, circular: map[string]types.Type{}}
}

func (p *CircularReferenceNodeParser) SupportsNode(node *ast.Node) bool {
	return p.child.SupportsNode(node)
}

func (p *CircularReferenceNodeParser) CreateType(node *ast.Node, ctx *Context, _ *types.ReferenceType) types.Type {
	key := GetNodeKey(node, ctx)
	if cached, ok := p.circular[key]; ok {
		return cached
	}
	reference := types.NewReferenceType()
	p.circular[key] = reference
	typ := p.child.CreateType(node, ctx, reference)
	if typ != nil {
		reference.SetType(typ)
	}
	delete(p.circular, key)
	return typ
}

// TopRefNodeParser optionally wraps the root type in a definition
// (src/TopRefNodeParser.ts).
type TopRefNodeParser struct {
	child    NodeParser
	fullName string
	topRef   bool
}

func NewTopRefNodeParser(child NodeParser, fullName string, topRef bool) *TopRefNodeParser {
	return &TopRefNodeParser{child: child, fullName: fullName, topRef: topRef}
}

// SetFullName renames the top-level definition for subsequent CreateType
// calls. It has no counterpart in the reference implementation, whose Config
// carries a single type name fixed at construction; the CLI's --outdir mode
// generates one named type at a time from a shared chain and renames between
// them. Only the wrapper is affected: the child chain's caches are untouched,
// and CreateType builds a fresh DefinitionType each time.
func (p *TopRefNodeParser) SetFullName(fullName string) {
	p.fullName = fullName
}

func (p *TopRefNodeParser) CreateType(node *ast.Node, ctx *Context, _ *types.ReferenceType) types.Type {
	baseType := p.child.CreateType(node, ctx, nil)
	def, isDef := baseType.(*types.DefinitionType)
	switch {
	case p.topRef && !isDef:
		return types.NewDefinitionType(p.fullName, baseType)
	case !p.topRef && isDef:
		return def.Type
	default:
		return baseType
	}
}

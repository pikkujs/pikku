package visit

import (
	"fmt"
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// Phase is one of visit.ts's three sweeps.
type Phase int

const (
	PhaseSetup Phase = iota
	PhaseFunctions
	PhaseRoutes
)

func (p Phase) String() string {
	return [...]string{"setup", "functions", "routes"}[p]
}

// Visitor is one entry of a sweep: a port of one add*(...) call in visit.ts.
// At every node, the phase's visitors run in Order, then the sweep descends —
// the same as visit.ts calling each add* in sequence before ts.forEachChild.
type Visitor struct {
	Name  string
	Phase Phase
	// Order is the position of the TS call in its visit function; see order.go.
	Order int
	Visit func(c *Context, node *ast.Node)
}

var registry = map[Phase][]Visitor{}

// Register adds a visitor; groups call it from init(). Two visitors with the
// same phase and order, or the same name, are a programming error.
func Register(v Visitor) {
	for _, e := range registry[v.Phase] {
		if e.Order == v.Order || e.Name == v.Name {
			panic(fmt.Sprintf("visit: %q collides with %q in phase %s", v.Name, e.Name, v.Phase))
		}
	}
	list := append(registry[v.Phase], v)
	sort.SliceStable(list, func(i, j int) bool { return list[i].Order < list[j].Order })
	registry[v.Phase] = list
}

// Visitors returns a phase's visitors in run order.
func Visitors(p Phase) []Visitor { return append([]Visitor(nil), registry[p]...) }

// Sweep runs one phase over every project file: visit.ts's
// `ts.forEachChild(sourceFile, child => visitX(...))`, which recurses itself.
func (s *Context) Sweep(p Phase, files []*ast.SourceFile) {
	vs := registry[p]
	if len(vs) == 0 {
		return
	}
	for _, sf := range files {
		s.SourceFile = sf
		tsutil.Walk(sf.AsNode(), func(n *ast.Node) {
			for _, v := range vs {
				v.Visit(s, n)
			}
		})
	}
	s.SourceFile = nil
}

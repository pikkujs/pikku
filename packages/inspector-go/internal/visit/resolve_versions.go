package visit

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/tsutil"
)

// ParseVersionedId is parseVersionedId from @pikku/core: "name@v3" -> ("name", 3);
// no separator, or a suffix that is not an integer >= 1, gives version -1.
func ParseVersionedId(id string) (string, int) {
	idx := strings.LastIndex(id, "@v")
	if idx < 0 {
		return id, -1
	}
	f, err := strconv.ParseFloat(strings.TrimSpace(id[idx+2:]), 64)
	if err != nil || f < 1 || f != float64(int(f)) {
		return id, -1
	}
	return id[:idx], int(f)
}

func areCompatibleFunctionIds(existing, incoming string) bool {
	if existing == incoming {
		return true
	}
	a, _ := ParseVersionedId(existing)
	b, _ := ParseVersionedId(incoming)
	return a == b
}

// ResolveLatestVersions ports utils/resolve-versions.ts.
func (s *Context) ResolveLatestVersions() {
	type explicit struct {
		id      string
		version int
	}
	type group struct {
		explicit    []explicit
		unversioned string
	}
	st := s.State
	meta := &st.Functions.Meta
	var order []string
	groups := map[string]*group{}
	meta.Each(func(id string, m *FunctionMeta) {
		base, version := ParseVersionedId(id)
		g := groups[base]
		if g == nil {
			g = &group{}
			groups[base] = g
			order = append(order, base)
		}
		switch {
		case version >= 0:
			g.explicit = append(g.explicit, explicit{id, version})
		case m.Version != nil:
			g.explicit = append(g.explicit, explicit{id, *m.Version})
		default:
			g.unversioned = id
		}
	})

	for _, base := range order {
		g := groups[base]
		if len(g.explicit) == 0 {
			continue
		}
		seen := map[int]string{}
		for _, e := range g.explicit {
			if existing, ok := seen[e.version]; ok {
				s.Log.Critical(diag.DuplicateFunctionVersion, fmt.Sprintf(
					"Duplicate version %d for function '%s': '%s' and '%s'.", e.version, base, existing, e.id))
			}
			seen[e.version] = e.id
		}
		maxVersion := g.explicit[0].version
		latest := g.explicit[0]
		for _, e := range g.explicit[1:] {
			if e.version > maxVersion {
				maxVersion = e.version
			}
			if !(latest.version > e.version) {
				latest = e
			}
		}

		if g.unversioned != "" {
			v := maxVersion + 1
			oldId, newId := g.unversioned, tsutil.FormatVersionedId(base, v)
			m := meta.At(oldId)
			m.PikkuFuncId, m.Version = newId, &v
			meta.Delete(oldId)
			meta.Set(newId, m)
			if f, ok := st.Functions.Files.Get(oldId); ok {
				st.Functions.Files.Delete(oldId)
				st.Functions.Files.Set(newId, f)
			}
			if f, ok := st.RPC.InternalFiles.Get(oldId); ok {
				st.RPC.InternalFiles.Delete(oldId)
				st.RPC.InternalFiles.Set(newId, f)
			}
			if st.RPC.InvokedFunctions.Has(oldId) {
				st.RPC.InvokedFunctions.Delete(oldId)
				st.RPC.InvokedFunctions.Add(newId)
			}
			if st.ServiceAggregation.UsedFunctions.Has(oldId) {
				st.ServiceAggregation.UsedFunctions.Delete(oldId)
				st.ServiceAggregation.UsedFunctions.Add(newId)
			}
			st.RPC.InternalMeta.Set(base, newId)
			st.RPC.InternalMeta.Set(newId, newId)
			if st.RPC.ExposedMeta.At(base) == oldId {
				st.RPC.ExposedMeta.Set(base, newId)
			}
			s.updateWiringReferences(oldId, newId)
		} else {
			st.RPC.InternalMeta.Set(base, latest.id)
		}

		if st.RPC.ExposedMeta.At(base) != "" {
			latestId := st.RPC.InternalMeta.At(base)
			st.RPC.ExposedMeta.Set(base, latestId)
			for _, e := range g.explicit {
				st.RPC.ExposedMeta.Set(e.id, e.id)
				if f, ok := st.RPC.InternalFiles.Get(e.id); ok {
					st.RPC.ExposedFiles.Set(e.id, f)
				}
			}
			if g.unversioned != "" {
				st.RPC.ExposedMeta.Set(latestId, latestId)
				if f, ok := st.RPC.InternalFiles.Get(latestId); ok {
					st.RPC.ExposedFiles.Set(latestId, f)
				}
			}
		}
		for _, e := range g.explicit {
			st.RPC.InvokedFunctions.Add(e.id)
		}
	}
}

// updateWiringReferences rewrites the wirings already typed in Go. Channels,
// CLI, scheduled tasks, triggers and MCP are still Raw sections; port their
// rewrite together with their visitor group.
func (s *Context) updateWiringReferences(oldId, newId string) {
	s.State.HTTP.Meta.Each(func(_ string, routes *state.Record[*HTTPRouteMeta]) {
		routes.Each(func(_ string, r *HTTPRouteMeta) {
			if r.PikkuFuncId == oldId {
				r.PikkuFuncId = newId
			}
		})
	})
	s.State.QueueWorkers.Meta.Each(func(_ string, q *QueueWorkerMeta) {
		if q.PikkuFuncId == oldId {
			q.PikkuFuncId = newId
		}
	})
	s.updateChannelAndCLIReferences(oldId, newId)
}

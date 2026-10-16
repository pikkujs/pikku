package finalize

import (
	"strconv"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// annotateHttpRouteAuth (annotate-http-route-auth.ts), validateExposedFunctionsGated
// (validate-exposed-functions-gated.ts) and validateTagsResolveToMiddleware
// (validate-tags-resolve-to-middleware.ts).

// resolveFunctionMeta is resolve-function-meta.ts: local meta first, then
// addonFunctions[namespace][name] for a namespaced id.
func resolveFunctionMeta(st *state.State, id string) *state.FunctionMeta {
	if meta := st.Functions.Meta.At(id); meta != nil {
		return meta
	}
	sep := strings.Index(id, ":")
	if sep < 0 {
		return nil
	}
	if fns := st.AddonFunctions.At(id[:sep]); fns != nil {
		return fns.At(id[sep+1:])
	}
	return nil
}

func isFalsePtr(b *bool) bool { return b != nil && !*b }
func isTruePtr(b *bool) bool  { return b != nil && *b }

// packagesGatedByTheirAddon: packages whose wireAddon demands a session.
func packagesGatedByTheirAddon(st *state.State) map[string]bool {
	gated := map[string]bool{}
	for _, e := range addonDecls(st) {
		if e.decl.pkg() == "" {
			continue
		}
		if e.decl.gated() {
			gated[e.decl.pkg()] = true
		}
	}
	return gated
}

func annotateHTTPRouteAuth(st *state.State) {
	gated := packagesGatedByTheirAddon(st)
	st.HTTP.Meta.Each(func(_ string, routes *state.Record[*state.HTTPRouteMeta]) {
		if routes == nil {
			return
		}
		routes.Each(func(_ string, route *state.HTTPRouteMeta) {
			if route == nil {
				return
			}
			meta := resolveFunctionMeta(st, route.PikkuFuncId)
			requires := (meta != nil && (isFalsePtr(meta.Sessionless) || isTruePtr(meta.Auth) || len(meta.Scopes) > 0)) ||
				isTruePtr(route.Auth) ||
				(route.PackageName != "" && gated[route.PackageName])
			route.RequiresSession = &requires
		})
	})
}

// gatesItself is validate-exposed-functions-gated.ts gatesItself.
func gatesItself(meta *state.FunctionMeta) bool {
	return isFalsePtr(meta.Sessionless) ||
		isTruePtr(meta.ScenarioStep) ||
		isTruePtr(meta.PermissionsInBody) ||
		meta.Auth != nil ||
		len(meta.Scopes) > 0 ||
		len(meta.Permissions) > 0
}

func validateExposedFunctionsGated(log *diag.Logger, st *state.State) {
	var ungated []string
	// TS also skips a function whose meta.packageName names a gated addon;
	// local function meta never carries packageName (FunctionMeta has no such
	// field), so that branch cannot fire here.
	st.Functions.Meta.Each(func(name string, meta *state.FunctionMeta) {
		if meta == nil || !isTruePtr(meta.Expose) || gatesItself(meta) {
			return
		}
		ungated = append(ungated, name)
	})
	for _, e := range addonDecls(st) {
		if !isArray(e.decl.Expose) || isTrue(e.decl.Auth) || len(e.decl.Scopes) > 0 {
			continue
		}
		fns := st.AddonFunctions.At(e.namespace)
		for _, fn := range decode[[]string](state.Raw(e.decl.Expose)) {
			var meta *state.FunctionMeta
			if fns != nil {
				meta = fns.At(fn)
			}
			if meta == nil || gatesItself(meta) {
				continue
			}
			ungated = append(ungated, e.namespace+":"+fn)
		}
	}
	if len(ungated) == 0 {
		return
	}
	shown := ungated
	if len(shown) > 10 {
		shown = shown[:10]
	}
	rest := len(ungated) - len(shown)
	one := len(ungated) == 1
	pick := func(single, many string) string {
		if one {
			return single
		}
		return many
	}
	more := ""
	if rest > 0 {
		more = ", and " + strconv.Itoa(rest) + " more"
	}
	log.Diagnostic(diag.Warn, diag.ExposedFunctionHasNoGate,
		strconv.Itoa(len(ungated))+" exposed sessionless function"+pick("", "s")+" "+
			"carr"+pick("ies", "y")+" no permission and no addon gate, so "+
			pick("it is", "they are")+" reachable by anyone through "+
			"POST /rpc/:rpcName: "+strings.Join(shown, ", ")+more+
			". Add permissions to the function, set `auth: true` if a session is "+
			"required after all, gate the whole addon with "+
			"wireAddon({ auth: true }), drop `expose: true` if "+
			pick("it was", "they were")+" not meant to be callable from outside, "+
			"or set `auth: false` to declare "+pick("it", "them")+" public on purpose.")
}

func validateTagsResolveToMiddleware(log *diag.Logger, st *state.State) {
	registered := map[string]bool{}
	for _, k := range st.Middleware.TagMiddleware.Keys() {
		registered[k] = true
	}
	for _, k := range st.ChannelMiddleware.TagMiddleware.Keys() {
		registered[k] = true
	}
	for _, e := range addonDecls(st) {
		for _, tag := range e.decl.Tags {
			if registered[tag] {
				continue
			}
			log.Diagnostic(diag.Warn, diag.TagResolvesToNoMiddleware,
				"wireAddon('"+e.namespace+"') declares tag '"+tag+"', but no "+
					"addTagMiddleware('"+tag+"', …) registers anything for it. The tag "+
					"resolves to an empty middleware list, so it applies no gate to the "+
					"addon at all. Register middleware for it, or drop the tag if it is "+
					"only meant to group and document.")
		}
	}
}

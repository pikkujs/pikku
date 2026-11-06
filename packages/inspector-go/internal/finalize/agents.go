package finalize

import (
	"encoding/json"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Ports of the agent validators in utils/post-process.ts.

type agentMeta struct {
	Name       json.RawMessage `json:"name"`
	Model      json.RawMessage `json:"model"`
	SourceFile json.RawMessage `json:"sourceFile"`
	Tools      []string        `json:"tools"`
	Scorers    []string        `json:"scorers"`
}

// where is `agent.sourceFile ? ` (${agent.sourceFile})` : ”`.
func (a agentMeta) where() string {
	if !truthy(a.SourceFile) {
		return ""
	}
	return " (" + templateValue(a.SourceFile) + ")"
}

func validateAgentModels(log *diag.Logger, st *state.State, modelAliases map[string]string) {
	agents := rawRecord(st.Agents.AgentsMeta)
	agents.Each(func(_ string, r state.Raw) {
		meta := decode[agentMeta](r)
		name := templateValue(meta.Name)
		if !truthy(meta.Model) {
			log.Critical(diag.MissingModel, "AI agent '"+name+"' is missing the 'model' property.")
			return
		}
		model := templateValue(meta.Model)
		if _, isAlias := modelAliases[model]; strings.Contains(model, "/") || isAlias {
			return
		}
		known := make([]string, 0, len(modelAliases))
		for k := range modelAliases {
			known = append(known, k)
		}
		sort.Strings(known)
		tail := "No \"models\" aliases are configured."
		if len(known) > 0 {
			tail = "Known aliases: " + strings.Join(known, ", ") + "."
		}
		log.Critical(diag.InvalidModel, "AI agent '"+name+"' uses model '"+model+"', which is neither provider-qualified as '<provider>/<model>' (e.g. 'openai/gpt-4') nor an alias in the \"models\" table of pikku.config.json. "+tail)
	})
}

func validateAgentToolReferences(log *diag.Logger, st *state.State, opts Options) {
	if st.Agents.AgentsMeta.Len() == 0 {
		return
	}
	agents := rawRecord(st.Agents.AgentsMeta)
	agents.Each(func(agentKey string, r state.Raw) {
		agent := decode[agentMeta](r)
		where := agent.where()
		for _, tool := range agent.Tools {
			if strings.HasPrefix(tool, "workflow:") {
				continue
			}
			var meta *state.FunctionMeta
			if sep := strings.Index(tool, ":"); sep < 0 {
				funcID := tool
				if v, ok := st.RPC.InternalMeta.Get(tool); ok {
					funcID = v
				}
				meta = st.Functions.Meta.At(funcID)
				if meta == nil {
					log.Critical(diag.AgentToolNotFound, "AI agent '"+agentKey+"'"+where+" references tool '"+tool+"', which is not a function in this project.")
					continue
				}
			} else {
				namespace, funcName := tool[:sep], tool[sep+1:]
				addonRaw, ok := st.RPC.WireAddonDeclarations.Get(namespace)
				if !ok || !truthy(json.RawMessage(addonRaw)) {
					log.Critical(diag.AgentToolUnknownNamespace, "AI agent '"+agentKey+"'"+where+" references tool '"+tool+"', but no addon is wired under the namespace '"+namespace+"'. "+
						"Wired namespaces: "+orNone(st.RPC.WireAddonDeclarations.Keys())+".")
					continue
				}
				addonMeta, ok := st.AddonFunctions.Get(namespace)
				if !ok || addonMeta == nil {
					continue
				}
				meta = addonMeta.At(funcName)
				if meta == nil {
					log.Critical(diag.AgentToolNotFound, "AI agent '"+agentKey+"'"+where+" references tool '"+tool+"', but addon '"+namespace+"' ('"+jsString(decode[addonDecl](addonRaw).Package)+"') exposes no function '"+funcName+"'.")
					continue
				}
			}
			if opts.StrictMeta && (meta.Description == nil || *meta.Description == "") {
				titleNote := ""
				if meta.Title != nil && *meta.Title != "" {
					titleNote = " (a 'title' does not count — it labels the tool, it does not explain it)"
				}
				log.Critical(diag.AgentToolMissingDescription, "AI agent '"+agentKey+"'"+where+" uses tool '"+tool+"', which has no description. "+
					"An agent tool's description is what the model is told it does; without one it is offered the tool under its own name. "+
					"Add a 'description' to '"+tool+"'"+titleNote+".")
			}
		}
	})
}

// validatePermissionDataUsed is validatePermissionDataUsed: a warning, or a
// critical under strictMeta, for a pikkuPermission that never reads its data.
func validatePermissionDataUsed(log *diag.Logger, st *state.State, opts Options) {
	definitions := rawRecord(st.Permissions.Definitions)
	definitions.Each(func(id string, r state.Raw) {
		d := decode[definitionMeta](r)
		if !d.DataUnused {
			return
		}
		message := "Permission '" + id + "' in " + jsRelative(st.RootDir, d.SourceFile) + " never uses its data argument, so it depends on the session alone. " +
			"Use pikkuAuth: pikkuAuth(async (services, session) => ...), or pikkuAuth({ skipWithoutSession: true, func: async (services, session) => ... }) if a call with no session must go through."
		if opts.StrictMeta {
			log.Critical(diag.PermissionDataUnused, message)
		} else {
			log.Diagnostic(diag.Warn, diag.PermissionDataUnused, message)
		}
	})
}

// validateSessionlessPermissions is validateSessionlessPermissions: always a
// critical for a check with no skipWithoutSession on a sessionless function,
// directly or as a global permission.
func validateSessionlessPermissions(log *diag.Logger, st *state.State) {
	var sessionless []string
	usedBy := map[string][]string{}
	st.Functions.Meta.Each(func(funcID string, meta *state.FunctionMeta) {
		if meta == nil || !isTruePtr(meta.Sessionless) || isTruePtr(meta.Auth) {
			return
		}
		sessionless = append(sessionless, funcID)
		for _, permission := range meta.Permissions {
			if permission.Type == "wire" {
				usedBy[permission.Name] = append(usedBy[permission.Name], funcID)
			}
		}
	})
	globals := map[string]bool{}
	for _, g := range st.Permissions.Global {
		if g.TargetsPackage {
			continue
		}
		for _, id := range g.DefinitionIds {
			globals[id] = true
		}
	}

	definitions := rawRecord(st.Permissions.Definitions)
	definitions.Each(func(id string, r state.Raw) {
		d := decode[definitionMeta](r)
		if d.SkipWithoutSession {
			return
		}
		label, verb, reached := "Permission", "guards", usedBy[id]
		if globals[id] {
			label, verb, reached = "Global permission", "reaches", sessionless
		}
		if len(reached) == 0 {
			return
		}
		names := slices.Clone(reached)
		sort.Strings(names)
		shown, more := names, ""
		if len(names) > 10 {
			shown = names[:10]
			more = ", and " + strconv.Itoa(len(names)-10) + " more"
		}
		plural := "s"
		if len(names) == 1 {
			plural = ""
		}
		log.Critical(diag.PermissionNeedsSkipWithoutSession, label+" '"+id+"' in "+jsRelative(st.RootDir, d.SourceFile)+" has no skipWithoutSession but "+verb+" sessionless function"+plural+" "+strings.Join(shown, ", ")+more+", so a call with no session is refused there. "+
			"Add skipWithoutSession: true to let that call through with the check skipped, or require a session with pikkuFunc or auth: true.")
	})
}

func validateAgentScorerReferences(log *diag.Logger, st *state.State) {
	known := st.Scorers.ScorersMeta.Keys()
	agents := rawRecord(st.Agents.AgentsMeta)
	agents.Each(func(agentKey string, r state.Raw) {
		agent := decode[agentMeta](r)
		for _, scorer := range agent.Scorers {
			if slices.Contains(known, scorer) {
				continue
			}
			log.Critical(diag.AgentScorerNotFound, "AI agent '"+agentKey+"'"+agent.where()+" asks to be graded by scorer '"+scorer+"', which is not declared in this project. "+
				"Declared scorers: "+orNone(known)+".")
		}
	})
}

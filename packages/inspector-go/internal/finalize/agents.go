package finalize

import (
	"encoding/json"
	"slices"
	"sort"
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

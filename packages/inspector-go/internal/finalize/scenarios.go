package finalize

import (
	"encoding/json"
	"regexp"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Ports of the scenario validators in utils/post-process.ts.

// dynamicScenarioStepTarget is inspector-constants.ts DYNAMIC_SCENARIO_STEP_TARGET.
const dynamicScenarioStepTarget = "<dynamic>"

type workflowMeta struct {
	PikkuFuncId string          `json:"pikkuFuncId"`
	Scenario    json.RawMessage `json:"scenario"`
	Asserts     json.RawMessage `json:"asserts"`
	Steps       []stepMeta      `json:"steps"`
}

// stepMeta is the part of a WorkflowStepMeta the scenario walk reads.
type stepMeta struct {
	Type        string          `json:"type"`
	Phase       string          `json:"phase"`
	StepFunc    string          `json:"stepFunc"`
	StepName    json.RawMessage `json:"stepName"`
	VirtualUser *string         `json:"virtualUser"`
	Options     *struct {
		Description json.RawMessage `json:"description"`
	} `json:"options"`
	Branches []struct {
		Steps []stepMeta `json:"steps"`
	} `json:"branches"`
	ElseSteps []stepMeta `json:"elseSteps"`
	Cases     []struct {
		Steps []stepMeta `json:"steps"`
	} `json:"cases"`
	DefaultSteps []stepMeta `json:"defaultSteps"`
	Body         []stepMeta `json:"body"`
	Children     []stepMeta `json:"children"`
}

func validateScenarioServices(log *diag.Logger, st *state.State) {
	st.Workflows.Meta.Each(func(name string, r state.Raw) {
		meta := decode[workflowMeta](r)
		if !truthy(meta.Scenario) {
			return
		}
		fn, ok := st.Functions.Meta.Get(meta.PikkuFuncId)
		if !ok || fn == nil {
			return
		}
		var disallowed []string
		for _, svc := range fn.Services.Services {
			if svc != "logger" && svc != "config" {
				disallowed = append(disallowed, svc)
			}
		}
		if len(disallowed) > 0 {
			log.Critical(diag.ScenarioHasServices,
				"Scenario '"+name+"' destructures services: "+strings.Join(disallowed, ", ")+". "+
					"Scenarios may only use 'logger'/'config' — drive everything else through "+
					"virtualUser steps (workflow.do(step, rpc, data, { virtualUser: virtualUsers.x })) so the flow "+
					"runs against the target environment.")
		}
	})
}

// jsWhitespace is the character class of a JavaScript `\s`.
const jsWhitespace = `\t\n\v\f\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

// proseOpensWithVirtualUser is post-process.ts proseOpensWithVirtualUser.
func proseOpensWithVirtualUser(prose, virtualUser string) bool {
	if virtualUser == "" {
		return false
	}
	re, err := regexp.Compile(`(?i)^["'“‘` + jsWhitespace + `]*` + regexp.QuoteMeta(virtualUser) + `(?:['’]s)?\b`)
	if err != nil {
		return false
	}
	return re.MatchString(prose)
}

// renderableProse is post-process.ts renderableProse.
func renderableProse(step stepMeta, fn *state.FunctionMeta) []string {
	stepName := templateValue(step.StepName)
	if step.Options != nil && truthy(step.Options.Description) {
		return []string{stepName, templateValue(step.Options.Description)}
	}
	var out []string
	if s, ok := stringValue(step.StepName); ok {
		out = append(out, s)
	}
	if fn != nil {
		if fn.ScenarioStepTemplate != "" {
			out = append(out, fn.ScenarioStepTemplate)
		}
		if fn.Description != nil {
			out = append(out, *fn.Description)
		}
	}
	return out
}

func capitaliseFirst(s string) string {
	r, size := utf8.DecodeRuneInString(s)
	if r == utf8.RuneError {
		return s
	}
	return string(unicode.ToUpper(r)) + s[size:]
}

func validateStepProse(log *diag.Logger, workflowName string, step stepMeta, fn *state.FunctionMeta) {
	if step.VirtualUser == nil || *step.VirtualUser == "" {
		return
	}
	vu := *step.VirtualUser
	idx := slices.IndexFunc(renderableProse(step, fn), func(p string) bool { return proseOpensWithVirtualUser(p, vu) })
	if idx < 0 {
		return
	}
	offender := renderableProse(step, fn)[idx]
	log.Critical(diag.ScenarioStepProseNamesVirtualUser,
		"Scenario '"+workflowName+"' names its virtual user in the step prose: '"+offender+"' runs as '"+vu+"'. "+
			"The reporter already renders the virtual user as the subject, so this reads "+
			"\""+capitaliseFirst(step.Phase)+" "+vu+" "+offender+"\". Drop the name and let "+
			"{ virtualUser: virtualUsers."+vu+" } supply it — the step reads as a bare third-person predicate.")
}

func validateScenarioSteps(log *diag.Logger, st *state.State) {
	var phases orderedSet
	var visit func(workflowName string, steps []stepMeta)
	visit = func(workflowName string, steps []stepMeta) {
		for _, step := range steps {
			switch step.Type {
			case "scenarioStep":
				phases.add(step.Phase)
				if step.StepFunc == dynamicScenarioStepTarget {
					log.Critical(diag.ScenarioStepTargetNotStatic,
						"Scenario '"+workflowName+"' calls step '"+templateValue(step.StepName)+"' with a target that isn't a string literal. "+
							"A step target must be statically resolvable so it can be bundled, typed and drawn — "+
							"loop over data sets instead of computing the step name.")
					continue
				}
				st.ServiceAggregation.UsedFunctions.Add(step.StepFunc)
				fn := st.Functions.Meta.At(step.StepFunc)
				validateStepProse(log, workflowName, step, fn)
				if fn != nil && fn.ScenarioStepRequiresVirtualUser != nil && *fn.ScenarioStepRequiresVirtualUser &&
					(step.VirtualUser == nil || *step.VirtualUser == "") {
					why := "is driven by a virtual user"
					if slices.Contains(fn.ScenarioStepSurfaces, "browser") {
						why = "declares a browser binding"
					}
					log.Critical(diag.ScenarioStepNeedsVirtualUser,
						"Scenario '"+workflowName+"' calls step '"+step.StepFunc+"', which "+why+", without a virtual user. "+
							"Pass { virtualUser: virtualUsers.<name> } so it runs as that virtual user.")
				}
			case "branch":
				for _, b := range step.Branches {
					visit(workflowName, b.Steps)
				}
				if step.ElseSteps != nil {
					visit(workflowName, step.ElseSteps)
				}
			case "switch":
				for _, c := range step.Cases {
					visit(workflowName, c.Steps)
				}
				if step.DefaultSteps != nil {
					visit(workflowName, step.DefaultSteps)
				}
			case "fanout":
				visit(workflowName, step.Body)
			case "parallel":
				visit(workflowName, step.Children)
			}
		}
	}

	st.Workflows.Meta.Each(func(name string, r state.Raw) {
		meta := decode[workflowMeta](r)
		phases = orderedSet{}
		visit(name, meta.Steps)
		if len(phases.items) > 0 && !phases.has("then") && !truthy(meta.Asserts) {
			log.Critical(diag.ScenarioHasNoAssertion,
				"Scenario '"+name+"' has "+strings.Join(phases.items, "/")+" steps but never asserts. "+
					"Add a scenario.then(...) naming what the virtual user should now see — a flow with no 'then' "+
					"only proves nothing threw, and contributes nothing to witness coverage.")
		}
	})
}

type featureFile struct {
	ExportedName   string   `json:"exportedName"`
	Mentions       []string `json:"mentions"`
	UnnamedEntries int      `json:"unnamedEntries"`
}

func validateScenarioFeatures(log *diag.Logger, st *state.State) {
	var features []featureFile
	owned := map[string]bool{}
	st.Workflows.FeatureFiles.Each(func(_ string, r state.Raw) {
		f := decode[featureFile](r)
		features = append(features, f)
		for _, m := range f.Mentions {
			owned[m] = true
		}
	})

	var unowned []string
	st.Workflows.Meta.Each(func(name string, r state.Raw) {
		if !truthy(decode[workflowMeta](r).Scenario) {
			return
		}
		exported := ""
		if f, ok := st.Workflows.Files.Get(name); ok {
			exported = f.ExportedName
		}
		if owned[name] || (exported != "" && owned[exported]) {
			return
		}
		unowned = append(unowned, name)
	})
	if len(unowned) == 0 {
		return
	}

	var unreadable []string
	for _, f := range features {
		if f.UnnamedEntries > 0 {
			unreadable = append(unreadable, f.ExportedName)
		}
	}
	if len(unreadable) > 0 {
		log.Diagnostic(diag.Warn, diag.ScenarioHasNoFeature,
			strings.Join(quoteEach(unowned), ", ")+" appear in no feature's `scenarios` array, "+
				"but "+strings.Join(quoteEach(unreadable), ", ")+" build theirs with a spread or a call, so one of them may still be listed there. "+
				"List those scenarios literally and this becomes a definite answer either way.")
		return
	}
	for _, name := range unowned {
		log.Diagnostic(diag.Error, diag.ScenarioHasNoFeature,
			"Scenario '"+name+"' is listed by no pikkuFeature, so nothing downstream can reach it — "+
				"a run stamps no feature onto its results, the console groups it under none, and a guide cannot cite it. "+
				"Add it to a feature's `scenarios` array.")
	}
}

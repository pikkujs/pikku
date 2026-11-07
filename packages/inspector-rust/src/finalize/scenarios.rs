//! Port of Go `finalize/scenarios.go`: the scenario validators of
//! utils/post-process.ts.

use std::collections::HashSet;

use super::jsval::{OrderedSet, V};
use super::utils::quote_each;
use super::jv;
use crate::diag::{codes, Level, Logger};
use crate::state::{FunctionMeta, State};

/// inspector-constants.ts DYNAMIC_SCENARIO_STEP_TARGET.
const DYNAMIC_SCENARIO_STEP_TARGET: &str = "<dynamic>";

fn s(v: &V) -> String {
    v.as_str().unwrap_or("").to_string()
}

pub fn validate_scenario_services(log: &mut Logger, st: &State) {
    for (name, r) in st.workflows.meta.iter() {
        let meta = jv(r);
        if !meta.get("scenario").truthy() {
            continue;
        }
        let Some(func) = st.functions.meta.get(&s(&meta.get("pikkuFuncId"))) else { continue };
        let disallowed: Vec<&str> = func.services.services.iter().map(String::as_str).filter(|s| *s != "logger" && *s != "config").collect();
        if !disallowed.is_empty() {
            log.critical(
                codes::SCENARIO_HAS_SERVICES,
                format!(
                    "Scenario '{name}' destructures services: {}. Scenarios may only use 'logger'/'config' \u{2014} drive everything else through virtualUser steps (workflow.do(step, rpc, data, {{ virtualUser: virtualUsers.x }})) so the flow runs against the target environment.",
                    disallowed.join(", ")
                ),
            );
        }
    }
}

fn is_js_whitespace(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
        || ('\u{2000}'..='\u{200a}').contains(&c)
}

fn is_lead(c: char) -> bool {
    matches!(c, '"' | '\'' | '\u{201c}' | '\u{2018}') || is_js_whitespace(c)
}

fn fold_eq(a: char, b: char) -> bool {
    a == b || a.to_lowercase().eq(b.to_lowercase()) || a.to_uppercase().eq(b.to_uppercase())
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// post-process.ts proseOpensWithVirtualUser:
/// `^["'“‘\s]*<virtualUser>(?:['’]s)?\b`, case-insensitive.
pub fn prose_opens_with_virtual_user(prose: &str, virtual_user: &str) -> bool {
    if virtual_user.is_empty() {
        return false;
    }
    let text: Vec<char> = prose.chars().collect();
    let vu: Vec<char> = virtual_user.chars().collect();
    let mut max = 0;
    while max < text.len() && is_lead(text[max]) {
        max += 1;
    }
    // The greedy star gives characters back until the rest matches.
    for start in (0..=max).rev() {
        let end = start + vu.len();
        if end > text.len() || !vu.iter().zip(&text[start..end]).all(|(a, b)| fold_eq(*a, *b)) {
            continue;
        }
        let boundary = |at: usize| -> bool {
            let prev = at.checked_sub(1).map(|i| is_word(text[i])).unwrap_or(false);
            let next = text.get(at).map(|c| is_word(*c)).unwrap_or(false);
            prev != next
        };
        if end + 1 < text.len() && matches!(text[end], '\'' | '\u{2019}') && fold_eq(text[end + 1], 's') && boundary(end + 2) {
            return true;
        }
        if boundary(end) {
            return true;
        }
    }
    false
}

fn renderable_prose(step: &V, func: Option<&FunctionMeta>) -> Vec<String> {
    let step_name_v = step.get("stepName");
    let step_name = step_name_v.template_string();
    let options = step.get("options");
    if options.is_obj() && options.get("description").truthy() {
        return vec![step_name, options.get("description").template_string()];
    }
    let mut out = Vec::new();
    if let Some(sn) = step_name_v.as_str() {
        out.push(sn.to_string());
    }
    if let Some(f) = func {
        if !f.scenario_step_template.is_empty() {
            out.push(f.scenario_step_template.clone());
        }
        if let Some(d) = &f.description {
            out.push(d.clone());
        }
    }
    out
}

fn capitalise_first(s: &str) -> String {
    let mut it = s.chars();
    match it.next() {
        None => s.to_string(),
        Some(c) => {
            let mut up = c.to_uppercase();
            let u = if up.len() == 1 { up.next().unwrap() } else { c };
            format!("{u}{}", it.as_str())
        }
    }
}

fn validate_step_prose(log: &mut Logger, workflow_name: &str, step: &V, func: Option<&FunctionMeta>) {
    let vu = step.get("virtualUser");
    let Some(vu) = vu.as_str().filter(|v| !v.is_empty()) else { return };
    let prose = renderable_prose(step, func);
    let Some(offender) = prose.iter().find(|p| prose_opens_with_virtual_user(p, vu)) else { return };
    log.critical(
        codes::SCENARIO_STEP_PROSE_NAMES_VIRTUAL_USER,
        format!(
            "Scenario '{workflow_name}' names its virtual user in the step prose: '{offender}' runs as '{vu}'. The reporter already renders the virtual user as the subject, so this reads \"{} {vu} {offender}\". Drop the name and let {{ virtualUser: virtualUsers.{vu} }} supply it \u{2014} the step reads as a bare third-person predicate.",
            capitalise_first(&s(&step.get("phase")))
        ),
    );
}

fn visit_steps(log: &mut Logger, st: &mut State, phases: &mut OrderedSet, workflow_name: &str, steps: &V) {
    for step in steps.items() {
        match s(&step.get("type")).as_str() {
            "scenarioStep" => {
                phases.add(s(&step.get("phase")));
                let step_func = s(&step.get("stepFunc"));
                if step_func == DYNAMIC_SCENARIO_STEP_TARGET {
                    log.critical(
                        codes::SCENARIO_STEP_TARGET_NOT_STATIC,
                        format!(
                            "Scenario '{workflow_name}' calls step '{}' with a target that isn't a string literal. A step target must be statically resolvable so it can be bundled, typed and drawn \u{2014} loop over data sets instead of computing the step name.",
                            step.get("stepName").template_string()
                        ),
                    );
                    continue;
                }
                st.service_aggregation.used_functions.add(step_func.clone());
                let func = st.functions.meta.get(&step_func);
                validate_step_prose(log, workflow_name, &step, func);
                if let Some(f) = func {
                    let has_vu = step.get("virtualUser").as_str().is_some_and(|v| !v.is_empty());
                    if f.scenario_step_requires_virtual_user == Some(true) && !has_vu {
                        let why = if f.scenario_step_surfaces.iter().any(|x| x == "browser") {
                            "declares a browser binding"
                        } else {
                            "is driven by a virtual user"
                        };
                        log.critical(
                            codes::SCENARIO_STEP_NEEDS_VIRTUAL_USER,
                            format!(
                                "Scenario '{workflow_name}' calls step '{step_func}', which {why}, without a virtual user. Pass {{ virtualUser: virtualUsers.<name> }} so it runs as that virtual user."
                            ),
                        );
                    }
                }
            }
            "branch" => {
                for b in step.get("branches").items() {
                    visit_steps(log, st, phases, workflow_name, &b.get("steps"));
                }
                visit_steps(log, st, phases, workflow_name, &step.get("elseSteps"));
            }
            "switch" => {
                for c in step.get("cases").items() {
                    visit_steps(log, st, phases, workflow_name, &c.get("steps"));
                }
                visit_steps(log, st, phases, workflow_name, &step.get("defaultSteps"));
            }
            "fanout" => visit_steps(log, st, phases, workflow_name, &step.get("body")),
            "parallel" => visit_steps(log, st, phases, workflow_name, &step.get("children")),
            _ => {}
        }
    }
}

pub fn validate_scenario_steps(log: &mut Logger, st: &mut State) {
    let workflows: Vec<(String, V)> = st.workflows.meta.iter().map(|(k, r)| (k.to_string(), jv(r))).collect();
    for (name, meta) in workflows {
        let mut phases = OrderedSet::default();
        visit_steps(log, st, &mut phases, &name, &meta.get("steps"));
        if !phases.items.is_empty() && !phases.has("then") && !meta.get("asserts").truthy() {
            log.critical(
                codes::SCENARIO_HAS_NO_ASSERTION,
                format!(
                    "Scenario '{name}' has {} steps but never asserts. Add a scenario.then(...) naming what the virtual user should now see \u{2014} a flow with no 'then' only proves nothing threw, and contributes nothing to witness coverage.",
                    phases.items.join("/")
                ),
            );
        }
    }
}

pub fn validate_scenario_features(log: &mut Logger, st: &State) {
    let mut features: Vec<V> = Vec::new();
    let mut owned: HashSet<String> = HashSet::new();
    for (_, r) in st.workflows.feature_files.iter() {
        let f = jv(r);
        for m in f.get("mentions").items() {
            if let Some(m) = m.as_str() {
                owned.insert(m.to_string());
            }
        }
        features.push(f);
    }

    let mut unowned: Vec<String> = Vec::new();
    for (name, r) in st.workflows.meta.iter() {
        if !jv(r).get("scenario").truthy() {
            continue;
        }
        let exported = st.workflows.files.get(name).map(|f| f.exported_name.clone()).unwrap_or_default();
        if owned.contains(name) || (!exported.is_empty() && owned.contains(&exported)) {
            continue;
        }
        unowned.push(name.to_string());
    }
    if unowned.is_empty() {
        return;
    }

    let unreadable: Vec<String> = features
        .iter()
        .filter(|f| f.get("unnamedEntries").as_f64().is_some_and(|n| n > 0.0))
        .map(|f| s(&f.get("exportedName")))
        .collect();
    if !unreadable.is_empty() {
        log.diagnostic(
            Level::Warn,
            codes::SCENARIO_HAS_NO_FEATURE,
            format!(
                "{} appear in no feature's `scenarios` array, but {} build theirs with a spread or a call, so one of them may still be listed there. List those scenarios literally and this becomes a definite answer either way.",
                quote_each(&unowned).join(", "),
                quote_each(&unreadable).join(", ")
            ),
        );
        return;
    }
    for name in unowned {
        log.diagnostic(
            Level::Error,
            codes::SCENARIO_HAS_NO_FEATURE,
            format!(
                "Scenario '{name}' is listed by no pikkuFeature, so nothing downstream can reach it \u{2014} a run stamps no feature onto its results, the console groups it under none, and a guide cannot cite it. Add it to a feature's `scenarios` array."
            ),
        );
    }
}

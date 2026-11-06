//! Port of Go `finalize/agents.go`: the agent validators of
//! utils/post-process.ts.

use super::jsval::V;
use super::utils::or_none;
use super::jv;
use super::Options;
use crate::diag::{codes, Logger};
use crate::state::State;

fn where_(agent: &V) -> String {
    let sf = agent.get("sourceFile");
    if sf.truthy() { format!(" ({})", sf.template_string()) } else { String::new() }
}

fn strings(v: &V) -> Vec<String> {
    v.items().iter().filter_map(|x| x.as_str().map(String::from)).collect()
}

pub fn validate_agent_models(log: &mut Logger, st: &State, model_aliases: &std::collections::BTreeMap<String, String>) {
    for (_, r) in st.agents.agents_meta.iter() {
        let meta = jv(r);
        let name = meta.get("name").template_string();
        if !meta.get("model").truthy() {
            log.critical(codes::MISSING_MODEL, format!("AI agent '{name}' is missing the 'model' property."));
            continue;
        }
        let model = meta.get("model").template_string();
        if model.contains('/') || model_aliases.contains_key(&model) {
            continue;
        }
        let known: Vec<&String> = model_aliases.keys().collect();
        let tail = if known.is_empty() {
            "No \"models\" aliases are configured.".to_string()
        } else {
            format!("Known aliases: {}.", known.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", "))
        };
        log.critical(
            codes::INVALID_MODEL,
            format!(
                "AI agent '{name}' uses model '{model}', which is neither provider-qualified as '<provider>/<model>' (e.g. 'openai/gpt-4') nor an alias in the \"models\" table of pikku.config.json. {tail}"
            ),
        );
    }
}

pub fn validate_agent_tool_references(log: &mut Logger, st: &State, opts: &Options) {
    if st.agents.agents_meta.len() == 0 {
        return;
    }
    for (agent_key, r) in st.agents.agents_meta.iter() {
        let agent = jv(r);
        let where_ = where_(&agent);
        for tool in strings(&agent.get("tools")) {
            if tool.starts_with("workflow:") {
                continue;
            }
            let meta;
            if let Some(sep) = tool.find(':') {
                let (namespace, func_name) = (&tool[..sep], &tool[sep + 1..]);
                let addon = st.rpc.wire_addon_declarations.get(namespace).map(jv);
                let Some(addon) = addon.filter(|a| a.truthy()) else {
                    log.critical(
                        codes::AGENT_TOOL_UNKNOWN_NAMESPACE,
                        format!(
                            "AI agent '{agent_key}'{where_} references tool '{tool}', but no addon is wired under the namespace '{namespace}'. Wired namespaces: {}.",
                            or_none(&st.rpc.wire_addon_declarations.keys().map(String::from).collect::<Vec<_>>())
                        ),
                    );
                    continue;
                };
                let Some(addon_meta) = st.addon_functions.get(namespace) else { continue };
                match addon_meta.get(func_name) {
                    Some(m) => meta = m,
                    None => {
                        log.critical(
                            codes::AGENT_TOOL_NOT_FOUND,
                            format!(
                                "AI agent '{agent_key}'{where_} references tool '{tool}', but addon '{namespace}' ('{}') exposes no function '{func_name}'.",
                                addon.get("package").as_str().map(String::from).unwrap_or_else(|| "undefined".into())
                            ),
                        );
                        continue;
                    }
                }
            } else {
                let func_id = st.rpc.internal_meta.get(&tool).cloned().unwrap_or_else(|| tool.clone());
                match st.functions.meta.get(&func_id) {
                    Some(m) => meta = m,
                    None => {
                        log.critical(
                            codes::AGENT_TOOL_NOT_FOUND,
                            format!("AI agent '{agent_key}'{where_} references tool '{tool}', which is not a function in this project."),
                        );
                        continue;
                    }
                }
            }
            if opts.strict_meta && meta.description.as_deref().map_or(true, str::is_empty) {
                let title_note = if meta.title.as_deref().is_some_and(|t| !t.is_empty()) {
                    " (a 'title' does not count \u{2014} it labels the tool, it does not explain it)"
                } else {
                    ""
                };
                log.critical(
                    codes::AGENT_TOOL_MISSING_DESCRIPTION,
                    format!(
                        "AI agent '{agent_key}'{where_} uses tool '{tool}', which has no description. An agent tool's description is what the model is told it does; without one it is offered the tool under its own name. Add a 'description' to '{tool}'{title_note}."
                    ),
                );
            }
        }
    }
}

pub fn validate_agent_scorer_references(log: &mut Logger, st: &State) {
    let known: Vec<String> = st.scorers.scorers_meta.keys().into_iter().map(String::from).collect();
    for (agent_key, r) in st.agents.agents_meta.iter() {
        let agent = jv(r);
        for scorer in strings(&agent.get("scorers")) {
            if known.contains(&scorer) {
                continue;
            }
            log.critical(
                codes::AGENT_SCORER_NOT_FOUND,
                format!(
                    "AI agent '{agent_key}'{} asks to be graded by scorer '{scorer}', which is not declared in this project. Declared scorers: {}.",
                    where_(&agent),
                    or_none(&known)
                ),
            );
        }
    }
}

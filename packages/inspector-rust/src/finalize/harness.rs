//! Port of Go `finalize/harness.go`.

use std::collections::BTreeSet;

use super::utils::{js_relative, or_none};
use crate::diag::{Logger, codes};
use crate::state::State;

/// Refuses a harness that lists a gate no pikkuHarnessGate or
/// pikkuHarnessGateAgent in the project declares.
pub fn validate_harness_gate_references(log: &mut Logger, st: &State) {
    let Some(harness) = &st.harness else { return };
    let mut known: BTreeSet<String> = st
        .functions
        .meta
        .iter()
        .filter(|(_, meta)| meta.harness == Some(true))
        .map(|(id, _)| id.to_string())
        .collect();
    known.extend(harness.gate_agents_meta.keys().into_iter().map(String::from));
    let declared: Vec<String> = known.iter().cloned().collect();
    for (name, h) in harness.harnesses_meta.iter() {
        for gate in &h.gates {
            if known.contains(&gate.name) {
                continue;
            }
            log.critical(
                codes::HARNESS_GATE_NOT_FOUND,
                format!(
                    "Harness '{name}' ({}) lists gate '{}', which is not declared in this project. Declared gates: {}.",
                    js_relative(&st.root_dir, &h.source_file),
                    gate.name,
                    or_none(&declared)
                ),
            );
        }
    }
}

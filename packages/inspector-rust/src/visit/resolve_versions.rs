//! Port of Go `visit/resolve_versions.go`: utils/resolve-versions.ts.

use std::collections::HashMap;

use super::Context;
use crate::diag::codes;
use crate::state::{FunctionMeta, Record};
use crate::tsutil;

/// `ParseVersionedId` is parseVersionedId from @pikku/core: `"name@v3"` ->
/// `("name", 3)`; no separator, or a suffix that is not an integer >= 1, gives
/// version -1.
pub fn parse_versioned_id(id: &str) -> (&str, i64) {
    let Some(idx) = id.rfind("@v") else { return (id, -1) };
    // Go: strconv.ParseFloat(strings.TrimSpace(...)).
    let f: f64 = match id[idx + 2..].trim().parse() {
        Ok(f) => f,
        Err(_) => return (id, -1),
    };
    if f < 1.0 || f != f.trunc() {
        return (id, -1);
    }
    (&id[..idx], f as i64)
}

pub fn are_compatible_function_ids(existing: &str, incoming: &str) -> bool {
    if existing == incoming {
        return true;
    }
    parse_versioned_id(existing).0 == parse_versioned_id(incoming).0
}

#[derive(Clone)]
struct Explicit {
    id: String,
    version: i64,
}

#[derive(Default)]
struct Group {
    explicit: Vec<Explicit>,
    unversioned: String,
}

impl Context<'_> {
    /// `ResolveLatestVersions` ports utils/resolve-versions.ts.
    pub fn resolve_latest_versions(&mut self) {
        let mut order: Vec<String> = Vec::new();
        let mut groups: HashMap<String, Group> = HashMap::new();
        for (id, m) in self.state.functions.meta.iter() {
            let (base, version) = parse_versioned_id(id);
            let g = groups.entry(base.to_string()).or_insert_with(|| {
                order.push(base.to_string());
                Group::default()
            });
            if version >= 0 {
                g.explicit.push(Explicit { id: id.to_string(), version });
            } else if let Some(v) = m.version {
                g.explicit.push(Explicit { id: id.to_string(), version: v });
            } else {
                g.unversioned = id.to_string();
            }
        }

        for base in &order {
            let g = &groups[base];
            if g.explicit.is_empty() {
                continue;
            }
            let mut seen: HashMap<i64, String> = HashMap::new();
            for e in &g.explicit {
                if let Some(existing) = seen.get(&e.version) {
                    self.log.critical(
                        codes::DUPLICATE_FUNCTION_VERSION,
                        format!("Duplicate version {} for function '{}': '{}' and '{}'.", e.version, base, existing, e.id),
                    );
                }
                seen.insert(e.version, e.id.clone());
            }
            let mut max_version = g.explicit[0].version;
            let mut latest = g.explicit[0].clone();
            for e in &g.explicit[1..] {
                if e.version > max_version {
                    max_version = e.version;
                }
                if !(latest.version > e.version) {
                    latest = e.clone();
                }
            }

            if !g.unversioned.is_empty() {
                let v = max_version + 1;
                let old_id = g.unversioned.clone();
                let new_id = tsutil::format_versioned_id(base, v);
                let st = &mut *self.state;
                let mut m = st.functions.meta.delete(&old_id).expect("grouped from meta");
                m.pikku_func_id = new_id.clone();
                m.version = Some(v);
                st.functions.meta.set(new_id.clone(), m);
                if let Some(f) = st.functions.files.delete(&old_id) {
                    st.functions.files.set(new_id.clone(), f);
                }
                if let Some(f) = st.rpc.internal_files.delete(&old_id) {
                    st.rpc.internal_files.set(new_id.clone(), f);
                }
                if st.rpc.invoked_functions.has(&old_id) {
                    st.rpc.invoked_functions.delete(&old_id);
                    st.rpc.invoked_functions.add(new_id.clone());
                }
                if st.service_aggregation.used_functions.has(&old_id) {
                    st.service_aggregation.used_functions.delete(&old_id);
                    st.service_aggregation.used_functions.add(new_id.clone());
                }
                st.rpc.internal_meta.set(base.clone(), new_id.clone());
                st.rpc.internal_meta.set(new_id.clone(), new_id.clone());
                if st.rpc.exposed_meta.get(base).map(String::as_str) == Some(old_id.as_str()) {
                    st.rpc.exposed_meta.set(base.clone(), new_id.clone());
                }
                self.update_wiring_references(&old_id, &new_id);
            } else {
                self.state.rpc.internal_meta.set(base.clone(), latest.id.clone());
            }

            let st = &mut *self.state;
            if st.rpc.exposed_meta.get(base).is_some_and(|s| !s.is_empty()) {
                let latest_id = st.rpc.internal_meta.get(base).cloned().unwrap_or_default();
                st.rpc.exposed_meta.set(base.clone(), latest_id.clone());
                for e in &g.explicit {
                    st.rpc.exposed_meta.set(e.id.clone(), e.id.clone());
                    if let Some(f) = st.rpc.internal_files.get(&e.id).cloned() {
                        st.rpc.exposed_files.set(e.id.clone(), f);
                    }
                }
                if !g.unversioned.is_empty() {
                    st.rpc.exposed_meta.set(latest_id.clone(), latest_id.clone());
                    if let Some(f) = st.rpc.internal_files.get(&latest_id).cloned() {
                        st.rpc.exposed_files.set(latest_id.clone(), f);
                    }
                }
            }
            // A remote caller names a version the same way: base is the latest
            // remote version, and every remote id stays callable by its own name.
            let mut candidates: Vec<Explicit> = g.explicit.clone();
            if !g.unversioned.is_empty() {
                candidates.push(Explicit {
                    id: st.rpc.internal_meta.get(base).cloned().unwrap_or_default(),
                    version: max_version + 1,
                });
            }
            let remote: Vec<Explicit> = candidates
                .into_iter()
                .filter(|e| st.functions.meta.get(&e.id).is_some_and(|m: &FunctionMeta| m.remote == Some(true)))
                .collect();
            if !remote.is_empty() {
                let mut latest_remote = remote[0].clone();
                for e in &remote[1..] {
                    if !(latest_remote.version > e.version) {
                        latest_remote = e.clone();
                    }
                }
                st.rpc.remote_meta.set(base.clone(), latest_remote.id.clone());
                for e in &remote {
                    st.rpc.remote_meta.set(e.id.clone(), e.id.clone());
                    if let Some(f) = st.rpc.internal_files.get(&e.id).cloned() {
                        st.rpc.remote_files.set(e.id.clone(), f);
                    }
                }
            }
            for e in &g.explicit {
                st.rpc.invoked_functions.add(e.id.clone());
            }
        }
    }

    /// `updateWiringReferences` rewrites the wirings already typed in Go.
    /// Channels, CLI, scheduled tasks and triggers are still Raw sections; port
    /// their rewrite together with their visitor group.
    fn update_wiring_references(&mut self, old_id: &str, new_id: &str) {
        let st = &mut *self.state;
        let method_keys: Vec<String> = st.http.meta.keys().iter().map(|s| s.to_string()).collect();
        for k in method_keys {
            let routes: &mut Record<_> = st.http.meta.get_mut(&k).unwrap();
            for r in routes.values_mut() {
                if r.pikku_func_id == old_id {
                    r.pikku_func_id = new_id.to_string();
                }
            }
        }
        for q in st.queue_workers.meta.values_mut() {
            if q.pikku_func_id == old_id {
                q.pikku_func_id = new_id.to_string();
            }
        }
        for r in st.mcp_endpoints.resources_meta.values_mut() {
            if r.pikku_func_id == old_id {
                r.pikku_func_id = new_id.to_string();
            }
        }
        for t in st.mcp_endpoints.tools_meta.values_mut() {
            if t.pikku_func_id == old_id {
                t.fields.pikku_func_id = new_id.to_string();
            }
        }
        for p in st.mcp_endpoints.prompts_meta.values_mut() {
            if p.pikku_func_id == old_id {
                p.pikku_func_id = new_id.to_string();
            }
        }
        self.update_channel_and_cli_references(old_id, new_id);
    }

    /// Go `updateChannelAndCLIReferences` (group_channel.go / group_cli.go).
    ///
    /// STUB until the channel and CLI groups are ported (their porters own it).
    pub fn update_channel_and_cli_references(&mut self, _old_id: &str, _new_id: &str) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_versioned_ids() {
        assert_eq!(parse_versioned_id("todos@v3"), ("todos", 3));
        assert_eq!(parse_versioned_id("todos"), ("todos", -1));
        assert_eq!(parse_versioned_id("todos@v0"), ("todos@v0", -1));
        assert_eq!(parse_versioned_id("todos@v1.5"), ("todos@v1.5", -1));
        assert_eq!(parse_versioned_id("a@vb@v2"), ("a@vb", 2));
        assert_eq!(parse_versioned_id("x@v 4 "), ("x", 4));
    }

    #[test]
    fn compatible_ids_share_a_base() {
        assert!(are_compatible_function_ids("a@v1", "a@v2"));
        assert!(are_compatible_function_ids("a", "a"));
        assert!(are_compatible_function_ids("a", "a@v3"));
        assert!(!are_compatible_function_ids("a", "b"));
    }
}

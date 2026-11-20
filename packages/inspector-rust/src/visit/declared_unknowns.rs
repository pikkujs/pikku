//! Port of Go `internal/visit/declared_unknowns.go`.

use std::collections::{HashMap, HashSet};

use tsrs_ast::Node;
use tsrs_checker::{Type, TypeFlags};
use tsrs_core::P;

use super::Context;
use super::group_functions_list::ListConfigTypes;

const MAX_DECLARED_UNKNOWN_DEPTH: usize = 12;

impl Context<'_> {
    /// The paths at which a schema's source wrote `unknown` or `any` itself,
    /// by schema name. A path names properties with `.name`, array items with
    /// `[]` and open-map values with `[*]`.
    pub fn declared_unknowns(&self) -> &HashMap<String, HashSet<String>> {
        &self.declared_unknowns
    }

    fn declared_unknown_paths_of_type(&mut self, t: P<Type>) -> HashSet<String> {
        let mut found = HashSet::new();
        let mut visiting: HashSet<tsrs_checker::TypeId> = HashSet::new();
        self.walk_declared_unknowns(t, String::new(), 0, &mut found, &mut visiting);
        found
    }

    fn walk_declared_unknowns(
        &mut self,
        cur: P<Type>,
        path: String,
        depth: usize,
        found: &mut HashSet<String>,
        visiting: &mut HashSet<tsrs_checker::TypeId>,
    ) {
        if cur.flags().intersects(TypeFlags::Any | TypeFlags::Unknown) {
            found.insert(if path.is_empty() { "$".to_string() } else { path });
            return;
        }
        if depth > MAX_DECLARED_UNKNOWN_DEPTH {
            return;
        }
        if cur.flags().intersects(TypeFlags::UnionOrIntersection) {
            for m in cur.types() {
                self.walk_declared_unknowns(*m, path.clone(), depth + 1, found, visiting);
            }
            return;
        }
        let id = cur.id();
        if !cur.flags().intersects(TypeFlags::Object) || visiting.contains(&id) {
            return;
        }
        visiting.insert(id);
        if self.checker.is_array_type_exported(cur) || cur.is_tuple_type() {
            let args = self.checker.get_type_arguments_exported(cur).to_vec();
            for el in args {
                self.walk_declared_unknowns(el, format!("{path}[]"), depth + 1, found, visiting);
            }
        } else {
            let props = self.checker.get_properties_of_type_exported(cur).to_vec();
            for p in props {
                let pt = self.checker.get_type_of_symbol_exported(p);
                self.walk_declared_unknowns(pt, format!("{path}.{}", p.name()), depth + 1, found, visiting);
            }
            let infos = self.checker.get_index_infos_of_type_exported(cur).to_vec();
            for info in infos {
                self.walk_declared_unknowns(info.value_type(), format!("{path}[*]"), depth + 1, found, visiting);
            }
        }
        visiting.remove(&id);
    }

    /// Records, against the schema names a function's input or output will be
    /// generated under, the places its source says unknown/any.
    pub(super) fn record_declared_unknowns(&mut self, names: &[String], types: &[P<Type>]) {
        let mut paths: HashSet<String> = HashSet::new();
        for t in types {
            paths.extend(self.declared_unknown_paths_of_type(*t));
        }
        for n in names {
            self.declared_unknowns.entry(n.clone()).or_default().extend(paths.iter().cloned());
        }
    }

    pub(super) fn declared_output_type(
        &mut self,
        is_list_func: bool,
        list: Option<&ListConfigTypes>,
        generics: &[P<Type>],
        handler: Option<P<Node>>,
    ) -> Option<P<Type>> {
        if is_list_func {
            return list.and_then(|l| l.output);
        }
        if generics.len() >= 2 {
            return Some(generics[1]);
        }
        let h = handler?;
        let sig = self.checker.get_signature_from_declaration_exported(h);
        let ret = self.checker.get_return_type_of_signature_exported(sig);
        Some(self.unwrap_promise(ret))
    }
}

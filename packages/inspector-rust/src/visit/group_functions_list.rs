//! Port of Go `internal/visit/group_functions_list.go`.

use tsrs_ast::{INTERNAL_SYMBOL_NAME_OBJECT, INTERNAL_SYMBOL_NAME_TYPE, Node};
use tsrs_checker::{ObjectFlags, Type, TypeFlags};
use tsrs_core::P;

use super::Context;
use crate::tsutil;

pub struct ListConfigTypes {
    pub input: P<Type>,
    pub output: Option<P<Type>>,
}

impl Context<'_> {
    /// The ListInput<F, S> and ListOutput<Row> a pikkuListFunc call resolves
    /// to, read off the config type of its resolved signature so inferred and
    /// explicit generics agree.
    pub(super) fn resolve_list_config(&mut self, call: P<Node>) -> Option<ListConfigTypes> {
        let sig = self.checker.get_resolved_signature_exported(call);
        let config = self.checker.get_return_type_of_signature_exported(sig);
        let mut args: Vec<P<Type>> = Vec::new();
        if let Some(a) = config.alias() {
            args = a.type_arguments().to_vec();
        }
        if args.is_empty() && config.object_flags().intersects(ObjectFlags::Reference) {
            args = self.checker.get_type_arguments_exported(config).to_vec();
        }
        let first = *args.first()?;
        if first.symbol().is_none_or(|s| s.name() != "ListInput") {
            return None;
        }
        Some(ListConfigTypes { input: first, output: args.get(1).copied() })
    }

    fn list_input_args(&mut self, input: P<Type>) -> (Option<P<Type>>, Option<P<Type>>) {
        if input.object_flags().intersects(ObjectFlags::Reference) {
            let args = self.checker.get_type_arguments_exported(input);
            return (args.first().copied(), args.get(1).copied());
        }
        if let Some(a) = input.alias() {
            let args = a.type_arguments();
            return (args.first().copied(), args.get(1).copied());
        }
        (None, None)
    }

    /// Registers the custom types of a list function's input and returns the
    /// name of the input alias and the input type. The input is
    /// ListInput<F, S> with an anonymous F named <Name>Filter and a declared S
    /// named <Name>SortColumn; with no sort columns declared the input drops
    /// `sort`.
    pub(super) fn register_list_input(&mut self, capitalized: &str, list: &ListConfigTypes) -> (String, P<Type>) {
        let (filter, sort) = self.list_input_args(list.input);
        let filter_named = filter.is_some_and(is_named_type);
        let filter_name = format!("{capitalized}Filter");
        if let Some(f) = filter {
            if !filter_named {
                let text = self.type_to_string(f);
                let refs = self.resolve_type_imports(f, true);
                self.types_map().add_custom_type(&filter_name, &text, tsutil::dedupe(&refs));
            }
        }
        let declares_sort = sort.is_some_and(|s| !s.flags().intersects(TypeFlags::Never));
        let sort_name = format!("{capitalized}SortColumn");
        if declares_sort {
            let text = self.type_to_string(sort.unwrap());
            self.types_map().add_custom_type(&sort_name, &text, vec![]);
        }
        let filter_text = match filter {
            Some(f) if filter_named => self.type_to_string(f),
            Some(_) => filter_name,
            None => "{}".to_string(),
        };
        let sort_text = if declares_sort { sort_name } else { "never".to_string() };
        let mut list_input_text = format!("ListInput<{filter_text}, {sort_text}>");
        if !declares_sort {
            list_input_text = format!("Omit<{list_input_text}, 'sort'>");
        }
        let name = format!("{capitalized}Input");
        let refs = self.resolve_type_imports(list.input, true);
        self.types_map().add_custom_type(&name, &list_input_text, tsutil::dedupe(&refs));
        (name, list.input)
    }

    /// The Row of a ListOutput<Row>.
    pub(super) fn list_row(&mut self, output: P<Type>) -> P<Type> {
        if output.object_flags().intersects(ObjectFlags::Reference) {
            if let Some(first) = self.checker.get_type_arguments_exported(output).first() {
                return *first;
            }
        }
        if let Some(a) = output.alias() {
            if let Some(first) = a.type_arguments().first() {
                return *first;
            }
        }
        output
    }
}

fn is_named_type(t: P<Type>) -> bool {
    let mut sym = t.symbol();
    if let Some(a) = t.alias() {
        if let Some(s) = a.symbol() {
            sym = Some(s);
        }
    }
    sym.is_some_and(|s| s.name() != INTERNAL_SYMBOL_NAME_TYPE && s.name() != INTERNAL_SYMBOL_NAME_OBJECT)
}

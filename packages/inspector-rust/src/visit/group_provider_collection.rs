//! Port of Go `visit/group_provider_collection.go`: `export const name =
//! defineProviderCollection('name')`, the collection's name and the module and
//! export a host imports it by.

use tsrs_ast::{self as ast, Node};
use tsrs_core::P;

use super::addon_json::{OJson, ojson_of_raw};
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::tsutil::{self, file_name_of, node_text};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addProviderCollection",
        phase: Phase::Setup,
        order: order::ADD_PROVIDER_COLLECTION,
        visit: |c, n| c.add_provider_collection(n),
    });
}

const DEFINER: &str = "defineProviderCollection";

impl Context<'_> {
    pub fn add_provider_collection(&mut self, node: P<Node>) {
        if ast::is_call_expression(node) && self.calls_imported_definer(node.expression().unwrap(), DEFINER) {
            let ok = node.parent().is_some_and(|p| ast::is_variable_declaration(p) && p.initializer() == Some(node));
            if !ok {
                self.collection_invalid(&format!(
                    "{DEFINER} must be assigned to an exported const with a string literal name, got: {}",
                    node_text(node)
                ));
            }
            return;
        }
        let Some((call, name_node)) = self.definer_declaration(node, DEFINER) else { return };
        let module = file_name_of(node).to_string();
        let export = self.module_exported_name(node, name_node);
        let args = call.arguments();
        let literal = (args.len() == 1).then(|| tsutil::unwrap_as(args[0])).filter(|a| ast::is_string_literal(*a));
        let (Some(export), Some(literal)) = (export, literal) else {
            self.collection_invalid(&format!(
                "{DEFINER} must be assigned to an exported const with a string literal name, got: {}",
                node_text(call)
            ));
            return;
        };
        let name = literal.text().to_string();

        let mut collections = OJson::new_object();
        if let Some(existing) = ojson_of_raw(&self.state.provider_collections)
            && existing.is_object()
        {
            collections = existing;
        }
        if let Some(first) = collections.get(&name) {
            let first = first.get("module").and_then(|m| m.str()).unwrap_or("").to_string();
            self.collection_invalid(&format!("Collection '{name}' is declared twice: {first} and {module}"));
            return;
        }
        let mut entry = OJson::new_object();
        entry.set("name", OJson::string(&name));
        entry.set("module", OJson::string(&module));
        entry.set("export", OJson::string(&export));
        self.log.debug(format!("\u{2022} Found defineProviderCollection: {name}"));
        collections.set(&name, entry);
        self.state.provider_collections = collections.raw();
    }

    fn collection_invalid(&mut self, msg: &str) {
        self.log.critical(codes::PROVIDER_COLLECTION_INVALID, msg.to_string());
    }
}

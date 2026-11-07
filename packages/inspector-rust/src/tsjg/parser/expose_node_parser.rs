//! Port of Go `tsjg/parser/expose_node_parser.go`.

use std::rc::Rc;
use std::sync::OnceLock;

use regex::Regex;
use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Chk, Context, SubNodeParser};
use crate::tsjg::config::{Expose, JsDocMode};
use crate::tsjg::fail;
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty};

/// Wraps exposed types in a DefinitionType (src/ExposeNodeParser.ts).
pub struct ExposeNodeParser {
    type_checker: Chk,
    sub_node_parser: Rc<dyn SubNodeParser>,
    expose: Expose,
    js_doc: JsDocMode,
}

pub fn new(type_checker: Chk, sub_node_parser: Rc<dyn SubNodeParser>, expose: Expose, js_doc: JsDocMode) -> Rc<ExposeNodeParser> {
    Rc::new(ExposeNodeParser { type_checker, sub_node_parser, expose, js_doc })
}

/// Strips a leading `"..."."` module prefix from fully qualified names.
fn module_prefix_pattern() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r#"^".*"\."#).unwrap())
}

impl SubNodeParser for ExposeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        self.sub_node_parser.supports_node(node)
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, reference: Option<&Ty>) -> Ty {
        let base_type = self.sub_node_parser.create_type(node, ctx, reference);
        if !self.is_export_node(node) {
            return base_type;
        }
        types::new_definition_type(self.get_definition_name(node, ctx), base_type)
    }
}

impl ExposeNodeParser {
    fn is_export_node(&self, node: P<Node>) -> bool {
        if self.expose == Expose::All {
            return node.kind() != Kind::TypeLiteral;
        }
        if self.expose == Expose::None {
            return false;
        }
        if self.js_doc != JsDocMode::None && tsutils::has_jsdoc_tag(node, "internal") {
            return false;
        }
        match node.local_symbol() {
            Some(local) => local.export_symbol().is_some(),
            None => false,
        }
    }

    fn get_definition_name(&self, node: P<Node>, ctx: &Context) -> String {
        let Some(symbol) = tsutils::symbol_at_node(node) else { fail("nil pointer dereference: no symbol for exposed node") };
        let qualified = self.type_checker.with(|c| c.get_fully_qualified_name_exported(symbol));
        let full_name = module_prefix_pattern().replace(&qualified, "").into_owned();
        let args = ctx.arguments();
        if args.is_empty() {
            return full_name;
        }
        format!("{full_name}<{}>", super::join_types(&args, |t| t.name()))
    }
}

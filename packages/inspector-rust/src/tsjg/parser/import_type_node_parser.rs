//! Port of Go `tsjg/parser/import_type_node_parser.go`: resolves
//! `import("./module").MyType` type nodes.

use std::rc::Rc;

use tsrs_ast::{Kind, Node, SymbolFlags};
use tsrs_core::P;

use super::shared::new_type_argument_context;
use super::{Chk, Context, NodeParser, SubNodeParser};
use crate::tsjg::fail;
use crate::tsjg::tsutils;
use crate::tsjg::types::Ty;

pub struct ImportTypeNodeParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>) -> Rc<ImportTypeNodeParser> {
    Rc::new(ImportTypeNodeParser { type_checker, child_node_parser })
}

impl SubNodeParser for ImportTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::ImportType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        // Resolve the symbol from the qualifier (e.g., `MyType` in
        // `import("./module").MyType`).
        let symbol_location = node.as_import_type_node().qualifier().unwrap_or(node);
        let Some(type_symbol) = tsutils::get_symbol_at_location(&self.type_checker, Some(symbol_location)) else {
            fail("nil pointer dereference")
        };

        // Handle transitive re-exports.
        if type_symbol.flags().intersects(SymbolFlags::Alias) {
            let aliased = self.type_checker.with(|c| c.get_aliased_symbol(type_symbol));
            return self.child_node_parser.create_type(
                Some(first_declaration(&aliased)),
                &new_type_argument_context(&self.child_node_parser, node, ctx),
                None,
            );
        }
        self.child_node_parser.create_type(
            Some(first_declaration(&type_symbol)),
            &new_type_argument_context(&self.child_node_parser, node, ctx),
            None,
        )
    }
}

/// `symbol.Declarations[0]`; Go panics with index out of range when empty.
pub(crate) fn first_declaration(symbol: &tsrs_ast::Symbol) -> P<Node> {
    match symbol.declarations().first() {
        Some(d) => *d,
        None => fail("index out of range [0] with length 0"),
    }
}

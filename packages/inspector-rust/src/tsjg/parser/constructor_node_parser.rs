//! Port of Go `tsjg/parser/constructor_node_parser.go`: constructor types
//! (src/NodeParser/ConstructorNodeParser.ts).

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::function_node_parser::{get_named_arguments, get_type_name, new_constructor_type};
use super::{Context, NodeParser, SubNodeParser};
use crate::tsjg::config::FunctionOptions;
use crate::tsjg::types::{self, Ty, TypeKind};

pub struct ConstructorNodeParser {
    child_node_parser: Rc<dyn NodeParser>,
    functions: FunctionOptions,
}

pub fn new(child_node_parser: Rc<dyn NodeParser>, functions: FunctionOptions) -> Rc<ConstructorNodeParser> {
    Rc::new(ConstructorNodeParser { child_node_parser, functions })
}

impl SubNodeParser for ConstructorNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::ConstructorType
    }

    fn create_type(&self, node: P<Node>, context: &Context, _reference: Option<&Ty>) -> Ty {
        if self.functions == FunctionOptions::Hide {
            return types::new(TypeKind::Never);
        }

        let name = get_type_name(node);
        let function = new_constructor_type(node, get_named_arguments(&self.child_node_parser, node, context));
        if !name.is_empty() {
            return types::new_definition_type(name, function);
        }
        function
    }
}

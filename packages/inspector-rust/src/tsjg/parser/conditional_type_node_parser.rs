//! Port of Go `tsjg/parser/conditional_type_node_parser.go`: conditional types
//! (src/NodeParser/ConditionalTypeNodeParser.ts).

use std::cell::RefCell;
use std::rc::Rc;

use tsrs_ast::{Kind, Node, SymbolFlags};
use tsrs_core::P;

use super::is_assignable_to::{InferMap, is_assignable_to};
use super::narrow_type::narrow_type;
use super::shared::inherit_parameters;
use super::{Chk, Context, NodeParser, SubNodeParser};
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty};

/// Pairs the type parameter name of the check-type with the narrowed check type
/// to use for the parameter in sub parsers (the private CheckType class upstream).
struct ConditionalCheckType {
    parameter_name: String,
    typ: Ty,
}

pub struct ConditionalTypeNodeParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>) -> Rc<ConditionalTypeNodeParser> {
    Rc::new(ConditionalTypeNodeParser { type_checker, child_node_parser })
}

impl SubNodeParser for ConditionalTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::ConditionalType
    }

    fn create_type(&self, node: P<Node>, context: &Context, _reference: Option<&Ty>) -> Ty {
        let conditional = node.as_conditional_type_node();
        let check_type = self.child_node_parser.create_type(Some(conditional.check_type()), context, None);
        let extends_type = self.child_node_parser.create_type(Some(conditional.extends_type()), context, None);
        let check_type_parameter_name = self.get_type_parameter_name(conditional.check_type());
        let infer_map = RefCell::new(InferMap::new());

        // If the check-type is not a type parameter then the condition is very
        // simple, no type narrowing needed.
        if check_type_parameter_name.is_empty() {
            let result = is_assignable_to(&extends_type, &check_type, Some(&mut infer_map.borrow_mut()));
            let mut branch = conditional.false_type();
            let mut branch_infer_map = InferMap::new();
            if result {
                branch = conditional.true_type();
                // Inferred bindings only flow into the true branch.
                branch_infer_map = std::mem::take(&mut *infer_map.borrow_mut());
            }
            return self.child_node_parser.create_type(Some(branch), &self.create_sub_context(node, context, None, &branch_infer_map), None);
        }

        // Narrow down the check type for both condition branches.
        let true_check_type =
            narrow_type(&check_type, &mut |t| is_assignable_to(&extends_type, t, Some(&mut infer_map.borrow_mut())));
        let false_check_type = narrow_type(&check_type, &mut |t| {
            // Note: no inferMap on the false side.
            !is_assignable_to(&extends_type, t, None)
        });

        // Follow the relevant branches and return the results from them.
        let mut results: Vec<Ty> = Vec::new();
        if !types::is_never_like(&true_check_type) {
            let sub = self.create_sub_context(
                node,
                context,
                Some(&ConditionalCheckType { parameter_name: check_type_parameter_name.clone(), typ: true_check_type }),
                &infer_map.borrow(),
            );
            results.push(self.child_node_parser.create_type(Some(conditional.true_type()), &sub, None));
        }
        if !types::is_never_like(&false_check_type) {
            let sub = self.create_sub_context(
                node,
                context,
                Some(&ConditionalCheckType { parameter_name: check_type_parameter_name, typ: false_check_type }),
                &InferMap::new(),
            );
            results.push(self.child_node_parser.create_type(Some(conditional.false_type()), &sub, None));
        }

        match &*types::new_union_type(&results) {
            types::TypeKind::Union(u) => u.normalize(),
            _ => unreachable!(),
        }
    }
}

impl ConditionalTypeNodeParser {
    /// The type parameter name of the given type node, or "" if the node is not
    /// a reference to a type parameter.
    fn get_type_parameter_name(&self, node: P<Node>) -> String {
        if node.kind() == Kind::TypeReference {
            let type_symbol = tsutils::get_symbol_at_location(&self.type_checker, Some(node.as_type_reference_node().type_name()));
            if let Some(s) = type_symbol {
                if s.flags().intersects(SymbolFlags::TypeParameter) {
                    return s.name().to_string();
                }
            }
        }
        String::new()
    }

    /// A sub context for evaluating the sub types of the conditional type. A
    /// sub context is needed in case the check-type is a type parameter which
    /// is then narrowed down by the extends-type.
    fn create_sub_context(
        &self,
        node: P<Node>,
        parent_context: &Context,
        check_type: Option<&ConditionalCheckType>,
        infer_map: &InferMap,
    ) -> Context {
        let sub = Context::new(Some(node));

        // Newly inferred types take precedence over check and parent types.
        for key in infer_map.keys() {
            let value = infer_map.get(key);
            sub.push_parameter(key);
            sub.push_argument(value);
        }

        let mut skip = String::new();
        if let Some(ct) = check_type {
            skip = ct.parameter_name.clone();
            // Set the new narrowed type for the check type parameter.
            // Note: the upstream implementation guards this with
            // `!(checkType.parameterName in inferMap)`, but `in` on a
            // JavaScript Map checks object properties (not map entries) and is
            // therefore always false, so the narrowed check type is always
            // pushed. The same applies to the parent-parameter loop below. We
            // replicate that observable behavior.
            sub.push_parameter(&ct.parameter_name);
            sub.push_argument(Some(ct.typ.clone()));
        }

        // Copy all other type parameters from the parent context.
        inherit_parameters(&sub, parent_context, &skip);
        sub
    }
}

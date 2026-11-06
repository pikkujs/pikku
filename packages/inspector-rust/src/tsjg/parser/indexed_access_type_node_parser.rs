//! Port of Go `tsjg/parser/indexed_access_type_node_parser.go`: indexed access
//! type nodes like `T["key"]` (src/NodeParser/IndexedAccessTypeNodeParser.ts).

use std::rc::Rc;

use tsrs_ast::{Kind, Node};
use tsrs_core::P;

use super::{Chk, Context, NodeParser, SubNodeParser, describe_node};
use crate::tsjg::fail;
use crate::tsjg::tsutils;
use crate::tsjg::types::{self, Ty, TupleType, TypeKind};

/// Whether `t` is an UnknownType created from a failed operation
/// (src/Type/UnknownType.ts).
fn is_errored_unknown_type(t: &Ty) -> bool {
    matches!(&**t, TypeKind::Unknown { errored_source: true })
}

pub struct IndexedAccessTypeNodeParser {
    type_checker: Chk,
    child_node_parser: Rc<dyn NodeParser>,
}

pub fn new(type_checker: Chk, child_node_parser: Rc<dyn NodeParser>) -> Rc<IndexedAccessTypeNodeParser> {
    Rc::new(IndexedAccessTypeNodeParser { type_checker, child_node_parser })
}

impl IndexedAccessTypeNodeParser {
    /// A syntactic fast path that preserves JSDoc: it only applies when the
    /// object type is a type reference to a type alias of a type literal and
    /// the index is a literal naming one of its members.
    fn create_indexed_type(&self, object_type: P<Node>, ctx: &Context, index_type: &Ty) -> Option<Ty> {
        let TypeKind::Literal(literal) = &**index_type else { return None };
        if object_type.kind() != Kind::TypeReference {
            return None;
        }

        let symbol = tsutils::get_symbol_at_location(&self.type_checker, Some(object_type.as_type_reference_node().type_name()))?;
        let declaration = *symbol.declarations().first()?;
        if declaration.kind() != Kind::TypeAliasDeclaration || declaration.type_node()?.kind() != Kind::TypeLiteral {
            return None;
        }

        // Strict equality in the original: only string literals can match
        // member names.
        let name = literal.value.as_str()?;

        for member in declaration.type_node()?.members() {
            if member.kind() == Kind::PropertySignature
                && member.type_node().is_some()
                && member.name().is_some_and(|n| n.kind() == Kind::Identifier)
                && member.name().unwrap().text() == name
            {
                return Some(self.child_node_parser.create_type(member.type_node(), ctx, None));
            }
        }
        None
    }
}

/// The element types of `tuple`, with rest elements unwrapped to the item
/// types they contribute.
fn get_tuple_index_types(tuple: &TupleType) -> Vec<Ty> {
    let mut index_types = Vec::new();
    for typ in tuple.types() {
        let derefed = types::deref_type(typ);
        let TypeKind::Rest(rest) = &*derefed else {
            index_types.push(typ.clone());
            continue;
        };
        match &*types::deref_type(&rest.ty) {
            TypeKind::Array(a) => index_types.push(a.item.clone()),
            TypeKind::Tuple(t) => index_types.extend(get_tuple_index_types(t)),
            _ => index_types.push(derefed.clone()),
        }
    }
    index_types
}

impl SubNodeParser for IndexedAccessTypeNodeParser {
    fn supports_node(&self, node: P<Node>) -> bool {
        node.kind() == Kind::IndexedAccessType
    }

    fn create_type(&self, node: P<Node>, ctx: &Context, _reference: Option<&Ty>) -> Ty {
        let access_node = node.as_indexed_access_type_node();
        let index_type = types::deref_type(&self.child_node_parser.create_type(Some(access_node.index_type()), ctx, None));
        if let Some(indexed) = self.create_indexed_type(access_node.object_type(), ctx, &index_type) {
            if !is_errored_unknown_type(&indexed) {
                return indexed;
            }
        }

        let object_type = types::deref_type(&self.child_node_parser.create_type(Some(access_node.object_type()), ctx, None));
        if types::is_never_like(&object_type) || types::is_never_like(&index_type) {
            return types::new(TypeKind::Never);
        }

        let index_types: Vec<Ty> = match &*index_type {
            TypeKind::Union(u) => u.types().to_vec(),
            _ => vec![index_type.clone()],
        };

        let mut property_types: Vec<Ty> = Vec::with_capacity(index_types.len());
        for typ in &index_types {
            if !matches!(&**typ, TypeKind::Literal(_) | TypeKind::String { .. } | TypeKind::Number) {
                fail(&format!(
                    "unexpected type {:?} (expected \"LiteralType.js\" or \"StringType.js\" or \"NumberType.js\") at node {}",
                    typ.id(),
                    describe_node(Some(node))
                ));
            }

            match types::get_type_by_key(&object_type, typ) {
                Some(p) => property_types.push(p),
                None => {
                    if matches!(&**typ, TypeKind::Number) {
                        if let TypeKind::Tuple(tuple) = &*object_type {
                            property_types.push(types::new_union_type(&get_tuple_index_types(tuple)).normalize_ty());
                            continue;
                        }
                    }
                    if matches!(&**typ, TypeKind::Literal(_)) {
                        if matches!(&*object_type, TypeKind::Reference(_)) {
                            property_types.push(object_type.clone());
                            continue;
                        }
                        // When the indexed property does not exist (e.g.
                        // constrained generics with narrower instantiations),
                        // treat it as never so optional properties are dropped
                        // instead of throwing.
                        property_types.push(types::new(TypeKind::Never));
                        continue;
                    }
                    fail(&format!("no additional properties in type {:?} at node {}", object_type.id(), describe_node(Some(node))));
                }
            }
        }

        super::shared::single_or_union(property_types)
    }
}

trait NormalizeTy {
    fn normalize_ty(&self) -> Ty;
}

impl NormalizeTy for Ty {
    /// `NewUnionType(..).Normalize()` on an already-built union.
    fn normalize_ty(&self) -> Ty {
        match &**self {
            TypeKind::Union(u) => u.normalize(),
            _ => self.clone(),
        }
    }
}

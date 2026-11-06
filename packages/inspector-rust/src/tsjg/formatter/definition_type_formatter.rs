//! Port of Go `tsjg/formatter/definition_type_formatter.go`.

use std::rc::Rc;

use super::{TypeFormatter, unique_types};
use crate::tsjg::schema::{self, Def, Definition, def};
use crate::tsjg::types::{Ty, TypeKind};

pub struct DefinitionTypeFormatter {
    child_type_formatter: Rc<dyn TypeFormatter>,
    encode_refs: bool,
}

impl DefinitionTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>, encode_refs: bool) -> Rc<DefinitionTypeFormatter> {
        Rc::new(DefinitionTypeFormatter { child_type_formatter, encode_refs })
    }
}

impl TypeFormatter for DefinitionTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Definition(_))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        definition_ref(&t.name(), self.encode_refs)
    }
    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        let TypeKind::Definition(d) = &**t else { unreachable!() };
        let mut children = vec![t.clone()];
        children.extend(self.child_type_formatter.get_children(&d.ty));
        unique_types(children)
    }
}

/// Builds the $ref to a named definition, shared by the definition and
/// reference type formatters.
pub fn definition_ref(name: &str, encode_refs: bool) -> Def {
    let name = if encode_refs { schema::encode_ref(name) } else { name.to_string() };
    def(Definition { ref_: format!("#/definitions/{name}"), ..Definition::default() })
}

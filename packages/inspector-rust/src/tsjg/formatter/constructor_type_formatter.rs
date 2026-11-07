//! Port of Go `tsjg/formatter/constructor_type_formatter.go`: the function
//! formatter embedded, with its own `supports_type`.

use std::rc::Rc;

use super::TypeFormatter;
use super::function_type_formatter::FunctionTypeFormatter;
use crate::tsjg::config::FunctionOptions;
use crate::tsjg::schema::Def;
use crate::tsjg::types::{Ty, TypeKind};

pub struct ConstructorTypeFormatter {
    inner: Rc<FunctionTypeFormatter>,
}

impl ConstructorTypeFormatter {
    pub fn new(child_type_formatter: Rc<dyn TypeFormatter>, functions: FunctionOptions) -> Rc<ConstructorTypeFormatter> {
        Rc::new(ConstructorTypeFormatter { inner: FunctionTypeFormatter::new(child_type_formatter, functions) })
    }
}

impl TypeFormatter for ConstructorTypeFormatter {
    fn supports_type(&self, t: &Ty) -> bool {
        matches!(&**t, TypeKind::Constructor(_))
    }
    fn get_definition(&self, t: &Ty) -> Def {
        self.inner.definition_of(t)
    }
    fn get_children(&self, t: &Ty) -> Vec<Ty> {
        self.inner.children_of(t)
    }
}

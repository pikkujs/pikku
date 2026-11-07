//! Port of Go `internal/tsjg/config`: generator configuration (src/Config.ts).

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Expose {
    All,
    None,
    Export,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JsDocMode {
    None,
    Basic,
    Extended,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DiscriminatorType {
    JsonSchema,
    OpenApi,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FunctionOptions {
    Fail,
    Comment,
    Hide,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub path: String,
    pub types: Vec<String>,
    pub minify: bool,
    pub schema_id: String,
    pub tsconfig: String,
    pub expose: Expose,
    pub top_ref: bool,
    pub js_doc: JsDocMode,
    pub markdown_description: bool,
    pub full_description: bool,
    pub sort_props: bool,
    pub strict_tuples: bool,
    pub skip_type_check: bool,
    pub encode_refs: bool,
    pub extra_tags: Vec<String>,
    pub additional_properties: bool,
    pub discriminator_type: DiscriminatorType,
    pub functions: FunctionOptions,
}

impl Default for Config {
    /// DEFAULT_CONFIG in src/Config.ts.
    fn default() -> Config {
        Config {
            path: String::new(),
            types: Vec::new(),
            minify: false,
            schema_id: String::new(),
            tsconfig: String::new(),
            expose: Expose::Export,
            top_ref: true,
            js_doc: JsDocMode::Extended,
            markdown_description: false,
            full_description: false,
            sort_props: true,
            strict_tuples: false,
            skip_type_check: false,
            encode_refs: true,
            extra_tags: Vec::new(),
            additional_properties: false,
            discriminator_type: DiscriminatorType::JsonSchema,
            functions: FunctionOptions::Comment,
        }
    }
}

package state

// Typed elements of the middleware, permissions, auth and approval-description
// sections (add-middleware.ts, add-permission.ts, add-auth.ts,
// add-approval-description.ts). Field order follows the visitors' object
// literals; see meta.go for the conventions.

// MiddlewareDefinition is InspectorMiddlewareDefinition and
// InspectorPermissionDefinition (the latter adds requiresData), and the shape
// of an approval description (which sets only the first five fields).
type MiddlewareDefinition struct {
	Services     ServicesMeta `json:"services"`
	Wires        *WiresMeta   `json:"wires,omitempty"`
	SourceFile   string       `json:"sourceFile"`
	Position     int          `json:"position"`
	ExportedName *string      `json:"exportedName"`
	Factory      *bool        `json:"factory,omitempty"`
	Name         *string      `json:"name,omitempty"`
	Description  *string      `json:"description,omitempty"`
	Package      *string      `json:"package,omitempty"`
	RequiresData *bool        `json:"requiresData,omitempty"`
}

// MiddlewareInstance is InspectorMiddlewareInstance.
type MiddlewareInstance struct {
	DefinitionId  string `json:"definitionId"`
	SourceFile    string `json:"sourceFile"`
	Position      int    `json:"position"`
	IsFactoryCall bool   `json:"isFactoryCall"`
}

// MiddlewareRegistration is one `add*Middleware` call of a group.
type MiddlewareRegistration struct {
	ExportName *string `json:"exportName"`
	SourceFile string  `json:"sourceFile"`
	Position   int     `json:"position"`
	IsFactory  bool    `json:"isFactory"`
}

// MiddlewareGroupMeta is a tag / HTTP-pattern middleware group.
type MiddlewareGroupMeta struct {
	ExportName              *string                  `json:"exportName"`
	SourceFile              string                   `json:"sourceFile"`
	Position                int                      `json:"position"`
	Services                ServicesMeta             `json:"services"`
	Count                   int                      `json:"count"`
	InstanceIds             Strings                  `json:"instanceIds"`
	IsFactory               bool                     `json:"isFactory"`
	AdditionalRegistrations []MiddlewareRegistration `json:"additionalRegistrations,omitempty"`
}

// AuthDefinition is the single pikkuBetterAuth(...) export.
type AuthDefinition struct {
	ExportName     string       `json:"exportName"`
	SourceFile     string       `json:"sourceFile"`
	BasePath       string       `json:"basePath"`
	HasCredentials bool         `json:"hasCredentials"`
	CookieCache    bool         `json:"cookieCache"`
	Plugins        Strings      `json:"plugins"`
	Services       ServicesMeta `json:"services"`
}

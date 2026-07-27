/**
 * The console's Scopes page, and the roles drawer on the Users page.
 *
 * Everything here reads and writes through the addon-console scope RPCs, which
 * are themselves gated on `pikku:scopes:*` — the admin actor holds them via the
 * seeded `console-admin` role, so the UI is reachable at all.
 *
 * Roles and scope ids are the vocabulary of the page and are safe to select on:
 * they are declared in code, not translated. The page's own copy is not — every
 * control is reached by test id and every state read from an attribute or from
 * the element itself, never from a label.
 *
 * The two mutating scenarios put the project back as they found it, because the
 * runner has no state reset between scenarios: the role created here is deleted
 * again, and the directly-granted scope revoked.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const SCOPES_PAGE = '/console/scopes'
const ROLES_READY = '[data-testid="role-row"]'

const roleRow = (name: string) => ({
  testId: 'role-row',
  where: { 'data-role-name': name },
})

const scopeRow = (id: string) => ({
  testId: 'scope-row',
  where: { 'data-scope-id': id },
})

export const scopesVocabularyVisibleScenario = pikkuScenario<
  void,
  { visible: true }
>({
  title: 'The declared vocabulary and seeded roles are visible',
  description:
    'The scopes page lists the roles composed by an admin and the scope vocabulary declared in code',
  tags: ['scenario', 'scopes-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scopesVocabularyVisibleScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scopes page',
      'opensConsolePage',
      { path: SCOPES_PAGE, waitFor: ROLES_READY },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the console-admin role',
      'seesTestId',
      roleRow('console-admin'),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the report-viewer role',
      'seesTestId',
      roleRow('report-viewer'),
      { actor: actors.admin }
    )

    await scenario.when(
      'views the scope vocabulary',
      'selectsSegment',
      { value: 'scopes' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the scopes-manage scope declared',
      'seesTestId',
      scopeRow('pikku:scopes:manage'),
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reports-read scope declared',
      'seesTestId',
      scopeRow('reports:read'),
      { actor: actors.admin }
    )

    return { visible: true }
  },
})

export const scopesCreateRoleScenario = pikkuScenario<void, { created: true }>({
  title: 'Creating a role from the declared scopes',
  description:
    'An admin composes a new role out of the declared vocabulary, and it appears in the list',
  tags: ['scenario', 'scopes-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scopesCreateRoleScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scopes page',
      'opensConsolePage',
      { path: SCOPES_PAGE, waitFor: ROLES_READY },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the role editor',
      'clicksTestId',
      { testId: 'scopes-create-role' },
      { actor: actors.admin }
    )
    await scenario.when(
      'names the role',
      'fillsTestId',
      { testId: 'role-name-input', value: 'billing-viewer' },
      { actor: actors.admin }
    )
    await scenario.when(
      'grants reports:read',
      'clicksTestId',
      { testId: 'scope-checkbox', where: { 'data-scope-id': 'reports:read' } },
      { actor: actors.admin }
    )
    await scenario.when(
      'saves the role',
      'clicksTestId',
      { testId: 'role-save' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the drawer close',
      'doesNotSeeTestId',
      { testId: 'role-editor' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the new role listed',
      'seesTestId',
      roleRow('billing-viewer'),
      { actor: actors.admin }
    )

    // Put the project back: the runner shares one server across scenarios, and
    // a stray role would leak into every later listing assertion.
    await scenario.when(
      'deletes the role again',
      'invokesRpcRaw',
      {
        rpcName: 'console:scopeDeleteRole',
        data: { name: 'billing-viewer' },
      },
      { actor: actors.admin }
    )

    return { created: true }
  },
})

export const scopesParentLocksChildrenScenario = pikkuScenario<
  void,
  { locked: true }
>({
  title: 'Granting a parent scope auto-selects and locks its children',
  description:
    'A parent grant satisfies every descendant at runtime, so the editor shows the children selected and locked',
  tags: ['scenario', 'scopes-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scopesParentLocksChildrenScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scopes page',
      'opensConsolePage',
      { path: SCOPES_PAGE, waitFor: ROLES_READY },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the role editor',
      'clicksTestId',
      { testId: 'scopes-create-role' },
      { actor: actors.admin }
    )
    await scenario.when(
      'grants the parent reports scope',
      'clicksTestId',
      { testId: 'scope-checkbox', where: { 'data-scope-id': 'reports' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees reports:read selected and locked',
      'expectsControl',
      {
        testId: 'scope-checkbox',
        where: { 'data-scope-id': 'reports:read' },
        checked: true,
        enabled: false,
      },
      { actor: actors.admin }
    )

    return { locked: true }
  },
})

export const scopesNameRequiredScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'Saving a role with no name surfaces a validation error',
  description:
    'The save button is live but refuses an unnamed role, marking the field invalid rather than doing nothing',
  tags: ['scenario', 'scopes-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scopesNameRequiredScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scopes page',
      'opensConsolePage',
      { path: SCOPES_PAGE, waitFor: ROLES_READY },
      { actor: actors.admin }
    )
    await scenario.when(
      'opens the role editor',
      'clicksTestId',
      { testId: 'scopes-create-role' },
      { actor: actors.admin }
    )
    await scenario.then(
      'is offered the save action',
      'expectsControl',
      { testId: 'role-save', enabled: true },
      { actor: actors.admin }
    )
    await scenario.when(
      'tries to save without a name',
      'clicksTestId',
      { testId: 'role-save' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the name field marked invalid',
      'seesTestId',
      { testId: 'role-name-input', where: { 'aria-invalid': 'true' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the editor still open',
      'seesTestId',
      { testId: 'role-editor' },
      { actor: actors.admin }
    )

    return { refused: true }
  },
})

export const scopesRoleKeyboardScenario = pikkuScenario<void, { opened: true }>(
  {
    title: 'A role can be opened for editing from the keyboard',
    description:
      'The role row is a real focusable control, so a keyboard-only admin can open the editor',
    tags: ['scenario', 'scopes-console', 'console'],
    func: async (_services, _data, { scenario, actors }) => {
      if (!actors?.admin) {
        throw new Error(
          'scopesRoleKeyboardScenario needs the admin actor — run via `pikku scenario run <environment>`'
        )
      }

      await scenario.given(
        'opens the scopes page',
        'opensConsolePage',
        { path: SCOPES_PAGE, waitFor: ROLES_READY },
        { actor: actors.admin }
      )
      await scenario.when(
        'opens console-admin with the keyboard',
        'opensTestIdWithKeyboard',
        roleRow('console-admin'),
        { actor: actors.admin }
      )
      await scenario.then(
        'sees the editor holding that role',
        'expectsTestIdValue',
        { testId: 'role-name-input', value: 'console-admin' },
        { actor: actors.admin }
      )

      return { opened: true }
    },
  }
)

export const scopesHeaderSearchScenario = pikkuScenario<
  void,
  { filtered: true }
>({
  title:
    'Roles are filtered from the page-header search, which clears on tab switch',
  description:
    'Search and the create action live in the shared page header, and the query never leaks across tabs',
  tags: ['scenario', 'scopes-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scopesHeaderSearchScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scopes page',
      'opensConsolePage',
      { path: SCOPES_PAGE, waitFor: ROLES_READY },
      { actor: actors.admin }
    )
    await scenario.then(
      'finds the create action in the page header',
      'seesTestId',
      { testId: 'scopes-create-role' },
      { actor: actors.admin }
    )
    await scenario.then(
      'finds the search in the page header',
      'seesTestId',
      { testId: 'page-search' },
      { actor: actors.admin }
    )

    await scenario.when(
      'searches for report-viewer',
      'fillsTestId',
      { testId: 'page-search', value: 'report-viewer' },
      { actor: actors.admin }
    )
    await scenario.then(
      'still sees report-viewer',
      'seesTestId',
      roleRow('report-viewer'),
      { actor: actors.admin }
    )
    await scenario.then(
      'no longer sees console-admin',
      'doesNotSeeTestId',
      roleRow('console-admin'),
      { actor: actors.admin }
    )

    await scenario.when(
      'views the scope vocabulary',
      'selectsSegment',
      { value: 'scopes' },
      { actor: actors.admin }
    )
    await scenario.when(
      'returns to the roles tab',
      'selectsSegment',
      { value: 'roles' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees console-admin again',
      'seesTestId',
      roleRow('console-admin'),
      { actor: actors.admin }
    )
    await scenario.then(
      'finds the search box empty',
      'expectsTestIdValue',
      { testId: 'page-search', value: '' },
      { actor: actors.admin }
    )

    return { filtered: true }
  },
})

export const scopesVocabularyReadOnlyScenario = pikkuScenario<
  void,
  { readOnly: true }
>({
  title: 'Scope vocabulary rows are not interactive',
  description:
    'The vocabulary is a read-only view, so its rows must not advertise a clickability they do not have',
  tags: ['scenario', 'scopes-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scopesVocabularyReadOnlyScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scopes page',
      'opensConsolePage',
      { path: SCOPES_PAGE, waitFor: ROLES_READY },
      { actor: actors.admin }
    )
    await scenario.when(
      'views the scope vocabulary',
      'selectsSegment',
      { value: 'scopes' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the reports:read row',
      'seesTestId',
      scopeRow('reports:read'),
      { actor: actors.admin }
    )
    await scenario.then(
      'finds it is not an interactive row',
      'seesTestId',
      {
        testId: 'scope-row',
        where: {
          'data-scope-id': 'reports:read',
          'data-interactive': 'false',
        },
      },
      { actor: actors.admin }
    )

    return { readOnly: true }
  },
})

export const scopesUserRoleAssignmentScenario = pikkuScenario<
  void,
  { assigned: true }
>({
  title: 'Assigning a role resolves its scopes onto the user',
  description:
    'Adding a role to a user widens the resolved scope set the session will carry, and removing it narrows it again',
  tags: ['scenario', 'scopes-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'scopesUserRoleAssignmentScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the roles drawer for the guest',
      'opensUserRolesDrawer',
      { email: 'guest@e2e.test' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the guest holds report-viewer',
      'seesTestId',
      { testId: 'held-role', where: { 'data-role-name': 'report-viewer' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees reports:read among the resolved scopes',
      'seesTestId',
      { testId: 'resolved-scope', where: { 'data-scope-id': 'reports:read' } },
      { actor: actors.admin }
    )

    await scenario.when(
      'opens the add-role menu',
      'clicksTestId',
      { testId: 'add-role' },
      { actor: actors.admin }
    )
    await scenario.when(
      'adds console-admin',
      'clicksTestId',
      {
        testId: 'add-role-option',
        where: { 'data-role-name': 'console-admin' },
      },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the scopes-manage scope resolve onto the user',
      'seesTestId',
      {
        testId: 'resolved-scope',
        where: { 'data-scope-id': 'pikku:scopes:manage' },
      },
      { actor: actors.admin }
    )

    await scenario.when(
      'removes console-admin again',
      'clicksTestId',
      { testId: 'revoke-role', where: { 'data-role-name': 'console-admin' } },
      { actor: actors.admin }
    )
    await scenario.then(
      'no longer sees the role held',
      'doesNotSeeTestId',
      { testId: 'held-role', where: { 'data-role-name': 'console-admin' } },
      { actor: actors.admin }
    )

    return { assigned: true }
  },
})

export const scopesDirectGrantScenario = pikkuScenario<void, { granted: true }>(
  {
    title: 'Granting and revoking a scope directly on a user',
    description:
      'A scope can be held outside of any role; the grant is revoked again so the admin is left as seeded',
    tags: ['scenario', 'scopes-console', 'console'],
    func: async (_services, _data, { scenario, actors }) => {
      if (!actors?.admin) {
        throw new Error(
          'scopesDirectGrantScenario needs the admin actor — run via `pikku scenario run <environment>`'
        )
      }

      await scenario.given(
        'opens the roles drawer for the admin',
        'opensUserRolesDrawer',
        { email: 'admin@e2e.test' },
        { actor: actors.admin }
      )
      await scenario.when(
        'grants reports:read directly',
        'clicksTestId',
        {
          testId: 'scope-checkbox',
          where: { 'data-scope-id': 'reports:read' },
        },
        { actor: actors.admin }
      )
      await scenario.then(
        'sees the direct grant held',
        'expectsControl',
        {
          testId: 'scope-checkbox',
          where: { 'data-scope-id': 'reports:read' },
          checked: true,
        },
        { actor: actors.admin }
      )

      await scenario.when(
        'revokes it again',
        'clicksTestId',
        {
          testId: 'scope-checkbox',
          where: { 'data-scope-id': 'reports:read' },
        },
        { actor: actors.admin }
      )
      await scenario.then(
        'no longer sees the direct grant',
        'expectsControl',
        {
          testId: 'scope-checkbox',
          where: { 'data-scope-id': 'reports:read' },
          checked: false,
        },
        { actor: actors.admin }
      )

      return { granted: true }
    },
  }
)

/**
 * The scope RPCs are self-hosting: reading roles or the vocabulary at all
 * requires `pikku:scopes:read`. Staff passes the console's own AuthGate but
 * holds no scope role, so the page must say the caller lacks permission rather
 * than the misleading "the scope service may be unavailable" a real outage
 * would produce — the two are different alerts, and only one is honest here.
 */
export const scopesForbiddenIsNotAnOutageScenario = pikkuScenario<
  void,
  { refused: true }
>({
  title: 'A console admin without pikku:scopes:read sees a permission message',
  description:
    'A caller who passes the console gate but holds no scope role is told so, not shown an outage',
  tags: ['scenario', 'scopes-console', 'console'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.staff) {
      throw new Error(
        'scopesForbiddenIsNotAnOutageScenario needs the staff actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the scopes page as staff',
      'opensConsolePage',
      { path: SCOPES_PAGE, waitFor: '[data-testid="roles-forbidden"]' },
      { actor: actors.staff }
    )
    await scenario.then(
      'sees the permission alert',
      'seesTestId',
      { testId: 'roles-forbidden' },
      { actor: actors.staff }
    )
    await scenario.then(
      'is not told the service is unavailable',
      'doesNotSeeTestId',
      { testId: 'roles-load-error' },
      { actor: actors.staff }
    )

    return { refused: true }
  },
})

export const scopesConsoleFeature = pikkuFeature({
  name: 'Scopes Console',
  description: 'Managing scopes and roles in the console',
  tags: ['scopes-console', 'console'],
  scenarios: [
    scopesVocabularyVisibleScenario,
    scopesCreateRoleScenario,
    scopesParentLocksChildrenScenario,
    scopesNameRequiredScenario,
    scopesRoleKeyboardScenario,
    scopesHeaderSearchScenario,
    scopesVocabularyReadOnlyScenario,
    scopesUserRoleAssignmentScenario,
    scopesDirectGrantScenario,
    scopesForbiddenIsNotAnOutageScenario,
  ],
})

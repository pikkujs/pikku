# Source guide: Ruby on Rails

Read this when the survey finds `Gemfile` + `config/routes.rb`. Rails is convention-heavy, so most intent sits in places the framework names for you. The traps are the things Rails does implicitly: callbacks, concerns, `default_scope`, and the console.

## Detect

`Gemfile` with `rails`, `config/application.rb`, `app/models`, `db/schema.rb` or `db/structure.sql`. Note the Rails version (`Gemfile.lock`) and whether it is API-only (`config.api_only`). Also note engines under `engines/` or `gems/`: each is a candidate domain.

## Where intent hides

| Location                                                                 | Blueprint concept                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `db/schema.rb` / `structure.sql` (+ `db/migrate` for history)            | entities, attributes, DB-enforced invariants (unique indexes, FKs, checks) |
| `app/models/*.rb`: validations, associations, scopes, enums              | entities, relationships, policies (validation), states                     |
| `aasm`, `state_machines`, `enum status:` + every `update(status:)`       | entity lifecycle: each write site is a transition                          |
| `config/routes.rb` (+ `routes/*.rb`, `concerns`)                         | api surfaces; `resources` generates 7 routes, so list only those enabled   |
| `app/controllers/**`: `before_action`, `rescue_from`, strong params      | commands/queries, policies, input shapes                                   |
| `app/policies/*` (Pundit), `app/models/ability.rb` (CanCanCan)           | policies (authorization)                                                   |
| `app/services`, `app/interactors`, `app/commands`, `app/operations`      | commands, usually already named in domain language                         |
| `app/jobs`, `app/workers` (Sidekiq/ActiveJob/Resque), `config/schedule.rb` (whenever), `sidekiq.yml`, `config/recurring.yml` | system workflows, event consumers |
| `app/mailers`, `app/views/*_mailer`                                      | integration + implicit event consumer ("InvoicePaid sends receipt")        |
| `app/admin`, `activeadmin`, `rails_admin`, `administrate`                | admin workflows and the real list of manageable entities                   |
| `lib/tasks/*.rake`                                                       | operator workflows (data fixes, imports, nightly sweeps)                   |
| `config/initializers/*`                                                  | integrations, global middleware, feature flags, hardcoded constants        |
| `spec/` (RSpec) or `test/`: request, model, system specs                 | scenarios; edge-case rules that exist nowhere else                         |
| `db/seeds.rb`, `spec/factories`                                          | realistic entity shapes and the roles/plans the product assumes            |

## Idiom -> blueprint -> Pikku

| Rails idiom                                       | Blueprint concept                                  | Pikku shortcut                                            |
| ------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `after_create` / `after_commit` / `after_save`    | **implicit event** (`explicit: false`), consumers = what the callback does | emit via EventHub/queue; consumer becomes `wireQueueWorker` |
| `before_validation`, `validates`, `validate :x`   | policy (validation)                                | Zod refinement on the command `input`                     |
| `before_action :authenticate_user!` / `authorize` | policy (authorization), `enforcedAt` per controller | one named permission function, wired once                 |
| `has_secure_password`, Devise, `devise_for`       | `LogInUser` / `RegisterUser` commands; session policy | auth middleware / `better-auth`; do not hand-port Devise internals |
| `enum` / `aasm event :x`                          | entity states + transitions                        | `status` column + guards inside the owning command        |
| `default_scope`, `acts_as_tenant`, `Current.account` | **tenancy scoping on every query**              | session filter on every read; missing scope = gap         |
| `dependent: :destroy` / `:nullify`                | invariant on deletion + cascade side effects       | FK `ON DELETE` in migration, or explicit command steps    |
| `counter_cache`, `touch: true`                    | derived state (invariant, may drift)               | computed in query, or updated inside the command          |
| ActiveJob `perform_later`                         | command effect: async step                         | `wireQueueWorker`                                         |
| `ActionCable` channels                            | realtime interface                                 | EventHub topics                                           |
| `ActiveStorage` / `CarrierWave` / `Shrine`        | integration (file storage) + attachment on entity  | storage service                                           |
| `Rails.application.routes` `mount Sidekiq::Web`   | operator tooling, not product: drop                | excluded                                                  |
| ERB/Slim/Haml + ViewComponent + Stimulus/Turbo    | frontend (see SKILL.md server-rendered note)       | TanStack route + `usePikkuQuery`; Stimulus = `custom-logic` candidate |

## Traps

- **Callbacks are the event system and nobody wrote it down.** Read every model's callback list, not just the controller. A status flip that also sends an email and bumps a counter is one event, `InvoicePaid`, with two consumers.
- **Concerns hide behavior.** `include Trackable` or `include Archivable` may add scopes, callbacks and validations to ten models. Open the concern and attribute its rules to every including model.
- **`default_scope` and `unscoped`.** A default scope silently filters deleted/other-tenant rows; every `unscoped` call is a deliberate escape worth a gap entry (security or reporting).
- **Fat controllers with no service layer**: the action body is the command. Name the command from the action plus its effects, not the route.
- **Monkeypatches and gems that override behavior** (`lib/core_ext`, `config/initializers`): grep for `class_eval`, `prepend`, `Module#refine`.
- **Soft delete** (`paranoia`, `discard`, `deleted_at`): the entity has an `archived` state; "delete" is a command with different semantics from the DB row removal.
- **Rails console and rake tasks are product surface.** If ops fix data in the console regularly (check READMEs, runbooks, `lib/tasks`), those fixes are missing commands. Record them in gaps.json.
- **Feature flags** (`flipper`, `rollout`, ENV): a flagged-off path is not dead; record the flag and who flips it.
- **Schema drift:** `schema.rb` is the truth, migrations are history. If they disagree, trust schema and note it. Raw SQL in migrations (`execute`) often hides triggers and views.

## Search checklist

```
grep -rnE "after_(create|commit|save|update|destroy)|before_(save|destroy)" app/models
grep -rnE "default_scope|unscoped|acts_as_tenant|Current\." app
grep -rnE "aasm|state_machine|enum |update(_attribute|_column)?s?\(.*status" app
grep -rnE "perform_(later|async|in)|\.deliver_(later|now)" app lib
grep -rnE "authorize|policy_scope|can\?|load_and_authorize" app
grep -rnE "Flipper|feature_enabled|ENV\[" app config lib
ls lib/tasks config/schedule.rb config/recurring.yml 2>/dev/null
```

## Confidence notes

A rule enforced by both a model validation and a request spec is `high`. A rule that only a callback implies (nobody tests it) is `medium`. Anything inferred from a view template alone is `low`.

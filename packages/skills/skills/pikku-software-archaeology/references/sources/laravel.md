# Source guide: Laravel (PHP)

Read this when the survey finds `composer.json` with `laravel/framework` and an `artisan` file. Laravel is conventional like Rails, but a lot of behavior is wired by service providers and the event system, so read those before the controllers.

## Detect

`artisan`, `bootstrap/app.php`, `routes/`, `app/Http`, `database/migrations`. Check the Laravel version in `composer.lock`: before 11, middleware lives in `app/Http/Kernel.php`; from 11, in `bootstrap/app.php`. Also check for Livewire, Inertia, Filament or Nova, which change what the frontend and admin are.

## Where intent hides

| Location                                                                  | Blueprint concept                                                       |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `database/migrations/*` (replay in order), `database/schema/*.sql`        | entities, attributes, DB-enforced invariants                            |
| `app/Models/*`: `$fillable`/`$guarded`, `$casts`, relations, scopes, `booted()` | entities, relationships, tenancy scopes                           |
| `app/Observers/*`, model `$dispatchesEvents`, `boot()` hooks              | **implicit events** (`created`, `updated`, `deleted`)                   |
| `app/Events` + `app/Listeners` + `EventServiceProvider`                   | explicit events and their consumers (`explicit: true`)                  |
| `routes/web.php`, `api.php`, `channels.php`, `console.php`                | api surfaces, realtime, CLI                                             |
| `app/Http/Controllers/**`                                                 | commands/queries; invokable controllers are one command each            |
| `app/Http/Requests/*` (FormRequest): `rules()`, `authorize()`             | input shape + validation and authorization policies                     |
| `app/Policies/*`, `Gate::define` in `AuthServiceProvider`                 | policies (authorization)                                                |
| `app/Http/Middleware/*` + middleware groups                               | cross-cutting policies (auth, tenancy, throttling, locale)              |
| `app/Jobs/*`, `config/queue.php`, `app/Console/Kernel.php` / `routes/console.php` `schedule()` | system workflows, async effects      |
| `app/Console/Commands/*`                                                  | operator workflows and CLI interface                                    |
| `app/Notifications/*`, `app/Mail/*`                                       | event consumers + integrations (channels: mail, Slack, SMS)             |
| `app/Providers/*`                                                         | bindings, global scopes, gates, macros: read for hidden wiring          |
| `config/*.php` + `.env.example`                                           | integrations, feature toggles, tenancy mode                             |
| `tests/Feature`, `tests/Unit` (Pest/PHPUnit)                              | scenarios; rules that exist only in tests                               |
| `app/Filament/**`, `app/Nova/**`, Livewire `app/Livewire/**`              | admin workflows; Livewire components are UI **and** commands            |

## Idiom -> blueprint -> Pikku

| Laravel idiom                                          | Blueprint concept                                  | Pikku shortcut                                           |
| ------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------- |
| `Model::created` observer / `$dispatchesEvents`        | implicit event, consumers = observer body          | emit event; consumer = `wireQueueWorker`                 |
| `event(new X)` + `Listener` (`ShouldQueue`)            | explicit event + async consumer                    | EventHub topic + queue worker                            |
| `FormRequest::rules()`                                 | validation policy + command `input[]`              | Zod schema on `input`                                    |
| `FormRequest::authorize()`, `$this->authorize()`, `Gate::allows`, `->can()` | authorization policy             | one named permission function                            |
| `Route::middleware('auth:sanctum', 'can:...')`         | auth policy `enforcedAt` the route group           | auth middleware + permission                             |
| `Policy` class methods (`view`, `update`, `delete`)    | per-entity authorization policies                  | permission functions per action                          |
| `dispatch(new Job)` / `Bus::chain` / `Bus::batch`      | command effect: async step / multi-step workflow   | `wireQueueWorker` / `pikkuWorkflowFunc`                  |
| `$schedule->command(...)->dailyAt(...)`                | system workflow with `schedule`                    | `wireScheduler`                                          |
| `Notification::send` (mail/database/slack)             | event consumer + integration                       | service call in consumer                                 |
| `Gate::before`, super-admin bypass                     | invariant exception: **record it**                 | explicit permission, never a global bypass               |
| global scope (`addGlobalScope`, `SoftDeletes`, tenant trait) | tenancy scoping / soft-delete state            | session filter on reads; `archived` state                |
| Eloquent accessors/mutators, `$casts`                  | derived/normalized attributes                      | Zod transforms or query mapping                          |
| Sanctum / Passport / Fortify / Breeze                  | `LogInUser` etc. + token issuance                  | auth middleware / `better-auth`                          |
| Livewire component (`wire:click`, public props)        | UI route + commands in one class: split them      | TanStack route + funcs                                   |
| Blade + Alpine/Inertia pages                           | frontend (see SKILL.md server-rendered note)       | TanStack route; Alpine behaviors = `custom-logic` candidates |

## Traps

- **Observers and model `boot()` are invisible from controllers.** A controller that only calls `$order->save()` may trigger emails, stock updates and audit logs. Read the model's observers before naming the command's effects.
- **Mass assignment shapes the API.** `$fillable` is the real allowed-input list; `$guarded = []` means any column is writable (a gap if exposed to users).
- **Service providers run before everything.** Macros, global scopes, gates and route model bindings registered there change behavior across the app.
- **Route model binding** (`Route::get('/invoices/{invoice}')`) silently adds a lookup + 404 + possibly a scope. Count it as a precondition, and check `Route::bind` customisations.
- **Queued vs sync.** `ShouldQueue` on a listener/notification changes consistency semantics (eventual vs immediate). Record which.
- **Duplicated rules between FormRequest, controller and model** are common; list every location in `enforcedAt`, and flag drift as a gap.
- **Config in `.env` drives behavior** (`FEATURE_X`, `TENANCY_MODE`). Collect every `env(` / `config(` that gates a branch.
- **Third-party packages carry product behavior** (Spatie `laravel-permission` = roles/permissions, `laravel-medialibrary`, Cashier = billing, `laravel-activitylog` = audit events). Read the package config, not the vendor code, and map to policies/integrations.
- **Raw `DB::` queries and `DB::statement`** often hold reporting logic and tenancy bypasses. Grep and review each.

## Search checklist

```
grep -rnE "Observer|\$dispatchesEvents|static::(created|updated|deleted|saving)" app
grep -rnE "event\(|Event::dispatch|::dispatch\(|dispatch\(new" app
grep -rnE "Gate::|->authorize\(|->can\(|@can|middleware\('can" app routes
grep -rnE "addGlobalScope|withoutGlobalScope|SoftDeletes|withTrashed" app
grep -rnE "DB::(raw|select|statement|table)" app
grep -rnE "env\(|config\('.*feature" app config
grep -rn "schedule->" app routes
cat composer.json | grep -E "spatie|laravel/(cashier|sanctum|passport|fortify|nova)|livewire|filament"
```

## Confidence notes

A validation in a FormRequest backed by a Feature test is `high`. Behavior reconstructed only from an observer with no test is `medium`. Anything resting on a Livewire component's public properties alone is `low`; confirm through the Blade template and its tests.

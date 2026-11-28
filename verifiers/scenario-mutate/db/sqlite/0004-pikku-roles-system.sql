-- `pikku_roles` needs `system` and `declared` for role sync to work.
--
-- @pikku/kysely writes both columns when it syncs the roles declared by
-- `defineSystemRole` (system: the role is the framework's rather than an
-- operator's; declared: it still exists in code, so removing a role marks it
-- inert instead of revoking it). The runtime migration that created this table
-- predates them, so `pikku persona sync` failed on
-- "table pikku_roles has no column named system" and no persona ever received
-- the roles it declares — which read downstream as every screen returning 403.
alter table "pikku_roles" add column "system" boolean default false not null;
alter table "pikku_roles" add column "declared" boolean default true not null;

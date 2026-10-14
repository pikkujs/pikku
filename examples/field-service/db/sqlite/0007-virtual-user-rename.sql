-- Virtual users used to be called personas, and two tables kept the old name.
--
-- `virtual_user_run.persona` and `virtual_user_schedule.persona` hold the id a
-- virtual user was declared under in `defineVirtualUsers`; they are now
-- `virtual_user_id`. A rename rather than a drop and add, so recorded runs and
-- every standing schedule keep their rows.
alter table "virtual_user_run" rename column "persona" to "virtual_user_id";
alter table "virtual_user_schedule" rename column "persona" to "virtual_user_id";

drop index "idx_virtual_user_run_persona";
create index "idx_virtual_user_run_virtual_user_id" on "virtual_user_run" ("virtual_user_id", "created_at");

-- The audit log column that records who performed an event is now
-- `performed_by_id`.
alter table "audit_log" rename column "actor_id" to "performed_by_id";

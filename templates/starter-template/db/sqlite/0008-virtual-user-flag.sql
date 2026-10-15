-- The better-auth `user` flag that marks an account as a virtual user is now
-- `virtual_user`. A rename rather than a drop and add, so every provisioned
-- virtual user keeps its flag and its sessions stay valid.
alter table "user" rename column "actor" to "virtual_user";

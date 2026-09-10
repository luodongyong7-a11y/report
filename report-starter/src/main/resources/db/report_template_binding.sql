-- Optional DDL for hosts that do not yet have report_template_binding.
-- tk-erp already has this table; do not re-run blindly in production.

CREATE TABLE IF NOT EXISTS report_template_binding (
    id            varchar PRIMARY KEY,
    menu_id       varchar,
    template_code varchar,
    update_time   timestamp,
    updater_id    varchar,
    updater       varchar,
    create_time   timestamp,
    creator_id    varchar,
    creator       varchar,
    remark        text,
    version       integer
);

CREATE INDEX IF NOT EXISTS idx_report_template_binding_menu_id ON report_template_binding (menu_id);

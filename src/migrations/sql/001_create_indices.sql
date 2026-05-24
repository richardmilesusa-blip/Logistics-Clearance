-- Migration 001: Build Performance Indices on ClearPath Foreign Key Columns
-- Safe is-not-exists checks for simple, safe, non-breaking applying in production environments

CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs (client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_broker_id ON jobs (assigned_broker_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_job_id ON audit_logs (job_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications (recipient_id);

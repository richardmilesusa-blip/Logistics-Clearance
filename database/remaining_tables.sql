-- ==========================================
-- ClearPath SaaS database schema: Remaining Tables
-- Designed for Nigerian Customs Compliance
-- ==========================================

-- 1. ENUM TYPES setup for Remaining Tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status_enum') THEN
        CREATE TYPE delivery_status_enum AS ENUM ('assigned', 'in_transit', 'delivered', 'failed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'form_m_status_enum') THEN
        CREATE TYPE form_m_status_enum AS ENUM ('open', 'expired', 'cancelled', 'fulfilled');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agency_enum') THEN
        CREATE TYPE agency_enum AS ENUM ('SON', 'NAFDAC', 'NAQS', 'DPR', 'OTHER');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clearance_status_enum') THEN
        CREATE TYPE clearance_status_enum AS ENUM ('not_required', 'pending', 'in_progress', 'approved', 'rejected');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'examination_outcome_enum') THEN
        CREATE TYPE examination_outcome_enum AS ENUM ('pending', 'passed', 'failed', 'short_landed', 'over_landed', 'misdescribed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_type_enum') THEN
        CREATE TYPE invoice_type_enum AS ENUM ('proforma', 'final');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'brokerage_basis_enum') THEN
        CREATE TYPE brokerage_basis_enum AS ENUM ('flat', 'percentage');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'client_payment_status_enum') THEN
        CREATE TYPE client_payment_status_enum AS ENUM ('awaiting', 'partial', 'paid', 'overdue');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel_enum') THEN
        CREATE TYPE notification_channel_enum AS ENUM ('in_app', 'email', 'sms', 'whatsapp');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'custom_field_type_enum') THEN
        CREATE TYPE custom_field_type_enum AS ENUM ('text', 'number', 'date', 'file');
    END IF;
END$$;

-- 2. TABLE: tdo_records (Terminal Delivery Order)
CREATE TABLE IF NOT EXISTS tdo_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    terminal_name VARCHAR(100) NOT NULL,
    tdo_ref VARCHAR(60) UNIQUE NOT NULL,
    fee_amount_ngn NUMERIC(14,2) NOT NULL CHECK (fee_amount_ngn >= 0),
    issue_date TIMESTAMPTZ,
    free_days INTEGER DEFAULT 7,
    demurrage_alert BOOLEAN NOT NULL DEFAULT FALSE,
    demurrage_amount_ngn NUMERIC(14,2) DEFAULT 0 CHECK (demurrage_amount_ngn >= 0),
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tdo_records_job_id ON tdo_records(job_id);
CREATE INDEX IF NOT EXISTS idx_tdo_records_issue_date ON tdo_records(issue_date);

-- 3. TABLE: hauling_companies (Approved transport vendors)
CREATE TABLE IF NOT EXISTS hauling_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(150),
    phone VARCHAR(20),
    email VARCHAR(150),
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    rating NUMERIC(3,2) CHECK (rating >= 0 AND rating <= 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABLE: haulage_orders (Last-mile container transport orders)
CREATE TABLE IF NOT EXISTS haulage_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    hauling_company_id UUID NOT NULL REFERENCES hauling_companies(id) ON DELETE RESTRICT,
    driver_name VARCHAR(150) NOT NULL,
    driver_phone VARCHAR(20) NOT NULL,
    truck_plate VARCHAR(20) NOT NULL,
    agreed_fee_ngn NUMERIC(14,2) NOT NULL CHECK (agreed_fee_ngn >= 0),
    delivery_destination TEXT NOT NULL,
    dispatch_date TIMESTAMPTZ,
    delivery_status delivery_status_enum NOT NULL DEFAULT 'assigned',
    delivery_date TIMESTAMPTZ,
    pod_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_haulage_orders_job_id ON haulage_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_haulage_orders_delivery_status ON haulage_orders(delivery_status);

-- 5. TABLE: form_m_records (Central Bank of Nigeria Form M clearance tracking)
CREATE TABLE IF NOT EXISTS form_m_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    form_m_number VARCHAR(50) NOT NULL,
    issuing_bank VARCHAR(100) NOT NULL,
    issue_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status form_m_status_enum NOT NULL DEFAULT 'open',
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_m_records_job_id ON form_m_records(job_id);
CREATE INDEX IF NOT EXISTS idx_form_m_records_status ON form_m_records(status);
CREATE INDEX IF NOT EXISTS idx_form_m_records_expiry_date ON form_m_records(expiry_date);

-- 6. TABLE: regulatory_clearances (SON, NAFDAC, NAQS, DPR agency approval tracking)
CREATE TABLE IF NOT EXISTS regulatory_clearances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    agency agency_enum NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    certificate_no VARCHAR(100),
    expiry_date DATE,
    clearance_date TIMESTAMPTZ,
    status clearance_status_enum NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regulatory_clearances_job_id ON regulatory_clearances(job_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_clearances_agency ON regulatory_clearances(agency);
CREATE INDEX IF NOT EXISTS idx_regulatory_clearances_status ON regulatory_clearances(status);

-- 7. TABLE: examination_records (NCS Physical Port Inspection Log)
CREATE TABLE IF NOT EXISTS examination_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    examination_date DATE NOT NULL,
    examination_officer VARCHAR(150),
    examination_shed VARCHAR(100),
    devanning_fee_ngn NUMERIC(14,2) DEFAULT 0 CHECK (devanning_fee_ngn >= 0),
    outcome examination_outcome_enum NOT NULL DEFAULT 'pending',
    short_landed_qty NUMERIC(12,3) CHECK (short_landed_qty >= 0),
    over_landed_qty NUMERIC(12,3) CHECK (over_landed_qty >= 0),
    examination_notes TEXT,
    stuffing_required BOOLEAN NOT NULL DEFAULT FALSE,
    stuffing_date DATE,
    stuffing_fee_ngn NUMERIC(14,2) DEFAULT 0 CHECK (stuffing_fee_ngn >= 0),
    report_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_examination_records_job_id ON examination_records(job_id);

-- 8. TABLE: demurrage_records (Vessel detention & container demurrage costs)
CREATE TABLE IF NOT EXISTS demurrage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    free_days_allotted INTEGER NOT NULL DEFAULT 7 CHECK (free_days_allotted >= 0),
    demurrage_start_date DATE NOT NULL,
    rate_per_day_usd NUMERIC(10,2) NOT NULL CHECK (rate_per_day_usd >= 0),
    days_accrued INTEGER DEFAULT 0 CHECK (days_accrued >= 0),
    total_usd NUMERIC(14,2) DEFAULT 0 CHECK (total_usd >= 0),
    total_ngn NUMERIC(18,2) DEFAULT 0 CHECK (total_ngn >= 0),
    waiver_requested BOOLEAN NOT NULL DEFAULT FALSE,
    waiver_amount_ngn NUMERIC(14,2) DEFAULT 0 CHECK (waiver_amount_ngn >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demurrage_records_job_id ON demurrage_records(job_id);

-- 9. TABLE: client_invoices (Proforma & Final Billing Documents)
CREATE TABLE IF NOT EXISTS client_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    invoice_no VARCHAR(40) UNIQUE NOT NULL,
    invoice_type invoice_type_enum NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    total_amount_ngn NUMERIC(18,2) NOT NULL CHECK (total_amount_ngn >= 0),
    brokerage_fee_ngn NUMERIC(14,2) DEFAULT 0 CHECK (brokerage_fee_ngn >= 0),
    brokerage_fee_basis brokerage_basis_enum,
    client_payment_ref VARCHAR(100),
    client_payment_date TIMESTAMPTZ,
    client_payment_status client_payment_status_enum NOT NULL DEFAULT 'awaiting',
    outstanding_balance_ngn NUMERIC(18,2) DEFAULT 0 CHECK (outstanding_balance_ngn >= 0),
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_invoices_job_id ON client_invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_client_invoices_invoice_no ON client_invoices(invoice_no);

-- 10. TABLE: notifications (Unified in-app and outbound alerts)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel notification_channel_enum NOT NULL,
    type VARCHAR(80) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_job_id ON notifications(job_id);

-- 11. TABLE: job_custom_fields (Extensibility EAV Layer for Client Configs)
CREATE TABLE IF NOT EXISTS job_custom_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    field_label VARCHAR(200) NOT NULL,
    field_type custom_field_type_enum NOT NULL,
    value_text TEXT,
    value_number NUMERIC(18,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_job_custom_fields_job_key UNIQUE (job_id, field_key)
);

-- 12. REGISTER ADDITIONAL TRIGGER FOR FEE RECALCULATION ON NEW TABLES
DROP TRIGGER IF EXISTS trg_recalculate_tdo_fee ON tdo_records;
CREATE TRIGGER trg_recalculate_tdo_fee
AFTER INSERT OR UPDATE OR DELETE ON tdo_records
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_fee_summary();

DROP TRIGGER IF EXISTS trg_recalculate_haulage_fee ON haulage_orders;
CREATE TRIGGER trg_recalculate_haulage_fee
AFTER INSERT OR UPDATE OR DELETE ON haulage_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_fee_summary();

DROP TRIGGER IF EXISTS trg_recalculate_examination_fee ON examination_records;
CREATE TRIGGER trg_recalculate_examination_fee
AFTER INSERT OR UPDATE OR DELETE ON examination_records
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_fee_summary();

DROP TRIGGER IF EXISTS trg_recalculate_demurrage_fee ON demurrage_records;
CREATE TRIGGER trg_recalculate_demurrage_fee
AFTER INSERT OR UPDATE OR DELETE ON demurrage_records
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_fee_summary();

-- 13. REGISTER updated_at TRIGGERS FOR REMAINING TABLES WITH updated_at
DROP TRIGGER IF EXISTS set_updated_at_tdo_records ON tdo_records;
CREATE TRIGGER set_updated_at_tdo_records
BEFORE UPDATE ON tdo_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_hauling_companies ON hauling_companies;
CREATE TRIGGER set_updated_at_hauling_companies
BEFORE UPDATE ON hauling_companies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_haulage_orders ON haulage_orders;
CREATE TRIGGER set_updated_at_haulage_orders
BEFORE UPDATE ON haulage_orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_form_m_records ON form_m_records;
CREATE TRIGGER set_updated_at_form_m_records
BEFORE UPDATE ON form_m_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_regulatory_clearances ON regulatory_clearances;
CREATE TRIGGER set_updated_at_regulatory_clearances
BEFORE UPDATE ON regulatory_clearances
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_examination_records ON examination_records;
CREATE TRIGGER set_updated_at_examination_records
BEFORE UPDATE ON examination_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_demurrage_records ON demurrage_records;
CREATE TRIGGER set_updated_at_demurrage_records
BEFORE UPDATE ON demurrage_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_client_invoices ON client_invoices;
CREATE TRIGGER set_updated_at_client_invoices
BEFORE UPDATE ON client_invoices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_job_custom_fields ON job_custom_fields;
CREATE TRIGGER set_updated_at_job_custom_fields
BEFORE UPDATE ON job_custom_fields
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

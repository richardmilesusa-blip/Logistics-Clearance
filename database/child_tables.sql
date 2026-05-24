-- ==========================================
-- ClearPath SaaS database schema: Child Tables
-- Designed for Nigerian Customs Compliance
-- ==========================================

-- 1. ENUM TYPES setup (using IF NOT EXISTS style check or pure declarations)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_type_enum') THEN
        CREATE TYPE doc_type_enum AS ENUM (
            'paar', 'tdo', 'bl', 'pod', 'examination_report', 
            'son_cert', 'nafdac_cert', 'ccvo', 'form_m', 'invoice', 'other'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'amendment_status_enum') THEN
        CREATE TYPE amendment_status_enum AS ENUM ('pending', 'submitted', 'approved', 'rejected');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'telex_status_enum') THEN
        CREATE TYPE telex_status_enum AS ENUM ('pending', 'issued', 'overdue');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'paar_status_enum') THEN
        CREATE TYPE paar_status_enum AS ENUM ('pending', 'submitted', 'approved', 'rejected');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rate_source_enum') THEN
        CREATE TYPE rate_source_enum AS ENUM ('cbn_auto', 'manual');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
        CREATE TYPE payment_status_enum AS ENUM ('unpaid', 'partial', 'paid');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nicis_status_enum') THEN
        CREATE TYPE nicis_status_enum AS ENUM ('pending', 'accepted', 'queried', 'rejected');
    END IF;
END$$;

-- 2. TABLE: documents (Centralized Document Repository)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    doc_type doc_type_enum NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_key VARCHAR(500) NOT NULL, -- Object storage key (S3 or equivalent)
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_job_id ON documents(job_id);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);

-- 3. TABLE: bl_records (Bill of Lading Details — One-To-One with jobs)
CREATE TABLE IF NOT EXISTS bl_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    requires_amendment BOOLEAN NOT NULL DEFAULT FALSE,
    amendment_reason TEXT,
    amendment_status amendment_status_enum DEFAULT NULL,
    telex_release_date DATE,
    telex_sla_days INTEGER NOT NULL DEFAULT 3,
    telex_status telex_status_enum NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TABLE: paar_records (Pre-Arrival Assessment Report Tracking)
CREATE TABLE IF NOT EXISTS paar_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    fee_amount NUMERIC(14,2) NOT NULL CHECK (fee_amount >= 0),
    status paar_status_enum NOT NULL DEFAULT 'pending',
    submission_date TIMESTAMPTZ,
    approval_date TIMESTAMPTZ,
    rejection_reason TEXT,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paar_records_job_id ON paar_records(job_id);
CREATE INDEX IF NOT EXISTS idx_paar_records_status ON paar_records(status);

-- 5. TABLE: duty_assessments (Customs Duty Computation — One-To-One with jobs)
CREATE TABLE IF NOT EXISTS duty_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    cif_value_usd NUMERIC(16,2) NOT NULL CHECK (cif_value_usd >= 0),
    exchange_rate NUMERIC(12,4) NOT NULL CHECK (exchange_rate > 0),
    rate_date DATE NOT NULL,
    rate_source rate_source_enum NOT NULL,
    cif_value_ngn NUMERIC(18,2) NOT NULL CHECK (cif_value_ngn >= 0),
    duty_rate_pct NUMERIC(6,4) NOT NULL CHECK (duty_rate_pct >= 0 AND duty_rate_pct <= 1),
    duty_amount_ngn NUMERIC(18,2) NOT NULL CHECK (duty_amount_ngn >= 0),
    vat_amount_ngn NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (vat_amount_ngn >= 0),
    ciss_levy_ngn NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (ciss_levy_ngn >= 0),
    etls_levy_ngn NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (etls_levy_ngn >= 0),
    levy_amount_ngn NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (levy_amount_ngn >= 0),
    total_duty_ngn NUMERIC(18,2) NOT NULL CHECK (total_duty_ngn >= 0),
    payment_status payment_status_enum NOT NULL DEFAULT 'unpaid',
    payment_ref VARCHAR(100),
    payment_date TIMESTAMPTZ,
    is_overridden BOOLEAN NOT NULL DEFAULT FALSE,
    override_reason TEXT,
    overridden_by UUID REFERENCES users(id) ON DELETE SET NULL,
    overridden_at TIMESTAMPTZ,
    sad_number VARCHAR(50),
    assessment_notice_no VARCHAR(50),
    cpc_code VARCHAR(20),
    nicis_submission_date TIMESTAMPTZ,
    nicis_status nicis_status_enum DEFAULT NULL,
    import_duty_receipt_no VARCHAR(100),
    assessed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_duty_assessments_job_id ON duty_assessments(job_id);
CREATE INDEX IF NOT EXISTS idx_duty_assessments_payment_status ON duty_assessments(payment_status);
CREATE INDEX IF NOT EXISTS idx_duty_assessments_nicis_status ON duty_assessments(nicis_status);

-- 6. TABLE: fee_summaries (Aggregated, Denormalized Financial Picture)
CREATE TABLE IF NOT EXISTS fee_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID UNIQUE NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    paar_fee_ngn NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paar_fee_ngn >= 0),
    duty_total_ngn NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (duty_total_ngn >= 0),
    tdo_fee_ngn NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tdo_fee_ngn >= 0),
    haulage_fee_ngn NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (haulage_fee_ngn >= 0),
    devanning_fee_ngn NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (devanning_fee_ngn >= 0),
    stuffing_fee_ngn NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (stuffing_fee_ngn >= 0),
    demurrage_total_ngn NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (demurrage_total_ngn >= 0),
    brokerage_fee_ngn NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (brokerage_fee_ngn >= 0),
    other_fees_ngn NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_fees_ngn >= 0),
    grand_total_ngn NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (grand_total_ngn >= 0),
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. RECALCULATION BUSINESS LOGIC: function recalculate_fee_summary(p_job_id uuid)
CREATE OR REPLACE FUNCTION recalculate_fee_summary(p_job_id UUID)
RETURNS VOID AS $$
DECLARE
    v_paar_fee NUMERIC(14,2) := 0;
    v_duty_total NUMERIC(18,2) := 0;
    v_tdo_fee NUMERIC(14,2) := 0;
    v_haulage_fee NUMERIC(14,2) := 0;
    v_devanning_fee NUMERIC(14,2) := 0;
    v_stuffing_fee NUMERIC(14,2) := 0;
    v_demurrage_total NUMERIC(14,2) := 0;
    v_brokerage_fee NUMERIC(14,2) := 0;
    v_other_fees NUMERIC(14,2) := 0;
    v_grand_total NUMERIC(18,2) := 0;
BEGIN
    -- Collect from paar_records
    SELECT COALESCE(SUM(fee_amount), 0) INTO v_paar_fee
    FROM paar_records
    WHERE job_id = p_job_id;

    -- Collect from duty_assessments
    SELECT COALESCE(SUM(total_duty_ngn), 0) INTO v_duty_total
    FROM duty_assessments
    WHERE job_id = p_job_id;

    -- Collect from tdo_records dynamically if the table has been provisioned
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tdo_records') THEN
        EXECUTE 'SELECT COALESCE(SUM(fee_amount_ngn), 0) FROM tdo_records WHERE job_id = $1'
        INTO v_tdo_fee
        USING p_job_id;
        
        EXECUTE 'SELECT COALESCE(SUM(demurrage_amount_ngn), 0) FROM tdo_records WHERE job_id = $1'
        INTO v_demurrage_total
        USING p_job_id;
    END IF;

    -- Collect from haulage_orders dynamically if the table has been provisioned
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'haulage_orders') THEN
        EXECUTE 'SELECT COALESCE(SUM(agreed_fee_ngn), 0) FROM haulage_orders WHERE job_id = $1'
        INTO v_haulage_fee
        USING p_job_id;
    END IF;

    -- Collect devanning/stuffing charges dynamically if examination_records is provisioned
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'examination_records') THEN
        EXECUTE 'SELECT COALESCE(SUM(devanning_fee_ngn), 0), COALESCE(SUM(stuffing_fee_ngn), 0) FROM examination_records WHERE job_id = $1'
        INTO v_devanning_fee, v_stuffing_fee
        USING p_job_id;
    END IF;

    -- Collect custom/other non-fee parameters if demurrage_records has been provisioned
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'demurrage_records') THEN
        EXECUTE 'SELECT COALESCE(SUM(total_ngn), 0) FROM demurrage_records WHERE job_id = $1'
        INTO v_demurrage_total
        USING p_job_id;
    END IF;

    -- Calculate complete aggregated grand total
    v_grand_total := v_paar_fee + v_duty_total + v_tdo_fee + v_haulage_fee + v_devanning_fee + v_stuffing_fee + v_demurrage_total + v_brokerage_fee + v_other_fees;

    -- Perform upsert on fee_summaries
    INSERT INTO fee_summaries (
        job_id,
        paar_fee_ngn,
        duty_total_ngn,
        tdo_fee_ngn,
        haulage_fee_ngn,
        devanning_fee_ngn,
        stuffing_fee_ngn,
        demurrage_total_ngn,
        brokerage_fee_ngn,
        other_fees_ngn,
        grand_total_ngn,
        last_calculated_at
    ) VALUES (
        p_job_id,
        v_paar_fee,
        v_duty_total,
        v_tdo_fee,
        v_haulage_fee,
        v_devanning_fee,
        v_stuffing_fee,
        v_demurrage_total,
        v_brokerage_fee,
        v_other_fees,
        v_grand_total,
        NOW()
    )
    ON CONFLICT (job_id) DO UPDATE SET
        paar_fee_ngn = EXCLUDED.paar_fee_ngn,
        duty_total_ngn = EXCLUDED.duty_total_ngn,
        tdo_fee_ngn = EXCLUDED.tdo_fee_ngn,
        haulage_fee_ngn = EXCLUDED.haulage_fee_ngn,
        devanning_fee_ngn = EXCLUDED.devanning_fee_ngn,
        stuffing_fee_ngn = EXCLUDED.stuffing_fee_ngn,
        demurrage_total_ngn = EXCLUDED.demurrage_total_ngn,
        brokerage_fee_ngn = EXCLUDED.brokerage_fee_ngn,
        other_fees_ngn = EXCLUDED.other_fees_ngn,
        grand_total_ngn = EXCLUDED.grand_total_ngn,
        last_calculated_at = EXCLUDED.last_calculated_at;
END;
$$ LANGUAGE plpgsql;

-- 8. TRIGGER FOR FEE RECALCULATION
CREATE OR REPLACE FUNCTION trigger_recalculate_fee_summary()
RETURNS TRIGGER AS $$
DECLARE
    v_job_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_job_id := OLD.job_id;
    ELSE
        v_job_id := NEW.job_id;
    END IF;

    IF v_job_id IS NOT NULL THEN
        PERFORM recalculate_fee_summary(v_job_id);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers for Recalculation (Applied to currently created tables)
DROP TRIGGER IF EXISTS trg_recalculate_paar_fee ON paar_records;
CREATE TRIGGER trg_recalculate_paar_fee
AFTER INSERT OR UPDATE OR DELETE ON paar_records
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_fee_summary();

DROP TRIGGER IF EXISTS trg_recalculate_duty_fee ON duty_assessments;
CREATE TRIGGER trg_recalculate_duty_fee
AFTER INSERT OR UPDATE OR DELETE ON duty_assessments
FOR EACH ROW
EXECUTE FUNCTION trigger_recalculate_fee_summary();


-- 9. TRIGGERS FOR updated_at COLUMNS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied triggers to all four tables that have updated_at fields
DROP TRIGGER IF EXISTS set_updated_at_documents ON documents;
CREATE TRIGGER set_updated_at_documents
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_bl_records ON bl_records;
CREATE TRIGGER set_updated_at_bl_records
BEFORE UPDATE ON bl_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_paar_records ON paar_records;
CREATE TRIGGER set_updated_at_paar_records
BEFORE UPDATE ON paar_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_duty_assessments ON duty_assessments;
CREATE TRIGGER set_updated_at_duty_assessments
BEFORE UPDATE ON duty_assessments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

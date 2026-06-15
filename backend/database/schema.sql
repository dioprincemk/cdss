-- =============================================================================
-- CDSS PostgreSQL Database Schema
-- Clinical Decision Support System for Pulmonary Disease Assessment
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ROLES TABLE
-- =============================================================================
CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL,  -- 'admin', 'doctor'
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (name, description) VALUES
    ('admin',  'System administrator with full access'),
    ('doctor', 'Physician with clinical assessment access');

-- =============================================================================
-- USERS TABLE
-- =============================================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    medical_license VARCHAR(100),             -- For doctors
    department      VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    is_verified     BOOLEAN DEFAULT FALSE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- REFRESH TOKENS TABLE
-- =============================================================================
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PATIENTS TABLE
-- =============================================================================
CREATE TABLE patients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id      VARCHAR(50) UNIQUE NOT NULL,  -- Hospital-assigned ID
    full_name       VARCHAR(255) NOT NULL,
    date_of_birth   DATE NOT NULL,
    age             INTEGER GENERATED ALWAYS AS (
                        EXTRACT(YEAR FROM AGE(date_of_birth))::INTEGER
                    ) STORED,
    sex             VARCHAR(10) NOT NULL CHECK (sex IN ('male', 'female', 'other')),
    contact_phone   VARCHAR(20),
    contact_email   VARCHAR(255),
    address         TEXT,
    emergency_contact VARCHAR(255),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PATIENT VITALS TABLE
-- =============================================================================
CREATE TABLE patient_vitals (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    recorded_by         UUID REFERENCES users(id),
    temperature         DECIMAL(4,1),    -- Celsius
    pulse_rate          INTEGER,         -- bpm
    respiratory_rate    INTEGER,         -- breaths/min
    spo2                DECIMAL(4,1),    -- %
    systolic_bp         INTEGER,         -- mmHg
    diastolic_bp        INTEGER,         -- mmHg
    weight_kg           DECIMAL(5,2),
    height_cm           DECIMAL(5,2),
    bmi                 DECIMAL(5,2) GENERATED ALWAYS AS (
                            CASE
                                WHEN height_cm > 0 THEN
                                    weight_kg / ((height_cm / 100.0) * (height_cm / 100.0))
                                ELSE NULL
                            END
                        ) STORED,
    recorded_at         TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- CLINICAL ASSESSMENTS TABLE
-- =============================================================================
CREATE TABLE clinical_assessments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    vitals_id           UUID REFERENCES patient_vitals(id),
    assessed_by         UUID REFERENCES users(id),
    chief_complaint     TEXT NOT NULL,
    symptoms            TEXT[],          -- Array of symptom strings
    symptom_duration    VARCHAR(100),    -- e.g., "3 days", "2 weeks"
    medical_conditions  TEXT[],          -- Existing conditions
    current_medications TEXT[],
    clinical_notes      TEXT,
    status              VARCHAR(20) DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress', 'completed', 'archived')),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- IMAGES TABLE
-- =============================================================================
CREATE TABLE images (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id   UUID NOT NULL REFERENCES clinical_assessments(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id),
    uploaded_by     UUID REFERENCES users(id),
    original_filename   VARCHAR(255) NOT NULL,
    stored_filename     VARCHAR(255) NOT NULL,
    file_path           TEXT NOT NULL,
    file_size_bytes     INTEGER,
    mime_type           VARCHAR(50),
    image_width         INTEGER,
    image_height        INTEGER,
    checksum_sha256     VARCHAR(64),
    upload_status       VARCHAR(20) DEFAULT 'uploaded'
                            CHECK (upload_status IN ('uploaded', 'processing', 'processed', 'failed')),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- AI MODELS TABLE
-- =============================================================================
CREATE TABLE ai_models (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    version         VARCHAR(50) NOT NULL,
    description     TEXT,
    architecture    VARCHAR(100) NOT NULL,   -- e.g., 'DenseNet121'
    file_path       TEXT NOT NULL,
    file_size_bytes BIGINT,
    checksum_sha256 VARCHAR(64),
    disease_classes JSONB NOT NULL,          -- ["Normal","Pneumonia","COVID-19","Tuberculosis"]
    input_size      INTEGER DEFAULT 224,      -- Image input size
    is_active       BOOLEAN DEFAULT FALSE,
    is_validated    BOOLEAN DEFAULT FALSE,
    validation_log  TEXT,
    uploaded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT one_active_model CHECK (TRUE)  -- Enforced at app level
);

-- =============================================================================
-- PREDICTIONS TABLE
-- =============================================================================
CREATE TABLE predictions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id       UUID NOT NULL REFERENCES clinical_assessments(id),
    image_id            UUID NOT NULL REFERENCES images(id),
    model_id            UUID NOT NULL REFERENCES ai_models(id),
    predicted_class     VARCHAR(100) NOT NULL,
    confidence_scores   JSONB NOT NULL,      -- {"Normal": 0.02, "Pneumonia": 0.94, ...}
    top_prediction      VARCHAR(100) NOT NULL,
    top_confidence      DECIMAL(5,4) NOT NULL,
    gradcam_path        TEXT,                -- Path to generated heatmap
    gradcam_overlay_path TEXT,              -- Path to overlay image
    inference_time_ms   INTEGER,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- LLM EXPLANATIONS TABLE
-- =============================================================================
CREATE TABLE llm_explanations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prediction_id   UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
    provider        VARCHAR(50) NOT NULL,    -- 'openai', 'local', 'mock'
    model_name      VARCHAR(100),
    explanation     TEXT NOT NULL,
    severity        VARCHAR(50),             -- 'low', 'moderate', 'high', 'critical'
    recommendations JSONB,                   -- Array of recommendation strings
    raw_response    JSONB,                   -- Full provider response for audit
    tokens_used     INTEGER,
    generated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- REPORTS TABLE
-- =============================================================================
CREATE TABLE reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id   UUID NOT NULL REFERENCES clinical_assessments(id),
    prediction_id   UUID REFERENCES predictions(id),
    explanation_id  UUID REFERENCES llm_explanations(id),
    generated_by    UUID REFERENCES users(id),
    report_path     TEXT NOT NULL,
    report_type     VARCHAR(50) DEFAULT 'clinical' CHECK (report_type IN ('clinical', 'summary')),
    version         INTEGER DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- AUDIT LOGS TABLE
-- =============================================================================
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id),
    action      VARCHAR(100) NOT NULL,   -- 'patient.create', 'model.activate', etc.
    resource    VARCHAR(100),            -- 'patient', 'model', 'assessment'
    resource_id UUID,
    ip_address  INET,
    user_agent  TEXT,
    details     JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SETTINGS TABLE
-- =============================================================================
CREATE TABLE settings (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(100) UNIQUE NOT NULL,
    value       TEXT NOT NULL,
    description TEXT,
    updated_by  UUID REFERENCES users(id),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value, description) VALUES
    ('hospital_name',   'General Hospital',     'Hospital name for reports'),
    ('hospital_address','123 Medical Drive',     'Hospital address'),
    ('report_footer',   'Confidential Medical Record', 'PDF report footer text'),
    ('llm_provider',    'mock',                  'Active LLM provider: openai|local|mock'),
    ('max_file_size_mb','10',                    'Maximum X-ray upload size in MB');

-- =============================================================================
-- NOTIFICATIONS TABLE
-- =============================================================================
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       VARCHAR(255) NOT NULL,
    message     TEXT NOT NULL,
    type        VARCHAR(50) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
    is_read     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX idx_patients_patient_id     ON patients(patient_id);
CREATE INDEX idx_patients_created_by     ON patients(created_by);
CREATE INDEX idx_assessments_patient     ON clinical_assessments(patient_id);
CREATE INDEX idx_assessments_doctor      ON clinical_assessments(assessed_by);
CREATE INDEX idx_predictions_assessment  ON predictions(assessment_id);
CREATE INDEX idx_audit_user              ON audit_logs(user_id);
CREATE INDEX idx_audit_created           ON audit_logs(created_at DESC);
CREATE INDEX idx_images_assessment       ON images(assessment_id);
CREATE INDEX idx_refresh_tokens_user     ON refresh_tokens(user_id);
CREATE INDEX idx_notifications_user      ON notifications(user_id, is_read);

-- =============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_assessments_updated_at
    BEFORE UPDATE ON clinical_assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_models_updated_at
    BEFORE UPDATE ON ai_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

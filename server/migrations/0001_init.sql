-- 0001: esquema inicial del Mecánico Virtual Motolab AA
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS applied_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  greeting_date date
);
CREATE UNIQUE INDEX IF NOT EXISTS clients_username_lower_unique ON clients (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS clients_phone_unique ON clients (phone);

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_client_id_idx ON sessions (client_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS access_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  price_usd integer NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'active',
  bank text,
  reference_norm text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_periods_client_id_idx ON access_periods (client_id);
CREATE INDEX IF NOT EXISTS access_periods_ends_at_idx ON access_periods (ends_at);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payer_name text NOT NULL,
  cedula text NOT NULL,
  amount_bs numeric(14,2) NOT NULL,
  reference text NOT NULL,
  reference_norm text NOT NULL,
  bank text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_client_id_idx ON payments (client_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE INDEX IF NOT EXISTS payments_reference_norm_idx ON payments (reference_norm);

CREATE TABLE IF NOT EXISTS consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultations_client_id_idx ON consultations (client_id);
CREATE INDEX IF NOT EXISTS consultations_created_at_idx ON consultations (created_at);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

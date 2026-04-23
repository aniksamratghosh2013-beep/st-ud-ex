CREATE TABLE IF NOT EXISTS public.email_validation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  domain text,
  status text NOT NULL,
  reason text,
  provider text,
  mx_hosts text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_validation_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_email_validation_logs_created_at ON public.email_validation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_validation_logs_domain ON public.email_validation_logs (domain);

DROP POLICY IF EXISTS "No direct client access to email validation logs" ON public.email_validation_logs;
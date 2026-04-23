CREATE POLICY "Email validation logs are backend only"
ON public.email_validation_logs
FOR SELECT
TO authenticated
USING (false);
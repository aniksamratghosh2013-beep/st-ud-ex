
-- Fix overly permissive INSERT policies
DROP POLICY "System can insert activity" ON public.activity_logs;
CREATE POLICY "Authenticated can insert activity" ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "System can insert reports" ON public.moderation_reports;
CREATE POLICY "Authenticated can insert reports" ON public.moderation_reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

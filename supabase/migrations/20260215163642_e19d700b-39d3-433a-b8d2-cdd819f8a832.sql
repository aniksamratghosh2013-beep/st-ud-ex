
-- Bans table
CREATE TABLE public.bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banned_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  banned_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins and org admins can view bans" ON public.bans FOR SELECT USING (is_super_admin(auth.uid()) OR is_org_admin(auth.uid(), banned_org_id));
CREATE POLICY "Admins can create bans" ON public.bans FOR INSERT WITH CHECK (is_super_admin(auth.uid()) OR (banned_org_id IS NOT NULL AND is_org_admin(auth.uid(), banned_org_id)));
CREATE POLICY "Super admin can update bans" ON public.bans FOR UPDATE USING (is_super_admin(auth.uid()));
CREATE POLICY "Super admin can delete bans" ON public.bans FOR DELETE USING (is_super_admin(auth.uid()));
CREATE TRIGGER update_bans_updated_at BEFORE UPDATE ON public.bans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Activity logs table
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  details jsonb DEFAULT '{}',
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view all activity" ON public.activity_logs FOR SELECT USING (is_super_admin(auth.uid()));
CREATE POLICY "System can insert activity" ON public.activity_logs FOR INSERT WITH CHECK (true);

-- Moderation reports table
CREATE TABLE public.moderation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_type text NOT NULL DEFAULT 'auto' CHECK (reporter_type IN ('auto', 'manual')),
  reason text NOT NULL,
  flagged_content text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can view reports" ON public.moderation_reports FOR SELECT USING (is_super_admin(auth.uid()));
CREATE POLICY "System can insert reports" ON public.moderation_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Super admin can update reports" ON public.moderation_reports FOR UPDATE USING (is_super_admin(auth.uid()));

-- Add is_banned columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS ban_reason text;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.bans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;

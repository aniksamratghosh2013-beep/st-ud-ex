
-- Fix 1: Revert membership INSERT policy to only allow 'pending' status
DROP POLICY IF EXISTS "Users can subscribe to orgs" ON public.organization_memberships;
CREATE POLICY "Users can request to join"
  ON public.organization_memberships FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- Fix 2: Ensure RLS is enabled on meeting tables (idempotent)
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;

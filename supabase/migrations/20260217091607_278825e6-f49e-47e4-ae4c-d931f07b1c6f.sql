
-- Fix 1: Replace overly permissive posts SELECT policy
DROP POLICY IF EXISTS "Anyone can view posts" ON public.posts;
CREATE POLICY "Users can view posts"
ON public.posts FOR SELECT
USING (
  organization_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = posts.organization_id
    AND (o.is_public = true OR is_member(auth.uid(), o.id) OR is_org_admin(auth.uid(), o.id) OR is_super_admin(auth.uid()))
  )
);

-- Fix 2: Tighten activity_logs INSERT to require org membership
DROP POLICY IF EXISTS "Users can insert own activity" ON public.activity_logs;
CREATE POLICY "Users can insert own activity"
ON public.activity_logs FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (
    organization_id IS NULL
    OR is_member(auth.uid(), organization_id)
    OR is_org_admin(auth.uid(), organization_id)
  )
);

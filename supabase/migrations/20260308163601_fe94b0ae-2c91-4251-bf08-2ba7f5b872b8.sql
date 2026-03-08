-- Migrate any existing super_admin roles to app_founder
UPDATE public.user_roles SET role = 'app_founder' WHERE role = 'super_admin';

-- Update is_super_admin to only check app_founder (keeping function name for backward compat with RLS)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'app_founder'
      AND organization_id IS NULL
  )
$$;

-- Update is_global_admin
CREATE OR REPLACE FUNCTION public.is_global_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('app_founder', 'org_admin')
      AND (organization_id IS NULL OR organization_id IN (
        SELECT id FROM public.organizations WHERE name = 'Admin HQ'
      ))
  )
$$;

-- Create a helper function to check if user can post
-- App founders can always post, org admins/founders can post for their orgs
CREATE OR REPLACE FUNCTION public.can_create_post(_user_id uuid, _org_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    -- App founders can always post
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'app_founder' AND organization_id IS NULL
    )
    OR
    -- Org founders/admins can post (with or without org context)
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('founder', 'org_admin')
    )
$$;

-- Update posts INSERT policy: only org founders, org admins, and app founders can create posts
DROP POLICY IF EXISTS "Users can create posts" ON public.posts;
CREATE POLICY "Admins and founders can create posts"
ON public.posts
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (
    -- App founders can post anything
    is_app_founder(auth.uid())
    OR
    -- Org admins/founders can post (personal or for their org)
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('founder', 'org_admin')
    )
  )
  AND (
    -- If posting to an org, must be member/admin of that org
    organization_id IS NULL
    OR is_org_admin(auth.uid(), organization_id)
    OR is_member(auth.uid(), organization_id)
  )
);

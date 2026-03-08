-- Create is_app_founder function
CREATE OR REPLACE FUNCTION public.is_app_founder(_user_id uuid)
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

-- Assign app_founder role to the 3 accounts
INSERT INTO public.user_roles (user_id, role, organization_id)
SELECT au.id, 'app_founder'::app_role, NULL
FROM auth.users au
WHERE au.email IN ('aeindrispam@gmail.com', 'anik080413@gmail.com', 'aniksamratghosh2013@gmail.com')
ON CONFLICT DO NOTHING;

-- Update is_super_admin to also recognize app_founders (app_founders are above super_admin)
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
      AND role IN ('super_admin', 'app_founder')
      AND organization_id IS NULL
  )
$$;

-- Update is_global_admin to also recognize app_founders
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
      AND role IN ('super_admin', 'org_admin', 'app_founder')
      AND (organization_id IS NULL OR organization_id IN (
        SELECT id FROM public.organizations WHERE name = 'Admin HQ'
      ))
  )
$$;

-- Update is_org_admin to also recognize app_founders (they can admin any org)
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (organization_id = _org_id AND role IN ('org_admin', 'founder'))
        OR (role = 'app_founder' AND organization_id IS NULL)
      )
  )
$$;

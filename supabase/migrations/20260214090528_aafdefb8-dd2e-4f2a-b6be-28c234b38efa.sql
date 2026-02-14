
-- Update handle_new_organization to assign 'founder' role
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.organization_memberships (organization_id, user_id, status)
  VALUES (NEW.id, NEW.created_by, 'approved');
  
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (NEW.created_by, NEW.id, 'founder');
  
  RETURN NEW;
END;
$$;

-- Update is_org_admin to also include founder
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
      AND organization_id = _org_id
      AND role IN ('org_admin', 'founder')
  )
$$;

-- Helper: check if user is a global admin (super_admin or org_admin of admin org)
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
      AND role IN ('super_admin', 'org_admin')
      AND (organization_id IS NULL OR organization_id IN (
        SELECT id FROM public.organizations WHERE name = 'Admin HQ'
      ))
  )
$$;

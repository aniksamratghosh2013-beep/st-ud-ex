
-- Create a SECURITY DEFINER function for admin-approved membership inserts
CREATE OR REPLACE FUNCTION public.admin_add_member(
  _org_id uuid,
  _user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only app_founders or org admins can use this
  IF NOT (is_app_founder(auth.uid()) OR is_org_admin(auth.uid(), _org_id)) THEN
    RAISE EXCEPTION 'Forbidden: admin access required';
  END IF;
  
  -- Insert as approved, ignore if already exists
  INSERT INTO public.organization_memberships (organization_id, user_id, status)
  VALUES (_org_id, _user_id, 'approved')
  ON CONFLICT DO NOTHING;
END;
$$;

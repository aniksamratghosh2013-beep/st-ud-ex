-- Allow super_admins to update any organization
DROP POLICY IF EXISTS "Org owners and admins can update" ON public.organizations;
CREATE POLICY "Org owners and admins can update" 
ON public.organizations 
FOR UPDATE 
USING (is_org_owner(auth.uid(), id) OR is_org_admin(auth.uid(), id) OR is_super_admin(auth.uid()));

-- Allow super_admins to manage roles in any org
DROP POLICY IF EXISTS "Org admins can assign roles" ON public.user_roles;
CREATE POLICY "Org admins can assign roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (is_org_admin(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Org admins can update roles" ON public.user_roles;
CREATE POLICY "Org admins can update roles" 
ON public.user_roles 
FOR UPDATE 
USING (is_org_admin(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Org admins can delete roles" ON public.user_roles;
CREATE POLICY "Org admins can delete roles" 
ON public.user_roles 
FOR DELETE 
USING (is_org_admin(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

DROP POLICY "Users can request to join" ON public.organization_memberships;

CREATE POLICY "Users can subscribe to orgs"
ON public.organization_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid()) AND (status IN ('pending', 'approved'))
);
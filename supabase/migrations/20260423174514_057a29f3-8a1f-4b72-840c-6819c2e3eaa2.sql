DROP POLICY IF EXISTS "Users can request to join" ON public.organization_memberships;

CREATE POLICY "Users can subscribe to public organizations"
ON public.organization_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status IN ('pending'::public.membership_status, 'approved'::public.membership_status)
  AND EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = organization_id
      AND o.is_public = true
      AND o.is_banned = false
  )
);
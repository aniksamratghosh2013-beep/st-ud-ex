-- Restrict channel creation to org admins/founders only
DROP POLICY IF EXISTS "Org members can create channels" ON public.chat_channels;
CREATE POLICY "Org admins can create channels"
  ON public.chat_channels FOR INSERT TO authenticated
  WITH CHECK (
    (created_by = auth.uid()) AND
    is_org_admin(auth.uid(), organization_id)
  );
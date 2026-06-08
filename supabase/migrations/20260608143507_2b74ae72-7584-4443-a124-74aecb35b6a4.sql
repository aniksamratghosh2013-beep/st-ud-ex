
-- 1) Tighten EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.is_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_moderator(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_global_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_organization() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_message_content() FROM PUBLIC, anon, authenticated;

-- Functions called by the client via RPC: revoke from PUBLIC/anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.is_app_founder(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_create_post(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_add_member(uuid, uuid) FROM PUBLIC, anon;

-- 2) user_roles: prevent privilege escalation
DROP POLICY IF EXISTS "Org admins can assign roles" ON public.user_roles;
CREATE POLICY "Admins can assign roles within scope"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  (
    role = 'app_founder'::public.app_role
    AND organization_id IS NULL
    AND public.is_super_admin(auth.uid())
  )
  OR (
    role <> 'app_founder'::public.app_role
    AND organization_id IS NOT NULL
    AND (public.is_org_admin(auth.uid(), organization_id) OR public.is_super_admin(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Org admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles within scope"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  (organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), organization_id))
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  (
    role = 'app_founder'::public.app_role
    AND organization_id IS NULL
    AND public.is_super_admin(auth.uid())
  )
  OR (
    role <> 'app_founder'::public.app_role
    AND organization_id IS NOT NULL
    AND (public.is_org_admin(auth.uid(), organization_id) OR public.is_super_admin(auth.uid()))
  )
);

-- 3) meeting_participants: restrict joining
DROP POLICY IF EXISTS "Authenticated can join meetings" ON public.meeting_participants;
CREATE POLICY "Users can join meetings they are entitled to"
ON public.meeting_participants
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_id
      AND (
        m.created_by = auth.uid()
        OR m.organization_id IS NULL
        OR public.is_member(auth.uid(), m.organization_id)
        OR public.is_org_admin(auth.uid(), m.organization_id)
      )
  )
);

-- 4) meeting_polls: restrict to meeting creator or participant
DROP POLICY IF EXISTS "Meeting creators can create polls" ON public.meeting_polls;
CREATE POLICY "Meeting creators or participants can create polls"
ON public.meeting_polls
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = meeting_polls.meeting_id AND mp.user_id = auth.uid())
  )
);

-- 5) email_validation_logs: explicit deny for client writes
CREATE POLICY "No client inserts to email validation logs"
ON public.email_validation_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "No client updates to email validation logs"
ON public.email_validation_logs
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "No client deletes from email validation logs"
ON public.email_validation_logs
FOR DELETE
TO anon, authenticated
USING (false);

REVOKE INSERT, UPDATE, DELETE ON public.email_validation_logs FROM anon, authenticated;

-- 6) Storage: chat-attachments — restrict to uploader's folder
DROP POLICY IF EXISTS "Authenticated users can view chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own chat attachments" ON storage.objects;

-- Path convention: chat/{user_id}/... or dm/{user_id}/...
CREATE POLICY "Chat attachments: uploader can read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Chat attachments: uploader can insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Chat attachments: uploader can delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- 7) Storage: meeting-recordings — restrict to meeting participants/creator
DROP POLICY IF EXISTS "Users can view their org recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload recordings" ON storage.objects;

CREATE POLICY "Meeting recordings: participants/creator can read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'meeting-recordings'
  AND EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id::text = (storage.foldername(name))[1]
      AND (
        m.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = auth.uid())
        OR (m.organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), m.organization_id))
      )
  )
);

CREATE POLICY "Meeting recordings: participants/creator can upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'meeting-recordings'
  AND EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id::text = (storage.foldername(name))[1]
      AND (
        m.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = auth.uid())
      )
  )
);

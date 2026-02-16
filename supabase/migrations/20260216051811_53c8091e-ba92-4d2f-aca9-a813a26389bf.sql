
-- Drop existing weak policies on storage.objects for org-logos
DROP POLICY IF EXISTS "Org admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Org admins can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Org admins can delete logos" ON storage.objects;

-- Recreate with proper org admin verification using folder path
CREATE POLICY "Org admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND public.is_org_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Org admins can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND public.is_org_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Org admins can delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND public.is_org_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

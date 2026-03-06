UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';

-- Update SELECT policy to require authentication
DROP POLICY IF EXISTS "Anyone can view chat attachments" ON storage.objects;
CREATE POLICY "Authenticated users can view chat attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
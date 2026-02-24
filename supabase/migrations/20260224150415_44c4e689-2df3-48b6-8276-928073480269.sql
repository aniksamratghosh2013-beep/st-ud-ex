
-- Organization follows table (one-way)
CREATE TABLE public.organization_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  following_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_org_id, following_org_id),
  CHECK(follower_org_id != following_org_id)
);

ALTER TABLE public.organization_follows ENABLE ROW LEVEL SECURITY;

-- Only admins/founders of the follower org can follow
CREATE POLICY "Org admins can follow other orgs" ON public.organization_follows
  FOR INSERT WITH CHECK (
    is_org_admin(auth.uid(), follower_org_id) AND created_by = auth.uid()
  );

CREATE POLICY "Org admins can unfollow" ON public.organization_follows
  FOR DELETE USING (
    is_org_admin(auth.uid(), follower_org_id)
  );

CREATE POLICY "Anyone can view org follows" ON public.organization_follows
  FOR SELECT USING (true);

-- Chat attachments storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true);

-- Storage RLS: members of the org owning the channel can upload
CREATE POLICY "Authenticated users can upload chat attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view chat attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "Users can delete own chat attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Add attachment columns to chat_messages
ALTER TABLE public.chat_messages 
  ADD COLUMN attachment_url text,
  ADD COLUMN attachment_name text,
  ADD COLUMN attachment_type text;

-- Add attachment columns to direct_messages
ALTER TABLE public.direct_messages 
  ADD COLUMN attachment_url text,
  ADD COLUMN attachment_name text,
  ADD COLUMN attachment_type text;

-- Enable realtime for organization_follows
ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_follows;

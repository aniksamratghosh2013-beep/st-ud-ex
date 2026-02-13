
-- Chat system tables
CREATE TABLE public.chat_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Channel policies: org members can view/create
CREATE POLICY "Org members can view channels" ON public.chat_channels
  FOR SELECT USING (is_member(auth.uid(), organization_id) OR is_org_admin(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Org members can create channels" ON public.chat_channels
  FOR INSERT WITH CHECK (is_member(auth.uid(), organization_id) OR is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update channels" ON public.chat_channels
  FOR UPDATE USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete channels" ON public.chat_channels
  FOR DELETE USING (is_org_admin(auth.uid(), organization_id));

-- Message policies: org members can view/create
CREATE POLICY "Org members can view messages" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = channel_id
      AND (is_member(auth.uid(), c.organization_id) OR is_org_admin(auth.uid(), c.organization_id) OR is_super_admin(auth.uid()))
    )
  );

CREATE POLICY "Org members can send messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = channel_id
      AND (is_member(auth.uid(), c.organization_id) OR is_org_admin(auth.uid(), c.organization_id))
    )
  );

CREATE POLICY "Users can update own messages" ON public.chat_messages
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own messages" ON public.chat_messages
  FOR DELETE USING (user_id = auth.uid());

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

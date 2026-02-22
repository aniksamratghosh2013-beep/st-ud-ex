
-- Create meetings table
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  room_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'scheduled',
  max_participants INTEGER NOT NULL DEFAULT 100,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view meetings"
ON public.meetings FOR SELECT
USING (
  (organization_id IS NULL AND created_by = auth.uid())
  OR (organization_id IS NOT NULL AND (
    is_member(auth.uid(), organization_id)
    OR is_org_admin(auth.uid(), organization_id)
    OR is_super_admin(auth.uid())
  ))
);

CREATE POLICY "Authenticated users can create meetings"
ON public.meetings FOR INSERT
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators can update meetings"
ON public.meetings FOR UPDATE
USING (created_by = auth.uid() OR (organization_id IS NOT NULL AND is_org_admin(auth.uid(), organization_id)));

CREATE POLICY "Creators can delete meetings"
ON public.meetings FOR DELETE
USING (created_by = auth.uid() OR (organization_id IS NOT NULL AND is_org_admin(auth.uid(), organization_id)));

-- Create meeting_participants table
CREATE TABLE public.meeting_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  left_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view participants of their meetings"
ON public.meeting_participants FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_id AND (
      m.created_by = auth.uid()
      OR (m.organization_id IS NOT NULL AND (
        is_member(auth.uid(), m.organization_id)
        OR is_org_admin(auth.uid(), m.organization_id)
      ))
    )
  )
);

CREATE POLICY "Authenticated can join meetings"
ON public.meeting_participants FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own participation"
ON public.meeting_participants FOR UPDATE
USING (user_id = auth.uid());

-- Create meeting_recordings table
CREATE TABLE public.meeting_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  duration_seconds INTEGER,
  file_url TEXT,
  file_size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'processing',
  recorded_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view recordings"
ON public.meeting_recordings FOR SELECT
USING (
  recorded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_id AND (
      m.created_by = auth.uid()
      OR (m.organization_id IS NOT NULL AND (
        is_member(auth.uid(), m.organization_id)
        OR is_org_admin(auth.uid(), m.organization_id)
      ))
    )
  )
);

CREATE POLICY "Authenticated can create recordings"
ON public.meeting_recordings FOR INSERT
WITH CHECK (recorded_by = auth.uid());

CREATE POLICY "Recorders can delete recordings"
ON public.meeting_recordings FOR DELETE
USING (recorded_by = auth.uid());

-- Create meeting_polls table for interactive polls
CREATE TABLE public.meeting_polls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  created_by UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meeting participants can view polls"
ON public.meeting_polls FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_id AND (
      m.created_by = auth.uid()
      OR (m.organization_id IS NOT NULL AND is_member(auth.uid(), m.organization_id))
    )
  )
);

CREATE POLICY "Meeting creators can create polls"
ON public.meeting_polls FOR INSERT
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Poll creators can update polls"
ON public.meeting_polls FOR UPDATE
USING (created_by = auth.uid());

-- Create storage bucket for recordings
INSERT INTO storage.buckets (id, name, public) VALUES ('meeting-recordings', 'meeting-recordings', false);

CREATE POLICY "Users can view their org recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'meeting-recordings' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can upload recordings"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'meeting-recordings' AND auth.uid() IS NOT NULL);

-- Enable realtime for meetings
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_polls;

-- Add updated_at triggers
CREATE TRIGGER update_meetings_updated_at
BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

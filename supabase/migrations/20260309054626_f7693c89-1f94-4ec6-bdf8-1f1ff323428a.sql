
-- Organization polls table
CREATE TABLE public.organization_polls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Poll votes table
CREATE TABLE public.organization_poll_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES public.organization_polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

-- Enable RLS
ALTER TABLE public.organization_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_poll_votes ENABLE ROW LEVEL SECURITY;

-- RLS for organization_polls
CREATE POLICY "Org members can view polls" ON public.organization_polls
  FOR SELECT TO authenticated
  USING (is_member(auth.uid(), organization_id) OR is_org_admin(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins can create polls" ON public.organization_polls
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update polls" ON public.organization_polls
  FOR UPDATE TO authenticated
  USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete polls" ON public.organization_polls
  FOR DELETE TO authenticated
  USING (is_org_admin(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

-- RLS for organization_poll_votes
CREATE POLICY "Members can view votes" ON public.organization_poll_votes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_polls p
    WHERE p.id = organization_poll_votes.poll_id
    AND (is_member(auth.uid(), p.organization_id) OR is_org_admin(auth.uid(), p.organization_id))
  ));

CREATE POLICY "Members can vote" ON public.organization_poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.organization_polls p
    WHERE p.id = organization_poll_votes.poll_id
    AND p.is_active = true
    AND (is_member(auth.uid(), p.organization_id) OR is_org_admin(auth.uid(), p.organization_id))
  ));

CREATE POLICY "Users can change their vote" ON public.organization_poll_votes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- Posts table: users can post individually or on behalf of an organization
CREATE TABLE public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view posts
CREATE POLICY "Anyone can view posts"
ON public.posts FOR SELECT
USING (true);

-- Users can create personal posts (org_id null) or org posts if admin/founder
CREATE POLICY "Users can create posts"
ON public.posts FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    organization_id IS NULL
    OR is_org_admin(auth.uid(), organization_id)
    OR is_member(auth.uid(), organization_id)
  )
);

-- Users can update own posts
CREATE POLICY "Users can update own posts"
ON public.posts FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete own posts, org admins can delete org posts
CREATE POLICY "Users can delete own posts"
ON public.posts FOR DELETE
USING (
  auth.uid() = user_id
  OR (organization_id IS NOT NULL AND is_org_admin(auth.uid(), organization_id))
  OR is_super_admin(auth.uid())
);

CREATE TRIGGER update_posts_updated_at
BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Organization events table for calendar
CREATE TABLE public.organization_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_events ENABLE ROW LEVEL SECURITY;

-- Org members can view events
CREATE POLICY "Org members can view events"
ON public.organization_events FOR SELECT
USING (
  is_member(auth.uid(), organization_id)
  OR is_org_admin(auth.uid(), organization_id)
  OR is_super_admin(auth.uid())
);

-- Only founders/admins can create events
CREATE POLICY "Admins can create events"
ON public.organization_events FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND is_org_admin(auth.uid(), organization_id)
);

-- Only founders/admins can update events
CREATE POLICY "Admins can update events"
ON public.organization_events FOR UPDATE
USING (is_org_admin(auth.uid(), organization_id));

-- Only founders/admins can delete events
CREATE POLICY "Admins can delete events"
ON public.organization_events FOR DELETE
USING (is_org_admin(auth.uid(), organization_id) OR is_super_admin(auth.uid()));

CREATE TRIGGER update_org_events_updated_at
BEFORE UPDATE ON public.organization_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for posts
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;

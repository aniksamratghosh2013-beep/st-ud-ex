
-- ==========================================
-- SyncUp Phase 1: Foundation Schema
-- ==========================================

-- 1. Create role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'org_admin', 'moderator', 'member');

-- 2. Create membership status enum
CREATE TYPE public.membership_status AS ENUM ('pending', 'approved', 'rejected');

-- 3. Create privacy setting enum
CREATE TYPE public.privacy_setting AS ENUM ('public', 'members_only', 'private');

-- ==========================================
-- PROFILES TABLE
-- ==========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  skills TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  online_status TEXT DEFAULT 'offline' CHECK (online_status IN ('online', 'offline', 'in_call')),
  privacy_setting public.privacy_setting DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- ORGANIZATIONS TABLE
-- ==========================================
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- ORGANIZATION MEMBERSHIPS TABLE
-- ==========================================
CREATE TABLE public.organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.membership_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- USER ROLES TABLE (separate from profiles!)
-- ==========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- ==========================================

-- Check if user is super admin (org_id is NULL for platform-level)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
      AND organization_id IS NULL
  )
$$;

-- Check if user is approved member of an org
CREATE OR REPLACE FUNCTION public.is_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND status = 'approved'
  )
$$;

-- Check if user is org admin
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role = 'org_admin'
  )
$$;

-- Check if user is moderator
CREATE OR REPLACE FUNCTION public.is_moderator(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role IN ('moderator', 'org_admin')
  )
$$;

-- Check if user is org owner
CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = _org_id
      AND created_by = _user_id
  )
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_memberships_updated_at
  BEFORE UPDATE ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- RLS POLICIES: PROFILES
-- ==========================================
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (privacy_setting = 'public' OR id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- ==========================================
-- RLS POLICIES: ORGANIZATIONS
-- ==========================================
CREATE POLICY "Public orgs are viewable by everyone"
  ON public.organizations FOR SELECT
  USING (is_public = true OR public.is_member(auth.uid(), id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can create orgs"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Org owners and admins can update"
  ON public.organizations FOR UPDATE
  USING (public.is_org_owner(auth.uid(), id) OR public.is_org_admin(auth.uid(), id));

CREATE POLICY "Org owners and super admins can delete"
  ON public.organizations FOR DELETE
  USING (public.is_org_owner(auth.uid(), id) OR public.is_super_admin(auth.uid()));

-- ==========================================
-- RLS POLICIES: ORGANIZATION MEMBERSHIPS
-- ==========================================
CREATE POLICY "Members can view org memberships"
  ON public.organization_memberships FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_member(auth.uid(), organization_id)
    OR public.is_org_admin(auth.uid(), organization_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can request to join"
  ON public.organization_memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND status = 'pending'
  );

CREATE POLICY "Admins and mods can update memberships"
  ON public.organization_memberships FOR UPDATE
  USING (
    public.is_org_admin(auth.uid(), organization_id)
    OR public.is_moderator(auth.uid(), organization_id)
  );

CREATE POLICY "Users can delete own membership"
  ON public.organization_memberships FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_org_admin(auth.uid(), organization_id)
    OR public.is_super_admin(auth.uid())
  );

-- ==========================================
-- RLS POLICIES: USER ROLES
-- ==========================================
CREATE POLICY "Members can view roles in their orgs"
  ON public.user_roles FOR SELECT
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_member(auth.uid(), organization_id))
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org admins can assign roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (
    public.is_org_admin(auth.uid(), organization_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Org admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (
    public.is_org_admin(auth.uid(), organization_id)
    OR public.is_super_admin(auth.uid())
  );

-- ==========================================
-- STORAGE BUCKETS
-- ==========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('org-logos', 'org-logos', true);

-- Avatar storage policies
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Avatars are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Org logo storage policies
CREATE POLICY "Org logos are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');

CREATE POLICY "Org admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'org-logos');

CREATE POLICY "Org admins can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'org-logos');

-- ==========================================
-- AUTO-CREATE MEMBERSHIP + ROLE ON ORG CREATION
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-add creator as approved member
  INSERT INTO public.organization_memberships (organization_id, user_id, status)
  VALUES (NEW.id, NEW.created_by, 'approved');
  
  -- Auto-assign org_admin role to creator
  INSERT INTO public.user_roles (user_id, organization_id, role)
  VALUES (NEW.created_by, NEW.id, 'org_admin');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_organization_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_organization();

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX idx_memberships_org_id ON public.organization_memberships(organization_id);
CREATE INDEX idx_memberships_user_id ON public.organization_memberships(user_id);
CREATE INDEX idx_memberships_status ON public.organization_memberships(status);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_org_id ON public.user_roles(organization_id);
CREATE INDEX idx_organizations_created_by ON public.organizations(created_by);

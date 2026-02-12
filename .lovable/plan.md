

# SyncUp — Phase 1: Foundation

## Overview
Build the core foundation of SyncUp: authentication, user profiles, organization management, and role-based access control. This creates the backbone that all future features (chat, video, events) will plug into.

---

## 1. Authentication System
- Email + password signup/login with email verification
- Magic link login
- Google, GitHub, and Microsoft OAuth (configured via Supabase dashboard — guidance provided)
- Password reset flow
- Session management with proper redirect handling
- Clean login/signup pages with provider buttons

## 2. User Profiles
- Profile page with avatar upload (using Supabase Storage), bio, skills/interests
- Online/offline status indicator
- Privacy controls (visibility settings)
- Organization membership list on profile
- Edit profile page

## 3. Organization System
- Create new organizations with name, description, and logo
- Browse/discover organizations
- Join via invite link or request approval
- Organization detail page showing members, description, and admin tools
- Leave organization functionality

## 4. Role-Based Access Control
- Roles: Super Admin, Org Admin, Moderator, Member
- Separate `user_roles` table (security best practice)
- Users can have different roles per organization
- Org admins can assign/change roles, approve/reject members, remove users
- Role-based UI — show/hide admin controls based on permissions

## 5. Admin Dashboard (Basic)
- Super Admin dashboard: total users, total orgs, recent activity
- Org Admin dashboard: member list, role management, pending join requests
- Sidebar navigation layout with dark/light mode toggle

## 6. UI/UX Foundation
- Modern, clean design with sidebar navigation
- Dark mode / light mode toggle
- Responsive layout (mobile-friendly)
- Top bar with user avatar, notification bell (placeholder for Phase 2)
- Smooth page transitions

---

## What's Next (Future Phases)
- **Phase 2**: Real-time chat system (org channels, DMs, group chats)
- **Phase 3**: Event management + notifications system
- **Phase 4**: Video calling integration (Daily.co or LiveKit)
- **Phase 5**: Email system, moderation tools, analytics


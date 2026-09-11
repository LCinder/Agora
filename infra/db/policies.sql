-- Row level security: the tenant boundary
--
-- CLAUDE.md, section 8: "Ningún usuario de un municipio puede leer o modificar
-- datos de otro. Este aislamiento debe garantizarse en la base de datos, no
-- solo en el frontend, y cubrirse con tests."
--
-- This file is that guarantee. The application is not trusted to filter by
-- municipality: even a query with no WHERE clause returns only rows the caller
-- is entitled to. Tests for this are the highest priority in the suite, and
-- `tests.sql` beside this file is where they go.
--
-- Two identities reach the database:
--   * a staff user (town hall, association, us), identified by the auth
--     provider and resolved through `memberships`;
--   * an anonymous device (a resident), identified by nothing else at all.
--
-- Provider binding lives in the two functions below. Swapping Supabase for
-- Cognito means rewriting those, and nothing else. See docs/decisiones.md,
-- D-001.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- On Supabase this reads auth.uid(); on another provider, whatever it sets.
create or replace function current_auth_id() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '');
$$;

create or replace function current_staff_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from staff_users where auth_user_id = current_auth_id();
$$;

create or replace function current_device_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from devices where anonymous_auth_id = current_auth_id();
$$;

create or replace function is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where staff_user_id = current_staff_user_id() and role = 'superadmin'
  );
$$;

-- The municipalities a staff user may touch, and at what level. `security
-- definer` so the policies below can call it without recursing into the RLS on
-- `memberships` itself.
create or replace function can_edit_municipality(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin() or exists (
    select 1 from memberships m
    where m.staff_user_id = current_staff_user_id()
      and m.municipality_id = target
      and m.role in ('municipal_editor', 'municipal_admin')
  );
$$;

create or replace function can_administer_municipality(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_superadmin() or exists (
    select 1 from memberships m
    where m.staff_user_id = current_staff_user_id()
      and m.municipality_id = target
      and m.role = 'municipal_admin'
  );
$$;

-- The associations a staff user edits for. An association editor is scoped to
-- one association inside one municipality and nothing else.
create or replace function editable_organizations() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id from memberships m
  where m.staff_user_id = current_staff_user_id()
    and m.role = 'org_editor'
    and m.organization_id is not null;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. A table without it is a hole.
-- ---------------------------------------------------------------------------

alter table municipalities         enable row level security;
alter table staff_users            enable row level security;
alter table organizations          enable row level security;
alter table memberships            enable row level security;
alter table devices                enable row level security;
alter table device_municipalities  enable row level security;
alter table event_categories       enable row level security;
alter table events                 enable row level security;
alter table event_pending_changes  enable row level security;
alter table event_interests        enable row level security;
alter table event_updates          enable row level security;
alter table live_sessions          enable row level security;
alter table live_positions         enable row level security;
alter table event_daily_stats      enable row level security;
alter table audit_log              enable row level security;

-- ---------------------------------------------------------------------------
-- Municipalities
-- ---------------------------------------------------------------------------

-- Anyone may list municipalities: the selector in the app needs it, and the
-- name and population of a town are not a secret.
create policy municipalities_public_read on municipalities
  for select using (status in ('demo', 'pilot', 'active'));

create policy municipalities_admin_write on municipalities
  for update using (can_administer_municipality(id));

create policy municipalities_superadmin_all on municipalities
  for all using (is_superadmin()) with check (is_superadmin());

-- ---------------------------------------------------------------------------
-- Staff, memberships and organisations
-- ---------------------------------------------------------------------------

create policy staff_users_self_read on staff_users
  for select using (id = current_staff_user_id() or is_superadmin());

create policy memberships_self_read on memberships
  for select using (staff_user_id = current_staff_user_id() or is_superadmin());

create policy memberships_admin_manage on memberships
  for all using (can_administer_municipality(municipality_id))
  with check (can_administer_municipality(municipality_id));

-- Residents see which association organises an event, so associations are
-- readable; only the town hall creates and disables them.
create policy organizations_public_read on organizations
  for select using (status = 'active' or can_edit_municipality(municipality_id));

create policy organizations_admin_manage on organizations
  for all using (can_administer_municipality(municipality_id))
  with check (can_administer_municipality(municipality_id));

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------

-- A device sees itself and nothing else. Crucially, one device can never read
-- another: that is what stops the interest table from becoming a social graph.
create policy devices_self on devices
  for all using (id = current_device_id()) with check (id = current_device_id());

create policy device_municipalities_self on device_municipalities
  for all using (device_id = current_device_id())
  with check (device_id = current_device_id());

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create policy event_categories_read on event_categories
  for select using (true);

create policy event_categories_manage on event_categories
  for all using (
    municipality_id is not null and can_administer_municipality(municipality_id)
  )
  with check (
    municipality_id is not null and can_administer_municipality(municipality_id)
  );

-- ---------------------------------------------------------------------------
-- Events — the heart of it
-- ---------------------------------------------------------------------------

-- Residents see published and cancelled events. Cancelled stays visible on
-- purpose: someone who planned their evening around it has to find out.
create policy events_public_read on events
  for select using (status in ('published', 'cancelled'));

-- Town hall staff see everything of their own municipality, whatever the state.
create policy events_municipal_read on events
  for select using (can_edit_municipality(municipality_id));

create policy events_municipal_write on events
  for all using (can_edit_municipality(municipality_id))
  with check (can_edit_municipality(municipality_id));

-- An association sees and edits its own events, and only in its own
-- municipality. Both halves are checked: the organisation must be one it
-- edits, and the municipality must be that organisation's.
create policy events_organization_read on events
  for select using (organization_id in (select editable_organizations()));

create policy events_organization_insert on events
  for insert with check (
    organization_id in (select editable_organizations())
    and exists (
      select 1 from organizations o
      where o.id = organization_id and o.municipality_id = events.municipality_id
    )
    -- An association may never publish directly. Approval is the town hall's,
    -- and a trusted association is promoted by a trigger, not by claiming it.
    and status in ('draft', 'pending_review')
  );

create policy events_organization_update on events
  for update using (organization_id in (select editable_organizations()))
  with check (
    organization_id in (select editable_organizations())
    and status in ('draft', 'pending_review')
  );

-- ---------------------------------------------------------------------------
-- Interest: readable only in aggregate
-- ---------------------------------------------------------------------------

-- A device reads and writes its own marks. Note what is missing: there is no
-- policy letting a town hall read this table at all. Counts reach the panel
-- through event_daily_stats, so no municipal user can ever see which device
-- is interested in what — which is the promise the privacy policy makes.
create policy event_interests_device on event_interests
  for all using (device_id = current_device_id())
  with check (device_id = current_device_id());

create policy event_updates_public_read on event_updates
  for select using (
    exists (
      select 1 from events e
      where e.id = event_id and e.status in ('published', 'cancelled')
    )
  );

create policy event_updates_municipal_write on event_updates
  for all using (
    exists (
      select 1 from events e
      where e.id = event_id and can_edit_municipality(e.municipality_id)
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = event_id and can_edit_municipality(e.municipality_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Live tracking
-- ---------------------------------------------------------------------------

-- The volunteer code is a credential, so residents read the session through a
-- view that excludes it rather than from the table.
create policy live_sessions_municipal on live_sessions
  for all using (can_edit_municipality(municipality_id))
  with check (can_edit_municipality(municipality_id));

create view public_live_sessions as
  select id, event_id, municipality_id, status, planned_route, started_at, ended_at
  from live_sessions
  where status in ('active', 'paused', 'ended');

create policy live_positions_read on live_positions
  for select using (
    exists (
      select 1 from live_sessions s
      where s.id = session_id and s.status in ('active', 'paused')
    )
  );

-- ---------------------------------------------------------------------------
-- Aggregates and audit
-- ---------------------------------------------------------------------------

create policy event_daily_stats_municipal_read on event_daily_stats
  for select using (
    exists (
      select 1 from events e
      where e.id = event_id and can_edit_municipality(e.municipality_id)
    )
  );

create policy audit_log_admin_read on audit_log
  for select using (can_administer_municipality(municipality_id));

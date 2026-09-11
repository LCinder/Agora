-- Municipal events platform — database schema
--
-- Plain PostgreSQL. It runs on Supabase, on RDS, or on a container, so writing
-- it does not commit us to the backend decision that is still open (D-001).
--
-- The one rule the whole schema is built around: every row belongs to exactly
-- one municipality, and no query can ever cross that line. That is enforced by
-- row level security in policies.sql, not by the application — an application
-- bug must not be able to leak one town hall's data to another.
--
-- Conventions: snake_case columns, plural table names, UUID primary keys,
-- timestamptz everywhere (never a naked timestamp — the whole product depends
-- on knowing what instant a thing happened at).

create extension if not exists "pgcrypto";
-- Case-insensitive text, for emails.
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------

create type municipality_status as enum ('demo', 'pilot', 'active', 'inactive');

create table municipalities (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name            text not null,
  province        text not null,
  population      integer not null check (population > 0),
  ine_code        char(5) not null unique check (ine_code ~ '^[0-9]{5}$'),
  latitude        double precision not null check (latitude between -90 and 90),
  longitude       double precision not null check (longitude between -180 and 180),
  time_zone       text not null default 'Europe/Madrid',
  default_locale  text not null default 'es',
  status          municipality_status not null default 'demo',

  -- Branding and settings, mirroring content/municipalities/<slug>/municipality.json
  logo_url        text,
  primary_color   char(7) not null check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  hero_image_url  text,
  reminder_hour   smallint not null default 19 check (reminder_hour between 0 and 23),
  max_daily_notifications smallint not null default 3 check (max_daily_notifications between 1 and 20),

  -- Contracted modules. Checked server side, not only in the interface.
  features        text[] not null default '{}',

  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People who log in: municipal staff, associations, us
-- ---------------------------------------------------------------------------

create table staff_users (
  id            uuid primary key default gen_random_uuid(),
  -- Identifier from the authentication provider. Kept separate from our own id
  -- so changing provider does not rewrite every foreign key.
  auth_user_id  text not null unique,
  email         citext not null unique,
  full_name     text not null,
  created_at    timestamptz not null default now()
);

create type organization_type as enum (
  'brotherhood', 'pena', 'sports_club', 'parents_assoc', 'cultural', 'seniors', 'other'
);
create type organization_status as enum ('invited', 'active', 'disabled');

create table organizations (
  id              uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipalities(id) on delete cascade,
  name            text not null,
  type            organization_type not null,
  contact_email   citext,
  -- A trusted association publishes without review. The lever that keeps the
  -- review queue short enough that the town hall actually looks at it.
  is_trusted      boolean not null default false,
  status          organization_status not null default 'invited',
  logo_url        text,
  created_at      timestamptz not null default now(),

  unique (municipality_id, name)
);

create type membership_role as enum (
  'org_editor', 'municipal_editor', 'municipal_admin', 'superadmin'
);

create table memberships (
  id              uuid primary key default gen_random_uuid(),
  staff_user_id   uuid not null references staff_users(id) on delete cascade,
  municipality_id uuid not null references municipalities(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  role            membership_role not null,
  created_at      timestamptz not null default now(),

  -- An association editor must be attached to an association; everyone else
  -- must not be. Encoding it here means no application path can create a
  -- membership that makes no sense.
  constraint org_editor_has_organization check (
    (role = 'org_editor') = (organization_id is not null)
  ),
  -- The organisation has to belong to the same municipality as the membership.
  -- Enforced by the trigger below, which a foreign key alone cannot express.
  unique (staff_user_id, municipality_id, organization_id)
);

create or replace function check_membership_organization() returns trigger
language plpgsql as $$
begin
  if new.organization_id is not null then
    if not exists (
      select 1 from organizations o
      where o.id = new.organization_id and o.municipality_id = new.municipality_id
    ) then
      raise exception 'organization % does not belong to municipality %',
        new.organization_id, new.municipality_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger memberships_organization_matches_municipality
  before insert or update on memberships
  for each row execute function check_membership_organization();

-- ---------------------------------------------------------------------------
-- Residents: anonymous devices, never people
-- ---------------------------------------------------------------------------

create type device_platform as enum ('ios', 'android', 'web');

-- No name, no email, no phone. A device is the only identity a resident has,
-- and it is one they never created. This is the table an auditor will look at
-- first, so it must stay this empty.
create table devices (
  id                uuid primary key default gen_random_uuid(),
  anonymous_auth_id text not null unique,
  platform          device_platform not null,
  locale            text not null default 'es',
  push_token        text,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now()
);

create table device_municipalities (
  device_id       uuid not null references devices(id) on delete cascade,
  municipality_id uuid not null references municipalities(id) on delete cascade,
  created_at      timestamptz not null default now(),

  primary key (device_id, municipality_id)
);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table event_categories (
  id              uuid primary key default gen_random_uuid(),
  -- Null means the category is shared by every municipality.
  municipality_id uuid references municipalities(id) on delete cascade,
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name            text not null,
  icon            text not null,
  color           char(7) not null check (color ~ '^#[0-9a-fA-F]{6}$')
);

-- One shared category per slug, and one per municipality per slug.
create unique index event_categories_shared_slug
  on event_categories (slug) where municipality_id is null;
create unique index event_categories_municipal_slug
  on event_categories (municipality_id, slug) where municipality_id is not null;

create type event_status as enum (
  'draft', 'pending_review', 'published', 'rejected', 'cancelled'
);

create table events (
  id              uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references municipalities(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  created_by      uuid references staff_users(id) on delete set null,

  title           text not null check (length(trim(title)) > 0),
  description     text not null default '',
  category_id     uuid references event_categories(id) on delete set null,

  start_at        timestamptz not null,
  end_at          timestamptz,
  all_day         boolean not null default false,

  location_name   text not null,
  latitude        double precision check (latitude between -90 and 90),
  longitude       double precision check (longitude between -180 and 180),
  image_url       text,

  price_info      text,
  is_free         boolean not null default true,
  audience_tags   text[] not null default '{}',

  status          event_status not null default 'draft',
  rejection_reason text,
  is_featured     boolean not null default false,
  live_tracking_enabled boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  published_at    timestamptz,

  constraint ends_after_it_starts check (end_at is null or end_at >= start_at),
  constraint rejected_says_why check (status <> 'rejected' or rejection_reason is not null)
);

-- The calendar query: published events of one municipality, by date. Every
-- resident opening the app runs this one, so it gets its own index.
create index events_calendar
  on events (municipality_id, start_at)
  where status in ('published', 'cancelled');

create index events_review_queue
  on events (municipality_id, created_at)
  where status = 'pending_review';

-- Edits an association makes to an already published event. The published
-- version stays visible while the change waits for approval.
create table event_pending_changes (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  payload     jsonb not null,
  created_by  uuid references staff_users(id) on delete set null,
  status      event_status not null default 'pending_review',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Interest and notices
-- ---------------------------------------------------------------------------

create table event_interests (
  device_id       uuid not null references devices(id) on delete cascade,
  event_id        uuid not null references events(id) on delete cascade,
  created_at      timestamptz not null default now(),
  reminder_sent_at timestamptz,

  primary key (device_id, event_id)
);

-- The reminder job reads this: interests whose event starts soon and that have
-- not been reminded yet.
create index event_interests_pending_reminders
  on event_interests (event_id) where reminder_sent_at is null;

create type event_update_type as enum (
  'time_change', 'location_change', 'cancelled', 'notice'
);

create table event_updates (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  type         event_update_type not null,
  message      text not null,
  created_by   uuid references staff_users(id) on delete set null,
  created_at   timestamptz not null default now(),
  push_sent_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Live tracking
-- ---------------------------------------------------------------------------

create type live_session_status as enum ('scheduled', 'active', 'paused', 'ended');

create table live_sessions (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,
  municipality_id uuid not null references municipalities(id) on delete cascade,
  -- Short code a volunteer types on their phone to start broadcasting.
  volunteer_code  text not null unique,
  status          live_session_status not null default 'scheduled',
  planned_route   jsonb,
  started_at      timestamptz,
  ended_at        timestamptz
);

-- The detail of this table is deleted when the event ends; only a simplified
-- route may be kept. It is the only place in the product where a person's
-- location is stored, and it is stored for hours, not for ever.
create table live_positions (
  id            bigserial primary key,
  session_id    uuid not null references live_sessions(id) on delete cascade,
  latitude      double precision not null check (latitude between -90 and 90),
  longitude     double precision not null check (longitude between -180 and 180),
  accuracy_m    real,
  recorded_at   timestamptz not null default now()
);

create index live_positions_session_time on live_positions (session_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Aggregates and audit
-- ---------------------------------------------------------------------------

-- Aggregated per day. There is deliberately no per-device analytics table:
-- what does not exist cannot leak and cannot be subpoenaed.
create table event_daily_stats (
  event_id        uuid not null references events(id) on delete cascade,
  date            date not null,
  views           integer not null default 0,
  detail_opens    integer not null default 0,
  interests_added integer not null default 0,
  shares          integer not null default 0,

  primary key (event_id, date)
);

create table audit_log (
  id              bigserial primary key,
  municipality_id uuid references municipalities(id) on delete set null,
  actor_id        uuid references staff_users(id) on delete set null,
  action          text not null,
  entity          text not null,
  entity_id       uuid,
  created_at      timestamptz not null default now()
);

create index audit_log_municipality_time on audit_log (municipality_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Housekeeping
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_touch_updated_at
  before update on events
  for each row execute function touch_updated_at();

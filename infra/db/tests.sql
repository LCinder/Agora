-- Tenant isolation tests
--
-- The highest priority tests in the product (CLAUDE.md, section 10): if these
-- pass, one town hall cannot reach another's data even through a query with no
-- WHERE clause. Run them against a throwaway database:
--
--   psql -v ON_ERROR_STOP=1 -f schema.sql -f policies.sql -f tests.sql
--
-- Everything runs as `app_user`, a role with no BYPASSRLS, because the
-- superuser ignores row level security and would make every test pass.
--
-- What is deliberately NOT asserted: that a user of one municipality cannot
-- read another's *published* events. Published events are public — a resident
-- reads them with no account at all, and a neighbour may follow several towns.
-- The boundary being defended here is unpublished data and every write.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------

create or replace function assert_count(label text, actual bigint, expected bigint)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % — expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end;
$$;

create or replace function assert_denied(label text, statement text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege or check_violation then
    raise notice 'ok  % (rejected)', label;
    return;
  end;
  raise exception 'FAIL % — the statement was allowed and should not have been', label;
end;
$$;

-- Rows a write silently failed to touch are the subtle case: RLS does not
-- raise on UPDATE, it just matches nothing.
create or replace function assert_no_rows_changed(label text, statement text)
returns void language plpgsql as $$
declare
  touched bigint;
begin
  execute statement;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL % — % rows were modified and none should have been', label, touched;
  end if;
  raise notice 'ok  % (no rows touched)', label;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: two municipalities that must never see each other
-- ---------------------------------------------------------------------------

insert into municipalities (id, slug, name, province, population, ine_code, latitude, longitude, primary_color, status)
values
  ('11111111-1111-1111-1111-111111111111', 'la-zubia', 'La Zubia', 'Granada', 20389, '18193', 37.12056, -3.585, '#1B5E20', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'otura', 'Otura', 'Granada', 7696, '18149', 37.0869, -3.6403, '#7C3AED', 'active');

insert into staff_users (id, auth_user_id, email, full_name)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'auth-zubia-editor', 'tecnico@lazubia.example', 'Técnica de cultura de La Zubia'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'auth-otura-editor', 'tecnico@otura.example', 'Técnico de cultura de Otura'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'auth-hermandad', 'hermandad@lazubia.example', 'Responsable de la hermandad');

insert into organizations (id, municipality_id, name, type, status, is_trusted)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Hermandad de San Juan', 'brotherhood', 'active', false),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Peña Flamenca', 'pena', 'active', false);

insert into memberships (staff_user_id, municipality_id, organization_id, role)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', null, 'municipal_admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', null, 'municipal_admin'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001', 'org_editor');

insert into devices (id, anonymous_auth_id, platform)
values
  ('dddddddd-0000-0000-0000-000000000001', 'device-one', 'android'),
  ('dddddddd-0000-0000-0000-000000000002', 'device-two', 'ios');

insert into events (id, municipality_id, organization_id, title, start_at, location_name, status)
values
  -- La Zubia
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', null, 'Cabalgata de Reyes', '2027-01-05T18:00:00+01', 'Plaza', 'published'),
  ('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', null, 'Borrador municipal', '2027-02-01T18:00:00+01', 'Plaza', 'draft'),
  ('eeeeeeee-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001', 'Procesión de la hermandad', '2027-03-26T20:00:00+01', 'Parroquia', 'pending_review'),
  ('eeeeeeee-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'Noche flamenca', '2027-04-10T21:00:00+02', 'Sede', 'pending_review'),
  -- Otura
  ('eeeeeeee-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', null, 'Concierto de la coral', '2027-02-14T20:00:00+01', 'Iglesia', 'published'),
  ('eeeeeeee-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', null, 'Borrador de Otura', '2027-02-20T20:00:00+01', 'Plaza', 'draft');

insert into event_interests (device_id, event_id)
values
  ('dddddddd-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000005');

insert into audit_log (municipality_id, actor_id, action, entity)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'event.publish', 'events'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'event.publish', 'events');

-- ---------------------------------------------------------------------------
-- A role that row level security actually applies to
-- ---------------------------------------------------------------------------

create role app_user nologin;
grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;

-- ---------------------------------------------------------------------------
-- 1. A municipal editor and another municipality
-- ---------------------------------------------------------------------------

set role app_user;
set request.jwt.claims = '{"sub":"auth-zubia-editor"}';

select assert_count(
  'municipal editor sees every event of their own municipality',
  (select count(*) from events where municipality_id = '11111111-1111-1111-1111-111111111111'),
  4);

select assert_count(
  'municipal editor cannot see another municipality unpublished events',
  (select count(*) from events where status = 'draft' and municipality_id = '22222222-2222-2222-2222-222222222222'),
  0);

select assert_count(
  'an unfiltered query returns no foreign drafts',
  (select count(*) from events where status not in ('published', 'cancelled')
     and municipality_id <> '11111111-1111-1111-1111-111111111111'),
  0);

select assert_no_rows_changed(
  'municipal editor cannot edit another municipality events',
  $$update events set title = 'secuestrado' where municipality_id = '22222222-2222-2222-2222-222222222222'$$);

select assert_count(
  'municipal editor cannot read who is interested in what',
  (select count(*) from event_interests), 0);

select assert_count(
  'municipal admin reads only their own audit log',
  (select count(*) from audit_log), 1);

-- ---------------------------------------------------------------------------
-- 2. An association responsible and the rest of the town
-- ---------------------------------------------------------------------------

reset role;
set role app_user;
set request.jwt.claims = '{"sub":"auth-hermandad"}';

select assert_count(
  'association sees its own pending event',
  (select count(*) from events where id = 'eeeeeeee-0000-0000-0000-000000000003'),
  1);

select assert_count(
  'association cannot see another association pending event',
  (select count(*) from events where id = 'eeeeeeee-0000-0000-0000-000000000004'),
  0);

select assert_count(
  'association cannot see the town hall draft',
  (select count(*) from events where id = 'eeeeeeee-0000-0000-0000-000000000002'),
  0);

select assert_no_rows_changed(
  'association cannot edit another association event',
  $$update events set title = 'secuestrado' where id = 'eeeeeeee-0000-0000-0000-000000000004'$$);

-- The one that matters most: an association must not be able to publish. If
-- this ever passes, the review queue is decorative.
select assert_denied(
  'association cannot publish directly',
  $$insert into events (municipality_id, organization_id, title, start_at, location_name, status)
    values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001',
            'Publicado a la brava', '2027-05-01T20:00:00+02', 'Plaza', 'published')$$);

select assert_denied(
  'association cannot approve its own pending event',
  $$update events set status = 'published' where id = 'eeeeeeee-0000-0000-0000-000000000003'$$);

select assert_denied(
  'association cannot create an event in another municipality',
  $$insert into events (municipality_id, organization_id, title, start_at, location_name, status)
    values ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001',
            'Invasión', '2027-05-01T20:00:00+02', 'Plaza', 'pending_review')$$);

-- ---------------------------------------------------------------------------
-- 3. Residents
-- ---------------------------------------------------------------------------

reset role;
set role app_user;
set request.jwt.claims = '{"sub":"device-one"}';

select assert_count(
  'a device reads its own marks',
  (select count(*) from event_interests), 1);

select assert_count(
  'a device cannot read another device marks',
  (select count(*) from event_interests where device_id = 'dddddddd-0000-0000-0000-000000000002'),
  0);

select assert_count(
  'a device cannot read another device row',
  (select count(*) from devices where anonymous_auth_id = 'device-two'), 0);

select assert_count(
  'a resident sees published events of every municipality they follow',
  (select count(*) from events where status = 'published'), 2);

select assert_count(
  'a resident never sees an event waiting for approval',
  (select count(*) from events where status in ('draft', 'pending_review')), 0);

select assert_no_rows_changed(
  'a resident cannot edit an event',
  $$update events set title = 'secuestrado' where status = 'published'$$);

-- ---------------------------------------------------------------------------
-- 4. Nobody at all
-- ---------------------------------------------------------------------------

reset role;
set role app_user;
set request.jwt.claims = '{"sub":"nobody"}';

select assert_count(
  'an unknown caller sees only published events',
  (select count(*) from events), 2);

select assert_count('an unknown caller sees no devices', (select count(*) from devices), 0);
select assert_count('an unknown caller sees no interests', (select count(*) from event_interests), 0);
select assert_count('an unknown caller sees no audit log', (select count(*) from audit_log), 0);

reset role;

\echo ''
\echo 'All isolation tests passed.'

-- READ ONLY. Run as the database owner BEFORE applying Unit 4, and again afterward.
-- Save these results for review. Migration history is not proof of live privileges.
-- Before: service_role UPDATE(status) is expected from the known column grant.
-- Unexpected table UPDATE, role memberships, status INSERT, or audit-field INSERT
-- must be reviewed separately. After: direct status/version writes must all be false.
select current_user as inspecting_role, version() as database_version;

select r.rolname, c.relname, pg_get_userbyid(c.relowner) as owner,
  c.relrowsecurity as rls_enabled, c.relacl,
  has_table_privilege(r.oid, c.oid, 'UPDATE') as table_update,
  has_any_column_privilege(r.oid, c.oid, 'UPDATE') as any_column_update,
  has_table_privilege(r.oid, c.oid, 'INSERT') as table_insert,
  has_table_privilege(r.oid, c.oid, 'DELETE') as can_delete,
  has_table_privilege(r.oid, c.oid, 'TRUNCATE') as can_truncate,
  pg_has_role(r.oid, c.relowner, 'MEMBER') as member_of_owner
from pg_roles r cross join pg_class c
where r.rolname in ('anon', 'authenticated', 'service_role')
  and c.oid in ('public.assistance_requests'::regclass, 'public.assistance_request_events'::regclass)
order by c.relname, r.rolname;

select r.rolname, c.relname, a.attname, a.attacl,
  has_column_privilege(r.oid, c.oid, a.attnum, 'SELECT') as can_select,
  has_column_privilege(r.oid, c.oid, a.attnum, 'INSERT') as can_insert,
  has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE') as can_update
from pg_roles r cross join pg_class c join pg_attribute a on a.attrelid = c.oid
where r.rolname in ('anon', 'authenticated', 'service_role') and a.attnum > 0 and not a.attisdropped
  and c.oid in ('public.assistance_requests'::regclass, 'public.assistance_request_events'::regclass)
order by c.relname, a.attnum, r.rolname;

-- All inherited memberships and app-executable SECURITY DEFINER functions need
-- human review for an alternate write path. Definitions can be inspected with
-- pg_get_functiondef(oid); don't infer safety from a name or text search alone.
select member_role.rolname as member, parent.rolname as granted_role, m.*
from pg_auth_members m join pg_roles member_role on member_role.oid = m.member
join pg_roles parent on parent.oid = m.roleid
order by member_role.rolname, parent.rolname;

select p.oid::regprocedure as function_signature, pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer, p.proconfig, p.proacl,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.oid::regprocedure::text;

select tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename in ('assistance_requests', 'assistance_request_events');

select c.relname, t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where t.tgrelid in ('public.assistance_requests'::regclass, 'public.assistance_request_events'::regclass)
  and not t.tgisinternal;

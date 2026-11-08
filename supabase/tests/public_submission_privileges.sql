-- READ ONLY: run as trusted owner before AND after migration; review unexpected
-- effective privileges, inherited memberships and all alternate SECURITY DEFINER
-- write paths. Do not infer live permissions from migration files alone.
select current_user, version(), current_setting('default_transaction_isolation');
select r.rolname, c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) as owner,
  has_any_column_privilege(r.oid,c.oid,'SELECT') as can_select,
  has_any_column_privilege(r.oid,c.oid,'INSERT') as can_insert,
  has_any_column_privilege(r.oid,c.oid,'UPDATE') as can_update,
  has_any_column_privilege(r.oid,c.oid,'REFERENCES') as can_reference,
  has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER') as other_access,
  pg_has_role(r.oid,c.relowner,'MEMBER') as member_of_owner
from pg_roles r cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
where r.rolname in ('anon','authenticated','service_role') and n.nspname='public'
  and c.relname in ('public_assistance_submission_receipts','assistance_requests','people','households',
    'household_members','animals','request_animals','prescreens','request_availability')
order by c.relname,r.rolname;
select p.oid::regprocedure as signature, pg_get_userbyid(p.proowner) as owner,
  p.prosecdef, p.proconfig, p.proacl,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' order by p.proname;
select member_role.rolname as member, parent.rolname as granted_role, m.*
from pg_auth_members m join pg_roles member_role on member_role.oid=m.member
join pg_roles parent on parent.oid=m.roleid;
select tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename in ('public_assistance_submission_receipts','assistance_requests');

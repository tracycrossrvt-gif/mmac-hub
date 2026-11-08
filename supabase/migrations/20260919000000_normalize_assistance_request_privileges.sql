-- Prerequisite for Unit 4 on fresh databases with Supabase automatic grants.
-- Existing migration histories require the separate rollout procedure in
-- docs/slice1-privilege-correction.md. Never reset a populated database to apply it.
begin;

do $$
declare
  request_owner oid;
  app_role text;
begin
  select relowner into request_owner from pg_class
    where oid = 'public.assistance_requests'::regclass and relkind = 'r';
  -- Run as the actual, trusted table owner, not merely a role with grant options.
  if request_owner is null
     or pg_get_userbyid(request_owner) <> current_user
     or current_user in ('anon', 'authenticated', 'service_role') then
    raise exception 'Trusted assistance_requests owner must apply privilege prerequisite';
  end if;
  foreach app_role in array array['anon', 'authenticated', 'service_role'] loop
    if pg_has_role(app_role, request_owner, 'MEMBER') then
      raise exception 'Application role % can assume the request owner; prerequisite rolled back', app_role;
    end if;
  end loop;
end;
$$;

-- Normalize this table only. Table revocation also removes corresponding column
-- grants, including the former UPDATE(status). No CASCADE or parent-role changes.
revoke all privileges on table public.assistance_requests
  from public, anon, authenticated, service_role;
grant select on table public.assistance_requests to service_role;

do $$
declare
  app_role text;
  privilege_name text;
begin
  foreach app_role in array array['anon', 'authenticated', 'service_role'] loop
    -- Check columns as well as the table so inherited column grants cannot hide.
    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
      if not (app_role = 'service_role' and privilege_name = 'SELECT')
         and has_any_column_privilege(app_role, 'public.assistance_requests', privilege_name) then
        raise exception 'Unexpected effective request % access for %; prerequisite rolled back', privilege_name, app_role;
      end if;
    end loop;
    -- Enumerate this PostgreSQL version's table privileges, including MAINTAIN
    -- where supported, rather than silently overlooking a newer privilege.
    for privilege_name in
      select acl.privilege_type
      from pg_class c cross join lateral aclexplode(acldefault('r', c.relowner)) acl
      where c.oid = 'public.assistance_requests'::regclass
    loop
      if not (app_role = 'service_role' and privilege_name = 'SELECT')
         and has_table_privilege(app_role, 'public.assistance_requests', privilege_name) then
        raise exception 'Unexpected effective request % access for %; prerequisite rolled back', privilege_name, app_role;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('service_role', 'public.assistance_requests', 'SELECT') then
    raise exception 'service_role requires request SELECT; prerequisite rolled back';
  end if;
end;
$$;

commit;

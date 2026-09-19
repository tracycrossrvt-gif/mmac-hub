-- Read-only preflight: run before/after migration and retain the output.
-- has_column_privilege includes table-level, column-level and inherited access.
select t.table_name, c.column_name,
  has_table_privilege('service_role', 'public.' || t.table_name, 'SELECT') as table_select,
  has_column_privilege('service_role', 'public.' || t.table_name, c.column_name, 'SELECT') as effective_column_select
from (values
  ('service_areas', array['id', 'name', 'state']),
  ('services', array['id', 'name', 'description']),
  ('request_animal_services', array['id', 'request_animal_id', 'service_id', 'notes']),
  ('prescreen_diagnostics', array['id', 'prescreen_id', 'diagnostic_type', 'status', 'notes'])
) as t(table_name, columns)
cross join lateral unnest(t.columns) as c(column_name)
order by t.table_name, c.column_name;

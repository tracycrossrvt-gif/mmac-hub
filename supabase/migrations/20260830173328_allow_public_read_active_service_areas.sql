create policy "Public can read active service areas"
on public.service_areas
for select
to anon, authenticated
using (is_active = true);

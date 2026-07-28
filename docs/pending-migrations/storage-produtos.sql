-- Bucket público de imagens de produtos (cardápio)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'produtos',
  'produtos',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif'];

-- Políticas de acesso
drop policy if exists "produtos_public_read" on storage.objects;
create policy "produtos_public_read"
  on storage.objects for select
  using (bucket_id = 'produtos');

drop policy if exists "produtos_auth_insert" on storage.objects;
create policy "produtos_auth_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'produtos');

drop policy if exists "produtos_auth_update" on storage.objects;
create policy "produtos_auth_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'produtos')
  with check (bucket_id = 'produtos');

drop policy if exists "produtos_auth_delete" on storage.objects;
create policy "produtos_auth_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'produtos');

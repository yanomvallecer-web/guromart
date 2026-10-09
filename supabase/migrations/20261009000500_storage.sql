-- Storage buckets and object policies.
-- Object paths start with the owner's seller account id:
--   product-files/{seller_account_id}/{product_id}/{random}.{ext}   (private)
--   product-previews/{seller_account_id}/{product_id}/{random}.webp (public)
--   verification-documents/{seller_account_id}/{random}.{ext}      (private)
--   storefront-media/{seller_account_id}/{random}.{ext}             (public)
-- Buyers never read product-files directly: the server checks entitlement
-- and returns a short-lived signed URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-files', 'product-files', false, 104857600, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'image/png', 'image/jpeg', 'image/webp'
  ]),
  ('product-previews', 'product-previews', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('verification-documents', 'verification-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('storefront-media', 'storefront-media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create or replace function private.object_owned_by_current_seller(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(object_name))[1] = (
    select id::text from public.seller_accounts where user_id = auth.uid()
  );
$$;

grant execute on function private.object_owned_by_current_seller(text) to authenticated, service_role;

create policy "seller uploads own product files" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('product-files', 'product-previews', 'verification-documents', 'storefront-media')
    and private.object_owned_by_current_seller(name));

create policy "seller reads own private files" on storage.objects
  for select to authenticated
  using (bucket_id in ('product-files', 'verification-documents')
    and (private.object_owned_by_current_seller(name) or private.is_admin()));

create policy "seller deletes own files" on storage.objects
  for delete to authenticated
  using (bucket_id in ('product-files', 'product-previews', 'storefront-media')
    and private.object_owned_by_current_seller(name));

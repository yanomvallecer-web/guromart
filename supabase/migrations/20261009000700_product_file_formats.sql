-- Buyers filter by file format, but product_files is private. Keep a public
-- summary of a product's formats on the product row.

alter table public.products add column file_formats text[] not null default '{}';
create index products_file_formats_idx on public.products using gin (file_formats) where status = 'published';

create or replace function private.refresh_product_file_formats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products set file_formats = coalesce((
    select array_agg(distinct file_format order by file_format)
    from public.product_files where product_id = pid
  ), '{}')
  where id = pid;
  return null;
end;
$$;

create trigger product_files_refresh_formats after insert or delete or update of file_format on public.product_files
  for each row execute function private.refresh_product_file_formats();

-- Sellers cannot write the summary themselves.
create or replace function private.guard_product_file_formats()
returns trigger
language plpgsql
as $$
begin
  if private.is_client_request() and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.file_formats := '{}';
    elsif new.file_formats is distinct from old.file_formats then
      raise exception 'Only GuroMart staff can change this product field' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger products_guard_file_formats before insert or update on public.products
  for each row execute function private.guard_product_file_formats();

-- Simplified Activity Sheets (SAS), listed right after Activity Sheets.
do $$
begin
  if not exists (select 1 from public.product_categories where code = 'simplified-activity-sheet') then
    update public.product_categories set sort_order = sort_order + 1 where sort_order >= 5 and sort_order < 99;
    insert into public.product_categories (code, name, sort_order)
    values ('simplified-activity-sheet', 'Simplified Activity Sheets (SAS)', 5);
  end if;
end $$;

insert into public.search_synonyms (term, expansion) values
  ('sas', 'simplified activity sheet'),
  ('simplified activity sheet', 'sas')
on conflict (term) do nothing;

-- =========================================================
-- AXE HUB · AXE BUILD V1.1.33
-- ADMIN MODBOOK CRUD
-- Run once in AXE HUB > Supabase > SQL Editor
-- =========================================================

begin;

create or replace function public.admin_create_modbook(
  p_name text,
  p_type text,
  p_category text,
  p_parts text default null,
  p_success_rate text default null,
  p_option1 text default null,
  p_option2 text default null,
  p_option3 text default null,
  p_note text default null,
  p_sort_order integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.modbooks%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_sort integer;
begin
  if not public.axe_hub_is_admin(auth.uid()) then
    raise exception '관리자만 개조서를 추가할 수 있습니다.';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception '개조서 이름을 확인해주세요.';
  end if;

  if p_type not in ('접두', '접미') then
    raise exception '종류는 접두 또는 접미여야 합니다.';
  end if;

  if char_length(v_category) < 1 or char_length(v_category) > 80 then
    raise exception '분류를 확인해주세요.';
  end if;

  if exists (
    select 1
      from public.modbooks
     where lower(btrim(name)) = lower(v_name)
       and type = p_type
       and lower(btrim(coalesce(category, ''))) = lower(v_category)
  ) then
    raise exception '같은 이름·종류·분류의 개조서가 이미 존재합니다.';
  end if;

  v_sort := coalesce(
    p_sort_order,
    (select coalesce(max(sort_order), 0) + 10 from public.modbooks)
  );

  insert into public.modbooks(
    name,
    type,
    category,
    parts,
    success_rate,
    option1,
    option2,
    option3,
    note,
    sort_order
  )
  values (
    v_name,
    p_type,
    v_category,
    nullif(btrim(coalesce(p_parts, '')), ''),
    nullif(btrim(coalesce(p_success_rate, '')), ''),
    nullif(btrim(coalesce(p_option1, '')), ''),
    nullif(btrim(coalesce(p_option2, '')), ''),
    nullif(btrim(coalesce(p_option3, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    v_sort
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_update_modbook(
  p_modbook_id bigint,
  p_name text,
  p_type text,
  p_category text,
  p_parts text default null,
  p_success_rate text default null,
  p_option1 text default null,
  p_option2 text default null,
  p_option3 text default null,
  p_note text default null,
  p_sort_order integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.modbooks%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_category text := btrim(coalesce(p_category, ''));
begin
  if not public.axe_hub_is_admin(auth.uid()) then
    raise exception '관리자만 개조서를 수정할 수 있습니다.';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception '개조서 이름을 확인해주세요.';
  end if;

  if p_type not in ('접두', '접미') then
    raise exception '종류는 접두 또는 접미여야 합니다.';
  end if;

  if char_length(v_category) < 1 or char_length(v_category) > 80 then
    raise exception '분류를 확인해주세요.';
  end if;

  if exists (
    select 1
      from public.modbooks
     where id <> p_modbook_id
       and lower(btrim(name)) = lower(v_name)
       and type = p_type
       and lower(btrim(coalesce(category, ''))) = lower(v_category)
  ) then
    raise exception '같은 이름·종류·분류의 개조서가 이미 존재합니다.';
  end if;

  update public.modbooks
     set name = v_name,
         type = p_type,
         category = v_category,
         parts = nullif(btrim(coalesce(p_parts, '')), ''),
         success_rate = nullif(btrim(coalesce(p_success_rate, '')), ''),
         option1 = nullif(btrim(coalesce(p_option1, '')), ''),
         option2 = nullif(btrim(coalesce(p_option2, '')), ''),
         option3 = nullif(btrim(coalesce(p_option3, '')), ''),
         note = nullif(btrim(coalesce(p_note, '')), ''),
         sort_order = coalesce(p_sort_order, sort_order)
   where id = p_modbook_id
   returning * into v_row;

  if v_row.id is null then
    raise exception '개조서를 찾을 수 없습니다.';
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_delete_modbook(
  p_modbook_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_usage integer;
begin
  if not public.axe_hub_is_admin(auth.uid()) then
    raise exception '관리자만 개조서를 삭제할 수 있습니다.';
  end if;

  select name
    into v_name
    from public.modbooks
   where id = p_modbook_id
   for update;

  if v_name is null then
    raise exception '개조서를 찾을 수 없습니다.';
  end if;

  select count(*)
    into v_usage
    from public.build_slots
   where prefix_modbook_id = p_modbook_id
      or suffix_modbook_id = p_modbook_id;

  if v_usage > 0 then
    raise exception '삭제 보호: 이 개조서는 추천세팅 %개 슬롯에서 사용 중입니다. 먼저 해당 세팅에서 개조서를 해제하거나 개조서 정보를 수정해주세요.', v_usage;
  end if;

  -- 제보 이력은 보존하되 삭제된 개조서를 가리키지 않도록 연결만 해제합니다.
  update public.modbook_reports
     set target_modbook_id = null
   where target_modbook_id = p_modbook_id;

  delete from public.modbooks
   where id = p_modbook_id;
end;
$$;

revoke all on function public.admin_create_modbook(text, text, text, text, text, text, text, text, text, integer) from public;
revoke all on function public.admin_update_modbook(bigint, text, text, text, text, text, text, text, text, text, integer) from public;
revoke all on function public.admin_delete_modbook(bigint) from public;

grant execute on function public.admin_create_modbook(text, text, text, text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.admin_update_modbook(bigint, text, text, text, text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.admin_delete_modbook(bigint) to authenticated;

notify pgrst, 'reload schema';

commit;

-- =========================================================
-- AXE HUB · AXE BUILD V1.1.29
-- BUILD / PRESET WEAPON SLOT
-- Run once in AXE HUB > Supabase > SQL Editor
-- =========================================================

begin;

-- build_slots already stores slot_key + prefix/suffix modbooks.
-- V1.1.29 adds the selected weapon family for slot_key='weapon'.
alter table public.build_slots
  add column if not exists weapon_family text;

comment on column public.build_slots.weapon_family is
  'Optional weapon family for AXE BUILD weapon slot (e.g. 라이플, SMG).';

-- Existing builds remain valid: they simply have no weapon slot or NULL family.
-- Existing RLS policies on build_slots already protect insert/update/delete
-- through build ownership/admin checks, so no policy changes are required.

notify pgrst, 'reload schema';

commit;

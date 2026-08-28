-- =========================================================
-- AXE HUB · AXE BUILD V1.1.31
-- FIX build_slots slot_key CHECK FOR WEAPON SLOT
-- Run once in AXE HUB > Supabase > SQL Editor
-- Requires V1.1.29 weapon_family column migration.
-- =========================================================

begin;

-- Existing schema allowed only the original 4 equipment slots.
-- V1.1.29 added the weapon slot in the frontend, but the old CHECK
-- constraint still rejected slot_key = 'weapon'.
alter table public.build_slots
  drop constraint if exists build_slots_slot_key_check;

alter table public.build_slots
  add constraint build_slots_slot_key_check
  check (slot_key in ('outer', 'top', 'bottom', 'shoes', 'weapon'));

notify pgrst, 'reload schema';

commit;

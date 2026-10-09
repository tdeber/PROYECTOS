-- Gym de a dos | Etapa 1: perfiles (cuenta, nick unico, nombre, foto y privacidad)
-- Pegar completo en Supabase > SQL Editor > Run.
-- Reemplaza las tablas de prueba anteriores (estaban vacias).

drop table if exists public.perfiles cascade;
drop function if exists public.es_miembro();
drop function if exists public.hay_cupo();

create table public.perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nick text not null check (nick ~ '^[a-z0-9_]{3,20}$'),
  nombre text not null check (char_length(nombre) between 1 and 24),
  avatar text check (avatar is null or char_length(avatar) <= 60000),
  privacidad jsonb not null default
    '{"entrenos":true,"stats":true,"plan":true,"bloques":false,"peso":false,"fotos":false}'::jsonb,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- El nick es unico sin importar mayusculas; se puede cambiar mientras este libre.
create unique index perfiles_nick_unico on public.perfiles (lower(nick));

alter table public.perfiles enable row level security;

create policy "ver mi perfil" on public.perfiles
  for select to authenticated using (user_id = auth.uid());
create policy "crear mi perfil" on public.perfiles
  for insert to authenticated with check (user_id = auth.uid());
create policy "editar mi perfil" on public.perfiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Para saber si un nick esta libre sin dejar ver los perfiles de otras personas.
create or replace function public.nick_disponible(p text) returns boolean
language sql security definer set search_path = public as
$$ select not exists (
     select 1 from public.perfiles where lower(nick) = lower(p) and user_id <> auth.uid()) $$;

-- Permisos explicitos: solo usuarios con sesion, nunca anonimos
revoke all on public.perfiles from anon;
grant usage on schema public to authenticated;
grant select, insert, update on public.perfiles to authenticated;
revoke execute on function public.nick_disponible(text) from public, anon;
grant execute on function public.nick_disponible(text) to authenticated;

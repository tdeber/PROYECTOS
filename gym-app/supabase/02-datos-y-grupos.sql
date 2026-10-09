-- Gym de a dos | Etapas 2 y 3: datos por cuenta, grupos, invitaciones y vista de grupo
-- Pegar completo en Supabase > SQL Editor > Run (despues de 01-perfiles.sql).
-- Se puede correr mas de una vez sin perder datos.
--
-- Seguridad: las tablas de grupos NO se pueden leer ni escribir directo desde la app.
-- Todo pasa por funciones que validan quien llama. Lo que un miembro ve de otro lo
-- decide la base segun la privacidad de esa persona (funcion ver_datos).

-- ===== Etapa 2: datos de cada persona =====
create table if not exists public.datos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now(),
  constraint datos_tamano check (octet_length(data::text) < 4000000)
);
alter table public.datos enable row level security;
drop policy if exists "ver mis datos" on public.datos;
drop policy if exists "crear mis datos" on public.datos;
drop policy if exists "editar mis datos" on public.datos;
create policy "ver mis datos" on public.datos
  for select to authenticated using (user_id = auth.uid());
create policy "crear mis datos" on public.datos
  for insert to authenticated with check (user_id = auth.uid());
create policy "editar mis datos" on public.datos
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.datos from anon;
grant select, insert, update on public.datos to authenticated;

-- La privacidad debe ser un objeto chico (evita guardar basura en el perfil).
alter table public.perfiles drop constraint if exists perfiles_privacidad_forma;
alter table public.perfiles add constraint perfiles_privacidad_forma
  check (jsonb_typeof(privacidad) = 'object' and octet_length(privacidad::text) < 500);

-- ===== Etapa 3: grupos =====
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 30),
  creador uuid not null references auth.users(id) on delete cascade,
  creado timestamptz not null default now()
);
create table if not exists public.miembros (
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  desde timestamptz not null default now(),
  primary key (grupo_id, user_id)
);
create index if not exists miembros_por_usuario on public.miembros (user_id);
create table if not exists public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  de uuid not null references auth.users(id) on delete cascade,
  a uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aceptada','rechazada','cancelada')),
  creado timestamptz not null default now()
);
create unique index if not exists invitacion_pendiente_unica
  on public.invitaciones (grupo_id, a) where estado = 'pendiente';

-- Sin politicas y sin permisos: nadie accede directo, solo las funciones de abajo.
alter table public.grupos enable row level security;
alter table public.miembros enable row level security;
alter table public.invitaciones enable row level security;
revoke all on public.grupos, public.miembros, public.invitaciones from anon, authenticated;

-- ===== Funciones =====
create or replace function public.mis_grupos()
returns table (id uuid, nombre text, soy_creador boolean, miembros int)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  return query
    select g.id, g.nombre, g.creador = auth.uid(),
           (select count(*)::int from public.miembros m2 where m2.grupo_id = g.id)
    from public.grupos g join public.miembros m on m.grupo_id = g.id
    where m.user_id = auth.uid()
    order by g.creado;
end $$;

create or replace function public.crear_grupo(p_nombre text) returns uuid
language plpgsql security definer set search_path = public as $$
declare nuevo uuid; n text := btrim(coalesce(p_nombre, ''));
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  if not exists (select 1 from public.perfiles where user_id = auth.uid()) then raise exception 'sin_perfil'; end if;
  if char_length(n) < 1 or char_length(n) > 30 then raise exception 'nombre_invalido'; end if;
  if (select count(*) from public.grupos where creador = auth.uid()) >= 10 then raise exception 'demasiados_grupos'; end if;
  insert into public.grupos (nombre, creador) values (n, auth.uid()) returning grupos.id into nuevo;
  insert into public.miembros (grupo_id, user_id) values (nuevo, auth.uid());
  return nuevo;
end $$;

create or replace function public.renombrar_grupo(g uuid, p_nombre text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(p_nombre, ''));
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  if char_length(n) < 1 or char_length(n) > 30 then raise exception 'nombre_invalido'; end if;
  update public.grupos set nombre = n where id = g and creador = auth.uid();
  if not found then raise exception 'no_creador'; end if;
end $$;

create or replace function public.eliminar_grupo(g uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  delete from public.grupos where id = g and creador = auth.uid();
  if not found then raise exception 'no_creador'; end if;
end $$;

create or replace function public.miembros_de(g uuid)
returns table (user_id uuid, nick text, nombre text, avatar text, es_creador boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  if not exists (select 1 from public.miembros where grupo_id = g and miembros.user_id = auth.uid()) then
    raise exception 'sin_acceso';
  end if;
  return query
    select m.user_id, p.nick, p.nombre, p.avatar, gr.creador = m.user_id
    from public.miembros m
    join public.perfiles p on p.user_id = m.user_id
    join public.grupos gr on gr.id = m.grupo_id
    where m.grupo_id = g
    order by (gr.creador = m.user_id) desc, m.desde;
end $$;

create or replace function public.invitar(g uuid, p_nick text) returns void
language plpgsql security definer set search_path = public as $$
declare destino uuid;
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  if not exists (select 1 from public.grupos where id = g and creador = auth.uid()) then raise exception 'no_creador'; end if;
  select user_id into destino from public.perfiles where lower(nick) = lower(btrim(coalesce(p_nick, '')));
  if destino is null then raise exception 'nick_no_existe'; end if;
  if destino = auth.uid() then raise exception 'ya_miembro'; end if;
  if exists (select 1 from public.miembros where grupo_id = g and user_id = destino) then raise exception 'ya_miembro'; end if;
  if exists (select 1 from public.invitaciones where grupo_id = g and a = destino and estado = 'pendiente') then raise exception 'ya_invitado'; end if;
  if (select count(*) from public.miembros where grupo_id = g)
   + (select count(*) from public.invitaciones where grupo_id = g and estado = 'pendiente') >= 20 then
    raise exception 'grupo_lleno';
  end if;
  insert into public.invitaciones (grupo_id, de, a) values (g, auth.uid(), destino);
end $$;

create or replace function public.invitaciones_enviadas(g uuid)
returns table (id uuid, a uuid, nick text, nombre text, avatar text, creado timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  if not exists (select 1 from public.grupos where grupos.id = g and creador = auth.uid()) then raise exception 'no_creador'; end if;
  return query
    select i.id, i.a, p.nick, p.nombre, p.avatar, i.creado
    from public.invitaciones i join public.perfiles p on p.user_id = i.a
    where i.grupo_id = g and i.estado = 'pendiente' order by i.creado;
end $$;

create or replace function public.mis_invitaciones()
returns table (id uuid, grupo_id uuid, grupo text, de_nick text, de_nombre text, creado timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  return query
    select i.id, i.grupo_id, g.nombre, p.nick, p.nombre, i.creado
    from public.invitaciones i
    join public.grupos g on g.id = i.grupo_id
    join public.perfiles p on p.user_id = i.de
    where i.a = auth.uid() and i.estado = 'pendiente' order by i.creado desc;
end $$;

create or replace function public.responder_invitacion(inv uuid, aceptar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.invitaciones%rowtype;
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  select * into r from public.invitaciones where id = inv and a = auth.uid() and estado = 'pendiente';
  if not found then raise exception 'invitacion_invalida'; end if;
  if aceptar then
    insert into public.miembros (grupo_id, user_id) values (r.grupo_id, auth.uid()) on conflict do nothing;
    update public.invitaciones set estado = 'aceptada' where id = inv;
  else
    update public.invitaciones set estado = 'rechazada' where id = inv;
  end if;
end $$;

create or replace function public.cancelar_invitacion(inv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  update public.invitaciones set estado = 'cancelada'
    where id = inv and de = auth.uid() and estado = 'pendiente';
  if not found then raise exception 'invitacion_invalida'; end if;
end $$;

create or replace function public.quitar_miembro(g uuid, u uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  if not exists (select 1 from public.grupos where id = g and creador = auth.uid()) then raise exception 'no_creador'; end if;
  if u = auth.uid() then raise exception 'creador_no_sale'; end if;
  delete from public.miembros where grupo_id = g and user_id = u;
end $$;

create or replace function public.salir_grupo(g uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  if exists (select 1 from public.grupos where id = g and creador = auth.uid()) then raise exception 'creador_no_sale'; end if;
  delete from public.miembros where grupo_id = g and user_id = auth.uid();
  if not found then raise exception 'sin_acceso'; end if;
end $$;

-- Auxiliares: aseguran que lo que se devuelve tenga la forma esperada aunque alguien
-- guarde datos raros en su propia fila.
create or replace function public._arr(j jsonb) returns jsonb language sql immutable as
$$ select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end $$;
create or replace function public._obj(j jsonb) returns jsonb language sql immutable as
$$ select case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end $$;

-- Lo que una persona del grupo puede ver de otra, filtrado por la privacidad de esa otra persona.
create or replace function public.ver_datos(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pr jsonb; d jsonb; u jsonb; r jsonb; logs jsonb; blocks jsonb;
  propio boolean; f_ent boolean; f_stats boolean; f_plan boolean; f_bloq boolean; f_peso boolean;
begin
  if me is null then raise exception 'no_auth'; end if;
  propio := (p_user = me);
  if not propio and not exists (
    select 1 from public.miembros a join public.miembros b on a.grupo_id = b.grupo_id
    where a.user_id = me and b.user_id = p_user) then
    raise exception 'sin_acceso';
  end if;
  select privacidad into pr from public.perfiles where user_id = p_user;
  select data into d from public.datos where user_id = p_user;
  r := jsonb_build_object('privacidad', coalesce(pr, '{}'::jsonb));
  if d is null then return r || jsonb_build_object('vacio', true); end if;
  f_ent   := propio or coalesce((pr->>'entrenos')::boolean, false);
  f_stats := propio or coalesce((pr->>'stats')::boolean, false);
  f_plan  := propio or coalesce((pr->>'plan')::boolean, false);
  f_bloq  := propio or coalesce((pr->>'bloques')::boolean, false);
  f_peso  := propio or coalesce((pr->>'peso')::boolean, false);
  u := public._obj(d->'user');
  begin
    if f_stats then
      logs := public._arr(u->'logs');
    elsif f_ent then
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', l->'id', 'date', l->'date', 'b', l->'b', 'min', l->'min',
               'n', (select coalesce(sum(jsonb_array_length(x->'sets')), 0)
                     from jsonb_array_elements(public._arr(l->'entries')) x))), '[]'::jsonb)
        into logs from jsonb_array_elements(public._arr(u->'logs')) l;
    end if;
    if f_bloq then
      blocks := public._arr(u->'blocks');
    elsif f_plan then
      select coalesce(jsonb_agg(jsonb_build_object('id', b->'id', 'code', b->'code', 'name', b->'name', 'c', b->'c')), '[]'::jsonb)
        into blocks from jsonb_array_elements(public._arr(u->'blocks')) b;
    end if;
    r := r || jsonb_build_object('permisos', jsonb_build_object(
      'entrenos', f_ent, 'stats', f_stats, 'plan', f_plan, 'bloques', f_bloq, 'peso', f_peso));
    if logs is not null then r := r || jsonb_build_object('logs', logs); end if;
    if blocks is not null then r := r || jsonb_build_object('blocks', blocks); end if;
    if f_plan then r := r || jsonb_build_object('plan', public._obj(u->'plan')); end if;
    if f_peso then r := r || jsonb_build_object('bw', public._arr(u->'bw')); end if;
    if f_stats or f_bloq then r := r || jsonb_build_object('ex', public._arr(d->'ex')); end if;
  exception when others then
    return jsonb_build_object('privacidad', coalesce(pr, '{}'::jsonb), 'error', true);
  end;
  return r;
end $$;

-- Permisos: solo usuarios con sesion
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.nick_disponible(text), public.mis_grupos(), public.crear_grupo(text),
  public.renombrar_grupo(uuid, text), public.eliminar_grupo(uuid), public.miembros_de(uuid),
  public.invitar(uuid, text), public.invitaciones_enviadas(uuid), public.mis_invitaciones(),
  public.responder_invitacion(uuid, boolean), public.cancelar_invitacion(uuid),
  public.quitar_miembro(uuid, uuid), public.salir_grupo(uuid), public.ver_datos(uuid)
  to authenticated;

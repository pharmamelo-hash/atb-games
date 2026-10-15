-- =====================================================================
-- Games @pharmamelo · Antimicrobianos — esquema do banco (Supabase)
-- Rode TODO este arquivo no SQL Editor (pode rodar de novo sem problema).
-- =====================================================================

-- 1) Perfis -----------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  subscription_status text not null default 'free'
    check (subscription_status in ('free','trialing','active','past_due','canceled')),
  payment_provider text,
  payment_ref text,            -- id do pedido/assinatura na Cakto
  paid_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- (se a tabela já existia da versão anterior)
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists payment_provider text;
alter table public.profiles add column if not exists payment_ref text;
alter table public.profiles add column if not exists paid_at timestamptz;
alter table public.profiles add column if not exists current_period_end timestamptz;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- 2) Pagamentos recebidos (preenchida pelo webhook da Cakto, depois) ---
create table if not exists public.payments (
  id bigint generated always as identity primary key,
  provider text not null default 'cakto',
  order_id text unique,
  email text not null,
  status text not null,        -- ex.: approved, refunded, chargeback...
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payments_email_idx on public.payments (lower(email));
alter table public.payments enable row level security;   -- sem policies: só service_role acessa

-- 3) Novo usuário: cria o perfil com o nome e libera se já havia pagamento
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare paid boolean;
begin
  select exists(select 1 from public.payments
                where lower(email) = lower(new.email) and status = 'approved') into paid;
  insert into public.profiles (id, email, display_name, subscription_status,
                               payment_provider, paid_at)
  values (new.id, new.email,
          nullif(trim(coalesce(new.raw_user_meta_data->>'name','')), ''),
          case when paid then 'active' else 'free' end,
          case when paid then 'cakto' end,
          case when paid then now() end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Demos por usuário e por jogo ------------------------------------
create table if not exists public.demo_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null check (game in ('plan','battle','quiz','mem','flee','fit')),
  used int not null default 0,
  primary key (user_id, game)
);

-- 5) Progresso por usuário (recordes + cartas) ------------------------
create table if not exists public.game_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  total_points int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists game_progress_rank_idx on public.game_progress (total_points desc);

-- 6) Segurança (RLS) --------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.demo_usage    enable row level security;
alter table public.game_progress enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own" on public.profiles for select using (auth.uid() = id);
-- IMPORTANTE: o usuário NÃO pode alterar o próprio perfil (evita se "dar" acesso pago).
drop policy if exists "profiles: update own" on public.profiles;
revoke insert, update, delete on public.profiles from anon, authenticated;

drop policy if exists "demo: select own" on public.demo_usage;
create policy "demo: select own" on public.demo_usage for select using (auth.uid() = user_id);
revoke insert, update, delete on public.demo_usage from anon, authenticated;

drop policy if exists "progress: select own" on public.game_progress;
create policy "progress: select own" on public.game_progress for select using (auth.uid() = user_id);
revoke insert, update, delete on public.game_progress from anon, authenticated;

-- 7) Funções chamadas pelo jogo --------------------------------------
-- Consome 1 demo (ou libera direto se o usuário já pagou).
create or replace function public.use_demo(p_game text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  lim constant int := 3;
  paid boolean;
  n int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_game not in ('plan','battle','quiz','mem','flee','fit') then raise exception 'invalid_game'; end if;
  select subscription_status in ('active','trialing') into paid from public.profiles where id = uid;
  if coalesce(paid,false) then
    return jsonb_build_object('allowed', true, 'paid', true, 'used', 0, 'limit', lim);
  end if;
  insert into public.demo_usage (user_id, game, used) values (uid, p_game, 0)
    on conflict (user_id, game) do nothing;
  update public.demo_usage set used = used + 1
    where user_id = uid and game = p_game and used < lim
    returning used into n;
  if n is null then
    select used into n from public.demo_usage where user_id = uid and game = p_game;
    return jsonb_build_object('allowed', false, 'paid', false, 'used', n, 'limit', lim);
  end if;
  return jsonb_build_object('allowed', true, 'paid', false, 'used', n, 'limit', lim);
end $$;

-- Salva o progresso (junta com o que já existe: nunca diminui recorde).
create or replace function public.save_progress(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  old jsonb; merged_best jsonb := '{}'::jsonb; k text; v int; ov int;
  cards jsonb; total int := 0; res jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select data into old from public.game_progress where user_id = uid;
  old := coalesce(old, '{}'::jsonb);
  foreach k in array array['b','q','m','f','x','p'] loop
    v  := greatest(0, least(coalesce((p_data->'best'->>k)::int, 0), 1000000));
    ov := coalesce((old->'best'->>k)::int, 0);
    merged_best := merged_best || jsonb_build_object(k, greatest(v, ov));
    total := total + greatest(v, ov);
  end loop;
  select coalesce(jsonb_agg(distinct c), '[]'::jsonb) into cards from (
    select jsonb_array_elements_text(coalesce(old->'cards','[]'::jsonb)) as c
    union
    select jsonb_array_elements_text(coalesce(p_data->'cards','[]'::jsonb))
  ) s;
  res := jsonb_build_object('best', merged_best, 'cards', cards);
  insert into public.game_progress (user_id, data, total_points, updated_at)
    values (uid, res, total, now())
  on conflict (user_id) do update
    set data = excluded.data, total_points = excluded.total_points, updated_at = now();
  return res;
end $$;

-- Ranking público: só nome de exibição e pontos (nunca e-mail). Top 3.
create or replace function public.get_ranking() returns table (pos int, name text, points int)
language sql security definer set search_path = public as $$
  select (row_number() over (order by g.total_points desc, g.updated_at asc))::int,
         coalesce(nullif(p.display_name,''), 'Jogador'),
         g.total_points
  from public.game_progress g
  join public.profiles p on p.id = g.user_id
  where g.total_points > 0
  order by g.total_points desc, g.updated_at asc
  limit 3
$$;

revoke all on function public.use_demo(text), public.save_progress(jsonb), public.get_ranking() from public;
grant execute on function public.use_demo(text), public.save_progress(jsonb) to authenticated;
grant execute on function public.get_ranking() to anon, authenticated;

-- ========================================================================
-- Games @pharmamelo · Antimicrobianos — schema de contas e assinatura
-- Rode este arquivo inteiro no Supabase: Painel → SQL Editor → New query
-- → cole tudo → Run. Pode rodar de novo sem problema (idempotente).
-- ========================================================================

-- 1) Tabela de perfis (1 linha por usuário autenticado) ------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  subscription_status text not null default 'free'
    check (subscription_status in ('free','trialing','active','past_due','canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Mantém updated_at em dia -------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 3) Cria o perfil automaticamente quando alguém se cadastra -------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Segurança: Row Level Security ---------------------------------------
-- Com RLS ligado, por padrão NINGUÉM lê ou escreve nada. Cada regra abaixo
-- abre só o estritamente necessário. A chave pública (anon key) do app
-- pode ficar no código-fonte com tranquilidade: sem essas políticas ela
-- não dá acesso a nada; com elas, só abre exatamente o que está aqui.
alter table public.profiles enable row level security;

drop policy if exists "usuario le o proprio perfil" on public.profiles;
create policy "usuario le o proprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "usuario edita campos proprios nao sensiveis" on public.profiles;
create policy "usuario edita campos proprios nao sensiveis"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Importante: a policy de UPDATE acima permite ao usuário editar sua
-- própria linha (ex.: display_name), mas o campo subscription_status só
-- deve ser alterado pelo backend (service role, usada só dentro da Edge
-- Function do webhook do Stripe — nunca pelo navegador). A service role
-- ignora RLS por padrão, então o webhook sempre consegue atualizar.
-- Para reforçar isso na prática, o frontend nunca deve enviar updates de
-- subscription_status — só a função stripe-webhook faz isso.

-- Ninguém faz INSERT/DELETE direto pelo navegador: a criação é só via
-- trigger handle_new_user (security definer) e não há policy de insert/
-- delete para o usuário comum, então ambos ficam bloqueados por padrão.

-- 5) Índice auxiliar -------------------------------------------------------
create index if not exists idx_profiles_stripe_customer on public.profiles (stripe_customer_id);

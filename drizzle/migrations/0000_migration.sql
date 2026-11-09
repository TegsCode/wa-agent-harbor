create type public.app_role as enum ('admin','member');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  email text,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_team_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

create policy "members read roles" on public.user_roles for select to authenticated using (public.is_team_member(auth.uid()));

create table public.team_invites (
  email text primary key,
  invited_by uuid,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.team_invites to authenticated;
grant all on public.team_invites to service_role;
alter table public.team_invites enable row level security;
create policy "members read invites" on public.team_invites for select to authenticated using (public.is_team_member(auth.uid()));
create policy "admins add invites" on public.team_invites for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admins delete invites" on public.team_invites for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles(user_id, role, email) values (new.id, 'admin', new.email);
  elsif exists (select 1 from public.team_invites where lower(email) = lower(new.email)) then
    insert into public.user_roles(user_id, role, email) values (new.id, 'member', new.email);
  else
    raise exception 'This email has not been invited to the team';
  end if;
  return new;
end $$;
create trigger on_auth_user_created_role after insert on auth.users
  for each row execute function public.handle_new_user_role();

create table public.bridge_settings (
  id int primary key default 1 check (id = 1),
  bridge_url text,
  bridge_api_key text,
  updated_at timestamptz not null default now()
);
grant select, update on public.bridge_settings to authenticated;
grant all on public.bridge_settings to service_role;
alter table public.bridge_settings enable row level security;
create policy "members read bridge" on public.bridge_settings for select to authenticated using (public.is_team_member(auth.uid()));
create policy "admins update bridge" on public.bridge_settings for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
insert into public.bridge_settings(id) values (1);

create table public.wa_accounts (
  id uuid primary key default gen_random_uuid(),
  instance_name text not null unique,
  label text not null,
  created_by uuid,
  status text not null default 'pairing' check (status in ('connected','pairing','disconnected')),
  phone_number text,
  profile_picture_url text,
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.wa_accounts to authenticated;
grant all on public.wa_accounts to service_role;
alter table public.wa_accounts enable row level security;
create policy "members all accounts" on public.wa_accounts for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.wa_accounts(id) on delete cascade,
  phone text not null,
  name text,
  notes text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (account_id, phone)
);
grant select, insert, update, delete on public.contacts to authenticated;
grant all on public.contacts to service_role;
alter table public.contacts enable row level security;
create policy "members all contacts" on public.contacts for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

create table public.wa_groups (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.wa_accounts(id) on delete cascade,
  jid text not null,
  name text not null,
  description text,
  participants jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (account_id, jid)
);
grant select, insert, update, delete on public.wa_groups to authenticated;
grant all on public.wa_groups to service_role;
alter table public.wa_groups enable row level security;
create policy "members all groups" on public.wa_groups for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

create table public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.wa_accounts(id) on delete cascade,
  chat_id text not null,
  chat_name text,
  is_group boolean not null default false,
  from_me boolean not null default false,
  author text,
  body text not null,
  status text not null default 'delivered',
  is_read boolean not null default true,
  sent_by_agent uuid,
  created_at timestamptz not null default now()
);
create index on public.wa_messages(account_id, chat_id, created_at);
grant select, insert, update, delete on public.wa_messages to authenticated;
grant all on public.wa_messages to service_role;
alter table public.wa_messages enable row level security;
create policy "members all messages" on public.wa_messages for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

create table public.agent_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  actions text[] not null default '{}',
  account_ids uuid[] not null default '{}',
  allowed_chats text[] not null default '{}',
  created_by uuid,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.agent_keys to authenticated;
grant all on public.agent_keys to service_role;
alter table public.agent_keys enable row level security;
create policy "members all keys" on public.agent_keys for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

create table public.agent_requests (
  id uuid primary key default gen_random_uuid(),
  key_id uuid references public.agent_keys(id) on delete cascade,
  tool text not null,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);
grant select on public.agent_requests to authenticated;
grant all on public.agent_requests to service_role;
alter table public.agent_requests enable row level security;
create policy "members read requests" on public.agent_requests for select to authenticated using (public.is_team_member(auth.uid()));

alter publication supabase_realtime add table public.agent_requests;
alter publication supabase_realtime add table public.wa_messages;
alter publication supabase_realtime add table public.wa_accounts;
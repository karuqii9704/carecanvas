-- CareCanvas: private, user-owned records with server-managed pipeline state.
create extension if not exists pgcrypto;

create type public.carecanvas_job_status as enum (
  'draft', 'reviewing', 'blocked', 'awaiting_approval', 'generating',
  'qa_review', 'completed', 'needs_human_review', 'failed', 'expired'
);
create type public.carecanvas_edit_mode as enum ('img2img', 'inpaint');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('source', 'mask', 'result')),
  created_at timestamptz not null default now(),
  unique (owner_id, storage_path)
);

create table public.jobs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null check (char_length(title) between 3 and 80),
  prompt text not null check (char_length(prompt) between 20 and 1200),
  audience text not null check (audience in ('children-6-9', 'children-10-13', 'families', 'wellbeing-teams')),
  mode public.carecanvas_edit_mode not null,
  input_url text not null,
  mask_url text,
  status public.carecanvas_job_status not null default 'draft',
  scene_brief jsonb,
  safety_review jsonb,
  qa_review jsonb,
  output_url text,
  provider_request_id text unique,
  attempts integer not null default 0 check (attempts between 0 and 2),
  simulate_first_qa_failure boolean not null default false,
  trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mask_required_for_inpaint check (mode <> 'inpaint' or mask_url is not null)
);

create table public.job_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  step_key text not null,
  state text not null check (state in ('queued', 'running', 'passed', 'warning', 'failed', 'waiting')),
  attempt integer not null check (attempt between 1 and 2),
  detail text not null,
  duration_ms integer check (duration_ms >= 0),
  provider_request_id_redacted text,
  created_at timestamptz not null default now(),
  unique (job_id, step_key, attempt)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  note text not null default '' check (char_length(note) <= 280),
  decided_at timestamptz not null default now()
);

create table public.usage_budget (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  day date not null default current_date,
  daily_count integer not null default 0 check (daily_count >= 0),
  lifetime_count integer not null default 0 check (lifetime_count >= 0),
  updated_at timestamptz not null default now()
);

create index jobs_owner_created_idx on public.jobs (owner_id, created_at desc);
create index jobs_provider_request_idx on public.jobs (provider_request_id) where provider_request_id is not null;
create index job_steps_job_created_idx on public.job_steps (job_id, created_at);

alter table public.projects enable row level security;
alter table public.assets enable row level security;
alter table public.jobs enable row level security;
alter table public.job_steps enable row level security;
alter table public.approvals enable row level security;
alter table public.usage_budget enable row level security;

-- Projects and source assets are directly manageable by their owner.
create policy "projects_select_own" on public.projects for select using (auth.uid() = owner_id);
create policy "projects_insert_own" on public.projects for insert with check (auth.uid() = owner_id);
create policy "projects_update_own" on public.projects for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "projects_delete_own" on public.projects for delete using (auth.uid() = owner_id);

create policy "assets_select_own" on public.assets for select using (auth.uid() = owner_id);
create policy "assets_insert_own" on public.assets for insert with check (auth.uid() = owner_id);
create policy "assets_update_own" on public.assets for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "assets_delete_own" on public.assets for delete using (auth.uid() = owner_id);

-- Pipeline state is readable by its owner, but all mutations go through the server service role.
create policy "jobs_select_own" on public.jobs for select using (auth.uid() = owner_id);
create policy "jobs_insert_server_only" on public.jobs for insert with check (false);
create policy "jobs_update_server_only" on public.jobs for update using (false) with check (false);
create policy "jobs_delete_server_only" on public.jobs for delete using (false);

create policy "job_steps_select_own" on public.job_steps for select using (auth.uid() = owner_id);
create policy "job_steps_insert_server_only" on public.job_steps for insert with check (false);
create policy "job_steps_update_server_only" on public.job_steps for update using (false) with check (false);
create policy "job_steps_delete_server_only" on public.job_steps for delete using (false);

create policy "approvals_select_own" on public.approvals for select using (auth.uid() = owner_id);
create policy "approvals_insert_server_only" on public.approvals for insert with check (false);
create policy "approvals_update_server_only" on public.approvals for update using (false) with check (false);
create policy "approvals_delete_server_only" on public.approvals for delete using (false);

create policy "usage_select_own" on public.usage_budget for select using (auth.uid() = owner_id);
create policy "usage_insert_server_only" on public.usage_budget for insert with check (false);
create policy "usage_update_server_only" on public.usage_budget for update using (false) with check (false);
create policy "usage_delete_server_only" on public.usage_budget for delete using (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('carecanvas-private', 'carecanvas-private', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Object keys must start with the authenticated user's UUID: <uid>/<job-id>/<file>.
create policy "carecanvas_storage_select_own" on storage.objects for select
using (bucket_id = 'carecanvas-private' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "carecanvas_storage_insert_own" on storage.objects for insert
with check (bucket_id = 'carecanvas-private' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "carecanvas_storage_update_own" on storage.objects for update
using (bucket_id = 'carecanvas-private' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'carecanvas-private' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "carecanvas_storage_delete_own" on storage.objects for delete
using (bucket_id = 'carecanvas-private' and (storage.foldername(name))[1] = auth.uid()::text);

-- PENDING PRODUCTION APPROVAL: apply after reviewing account deletion and suspension scope.
-- Explicit deletion rules: keep audit/suggestions, remove personal dependent content.
alter table public.lists drop constraint lists_owner_id_fkey;
alter table public.lists add constraint lists_owner_id_fkey foreign key(owner_id) references public.profiles on delete cascade;
alter table public.list_places alter column added_by drop not null;
alter table public.list_places drop constraint list_places_added_by_fkey;
alter table public.list_places add constraint list_places_added_by_fkey foreign key(added_by) references public.profiles on delete set null;
alter table public.place_suggestions alter column user_id drop not null;
alter table public.place_suggestions drop constraint place_suggestions_user_id_fkey;
alter table public.place_suggestions add constraint place_suggestions_user_id_fkey foreign key(user_id) references public.profiles on delete set null;
alter table public.place_suggestions drop constraint place_suggestions_decided_by_fkey;
alter table public.place_suggestions add constraint place_suggestions_decided_by_fkey foreign key(decided_by) references public.profiles on delete set null;
alter table public.moderation_audit alter column moderator_id drop not null;
alter table public.moderation_audit drop constraint moderation_audit_moderator_id_fkey;
alter table public.moderation_audit add constraint moderation_audit_moderator_id_fkey foreign key(moderator_id) references public.profiles on delete set null;
alter table public.reports alter column user_id drop not null;
alter table public.reports drop constraint reports_user_id_fkey;
alter table public.reports add constraint reports_user_id_fkey foreign key(user_id) references public.profiles on delete set null;
alter table public.corrections alter column user_id drop not null;
alter table public.corrections drop constraint corrections_user_id_fkey;
alter table public.corrections add constraint corrections_user_id_fkey foreign key(user_id) references public.profiles on delete set null;
alter table public.reports drop constraint reports_check;
alter table public.reports add constraint reports_check check(num_nonnulls(review_id,photo_id)<=1);
create table private.disabled_accounts(user_id uuid primary key references public.profiles on delete cascade);
create function private.account_enabled() returns boolean language sql stable security definer set search_path='' as $$select not exists(select 1 from private.disabled_accounts where user_id=auth.uid())$$;
revoke execute on function private.account_enabled() from public;
grant execute on function private.account_enabled() to anon,authenticated,service_role;
do $$declare t text;begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('create policy active_account on public.%I as restrictive to authenticated using(private.account_enabled()) with check(private.account_enabled())',t);
 end loop;end$$;
create policy active_account_storage on storage.objects as restrictive to authenticated using(private.account_enabled()) with check(private.account_enabled());
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select private.account_enabled() and exists(select 1 from private.administrators where user_id=auth.uid())$$;
create function public.admin_disable_account(target uuid,disabled boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if disabled then insert into private.disabled_accounts(user_id) values(target) on conflict do nothing;else delete from private.disabled_accounts where user_id=target;end if;end$$;
revoke execute on function public.admin_disable_account(uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_disable_account(uuid,boolean) to service_role;
create or replace function private.check_rate(op text,maximum int default 30) returns void language plpgsql security definer set search_path='' as $$declare n int;begin
 if auth.uid() is null or not private.account_enabled() then raise exception 'Iniciá sesión con una cuenta activa';end if;
 insert into private.rate_limits(user_id,operation) values(auth.uid(),op) on conflict(user_id,operation) do update set count=case when private.rate_limits.window_at<now()-interval '1 minute' then 1 else private.rate_limits.count+1 end,window_at=case when private.rate_limits.window_at<now()-interval '1 minute' then now() else private.rate_limits.window_at end returning count into n;
 if n>maximum then raise exception 'Demasiados intentos. Esperá un minuto.';end if;end$$;


update private.admin_features set enabled=true where feature='account_lifecycle';

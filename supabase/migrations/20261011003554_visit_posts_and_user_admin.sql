-- Additive rollout: no users, places, lists or reviews are deleted or reclassified.
-- Repeat visits are posts; ratings here do not alter the aggregate review score.
create table public.posts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references public.profiles on delete cascade,
 place_id uuid not null references public.places,
 visited_on date not null check(visited_on <= (now() at time zone 'America/Argentina/Buenos_Aires')::date),
 description text not null check(length(trim(description)) between 1 and 2000),
 rating integer check(rating between 1 and 5),
 visibility public.visibility not null default 'friends',
 hidden boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index posts_profile on public.posts(user_id,created_at desc,id desc);
create index posts_place on public.posts(place_id,created_at desc);
create table public.post_photos (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts on delete cascade,
 path text not null unique, thumbnail_path text not null unique, created_at timestamptz not null default now()
);
create table public.post_likes (
 user_id uuid not null default auth.uid() references public.profiles on delete cascade,
 post_id uuid not null references public.posts on delete cascade, primary key(user_id,post_id)
);
alter table public.posts enable row level security;
alter table public.post_photos enable row level security;
alter table public.post_likes enable row level security;
create function private.post_access(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select user_id=auth.uid() or (not hidden and private.activity_access(user_id,visibility)) from public.posts where id=pid),false)
$$;
revoke execute on function private.post_access(uuid) from public;
grant execute on function private.post_access(uuid) to anon,authenticated,service_role;
create function private.post_admin() returns boolean language sql stable security definer set search_path='' as $$select private.is_admin()$$;
revoke execute on function private.post_admin() from public;
grant execute on function private.post_admin() to anon,authenticated,service_role;
create policy posts_read on public.posts for select using(user_id=auth.uid() or (not hidden and private.activity_access(user_id,visibility)) or private.post_admin());
create policy posts_insert on public.posts for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.places where id=place_id and archived_at is null and merged_into is null));
create policy posts_update on public.posts for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy posts_delete on public.posts for delete to authenticated using(user_id=auth.uid());
create policy post_photos_read on public.post_photos for select using(private.post_access(post_id) or private.post_admin());
create policy post_photos_delete on public.post_photos for delete to authenticated using(exists(select 1 from public.posts where id=post_id and user_id=auth.uid()));
create policy post_likes_read on public.post_likes for select using(private.post_access(post_id));
create policy post_likes_insert on public.post_likes for insert to authenticated with check(user_id=auth.uid() and private.post_access(post_id));
create policy post_likes_delete on public.post_likes for delete to authenticated using(user_id=auth.uid());
grant select on public.posts,public.post_photos,public.post_likes to anon,authenticated;
grant insert(place_id,visited_on,description,rating,visibility) on public.posts to authenticated;
grant update(visited_on,description,rating,visibility) on public.posts to authenticated;
grant delete on public.posts,public.post_photos,public.post_likes to authenticated;
grant insert(post_id) on public.post_likes to authenticated;
grant all on public.posts,public.post_photos,public.post_likes to service_role;
create trigger posts_rate before insert on public.posts for each row execute function private.limit_write();
create function private.post_photo_limit() returns trigger language plpgsql set search_path='' as $$begin
 perform 1 from public.posts where id=new.post_id for update;
 if (select count(*) from public.post_photos where post_id=new.post_id)>=5 then raise exception 'Máximo 5 fotos por publicación';end if;return new;end$$;
create trigger post_photo_limit before insert on public.post_photos for each row execute function private.post_photo_limit();
create function private.post_photo_gc() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into private.photo_gc(path,bucket) values(old.path,'post-photos'),(old.thumbnail_path,'post-photos') on conflict do nothing;return old;end$$;
revoke execute on function private.post_photo_gc(),private.post_photo_limit() from public,anon,authenticated;
create trigger post_photo_gc after delete on public.post_photos for each row execute function private.post_photo_gc();
alter table private.photo_gc drop constraint photo_gc_bucket_check;
alter table private.photo_gc add constraint photo_gc_bucket_check check(bucket in ('review-photos','avatars','post-photos'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('post-photos','post-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy post_photo_storage_read on storage.objects for select using(bucket_id='post-photos' and exists(select 1 from public.post_photos p where (p.path=name or p.thumbnail_path=name) and (private.post_access(p.post_id) or private.post_admin())));
create table private.user_admin_audit(id uuid primary key default gen_random_uuid(),actor_id uuid, target_id uuid, action text not null,created_at timestamptz not null default now());
create function public.admin_set_role(target uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not private.is_admin() then raise exception 'Acceso de administrador requerido' using errcode='42501';end if;
 perform pg_advisory_xact_lock(90261011);
 if not enabled and exists(select 1 from private.administrators where user_id=target) and (select count(*) from private.administrators)<=1 then raise exception 'Debe quedar al menos un administrador';end if;
 if enabled then insert into private.administrators(user_id) values(target) on conflict do nothing;
 else delete from private.administrators where user_id=target;end if;
 insert into private.user_admin_audit(actor_id,target_id,action) values(auth.uid(),target,case when enabled then 'grant_admin' else 'revoke_admin' end);
end$$;
revoke execute on function public.admin_set_role(uuid,boolean) from public,anon;
grant execute on function public.admin_set_role(uuid,boolean) to authenticated;
create function public.admin_roles() returns table(user_id uuid) language plpgsql stable security definer set search_path='' as $$begin
 if not private.is_admin() then raise exception 'Acceso restringido' using errcode='42501';end if;
 return query select a.user_id from private.administrators a;end$$;
revoke execute on function public.admin_roles() from public,anon;
grant execute on function public.admin_roles() to authenticated;
create function public.admin_log_user_action(actor uuid,target uuid,operation text) returns void language sql security definer set search_path='' as $$insert into private.user_admin_audit(actor_id,target_id,action) values(actor,target,operation)$$;
revoke execute on function public.admin_log_user_action(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_log_user_action(uuid,uuid,text) to service_role;
create function public.admin_session_active(actor uuid,sid uuid) returns boolean language plpgsql stable security definer set search_path='' as $$begin
 return exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=sid and s.user_id=actor and (u.banned_until is null or u.banned_until<now()));end$$;
create function public.admin_revoke_sessions(target uuid) returns void language plpgsql security definer set search_path='' as $$begin
 delete from auth.sessions where user_id=target;end$$;
revoke execute on function public.admin_session_active(uuid,uuid),public.admin_revoke_sessions(uuid) from public,anon,authenticated;
grant execute on function public.admin_session_active(uuid,uuid),public.admin_revoke_sessions(uuid) to service_role;
create function public.admin_user_rate() returns void language plpgsql security definer set search_path='' as $$begin
 if not private.is_admin() then raise exception 'Acceso restringido';end if;
 perform private.check_rate('user_admin',30);end$$;
revoke execute on function public.admin_user_rate() from public,anon;
grant execute on function public.admin_user_rate() to authenticated;

create trigger touch_post before update on public.posts for each row execute function private.touch_review();
create or replace function private.my_place_match(pid uuid,kind text,lid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
 (kind in ('all','saved') and exists(select 1 from public.saved_places where user_id=auth.uid() and place_id=pid)) or
 (kind in ('all','want') and exists(select 1 from public.want_places where user_id=auth.uid() and place_id=pid)) or
 (kind in ('all','visited') and (exists(select 1 from public.visits where user_id=auth.uid() and place_id=pid) or exists(select 1 from public.posts where user_id=auth.uid() and place_id=pid))) or
 (kind in ('all','reviewed') and exists(select 1 from public.reviews where user_id=auth.uid() and place_id=pid and not archived)) or
 (kind in ('all','lists') and exists(select 1 from public.list_places lp join public.lists l on l.id=lp.list_id where lp.place_id=pid and (l.owner_id=auth.uid() or exists(select 1 from public.list_members m where m.list_id=l.id and m.user_id=auth.uid() and m.status='accepted'))))
 ) and (lid is null or exists(select 1 from public.list_places lp join public.lists l on l.id=lp.list_id where lp.place_id=pid and l.id=lid and (l.owner_id=auth.uid() or exists(select 1 from public.list_members m where m.list_id=l.id and m.user_id=auth.uid() and m.status='accepted'))))
 $$;
create function public.post_feed(mode text default 'all',before_time timestamptz default null,before_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
 select r.*,jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name) profiles,
 jsonb_build_object('id',l.id,'name',l.name,'category',l.category) places,
 coalesce((select jsonb_agg(to_jsonb(ph)) from public.post_photos ph where ph.post_id=r.id),'[]') post_photos,
 coalesce((select jsonb_agg(jsonb_build_object('user_id',lk.user_id)) from public.post_likes lk where lk.post_id=r.id),'[]') post_likes
 from public.posts r join public.profiles p on p.id=r.user_id join public.places l on l.id=r.place_id
 where not r.hidden and (before_time is null or (r.created_at,r.id)<(before_time,before_id))
 and ((mode in ('all','friends') and private.is_friend(r.user_id)) or (mode in ('all','following') and exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=r.user_id)))
 order by r.created_at desc,r.id desc limit 20) x
$$;
revoke execute on function public.post_feed(text,timestamptz,uuid) from public,anon;
grant execute on function public.post_feed(text,timestamptz,uuid) to authenticated;

create function private.avatar_delete_gc() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.avatar_path is not null then insert into private.photo_gc(path,bucket) values(old.avatar_path,'avatars') on conflict do nothing;end if;return old;end$$;
revoke execute on function private.avatar_delete_gc() from public,anon,authenticated;
create trigger avatar_delete_gc after delete on public.profiles for each row execute function private.avatar_delete_gc();

create table private.admin_features(feature text primary key,enabled boolean not null default false);
insert into private.admin_features values('account_lifecycle',false);
create function public.admin_lifecycle_enabled() returns boolean language sql stable security definer set search_path='' as $$select coalesce((select enabled from private.admin_features where feature='account_lifecycle'),false)$$;
revoke execute on function public.admin_lifecycle_enabled() from public,anon;
grant execute on function public.admin_lifecycle_enabled() to authenticated,service_role;

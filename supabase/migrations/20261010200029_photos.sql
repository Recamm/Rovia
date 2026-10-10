alter table private.photo_gc add column bucket text not null default 'review-photos' check(bucket in ('review-photos','avatars'));
drop function public.photo_gc_batch();
create function public.photo_gc_batch() returns table(path text,bucket text) language sql security definer set search_path='' as $$select path,bucket from private.photo_gc order by queued_at limit 200$$;
create function public.enqueue_photo_gc(paths text[],bucket_name text default 'review-photos') returns void language sql security definer set search_path='' as $$insert into private.photo_gc(path,bucket) select unnest(paths),bucket_name on conflict(path) do nothing$$;
create function public.photo_rate() returns void language plpgsql security definer set search_path='' as $$begin perform private.check_rate('photos',15);end$$;
revoke execute on function public.photo_gc_batch(),public.enqueue_photo_gc(text[],text),public.photo_rate() from public,anon,authenticated;
grant execute on function public.photo_gc_batch(),public.enqueue_photo_gc(text[],text) to service_role;
grant execute on function public.photo_rate() to authenticated;

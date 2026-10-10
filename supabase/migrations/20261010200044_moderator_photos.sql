-- Helpers avoid granting anonymous visitors SELECT on reports just to evaluate Storage RLS.
create function private.moderator_photo_access(pid uuid,rid uuid,is_hidden boolean) returns boolean language sql stable security definer set search_path='' as $$select private.is_moderator() and (is_hidden or exists(select 1 from public.reports where status='pending' and (photo_id=pid or review_id=rid)))$$;
revoke execute on function private.moderator_photo_access(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.moderator_photo_access(uuid,uuid,boolean) to anon,authenticated,service_role;
drop policy photo_read on public.review_photos;
create policy photo_read on public.review_photos for select using((not hidden and private.review_access(review_id)) or private.moderator_photo_access(id,review_id,hidden));
drop policy authorized_photo_read on storage.objects;
create policy authorized_photo_read on storage.objects for select using(bucket_id='review-photos' and exists(select 1 from public.review_photos p where (p.path=name or p.thumbnail_path=name) and ((not p.hidden and private.review_access(p.review_id)) or private.moderator_photo_access(p.id,p.review_id,p.hidden))));

create function public.place_summaries(ids uuid[]) returns jsonb language sql stable security invoker set search_path='' as $$select coalesce(jsonb_agg(to_jsonb(p)||to_jsonb(r)),'[]') from public.places p cross join lateral public.public_rating(p.id) r where p.id=any(ids[1:200])$$;
revoke execute on function public.place_summaries(uuid[]) from public,anon,authenticated;
grant execute on function public.place_summaries(uuid[]) to anon,authenticated;

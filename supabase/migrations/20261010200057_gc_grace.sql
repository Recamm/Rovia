-- Every upload is enqueued before Storage writes. A grace window protects in-flight uploads.
-- Cleanup rechecks live references before deletion, then acknowledges both live and removed paths.
create or replace function public.photo_gc_batch() returns table(path text,bucket text) language sql security definer set search_path='' as $$select path,bucket from private.photo_gc where queued_at<now()-interval '15 minutes' order by queued_at limit 200$$;

-- Las reimportaciones nunca deshacen ediciones ni bajas del administrador.
create or replace function public.import_places(batch jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare raw jsonb;x jsonb;o jsonb;pid uuid; begin
 if jsonb_typeof(batch)<>'array' or jsonb_array_length(batch)>100 then raise exception 'Lote inválido o demasiado grande';end if;
 for raw in select value from jsonb_array_elements(batch) loop
  if raw->>'category' not in ('cafe','bar','restaurant','ice_cream','bakery','pastry','fast_food') or not private.in_coverage((raw->>'lat')::float8,(raw->>'lng')::float8) then raise exception 'Local fuera del catálogo gastronómico o geográfico';end if;
  select place_id into pid from public.place_sources where source='OpenStreetMap' and external_type=raw->>'external_type' and external_id=raw->>'external_id';
  if pid is null then pid:=(raw->>'id')::uuid;end if;
  if exists(select 1 from public.places where id=(raw->>'id')::uuid and merged_into is not null) then
   update public.place_sources set raw_data=raw,imported_at=(raw->>'imported_at')::timestamptz where source='OpenStreetMap' and external_type=raw->>'external_type' and external_id=raw->>'external_id';continue;
  end if;
  select fields into o from public.place_overrides where place_id=pid;
  x:=raw||coalesce(o,'{}');
  insert into public.places(id,name,category,lat,lng,address,area,phone,website,instagram,opening_hours,timezone,price_level,source,external_type,external_id,imported_at,closed)
  values(pid,x->>'name',x->>'category',(x->>'lat')::float8,(x->>'lng')::float8,x->>'address',x->>'area',x->>'phone',x->>'website',x->>'instagram',x->>'opening_hours',coalesce(x->>'timezone','America/Argentina/Buenos_Aires'),(x->>'price_level')::int,'OpenStreetMap',raw->>'external_type',raw->>'external_id',(raw->>'imported_at')::timestamptz,coalesce((x->>'closed')::boolean,false))
  on conflict(id) do update set name=excluded.name,category=excluded.category,lat=excluded.lat,lng=excluded.lng,address=excluded.address,area=excluded.area,phone=excluded.phone,website=excluded.website,instagram=excluded.instagram,opening_hours=excluded.opening_hours,price_level=excluded.price_level,closed=excluded.closed,imported_at=excluded.imported_at;
  insert into public.place_sources values('OpenStreetMap',raw->>'external_type',raw->>'external_id',pid,raw,(raw->>'imported_at')::timestamptz)
  on conflict(source,external_type,external_id) do update set raw_data=excluded.raw_data,imported_at=excluded.imported_at;
 end loop;end $$;

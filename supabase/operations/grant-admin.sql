-- Ejecutar en SQL Editor como propietario, después de registrar y confirmar
-- la cuenta normal de Rovia que administrará el catálogo.
-- Reemplazar solamente el correo. Nunca colocar este SQL en el frontend.
do $$
declare admin_id uuid;
begin
  select u.id into admin_id from auth.users u join public.profiles p on p.id=u.id
  where lower(u.email)=lower('REEMPLAZAR_POR_TU_CORREO');
  if admin_id is null then raise exception 'Registrá y confirmá esa cuenta primero';end if;
  insert into private.administrators(user_id) values(admin_id) on conflict do nothing;
end $$;
-- Revocar permiso cuando sea necesario, desde el mismo entorno confiable:
-- delete from private.administrators where user_id='UUID_DE_LA_CUENTA';

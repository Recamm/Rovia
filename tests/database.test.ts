// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
const pg = new PGlite({ extensions: { postgis } });
const alice = "00000000-0000-4000-a000-000000000001",
  bob = "00000000-0000-4000-a000-000000000002",
  third = "00000000-0000-4000-a000-000000000003";
const place = "10000000-0000-4000-a000-000000000001",
  place2 = "10000000-0000-4000-a000-000000000002";
let review: string, list: string;
async function as<T = Record<string, unknown>>(
  role: string,
  uid: string | null,
  sql: string,
  args: unknown[] = [],
) {
  return pg.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      uid ?? "",
    ]);
    return tx.query<T>(sql, args);
  });
}
beforeAll(async () => {
  await pg.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select on storage.objects to anon,authenticated;grant all on storage.objects to service_role;`,
  );
  const migrationFiles = (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    try {
      await pg.exec(
        await readFile(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    } catch (e) {
      const err = e as {
        message: string;
        position?: string;
        internalQuery?: string;
        internalPosition?: string;
      };
      throw new Error(
        `${file}: ${err.message} (position=${err.position}, internal=${err.internalPosition}) ${err.internalQuery?.slice(0, 700) ?? ""}`,
      );
    }
  }
  for (const [id, name] of [
    [alice, "alice"],
    [bob, "bob"],
    [third, "third"],
  ])
    await pg.query("insert into auth.users values($1,$2)", [
      id,
      JSON.stringify({ username: name, display_name: name }),
    ]);
  await pg.query(
    "insert into public.places(id,name,category,lat,lng) values($1,'Local de prueba','cafe',-34.588,-58.431),($2,'Duplicado de prueba','cafe',-34.588,-58.431)",
    [place, place2],
  );
  review = (
    await as<{ id: string }>(
      "authenticated",
      alice,
      "insert into public.reviews(place_id,rating,comment,visibility) values($1,5,$2,$3) returning id",
      [place, "Experiencia sintética solo para pruebas", "friends"],
    )
  ).rows[0].id;
  list = (
    await as<{ id: string }>(
      "authenticated",
      alice,
      "insert into public.lists(name,visibility) values($1,$2) returning id",
      ["Lista de prueba", "private"],
    )
  ).rows[0].id;
  await pg.query(
    "insert into public.review_photos(review_id,path,thumbnail_path) values($1,'alice/full.jpg','alice/thumb.jpg')",
    [review],
  );
  await pg.exec(
    "insert into storage.objects(bucket_id,name) values('review-photos','alice/full.jpg');",
  );
}, 60000);
afterAll(async () => pg.close());
describe.sequential(
  "Migraciones y autorización sobre PostgreSQL + PostGIS aislado",
  () => {
    it("un visitante ve catálogo pero no reseñas para amigos ni archivos", async () => {
      expect(
        (await as("anon", null, "select * from public.places")).rows.length,
      ).toBe(2);
      expect(
        (await as("anon", null, "select * from public.reviews")).rows,
      ).toEqual([]);
      expect(
        (await as("anon", null, "select * from storage.objects")).rows,
      ).toEqual([]);
    });
    it("seguir y una solicitud pendiente no conceden acceso", async () => {
      await as(
        "authenticated",
        bob,
        "insert into public.follows(followed_id) values($1)",
        [alice],
      );
      await as(
        "authenticated",
        bob,
        "select public.friend_action($1,'request')",
        [alice],
      );
      expect(
        (await as("authenticated", bob, "select * from public.reviews")).rows,
      ).toEqual([]);
    });
    it("solicitudes cruzadas conservan un único pendiente, aceptación explícita abre acceso", async () => {
      await as(
        "authenticated",
        alice,
        "select public.friend_action($1,'request')",
        [bob],
      );
      const friends = await pg.query<{ status: string }>(
        "select * from public.friendships",
      );
      expect(friends.rows).toHaveLength(1);
      expect(friends.rows[0].status).toBe("pending");
      await as(
        "authenticated",
        alice,
        "select public.friend_action($1,'accept')",
        [bob],
      );
      expect(
        (await as("authenticated", bob, "select * from public.reviews")).rows,
      ).toHaveLength(1);
      expect(
        (await as("authenticated", bob, "select * from storage.objects")).rows,
      ).toHaveLength(1);
    });
    it("revoca acceso al quitar amistad y no permite falsificar autor ni moderación", async () => {
      await as(
        "authenticated",
        bob,
        "select public.friend_action($1,'remove')",
        [alice],
      );
      expect(
        (await as("authenticated", bob, "select * from public.reviews")).rows,
      ).toEqual([]);
      expect(
        (await as("authenticated", bob, "select * from storage.objects")).rows,
      ).toEqual([]);
      await expect(
        as(
          "authenticated",
          bob,
          "insert into public.reviews(user_id,place_id,rating,comment) values($1,$2,4,$3)",
          [alice, place, "No puedo publicar como otra persona"],
        ),
      ).rejects.toThrow();
      await expect(
        as(
          "authenticated",
          bob,
          "update public.reviews set hidden=false where id=$1",
          [review],
        ),
      ).rejects.toThrow();
      await expect(
        as("authenticated", bob, "select public.moderation_queue()"),
      ).rejects.toThrow();
    });
    it("los agregados públicos combinan perfil y reseña", async () => {
      await as(
        "authenticated",
        alice,
        "update public.reviews set visibility='public' where id=$1",
        [review],
      );
      expect(
        (
          await as<{ review_count: string }>(
            "anon",
            null,
            "select * from public.public_rating($1)",
            [place],
          )
        ).rows[0].review_count,
      ).toBe(0);
      await as(
        "authenticated",
        alice,
        "update public.profile_details set visibility='public' where id=$1",
        [alice],
      );
      const r = await as<{ review_count: number }>(
        "anon",
        null,
        "select * from public.public_rating($1)",
        [place],
      );
      expect(Number(r.rows[0].review_count)).toBe(1);
    });
    it("un lector accede a una lista privada, no puede editar, y pierde acceso al retirarlo", async () => {
      await as(
        "authenticated",
        alice,
        "select public.member_action($1,$2,'invite','reader')",
        [list, bob],
      );
      expect(
        (await as("authenticated", bob, "select * from public.lists")).rows,
      ).toEqual([]);
      await as(
        "authenticated",
        bob,
        "select public.member_action($1,$2,'accept','reader')",
        [list, bob],
      );
      expect(
        (await as("authenticated", bob, "select * from public.lists")).rows,
      ).toHaveLength(1);
      await expect(
        as(
          "authenticated",
          bob,
          "insert into public.list_places(list_id,place_id) values($1,$2)",
          [list, place],
        ),
      ).rejects.toThrow();
      await as(
        "authenticated",
        alice,
        "select public.member_action($1,$2,'role','editor')",
        [list, bob],
      );
      await as(
        "authenticated",
        bob,
        "insert into public.list_places(list_id,place_id) values($1,$2)",
        [list, place],
      );
      await as(
        "authenticated",
        alice,
        "select public.member_action($1,$2,'remove','reader')",
        [list, bob],
      );
      expect(
        (await as("authenticated", bob, "select * from public.lists")).rows,
      ).toEqual([]);
      expect(
        (await as("authenticated", bob, "select * from public.list_places"))
          .rows,
      ).toEqual([]);
    });
    it("likes únicos y guardados independientes de visitas", async () => {
      await as(
        "authenticated",
        bob,
        "insert into public.likes(review_id) values($1)",
        [review],
      );
      await expect(
        as(
          "authenticated",
          bob,
          "insert into public.likes(review_id) values($1)",
          [review],
        ),
      ).rejects.toThrow();
      await as(
        "authenticated",
        bob,
        "delete from public.likes where review_id=$1",
        [review],
      );
      await as(
        "authenticated",
        bob,
        "insert into public.saved_places(place_id) values($1)",
        [place],
      );
      expect(
        (await as("authenticated", bob, "select * from public.visits")).rows,
      ).toEqual([]);
    });
    it("PostGIS consulta la zona y respeta los filtros", async () => {
      const r = await as<{ search_places: unknown[] }>(
        "anon",
        null,
        "select public.search_places(-34.60,-58.45,-34.57,-58.41,-34.588,-58.431,'',array['cafe'],0,null,null)",
      );
      expect(r.rows[0].search_places).toHaveLength(2);
      const none = await as<{ search_places: unknown[] }>(
        "anon",
        null,
        "select public.search_places(-34.60,-58.45,-34.57,-58.41,-34.588,-58.431,'',array['bar'],0,null,null)",
      );
      expect(none.rows[0].search_places).toEqual([]);
    });
    it("perfil privado revoca reseñas, fotos, feed y notificaciones de likes", async () => {
      await as(
        "authenticated",
        bob,
        "insert into public.likes(review_id) values($1)",
        [review],
      );
      await as(
        "authenticated",
        alice,
        "update public.profile_details set visibility='private' where id=$1",
        [alice],
      );
      expect(
        (await as("authenticated", bob, "select * from public.reviews")).rows,
      ).toEqual([]);
      expect(
        (await as("authenticated", bob, "select * from storage.objects")).rows,
      ).toEqual([]);
      const r = await as<{ activity_feed: unknown[] }>(
        "authenticated",
        bob,
        "select public.activity_feed('all',null,null)",
      );
      expect(r.rows[0].activity_feed).toEqual([]);
      expect(
        Number(
          (
            await as<{ review_count: number }>(
              "anon",
              null,
              "select * from public.public_rating($1)",
              [place],
            )
          ).rows[0].review_count,
        ),
      ).toBe(0);
    });
    it("limpieza de fotos queda en cola al borrar una reseña", async () => {
      await as(
        "authenticated",
        alice,
        "delete from public.reviews where id=$1",
        [review],
      );
      expect(
        (await pg.query("select * from private.photo_gc")).rows,
      ).toHaveLength(2);
      expect(
        (await pg.query("select * from public.review_photos")).rows,
      ).toEqual([]);
    });
    it("importa dos veces sin duplicar y conserva correcciones aprobadas", async () => {
      const row = {
        id: "50000000-0000-4000-a000-000000000001",
        name: "Importado de prueba",
        category: "cafe",
        lat: -34.59,
        lng: -58.43,
        address: "Dirección OSM",
        area: "Prueba",
        phone: null,
        website: null,
        instagram: null,
        opening_hours: null,
        timezone: "America/Argentina/Buenos_Aires",
        external_type: "node",
        external_id: "9999999",
        imported_at: "2026-10-10T12:00:00Z",
      };
      await as("service_role", null, "select public.import_places($1)", [
        JSON.stringify([row]),
      ]);
      await pg.query("insert into private.moderators values($1)", [third]);
      const proposal = await as<{ id: string }>(
        "authenticated",
        bob,
        "insert into public.corrections(place_id,fields) values($1,$2) returning id",
        [row.id, JSON.stringify({ address: "Dirección corregida" })],
      );
      await as(
        "authenticated",
        third,
        "select public.moderate($1,'approve_correction','Se verificó la dirección de prueba')",
        [proposal.rows[0].id],
      );
      await as("service_role", null, "select public.import_places($1)", [
        JSON.stringify([row]),
      ]);
      const data = await pg.query<{ address: string }>(
        "select address from public.places where id=$1",
        [row.id],
      );
      expect(data.rows).toHaveLength(1);
      expect(data.rows[0].address).toBe("Dirección corregida");
      expect(
        (
          await pg.query(
            "select * from public.place_sources where external_id=$1",
            [row.external_id],
          )
        ).rows,
      ).toHaveLength(1);
      await expect(
        as("authenticated", bob, "select public.import_places($1)", [
          JSON.stringify([row]),
        ]),
      ).rejects.toThrow();
    });
    it("oculta y restaura reseñas desde moderación con auditoría", async () => {
      await as(
        "authenticated",
        alice,
        "update public.profile_details set visibility='public' where id=$1",
        [alice],
      );
      const r = await as<{ id: string }>(
        "authenticated",
        alice,
        "insert into public.reviews(place_id,rating,comment,visibility) values($1,4,'Reseña de moderación de prueba','public') returning id",
        [place],
      );
      review = r.rows[0].id;
      const report = await as<{ id: string }>(
        "authenticated",
        bob,
        "insert into public.reports(review_id,reason) values($1,'spam') returning id",
        [review],
      );
      await as(
        "authenticated",
        third,
        "select public.moderate($1,'hide_reported','Reporte revisado en prueba aislada')",
        [report.rows[0].id],
      );
      expect(
        (
          await as("anon", null, "select * from public.reviews where id=$1", [
            review,
          ])
        ).rows,
      ).toEqual([]);
      await as(
        "authenticated",
        third,
        "select public.moderate($1,'restore_review','Restauración justificada en prueba')",
        [review],
      );
      expect(
        (
          await as("anon", null, "select * from public.reviews where id=$1", [
            review,
          ])
        ).rows,
      ).toHaveLength(1);
      expect(
        (await pg.query("select * from public.moderation_audit")).rows.length,
      ).toBeGreaterThanOrEqual(3);
    });
    it("permite reportar fotos y ocultarlas sin borrar su referencia", async () => {
      const ph = (
        await pg.query<{ id: string }>(
          "insert into public.review_photos(review_id,path,thumbnail_path) values($1,'test/photo.jpg','test/thumb.jpg') returning id",
          [review],
        )
      ).rows[0].id;
      await pg.exec(
        "insert into storage.objects(bucket_id,name) values('review-photos','test/photo.jpg')",
      );
      const report = await as<{ id: string }>(
        "authenticated",
        bob,
        "insert into public.reports(photo_id,reason) values($1,'inappropriate') returning id",
        [ph],
      );
      await as(
        "authenticated",
        third,
        "select public.moderate($1,'hide_reported','Foto revisada por moderador autorizado')",
        [report.rows[0].id],
      );
      expect(
        (
          await as(
            "anon",
            null,
            "select * from storage.objects where name='test/photo.jpg'",
          )
        ).rows,
      ).toEqual([]);
      expect(
        (await pg.query("select * from public.review_photos where id=$1", [ph]))
          .rows,
      ).toHaveLength(1);
      await as(
        "authenticated",
        third,
        "select public.moderate($1,'restore_photo','Foto aceptada luego de revisar contexto')",
        [ph],
      );
      expect(
        (
          await as(
            "anon",
            null,
            "select * from storage.objects where name='test/photo.jpg'",
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("limita el total de fotos también desde el backend", async () => {
      for (let i = 1; i <= 4; i++)
        await pg.query(
          "insert into public.review_photos(review_id,path,thumbnail_path) values($1,$2,$3)",
          [review, `test/${i}.jpg`, `test/${i}-thumb.jpg`],
        );
      await expect(
        pg.query(
          "insert into public.review_photos(review_id,path,thumbnail_path) values($1,'test/six.jpg','test/six-thumb.jpg')",
          [review],
        ),
      ).rejects.toThrow("Máximo cinco fotos");
    });
    it("marca visitas por elección y quita pendientes solo cuando se solicita", async () => {
      await as(
        "authenticated",
        bob,
        "insert into public.want_places(place_id) values($1)",
        [place],
      );
      await as(
        "authenticated",
        bob,
        "select public.mark_visit($1,null,'private',false,false)",
        [place],
      );
      expect(
        (await as("authenticated", bob, "select * from public.want_places"))
          .rows,
      ).toHaveLength(1);
      await as(
        "authenticated",
        bob,
        "select public.mark_visit($1,null,'private',false,true)",
        [place],
      );
      expect(
        (await as("authenticated", bob, "select * from public.want_places"))
          .rows,
      ).toEqual([]);
      expect(
        (
          await as(
            "anon",
            null,
            "select * from public.visits where user_id=$1",
            [bob],
          )
        ).rows,
      ).toEqual([]);
    });
    it("archiva conflictos de reseñas al fusionar, conservando fotos y listas", async () => {
      await as(
        "authenticated",
        alice,
        "insert into public.reviews(place_id,rating,comment,visibility) values($1,3,'Segunda reseña de prueba del duplicado','public')",
        [place2],
      );
      const c = await as<{ id: string }>(
        "authenticated",
        bob,
        "insert into public.corrections(place_id,fields) values($1,$2) returning id",
        [place2, JSON.stringify({ duplicate_of: place })],
      );
      await as(
        "authenticated",
        third,
        "select public.moderate($1,'approve_correction','Duplicación comprobada en datos de prueba')",
        [c.rows[0].id],
      );
      const r = await pg.query<{ archived: boolean }>(
        "select archived from public.reviews where user_id=$1 and place_id=$2",
        [alice, place],
      );
      expect(r.rows).toHaveLength(2);
      expect(r.rows.filter((x) => !x.archived)).toHaveLength(1);
      expect(
        (
          await pg.query(
            "select * from public.review_photos where review_id=$1",
            [review],
          )
        ).rows,
      ).toHaveLength(5);
    });
    it("las notificaciones las genera el backend y suprime detalles tras revocar acceso", async () => {
      await expect(
        as(
          "authenticated",
          bob,
          "insert into public.notifications(user_id,actor_id,kind) values($1,$2,'friendship')",
          [third, bob],
        ),
      ).rejects.toThrow();
      await as(
        "authenticated",
        alice,
        "select public.member_action($1,$2,'invite','editor')",
        [list, bob],
      );
      await as(
        "authenticated",
        bob,
        "select public.member_action($1,$2,'accept','editor')",
        [list, bob],
      );
      await as(
        "authenticated",
        alice,
        "insert into public.list_places(list_id,place_id) values($1,$2)",
        [list, "50000000-0000-4000-a000-000000000001"],
      );
      expect(
        (
          await as(
            "authenticated",
            bob,
            "select * from public.notifications where kind='list_place'",
          )
        ).rows.length,
      ).toBeGreaterThan(0);
      await as(
        "authenticated",
        alice,
        "select public.member_action($1,$2,'remove','reader')",
        [list, bob],
      );
      expect(
        (
          await as(
            "authenticated",
            bob,
            "select * from public.notifications where kind in ('list_place','list_invite')",
          )
        ).rows,
      ).toEqual([]);
    });
    it("el rol admin no se puede activar desde una cuenta normal", async () => {
      expect(
        (
          await as<{ is_admin: boolean }>(
            "authenticated",
            bob,
            "select public.is_admin()",
          )
        ).rows[0].is_admin,
      ).toBe(false);
      await expect(
        as(
          "authenticated",
          bob,
          "insert into private.administrators values($1)",
          [bob],
        ),
      ).rejects.toThrow();
      await expect(
        as(
          "authenticated",
          bob,
          "select public.admin_catalog(-34.77,-58.57,-34.45,-58.32,'','active')",
        ),
      ).rejects.toThrow();
      await expect(
        as(
          "anon",
          null,
          "select public.admin_catalog(-34.77,-58.57,-34.45,-58.32,'','active')",
        ),
      ).rejects.toThrow();
      await pg.query("insert into private.administrators values($1)", [third]);
      expect(
        (
          await as<{ is_admin: boolean }>(
            "authenticated",
            third,
            "select public.is_admin()",
          )
        ).rows[0].is_admin,
      ).toBe(true);
    });
    it("las propuestas son privadas y no se publican hasta su aprobación", async () => {
      const fields = {
        name: "Café propuesto en prueba",
        category: "cafe",
        lat: -34.531,
        lng: -58.522,
        address: "Dirección sintética 123",
        area: "Munro",
      };
      const submitted = await as<{ submit_place_suggestion: string }>(
        "authenticated",
        bob,
        "select public.submit_place_suggestion($1,'Prueba aislada de apertura')",
        [JSON.stringify(fields)],
      );
      const sid = submitted.rows[0].submit_place_suggestion;
      expect(
        (
          await as(
            "authenticated",
            bob,
            "select * from public.place_suggestions where id=$1",
            [sid],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await as(
            "authenticated",
            alice,
            "select * from public.place_suggestions where id=$1",
            [sid],
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await as(
            "authenticated",
            third,
            "select * from public.place_suggestions where id=$1",
            [sid],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await pg.query("select * from public.places where name=$1", [
            fields.name,
          ])
        ).rows,
      ).toEqual([]);
      await expect(
        as(
          "authenticated",
          bob,
          "update public.place_suggestions set status='approved' where id=$1",
          [sid],
        ),
      ).rejects.toThrow();
      await expect(
        as(
          "authenticated",
          bob,
          "select public.submit_place_suggestion($1,'Duplicado de prueba')",
          [JSON.stringify(fields)],
        ),
      ).rejects.toThrow();
      await expect(
        as(
          "authenticated",
          bob,
          "select public.submit_place_suggestion($1,'Fuera de zona')",
          [JSON.stringify({ ...fields, lat: -34.65, lng: -58.62 })],
        ),
      ).rejects.toThrow();
      await expect(
        as(
          "authenticated",
          bob,
          "select public.submit_place_suggestion($1,'Autor falsificado')",
          [
            JSON.stringify({
              ...fields,
              name: "Otra propuesta",
              user_id: alice,
            }),
          ],
        ),
      ).rejects.toThrow();
      await expect(
        as(
          "authenticated",
          bob,
          "select public.admin_decide_suggestion($1,'approve','Aprobación no autorizada')",
          [sid],
        ),
      ).rejects.toThrow();
      await as(
        "authenticated",
        third,
        "select public.admin_decide_suggestion($1,'approve','Local revisado en prueba aislada')",
        [sid],
      );
      const accepted = await pg.query<{ status: string; place_id: string }>(
        "select * from public.place_suggestions where id=$1",
        [sid],
      );
      expect(accepted.rows[0].status).toBe("approved");
      expect(
        (
          await pg.query("select * from public.places where id=$1", [
            accepted.rows[0].place_id,
          ])
        ).rows,
      ).toHaveLength(1);
      await expect(
        as(
          "authenticated",
          third,
          "select public.admin_decide_suggestion($1,'approve','No se aprueba dos veces')",
          [sid],
        ),
      ).rejects.toThrow();
    });
    it("vincula propuestas duplicadas sin crear otro local y conserva el motivo de rechazo", async () => {
      const fields = {
        name: "Otra propuesta de prueba",
        category: "bakery",
        lat: -34.588,
        lng: -58.431,
        address: "Dirección de prueba 456",
      };
      const sid = (
        await as<{ submit_place_suggestion: string }>(
          "authenticated",
          bob,
          "select public.submit_place_suggestion($1,'')",
          [JSON.stringify(fields)],
        )
      ).rows[0].submit_place_suggestion;
      const count = (
        await pg.query<{ n: number }>(
          "select count(*)::int n from public.places",
        )
      ).rows[0].n;
      await as(
        "authenticated",
        third,
        "select public.admin_decide_suggestion($1,'duplicate','Ya existe un local en el catálogo',null,$2)",
        [sid, place],
      );
      expect(
        (
          await pg.query<{ n: number }>(
            "select count(*)::int n from public.places",
          )
        ).rows[0].n,
      ).toBe(count);
      expect(
        (
          await pg.query<{ place_id: string }>(
            "select place_id from public.place_suggestions where id=$1",
            [sid],
          )
        ).rows[0].place_id,
      ).toBe(place);
      const rejected = (
        await as<{ submit_place_suggestion: string }>(
          "authenticated",
          bob,
          "select public.submit_place_suggestion($1,'')",
          [
            JSON.stringify({
              ...fields,
              name: "Propuesta rechazada de prueba",
            }),
          ],
        )
      ).rows[0].submit_place_suggestion;
      await as(
        "authenticated",
        third,
        "select public.admin_decide_suggestion($1,'reject','No corresponde a un local abierto')",
        [rejected],
      );
      expect(
        (
          await as<{ status: string; decision_reason: string }>(
            "authenticated",
            bob,
            "select * from public.place_suggestions where id=$1",
            [rejected],
          )
        ).rows[0],
      ).toMatchObject({
        status: "rejected",
        decision_reason: "No corresponde a un local abierto",
      });
    });
    it("editar, dar de baja y reimportar conserva ediciones, actividad y auditoría", async () => {
      const id = "50000000-0000-4000-a000-000000000001";
      const fields = {
        name: "Nombre corregido por admin",
        category: "cafe",
        lat: -34.5905,
        lng: -58.4305,
        address: "Dirección editada",
        area: "CABA",
        price_level: 2,
        closed: true,
      };
      await expect(
        as(
          "authenticated",
          bob,
          "select public.admin_save_place($1,'No autorizado',$2)",
          [JSON.stringify(fields), id],
        ),
      ).rejects.toThrow();
      await as(
        "authenticated",
        third,
        "select public.admin_save_place($1,'Ubicación y nombre verificados',$2)",
        [JSON.stringify(fields), id],
      );
      await as(
        "authenticated",
        bob,
        "insert into public.saved_places(place_id) values($1)",
        [id],
      );
      await as(
        "authenticated",
        third,
        "select public.admin_archive_place($1,true,'Baja temporal de prueba')",
        [id],
      );
      const raw = {
        id,
        name: "Nombre OSM anterior",
        category: "cafe",
        lat: -34.59,
        lng: -58.43,
        address: "OSM anterior",
        area: "Prueba",
        timezone: "America/Argentina/Buenos_Aires",
        external_type: "node",
        external_id: "9999999",
        imported_at: "2026-10-11T12:00:00Z",
      };
      await as("service_role", null, "select public.import_places($1)", [
        JSON.stringify([raw]),
      ]);
      const p = (
        await pg.query<{
          name: string;
          lat: number;
          price_level: number;
          closed: boolean;
          archived_at: string;
        }>("select * from public.places where id=$1", [id])
      ).rows[0];
      expect(p).toMatchObject({
        name: fields.name,
        lat: fields.lat,
        price_level: 2,
        closed: true,
      });
      expect(p.archived_at).toBeTruthy();
      expect(
        (
          await as(
            "authenticated",
            bob,
            "select * from public.saved_places where place_id=$1",
            [id],
          )
        ).rows,
      ).toHaveLength(1);
      await as(
        "authenticated",
        third,
        "select public.admin_archive_place($1,false,'Restauración verificada de prueba')",
        [id],
      );
      expect(
        (
          await pg.query<{ archived_at: null }>(
            "select archived_at from public.places where id=$1",
            [id],
          )
        ).rows[0].archived_at,
      ).toBeNull();
      expect(
        (
          await pg.query(
            "select * from public.moderation_audit where target_id=$1 and action in ('archive_place','restore_place','update_place')",
            [id],
          )
        ).rows,
      ).toHaveLength(3);
    });
    it("Mi mapa une estados sin duplicar y exige pertenencia a las listas", async () => {
      const pid = "70000000-0000-4000-a000-000000000001";
      await pg.query(
        "insert into public.places(id,name,category,lat,lng) values($1,'Mapa personal sintético','cafe',-34.588,-58.431)",
        [pid],
      );
      await as(
        "authenticated",
        alice,
        "insert into public.saved_places(place_id) values($1)",
        [pid],
      );
      await as(
        "authenticated",
        alice,
        "insert into public.want_places(place_id) values($1)",
        [pid],
      );
      await as(
        "authenticated",
        alice,
        "select public.mark_visit($1,null,'private',false,false)",
        [pid],
      );
      await as(
        "authenticated",
        alice,
        "insert into public.reviews(place_id,rating,comment,visibility) values($1,4,'Experiencia de prueba para mapa','private')",
        [pid],
      );
      const lid = (
        await as<{ id: string }>(
          "authenticated",
          alice,
          "insert into public.lists(name,visibility) values('Lista para mapa','public') returning id",
        )
      ).rows[0].id;
      await as(
        "authenticated",
        alice,
        "insert into public.list_places(list_id,place_id) values($1,$2)",
        [lid, pid],
      );
      const sql =
        "select public.map_places(-34.60,-58.45,-34.57,-58.41,-34.588,-58.431,'Mapa personal',array[]::text[],0,null,null,'mine',$1,$2)";
      for (const filter of [
        "all",
        "saved",
        "want",
        "visited",
        "reviewed",
        "lists",
      ]) {
        const rows = (
          await as<{ map_places: { id: string }[] }>(
            "authenticated",
            alice,
            sql,
            [filter, null],
          )
        ).rows[0].map_places;
        expect(rows.map((p) => p.id)).toEqual([pid]);
      }
      expect(
        (
          await as<{ map_places: unknown[] }>("authenticated", bob, sql, [
            "all",
            lid,
          ])
        ).rows[0].map_places,
      ).toEqual([]);
      await as(
        "authenticated",
        alice,
        "select public.member_action($1,$2,'invite','reader')",
        [lid, bob],
      );
      expect(
        (
          await as<{ map_places: unknown[] }>("authenticated", bob, sql, [
            "all",
            lid,
          ])
        ).rows[0].map_places,
      ).toEqual([]);
      await as(
        "authenticated",
        bob,
        "select public.member_action($1,$2,'accept','reader')",
        [lid, bob],
      );
      expect(
        (
          await as<{ map_places: unknown[] }>("authenticated", bob, sql, [
            "lists",
            lid,
          ])
        ).rows[0].map_places,
      ).toHaveLength(1);
      await as(
        "authenticated",
        alice,
        "select public.member_action($1,$2,'remove','reader')",
        [lid, bob],
      );
      expect(
        (
          await as<{ map_places: unknown[] }>("authenticated", bob, sql, [
            "lists",
            lid,
          ])
        ).rows[0].map_places,
      ).toEqual([]);
      await expect(as("anon", null, sql, ["all", null])).rejects.toThrow();
    });
  },
);
describe("Publicaciones por visita y administración de cuentas", () => {
  const author = "00000000-0000-4000-b000-000000000010";
  const viewer = "00000000-0000-4000-b000-000000000011";
  const local = "10000000-0000-4000-b000-000000000010";
  let post: string;
  beforeAll(async () => {
    for (const [id, username] of [
      [author, "post_author"],
      [viewer, "post_viewer"],
    ])
      await pg.query("insert into auth.users values($1,$2)", [
        id,
        JSON.stringify({ username, display_name: username }),
      ]);
    await pg.query(
      "insert into public.places(id,name,category,lat,lng) values($1,'Lugar para publicaciones','cafe',-34.588,-58.431)",
      [local],
    );
    await pg.query(
      "update public.profile_details set visibility='public' where id=$1",
      [author],
    );
  });
  it("admite visitas repetidas sin puntaje y las agrega a Mi mapa", async () => {
    for (const day of ["2026-01-01", "2026-02-02"]) {
      const row = await as<{ id: string }>(
        "authenticated",
        author,
        "insert into posts(place_id,visited_on,description,visibility) values($1,$2,'Una visita para probar','private') returning id",
        [local, day],
      );
      post = row.rows[0].id;
    }
    expect(
      (
        await as(
          "authenticated",
          author,
          "select * from posts where place_id=$1",
          [local],
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await as<{ result: { id: string }[] }>(
          "authenticated",
          author,
          "select public.map_places(-34.59,-58.44,-34.58,-58.42,-34.588,-58.431,map_scope=>'mine',personal_filter=>'visited') result",
        )
      ).rows[0].result.some((p) => p.id === local),
    ).toBe(true);
  });
  it("protege publicaciones privadas, fotos y escrituras ajenas", async () => {
    await pg.query(
      "insert into post_photos(post_id,path,thumbnail_path) values($1,'post/full','post/thumb')",
      [post],
    );
    await pg.query(
      "insert into storage.objects(bucket_id,name) values('post-photos','post/full')",
    );
    expect(
      (
        await as("authenticated", viewer, "select * from posts where id=$1", [
          post,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await as(
          "authenticated",
          viewer,
          "select * from storage.objects where name='post/full'",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await as(
          "authenticated",
          viewer,
          "update posts set description='Otra persona' where id=$1 returning id",
          [post],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      as(
        "authenticated",
        viewer,
        "insert into post_likes(post_id) values($1)",
        [post],
      ),
    ).rejects.toThrow();
    await expect(
      as("authenticated", author, "update posts set hidden=true where id=$1", [
        post,
      ]),
    ).rejects.toThrow();
  });
  it("permite fotos públicas solo con el perfil y la publicación públicos", async () => {
    await as(
      "authenticated",
      author,
      "update posts set visibility='public' where id=$1",
      [post],
    );
    expect(
      (
        await as(
          "anon",
          null,
          "select * from storage.objects where name='post/full'",
        )
      ).rows,
    ).toHaveLength(1);
    await pg.query(
      "update profile_details set visibility='private' where id=$1",
      [author],
    );
    expect(
      (
        await as(
          "anon",
          null,
          "select * from storage.objects where name='post/full'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("limita fotos, encola limpieza y valida fecha y calificación", async () => {
    for (let i = 0; i < 4; i++)
      await pg.query(
        "insert into post_photos(post_id,path,thumbnail_path) values($1,$2,$3)",
        [post, `post/full-${i}`, `post/thumb-${i}`],
      );
    await expect(
      pg.query(
        "insert into post_photos(post_id,path,thumbnail_path) values($1,'post/extra','post/extra-thumb')",
        [post],
      ),
    ).rejects.toThrow("Máximo");
    await expect(
      as(
        "authenticated",
        author,
        "insert into posts(place_id,visited_on,description,rating) values($1,'2099-01-01','Fecha futura',1)",
        [local],
      ),
    ).rejects.toThrow();
    await expect(
      as(
        "authenticated",
        author,
        "insert into posts(place_id,visited_on,description,rating) values($1,'2026-01-01','Puntaje inválido',6)",
        [local],
      ),
    ).rejects.toThrow();
    await as("authenticated", author, "delete from posts where id=$1", [post]);
    expect(
      (
        await pg.query(
          "select * from private.photo_gc where bucket='post-photos'",
        )
      ).rows,
    ).toHaveLength(10);
  });
  it("un usuario común no puede otorgarse administrador y protege al último admin", async () => {
    await expect(
      as("authenticated", viewer, "select admin_set_role($1,true)", [viewer]),
    ).rejects.toThrow();
    const { rows: old } = await pg.query<{ user_id: string }>(
      "select user_id from private.administrators",
    );
    await pg.exec("delete from private.administrators");
    await pg.query("insert into private.administrators values($1)", [author]);
    await expect(
      as("authenticated", author, "select admin_set_role($1,false)", [author]),
    ).rejects.toThrow("al menos");
    await as("authenticated", author, "select admin_set_role($1,true)", [
      viewer,
    ]);
    await as("authenticated", viewer, "select admin_set_role($1,false)", [
      author,
    ]);
    await pg.exec("delete from private.administrators");
    for (const r of old)
      await pg.query("insert into private.administrators values($1)", [
        r.user_id,
      ]);
  });
  it("una suspensión bloquea lectura y escritura aunque el JWT no haya vencido", async () => {
    await pg.query("insert into private.disabled_accounts values($1)", [
      author,
    ]);
    expect(
      (await as("authenticated", author, "select * from posts")).rows,
    ).toHaveLength(0);
    await expect(
      as(
        "authenticated",
        author,
        "insert into posts(place_id,visited_on,description) values($1,'2026-01-01','Cuenta suspendida')",
        [local],
      ),
    ).rejects.toThrow();
    await pg.query("delete from private.disabled_accounts where user_id=$1", [
      author,
    ]);
  });
  it("elimina cuentas con listas, publicaciones y propuestas sin bloquear claves foráneas", async () => {
    await as(
      "authenticated",
      author,
      "insert into lists(name) values('Lista antes de borrar')",
    );
    await as(
      "authenticated",
      author,
      "insert into posts(place_id,visited_on,description) values($1,'2026-01-01','Otra visita')",
      [local],
    );
    await pg.query(
      "insert into place_suggestions(user_id,name,category,lat,lng,address,area) values($1,'Propuesta de cuenta borrada','cafe',-34.588,-58.431,'Dirección 123','CABA')",
      [author],
    );
    await pg.query("delete from auth.users where id=$1", [author]);
    expect(
      (await pg.query("select * from posts where user_id=$1", [author])).rows,
    ).toHaveLength(0);
    expect(
      (await pg.query("select * from lists where owner_id=$1", [author])).rows,
    ).toHaveLength(0);
    expect(
      (
        await pg.query(
          "select * from place_suggestions where name='Propuesta de cuenta borrada' and user_id is null",
        )
      ).rows,
    ).toHaveLength(1);
  });
});

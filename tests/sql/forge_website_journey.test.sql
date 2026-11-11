-- FORGE / Website Designer · synthetic isolated PostgreSQL acceptance.
-- Run ONLY after the existing owner memberships + OS module migrations.
-- Never run on production; all rows below are synthetic and transaction rolled back.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id,email) VALUES
 ('00000000-0000-4000-8000-000000000011','forge-owner-a@example.test'),
 ('00000000-0000-4000-8000-000000000012','forge-owner-b@example.test'),
 ('00000000-0000-4000-8000-000000000013','forge-outsider@example.test');
INSERT INTO public.agency_memberships(user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000011','owner'),
 ('00000000-0000-4000-8000-000000000012','owner');

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000011',false);
DO $$
DECLARE
 v_project_id uuid;
 v_page_id uuid;
 current_version integer;
 changed integer;
 original jsonb;
begin
 -- Real module tables, synthetic project and its first page.
 INSERT INTO public.os_projects(module,name,description)
   VALUES('website','Forge synthetic website','Isolated acceptance only') RETURNING id INTO v_project_id;
 INSERT INTO public.os_website_pages(project_id,slug,title,blocks)
   VALUES(v_project_id,'inicio','Inicio','[{"type":"hero","heading":"Borrador original","subheading":"","buttonLabel":"","buttonHref":""}]')
   RETURNING id,version INTO v_page_id,current_version;
 ASSERT current_version=1,'page creation must persist version 1';
 ASSERT (SELECT count(*) FROM public.os_website_page_versions WHERE page_id=v_page_id)=1,'initial snapshot must exist';

 -- A version-guarded save and an actual DB read (equivalent to reopen).
 UPDATE public.os_website_pages
   SET blocks='[{"type":"hero","heading":"Sitio editado","subheading":"Contenido guardado","buttonLabel":"","buttonHref":""}]'::jsonb
   WHERE id=v_page_id AND project_id=v_project_id AND version=1
   RETURNING version INTO current_version;
 ASSERT current_version=2,'successful save must increment version';
 ASSERT (SELECT blocks->0->>'heading' FROM public.os_website_pages WHERE id=v_page_id)='Sitio editado',
   'reopened page must contain edited text';

 -- A stale editor must not overwrite a saved revision.
 UPDATE public.os_website_pages SET blocks='[]'::jsonb WHERE id=v_page_id AND version=1;
 GET DIAGNOSTICS changed=ROW_COUNT;
 ASSERT changed=0,'a stale save must be rejected';
 ASSERT (SELECT blocks->0->>'heading' FROM public.os_website_pages WHERE id=v_page_id)='Sitio editado',
   'a rejected save must not lose persisted text';

 -- Restore a genuine previously snapshotted revision.
 SELECT blocks INTO original FROM public.os_website_page_versions
   WHERE page_id=v_page_id AND page_version=1;
 ASSERT original IS NOT NULL,'restore source must be a persisted page version';
 UPDATE public.os_website_pages SET blocks=original WHERE id=v_page_id AND version=2
   RETURNING version INTO current_version;
 ASSERT current_version=3,'restoring must generate a new revision';
 ASSERT (SELECT blocks->0->>'heading' FROM public.os_website_pages WHERE id=v_page_id)='Borrador original',
   'restore must re-open with the original text';
 ASSERT (SELECT count(*) FROM public.os_website_page_versions WHERE page_id=v_page_id)=3,
   'restore must retain earlier versions and add a new snapshot';

 PERFORM set_config('forge.page_id',v_page_id::text,false);
 PERFORM set_config('forge.project_id',v_project_id::text,false);
end $$;

-- Owner B can see the same synthetic page in this RLS scenario. This does
-- NOT certify independent real-browser sessions or cross-device collaboration.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000012',false);
DO $$
BEGIN
 ASSERT EXISTS (SELECT 1 FROM public.os_projects
   WHERE id=current_setting('forge.project_id')::uuid), 'other owner cannot see synthetic project';
 ASSERT EXISTS (SELECT 1 FROM public.os_website_pages
   WHERE id=current_setting('forge.page_id')::uuid AND version=3), 'other owner cannot reopen synthetic page';
END $$;

-- Authenticated outsider is denied by the existing RLS policies.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000013',false);
DO $$
BEGIN
 ASSERT NOT EXISTS (SELECT 1 FROM public.os_projects
   WHERE id=current_setting('forge.project_id')::uuid), 'outsider could read project';
 ASSERT NOT EXISTS (SELECT 1 FROM public.os_website_pages
   WHERE id=current_setting('forge.page_id')::uuid), 'outsider could read page';
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'forge_website_journey: synthetic create, edit, guarded save, reopen, conflict, restore, owner-RLS passed' AS result;

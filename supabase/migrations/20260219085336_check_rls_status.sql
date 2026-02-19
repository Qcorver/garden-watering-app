-- Temporary function to check RLS status (will be dropped after inspection)
CREATE OR REPLACE FUNCTION public.check_rls_status()
RETURNS TABLE(table_name text, rls_enabled boolean, policies bigint)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    t.tablename::text,
    t.rowsecurity,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.tablename)
  FROM pg_tables t
  WHERE t.schemaname = 'public'
  ORDER BY t.tablename;
$$;

CREATE OR REPLACE FUNCTION public.check_rls_policies()
RETURNS TABLE(table_name text, policy_name text, cmd text, qual text, with_check text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    p.tablename::text,
    p.policyname::text,
    p.cmd::text,
    p.qual::text,
    p.with_check::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
  ORDER BY p.tablename, p.policyname;
$$;

-- my_role() is used by RLS policies for signed-in users only; keep it off the anonymous API.
-- It only returns the caller's own role.
revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

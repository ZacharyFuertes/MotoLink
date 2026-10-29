-- Permanently remove a rejected pending shop and its unused owner account.
-- Only a signed-in platform admin may decline a shop, and active shops cannot
-- be removed through this workflow.
CREATE OR REPLACE FUNCTION public.admin_decline_pending_shop(p_shop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_shop_name text;
  v_is_active boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only platform admins can decline shops';
  END IF;

  SELECT s.owner_id, s.name, s.is_active
    INTO v_owner_id, v_shop_name, v_is_active
  FROM public.shops AS s
  WHERE s.id = p_shop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop not found';
  END IF;

  IF v_is_active THEN
    RAISE EXCEPTION 'Only pending shops can be declined';
  END IF;

  DELETE FROM public.shops WHERE id = p_shop_id;

  -- Remove the auth account only if this was the owner's only shop, allowing
  -- a declined applicant to retry registration with the same email.
  IF v_owner_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.shops WHERE owner_id = v_owner_id) THEN
    DELETE FROM auth.users WHERE id = v_owner_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'shop_id', p_shop_id,
    'shop_name', v_shop_name,
    'owner_id', v_owner_id,
    'message', 'Pending shop declined and deleted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_decline_pending_shop(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_decline_pending_shop(uuid) TO authenticated;
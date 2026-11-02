-- Map each shop service to the inventory categories compatible with it.
-- Inventory remains shop-scoped; legacy text category values are retained and
-- backfilled into the normalized category table.

CREATE TABLE IF NOT EXISTS public.part_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT part_categories_shop_name_unique UNIQUE (shop_id, name),
  CONSTRAINT part_categories_id_shop_unique UNIQUE (id, shop_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_services_pricing_id_shop_unique
  ON public.services_pricing(id, shop_id);

CREATE TABLE IF NOT EXISTS public.service_part_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  service_id UUID NOT NULL,
  part_category_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_part_categories_service_category_unique
    UNIQUE (service_id, part_category_id),
  CONSTRAINT service_part_categories_id_shop_unique UNIQUE (id, shop_id),
  CONSTRAINT service_part_categories_service_shop_fk
    FOREIGN KEY (service_id, shop_id)
    REFERENCES public.services_pricing(id, shop_id) ON DELETE CASCADE,
  CONSTRAINT service_part_categories_category_shop_fk
    FOREIGN KEY (part_category_id, shop_id)
    REFERENCES public.part_categories(id, shop_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_part_categories_shop_service
  ON public.service_part_categories(shop_id, service_id);
CREATE INDEX IF NOT EXISTS idx_service_part_categories_category
  ON public.service_part_categories(part_category_id);

ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS category_id UUID,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Preserve existing inventory classifications by creating a per-shop category
-- for each distinct non-empty legacy category string.
INSERT INTO public.part_categories (shop_id, name)
SELECT DISTINCT p.shop_id, btrim(p.category)
FROM public.parts AS p
WHERE NULLIF(btrim(p.category), '') IS NOT NULL
ON CONFLICT (shop_id, name) DO NOTHING;

INSERT INTO public.part_categories (shop_id, name)
SELECT DISTINCT p.shop_id, 'other'
FROM public.parts AS p
WHERE NULLIF(btrim(p.category), '') IS NULL
ON CONFLICT (shop_id, name) DO NOTHING;

UPDATE public.parts
SET category = 'other'
WHERE NULLIF(btrim(category), '') IS NULL;

UPDATE public.parts AS p
SET category_id = c.id
FROM public.part_categories AS c
WHERE p.shop_id = c.shop_id
  AND btrim(p.category) = c.name
  AND p.category_id IS NULL;

ALTER TABLE public.parts
  DROP CONSTRAINT IF EXISTS parts_category_id_shop_fk;
ALTER TABLE public.parts
  ADD CONSTRAINT parts_category_id_shop_fk
  FOREIGN KEY (category_id, shop_id)
  REFERENCES public.part_categories(id, shop_id) ON DELETE RESTRICT;
ALTER TABLE public.parts ALTER COLUMN category_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parts_shop_category_active
  ON public.parts(shop_id, category_id, is_active);

CREATE OR REPLACE FUNCTION public.sync_part_category_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NULLIF(btrim(NEW.category), '') IS NULL THEN
    NEW.category := 'other';
  END IF;

  INSERT INTO public.part_categories (shop_id, name)
  VALUES (NEW.shop_id, btrim(NEW.category))
  ON CONFLICT (shop_id, name) DO NOTHING;

  SELECT c.id INTO NEW.category_id
  FROM public.part_categories AS c
  WHERE c.shop_id = NEW.shop_id AND c.name = btrim(NEW.category)
  ORDER BY c.created_at, c.id
  LIMIT 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_part_category_id ON public.parts;
CREATE TRIGGER sync_part_category_id
  BEFORE INSERT OR UPDATE OF shop_id, category ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.sync_part_category_id();
REVOKE EXECUTE ON FUNCTION public.sync_part_category_id() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.service_part_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view service part mappings" ON public.service_part_categories;
CREATE POLICY "Anyone can view service part mappings"
  ON public.service_part_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Shop owners and admins insert service part mappings" ON public.service_part_categories;
CREATE POLICY "Shop owners and admins insert service part mappings"
  ON public.service_part_categories FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Shop owners and admins update service part mappings" ON public.service_part_categories;
CREATE POLICY "Shop owners and admins update service part mappings"
  ON public.service_part_categories FOR UPDATE
  USING (
    public.is_admin()
    OR shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_id = auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Shop owners and admins delete service part mappings" ON public.service_part_categories;
CREATE POLICY "Shop owners and admins delete service part mappings"
  ON public.service_part_categories FOR DELETE
  USING (
    public.is_admin()
    OR shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can view part categories" ON public.part_categories;
DROP POLICY IF EXISTS "Anyone can view part categories" ON public.part_categories;
CREATE POLICY "Anyone can view part categories"
  ON public.part_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Shop owners and admins manage part categories" ON public.part_categories;
DROP POLICY IF EXISTS "Shop owners and admins manage part categories" ON public.part_categories;
CREATE POLICY "Shop owners and admins manage part categories"
  ON public.part_categories FOR ALL
  USING (
    public.is_admin()
    OR shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_id = auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR shop_id IN (SELECT s.id FROM public.shops AS s WHERE s.owner_id = auth.uid())
  );

GRANT SELECT ON public.service_part_categories, public.part_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_part_categories, public.part_categories TO authenticated;

CREATE OR REPLACE FUNCTION public.set_service_part_categories(
  p_shop_id UUID,
  p_service_id UUID,
  p_part_category_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shops AS s WHERE s.id = p_shop_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the owner of this shop can edit compatible part categories.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.services_pricing AS svc
    WHERE svc.id = p_service_id AND svc.shop_id = p_shop_id
  ) THEN
    RAISE EXCEPTION 'Service does not belong to this shop.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_part_category_ids, '{}'::UUID[])) AS chosen(category_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.part_categories AS c
      WHERE c.id = chosen.category_id AND c.shop_id = p_shop_id
    )
  ) THEN
    RAISE EXCEPTION 'Every compatible category must belong to this shop.';
  END IF;

  DELETE FROM public.service_part_categories AS spc
  WHERE spc.shop_id = p_shop_id AND spc.service_id = p_service_id;

  INSERT INTO public.service_part_categories (shop_id, service_id, part_category_id)
  SELECT p_shop_id, p_service_id, chosen.category_id
  FROM unnest(COALESCE(p_part_category_ids, '{}'::UUID[])) AS chosen(category_id)
  ON CONFLICT (service_id, part_category_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.set_service_part_categories(UUID, UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_service_part_categories(UUID, UUID, UUID[]) TO authenticated;

-- Persist IDs of selected services alongside the legacy service_type label and
-- mark inventory already deducted so repeated status updates cannot double-deduct.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  ADD COLUMN IF NOT EXISTS parts_stock_deducted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.get_parts_for_services(
  p_shop_id UUID,
  p_service_ids UUID[]
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  sku TEXT,
  unit_price NUMERIC,
  quantity_in_stock INTEGER,
  category_id UUID,
  category_name TEXT,
  image_url TEXT,
  service_ids UUID[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_shop_id IS NULL OR p_service_ids IS NULL THEN
    RAISE EXCEPTION 'A shop and selected service IDs are required.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_service_ids) AS chosen(service_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.services_pricing AS svc
      WHERE svc.id = chosen.service_id AND svc.shop_id = p_shop_id AND svc.is_active
    )
  ) THEN
    RAISE EXCEPTION 'A selected service is not active at this shop.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.sku, p.unit_price,
         GREATEST(COALESCE(p.quantity_in_stock, 0), 0),
         c.id, c.name, p.image_url,
         array_agg(DISTINCT spc.service_id ORDER BY spc.service_id)
  FROM public.parts AS p
  JOIN public.part_categories AS c
    ON c.id = p.category_id AND c.shop_id = p.shop_id
  JOIN public.service_part_categories AS spc
    ON spc.part_category_id = c.id AND spc.shop_id = p.shop_id
  JOIN public.services_pricing AS svc
    ON svc.id = spc.service_id AND svc.shop_id = p.shop_id
  WHERE p.shop_id = p_shop_id
    AND p.is_active = true
    AND spc.service_id = ANY (p_service_ids)
    AND svc.is_active = true
  GROUP BY p.id, p.name, p.sku, p.unit_price, p.quantity_in_stock,
           c.id, c.name, p.image_url
  ORDER BY p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_parts_for_services(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_parts_for_services(UUID, UUID[]) TO anon, authenticated;

-- Validate selected line items on every appointment insert/update. Totals for
-- duplicate part IDs are combined before checking stock to prevent JSON tampering.
CREATE OR REPLACE FUNCTION public.validate_appointment_parts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line JSONB;
  v_part_id UUID;
  v_quantity INTEGER;
  v_part_name TEXT;
BEGIN
  IF NEW.parts IS NULL THEN
    NEW.parts := '[]'::JSONB;
  END IF;
  IF jsonb_typeof(NEW.parts) <> 'array' THEN
    RAISE EXCEPTION 'Booking parts must be a list.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.parts) AS item(value)
    WHERE COALESCE(item.value->>'part_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR COALESCE(item.value->>'quantity', '') !~ '^[1-9][0-9]*$'
  ) THEN
    RAISE EXCEPTION 'Each selected part must have a valid ID and positive whole-number quantity.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(NEW.service_ids, '{}'::UUID[])) AS chosen(service_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.services_pricing AS svc
      WHERE svc.id = chosen.service_id AND svc.shop_id = NEW.shop_id AND svc.is_active
    )
  ) THEN
    RAISE EXCEPTION 'A selected service is not active at this shop.';
  END IF;

  IF cardinality(COALESCE(NEW.service_ids, '{}'::UUID[])) = 0
     AND jsonb_array_length(NEW.parts) > 0 THEN
    -- Older booking paths only wrote service_type text. Leave those legacy
    -- rows unaffected, but never accept unvalidated new line items.
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Select at least one service before adding parts.';
    END IF;
  END IF;

  FOR v_line IN
    SELECT value FROM jsonb_array_elements(NEW.parts) AS item(value)
  LOOP
    BEGIN
      v_part_id := (v_line->>'part_id')::UUID;
      v_quantity := (v_line->>'quantity')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'A selected part has invalid ID or quantity.';
    END;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Part quantities must be positive whole numbers.';
    END IF;

    SELECT p.name INTO v_part_name
    FROM public.parts AS p
    WHERE p.id = v_part_id
      AND p.shop_id = NEW.shop_id
      AND p.is_active = true
      AND EXISTS (
        SELECT 1
        FROM public.service_part_categories AS spc
        WHERE spc.shop_id = NEW.shop_id
          AND spc.part_category_id = p.category_id
          AND spc.service_id = ANY (NEW.service_ids)
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Part % is not compatible with the selected services at this shop.', COALESCE(v_line->>'part_name', v_part_id::TEXT);
    END IF;

    IF (SELECT COALESCE(sum((item.value->>'quantity')::INTEGER), 0)
      FROM jsonb_array_elements(NEW.parts) AS item(value)
      WHERE item.value->>'part_id' = v_part_id::TEXT) >
       (SELECT p.quantity_in_stock FROM public.parts AS p WHERE p.id = v_part_id AND p.shop_id = NEW.shop_id) THEN
      RAISE EXCEPTION 'Not enough stock for part "%". Update its quantity or remove it.', v_part_name;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_appointment_parts ON public.appointments;
CREATE TRIGGER validate_appointment_parts
  BEFORE INSERT OR UPDATE OF parts, service_ids, shop_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_parts();
REVOKE EXECUTE ON FUNCTION public.validate_appointment_parts() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_confirmed_appointment_parts_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('confirmed', 'in_progress', 'completed')
     AND (NEW.parts IS DISTINCT FROM OLD.parts OR NEW.service_ids IS DISTINCT FROM OLD.service_ids) THEN
    RAISE EXCEPTION 'Parts and services cannot be changed after this appointment is confirmed.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_confirmed_appointment_parts_edit ON public.appointments;
CREATE TRIGGER prevent_confirmed_appointment_parts_edit
  BEFORE UPDATE OF parts, service_ids ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_confirmed_appointment_parts_edit();
REVOKE EXECUTE ON FUNCTION public.prevent_confirmed_appointment_parts_edit() FROM PUBLIC, anon, authenticated;

-- Deduct only when an owner confirms a pending request. The row lock and guarded
-- UPDATE are atomic; the status transition and stock changes share one transaction.
CREATE OR REPLACE FUNCTION public.deduct_appointment_parts_on_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line JSONB;
  v_part_id UUID;
  v_quantity INTEGER;
  v_part_name TEXT;
BEGIN
  IF NEW.status NOT IN ('confirmed', 'in_progress', 'completed')
      OR OLD.status IN ('confirmed', 'in_progress', 'completed')
    OR OLD.parts_stock_deducted_at IS NOT NULL
     OR jsonb_array_length(COALESCE(NEW.parts, '[]'::JSONB)) = 0 THEN
    RETURN NEW;
  END IF;

  -- Existing appointments do not have structured service IDs; preserve their
  -- prior behavior instead of blocking confirmation or deducting legacy parts.
  IF cardinality(COALESCE(NEW.service_ids, '{}'::UUID[])) = 0 THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shops AS s
    WHERE s.id = NEW.shop_id AND (s.owner_id = auth.uid() OR public.is_admin())
  ) THEN
    RAISE EXCEPTION 'Only this shop owner or an admin can confirm and reserve appointment parts.';
  END IF;

  FOR v_line IN
    SELECT jsonb_build_object('part_id', parsed.part_id, 'quantity', sum(parsed.quantity)::INTEGER,
                              'part_name', min(parsed.part_name))
    FROM (
      SELECT (item.value->>'part_id')::UUID AS part_id,
             (item.value->>'quantity')::INTEGER AS quantity,
             item.value->>'part_name' AS part_name
      FROM jsonb_array_elements(NEW.parts) AS item(value)
    ) AS parsed
    GROUP BY parsed.part_id
    ORDER BY parsed.part_id
  LOOP
    v_part_id := (v_line->>'part_id')::UUID;
    v_quantity := (v_line->>'quantity')::INTEGER;
    UPDATE public.parts AS p
    SET quantity_in_stock = p.quantity_in_stock - v_quantity,
        updated_at = now()
    WHERE p.id = v_part_id
      AND p.shop_id = NEW.shop_id
      AND p.is_active = true
      AND p.quantity_in_stock >= v_quantity
      AND (
        cardinality(COALESCE(NEW.service_ids, '{}'::UUID[])) = 0
        OR EXISTS (
        SELECT 1 FROM public.service_part_categories AS spc
        WHERE spc.shop_id = NEW.shop_id
          AND spc.part_category_id = p.category_id
          AND spc.service_id = ANY (NEW.service_ids)
        )
      )
    RETURNING p.name INTO v_part_name;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Part "%" is no longer compatible or has insufficient stock. Update the booking before confirming.', COALESCE(v_line->>'part_name', v_part_id::TEXT);
    END IF;
  END LOOP;

  PERFORM set_config('motolink.parts_deduction_trigger', 'on', true);
  NEW.parts_stock_deducted_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deduct_appointment_parts_on_confirmation ON public.appointments;
CREATE TRIGGER deduct_appointment_parts_on_confirmation
  BEFORE UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.deduct_appointment_parts_on_confirmation();
REVOKE EXECUTE ON FUNCTION public.deduct_appointment_parts_on_confirmation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_appointment_parts_stock_marker()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.parts_stock_deducted_at := NULL;
  ELSIF NEW.parts_stock_deducted_at IS DISTINCT FROM OLD.parts_stock_deducted_at
        AND current_setting('motolink.parts_deduction_trigger', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'The inventory deduction marker is managed by the database.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_appointment_parts_stock_marker ON public.appointments;
CREATE TRIGGER protect_appointment_parts_stock_marker
  BEFORE INSERT OR UPDATE OF parts_stock_deducted_at ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.protect_appointment_parts_stock_marker();
REVOKE EXECUTE ON FUNCTION public.protect_appointment_parts_stock_marker() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.deduct_legacy_appointment_parts(
  p_appointment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_line RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.appointments AS a
    JOIN public.shops AS s ON s.id = a.shop_id
    WHERE a.id = p_appointment_id AND (s.owner_id = auth.uid() OR public.is_admin())
  ) THEN
    RAISE EXCEPTION 'Only this shop owner or an admin can adjust legacy booking inventory.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_appointment FROM public.appointments AS a
  WHERE a.id = p_appointment_id FOR UPDATE;
  IF cardinality(COALESCE(v_appointment.service_ids, '{}'::UUID[])) > 0
     OR v_appointment.status <> 'completed'
     OR v_appointment.parts_stock_deducted_at IS NOT NULL THEN
    RETURN;
  END IF;

  FOR v_line IN
    SELECT (line.value->>'part_id')::UUID AS part_id,
           sum((line.value->>'quantity')::INTEGER)::INTEGER AS quantity
    FROM jsonb_array_elements(COALESCE(v_appointment.parts, '[]'::JSONB)) AS line(value)
    GROUP BY (line.value->>'part_id')::UUID
    ORDER BY (line.value->>'part_id')::UUID
  LOOP
    UPDATE public.parts AS p
    SET quantity_in_stock = GREATEST(p.quantity_in_stock - v_line.quantity, 0), updated_at = now()
    WHERE p.id = v_line.part_id AND p.shop_id = v_appointment.shop_id;
  END LOOP;

  PERFORM set_config('motolink.parts_deduction_trigger', 'on', true);
  UPDATE public.appointments SET parts_stock_deducted_at = now() WHERE id = p_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_legacy_appointment_parts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_legacy_appointment_parts(UUID) TO authenticated;

-- Preserve the existing conflict-resolution RPC and its idempotency key while
-- adding validated service/parts metadata for the resulting pending booking.
CREATE OR REPLACE FUNCTION public.resolve_walk_in_conflict_with_parts(
  p_shop_id UUID,
  p_walk_in JSONB,
  p_resolutions JSONB,
  p_request_id UUID,
  p_service_ids UUID[],
  p_parts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_appointment_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shops AS s WHERE s.id = p_shop_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the owner of this shop can book a walk-in.' USING ERRCODE = '42501';
  END IF;
  IF p_service_ids IS NULL OR cardinality(p_service_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one service from this shop.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_service_ids) AS selected(service_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.services_pricing AS svc
      WHERE svc.id = selected.service_id AND svc.shop_id = p_shop_id AND svc.is_active
    )
  ) THEN
    RAISE EXCEPTION 'A selected service is not active at this shop.';
  END IF;

  p_walk_in := jsonb_set(
    p_walk_in,
    '{service_ids}',
    to_jsonb(p_service_ids),
    true
  );
  p_walk_in := jsonb_set(
    p_walk_in,
    '{parts}',
    COALESCE(p_parts, '[]'::JSONB),
    true
  );

  v_result := public.resolve_walk_in_conflict(p_shop_id, p_walk_in, p_resolutions, p_request_id);
  IF COALESCE((v_result->>'idempotent_replay')::BOOLEAN, false) THEN
    IF COALESCE(v_result->'appointment'->'service_ids', '[]'::JSONB) <> to_jsonb(p_service_ids)
       OR COALESCE(v_result->'appointment'->'parts', '[]'::JSONB) <> COALESCE(p_parts, '[]'::JSONB) THEN
      RAISE EXCEPTION 'This walk-in request ID was already used with different services or parts.';
    END IF;
    RETURN v_result;
  END IF;
  v_appointment_id := (v_result->'appointment'->>'id')::UUID;
  UPDATE public.appointments AS a
  SET service_ids = p_service_ids,
      parts = COALESCE(p_parts, '[]'::JSONB),
      total_amount = COALESCE(NULLIF(p_walk_in->>'estimated_price', '')::NUMERIC, 0)
                     + COALESCE((SELECT sum((line->>'unit_price')::NUMERIC * (line->>'quantity')::INTEGER)
                                 FROM jsonb_array_elements(COALESCE(p_parts, '[]'::JSONB)) AS item(line)), 0),
      updated_at = now()
  WHERE a.id = v_appointment_id AND a.shop_id = p_shop_id;

  v_result := jsonb_set(v_result, '{appointment}',
    (SELECT to_jsonb(a) FROM public.appointments AS a WHERE a.id = v_appointment_id));
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_walk_in_conflict_with_parts(UUID, JSONB, JSONB, UUID, UUID[], JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_walk_in_conflict_with_parts(UUID, JSONB, JSONB, UUID, UUID[], JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
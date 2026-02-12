-- RPC functions for Supabase .rpc() calls
-- These bypass the PostgREST 1000-row limit and aggregate server-side.

--------------------------------------------------------------------------------
-- 1. get_inventory_aggregations()
--    Returns totalCount, byType, byWarehouse, byPeriod as a single JSON object.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_inventory_aggregations()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'totalCount', (SELECT count(*) FROM "Inventory"),

    'byType', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          "movementType",
          count(*)::int AS count,
          coalesce(sum("qty"), 0) AS sum_qty,
          coalesce(sum("extension"), 0) AS sum_extension
        FROM "Inventory"
        GROUP BY "movementType"
        ORDER BY "movementType"
      ) t
    ),

    'byWarehouse', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          "warehouse",
          count(*)::int AS count,
          coalesce(sum("qty"), 0) AS sum_qty,
          coalesce(sum("extension"), 0) AS sum_extension
        FROM "Inventory"
        GROUP BY "warehouse"
        ORDER BY "warehouse"
      ) t
    ),

    'byPeriod', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          "period",
          count(*)::int AS count,
          coalesce(sum("qty"), 0) AS sum_qty,
          coalesce(sum("extension"), 0) AS sum_extension
        FROM "Inventory"
        GROUP BY "period"
        ORDER BY "period"
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

--------------------------------------------------------------------------------
-- 2. get_sales_aggregations()
--    Returns byChannel, byCategory, byGender, byCustomer as a single JSON object.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_sales_aggregations()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'byChannel', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          "season",
          "customerType",
          coalesce(sum("revenue"), 0) AS sum_revenue,
          coalesce(sum("unitsBooked"), 0) AS sum_units_booked
        FROM "Sale"
        GROUP BY "season", "customerType"
        ORDER BY "season", "customerType"
      ) t
    ),

    'byCategory', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          "season",
          "categoryDesc",
          coalesce(sum("revenue"), 0) AS sum_revenue,
          coalesce(sum("unitsBooked"), 0) AS sum_units_booked
        FROM "Sale"
        GROUP BY "season", "categoryDesc"
        ORDER BY "season", "categoryDesc"
      ) t
    ),

    'byGender', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          "season",
          CASE
            WHEN lower("divisionDesc") LIKE '%women%'
              OR lower("divisionDesc") LIKE '%woman%'
              THEN 'Women''s'
            WHEN lower("divisionDesc") LIKE '%men''s%'
              OR lower("divisionDesc") LIKE '%mens%'
              THEN 'Men''s'
            ELSE 'Unisex'
          END AS gender,
          coalesce(sum("revenue"), 0) AS sum_revenue,
          coalesce(sum("unitsBooked"), 0) AS sum_units_booked
        FROM "Sale"
        GROUP BY "season",
          CASE
            WHEN lower("divisionDesc") LIKE '%women%'
              OR lower("divisionDesc") LIKE '%woman%'
              THEN 'Women''s'
            WHEN lower("divisionDesc") LIKE '%men''s%'
              OR lower("divisionDesc") LIKE '%mens%'
              THEN 'Men''s'
            ELSE 'Unisex'
          END
        ORDER BY "season", gender
      ) t
    ),

    'byCustomer', (
      SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT
          "season",
          "customer",
          "customerType",
          coalesce(sum("revenue"), 0) AS sum_revenue,
          coalesce(sum("unitsBooked"), 0) AS sum_units_booked
        FROM "Sale"
        GROUP BY "season", "customer", "customerType"
        ORDER BY "season", "customer"
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

--------------------------------------------------------------------------------
-- 3. get_sales_page(p_offset, p_limit)
--    Returns a SETOF records from Sale, bypassing the PostgREST row limit.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_sales_page(p_offset int, p_limit int)
RETURNS SETOF "Sale"
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    *
  FROM "Sale"
  ORDER BY "season", "styleNumber", "customer"
  OFFSET p_offset
  LIMIT p_limit;
$$;

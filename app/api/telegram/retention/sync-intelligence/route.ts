import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  computeCustomerIntelligence,
  computeBenchmarks,
  normalizePhone,
  type KeyCRMBuyer,
  type KeyCRMOrder,
  type CustomerIntelligenceRow,
} from "@/lib/retention/intelligence";

// ============================================================
// Configuration
// ============================================================

const KEYCRM_BASE = "https://openapi.keycrm.app/v1";
const KEYCRM_API_KEY = process.env.KEYCRM_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET; // optional auth for cron

// Rate limit: KeyCRM allows 60 req/min = 1 per second
// We'll be conservative: 1 request per 1.1 seconds
const KEYCRM_DELAY_MS = 1100;

// Batch size for DB upserts
const DB_BATCH_SIZE = 100;

// Buyer page size (max 50 per KeyCRM docs)
const BUYER_PAGE_SIZE = 50;

// Order page size
const ORDER_PAGE_SIZE = 50;

// Max runtime: 5 minutes (Vercel Pro limit). We track time to bail early.
const MAX_RUNTIME_MS = 4.5 * 60 * 1000;

// ============================================================
// KeyCRM API helpers
// ============================================================

async function keycrmFetch<T>(path: string, retries = 2): Promise<T> {
  const url = `${KEYCRM_BASE}${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${KEYCRM_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        // No cache for API data
        cache: "no-store",
      });

      if (res.status === 429) {
        // Rate limited — wait and retry
        console.log(`[sync] Rate limited on ${path}, waiting 10s...`);
        await sleep(10000);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`KeyCRM ${res.status}: ${text}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`[sync] Retry ${attempt + 1} for ${path}: ${err}`);
      await sleep(2000);
    }
  }

  throw new Error("Unreachable");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// Fetch all buyers (paginated)
// ============================================================

interface KeyCRMPaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

async function fetchAllBuyers(): Promise<KeyCRMBuyer[]> {
  const allBuyers: KeyCRMBuyer[] = [];
  let page = 1;

  while (true) {
    const res = await keycrmFetch<KeyCRMPaginatedResponse<KeyCRMBuyer>>(
      `/buyer?page=${page}&limit=${BUYER_PAGE_SIZE}`
    );

    allBuyers.push(...res.data);
    console.log(`[sync] Buyers page ${page}/${res.last_page}: ${res.data.length} buyers`);

    if (page >= res.last_page) break;
    page++;
    await sleep(KEYCRM_DELAY_MS);
  }

  return allBuyers;
}

// ============================================================
// Fetch all orders for a buyer (paginated)
// ============================================================

async function fetchBuyerOrders(buyerId: number): Promise<KeyCRMOrder[]> {
  const allOrders: KeyCRMOrder[] = [];
  let page = 1;

  while (true) {
    const res = await keycrmFetch<KeyCRMPaginatedResponse<KeyCRMOrder>>(
      `/order?filter[buyer_id]=${buyerId}&include=products&page=${page}&limit=${ORDER_PAGE_SIZE}`
    );

    allOrders.push(...res.data);

    if (page >= res.last_page) break;
    page++;
    await sleep(KEYCRM_DELAY_MS);
  }

  return allOrders;
}

// ============================================================
// Alternative: Fetch ALL orders at once (more efficient for 7800 customers)
// Instead of per-buyer, we fetch all orders in bulk and group by buyer_id
// ============================================================

async function fetchAllOrdersBulk(): Promise<Map<number, KeyCRMOrder[]>> {
  const ordersByBuyer = new Map<number, KeyCRMOrder[]>();
  let page = 1;
  let totalFetched = 0;

  while (true) {
    const res = await keycrmFetch<KeyCRMPaginatedResponse<KeyCRMOrder>>(
      `/order?include=products&page=${page}&limit=${ORDER_PAGE_SIZE}`
    );

    for (const order of res.data) {
      if (!order.buyer_id) continue;
      if (!ordersByBuyer.has(order.buyer_id)) {
        ordersByBuyer.set(order.buyer_id, []);
      }
      ordersByBuyer.get(order.buyer_id)!.push(order);
    }

    totalFetched += res.data.length;
    console.log(
      `[sync] Orders page ${page}/${res.last_page}: ${res.data.length} orders (total: ${totalFetched})`
    );

    if (page >= res.last_page) break;
    page++;
    await sleep(KEYCRM_DELAY_MS);
  }

  return ordersByBuyer;
}

// ============================================================
// Upsert customer intelligence in batches
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertBatch(
  supabase: any,
  rows: Omit<CustomerIntelligenceRow, "percentile_spend" | "percentile_frequency" | "is_below_avg_basket">[]
) {
  if (rows.length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("customer_intelligence") as any).upsert(
    rows.map((r) => ({
      phone: r.phone,
      keycrm_buyer_id: r.keycrm_buyer_id,
      name: r.name,
      city: r.city,
      segment: r.segment,
      first_order_date: r.first_order_date,
      last_order_date: r.last_order_date,
      total_orders: r.total_orders,
      total_spend: r.total_spend,
      avg_order_value: r.avg_order_value,
      avg_order_interval_days: r.avg_order_interval_days,
      product_categories: r.product_categories,
      favorite_products: r.favorite_products,
      never_bought_categories: r.never_bought_categories,
      products_running_low: r.products_running_low,
      next_expected_order_date: r.next_expected_order_date,
      ai_summary: r.ai_summary,
      last_ai_analysis: r.last_ai_analysis,
    })),
    { onConflict: "phone" }
  );

  if (error) {
    console.error(`[sync] Upsert batch error:`, error);
    throw error;
  }
}

// ============================================================
// Update percentiles after all customers are processed
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updatePercentiles(
  supabase: any,
  benchmarks: Record<string, unknown>
) {
  const spendPercentiles = benchmarks._spendPercentiles as Record<string, number>;
  const freqPercentiles = benchmarks._freqPercentiles as Record<string, number>;
  const avgOrderValueAll = benchmarks._avgOrderValueAll as number;

  // Update in batches
  const phones = Object.keys(spendPercentiles);

  for (let i = 0; i < phones.length; i += DB_BATCH_SIZE) {
    const batch = phones.slice(i, i + DB_BATCH_SIZE);

    // We must do individual updates since each row has unique percentiles
    // Use a Promise.all with limited concurrency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates = batch.map((phone) =>
      (supabase.from("customer_intelligence") as any)
        .update({
          percentile_spend: spendPercentiles[phone] ?? null,
          percentile_frequency: freqPercentiles[phone] ?? null,
          is_below_avg_basket:
            spendPercentiles[phone] !== undefined
              ? (spendPercentiles[phone] ?? 0) < 50
              : false,
        })
        .eq("phone", phone)
    );

    await Promise.all(updates);
  }
}

// ============================================================
// Store benchmarks
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function storeBenchmarks(
  supabase: any,
  benchmarks: Record<string, unknown>
) {
  const now = new Date().toISOString();

  // Filter out internal keys (prefixed with _)
  const publicBenchmarks = Object.entries(benchmarks).filter(
    ([key]) => !key.startsWith("_")
  );

  for (const [key, value] of publicBenchmarks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("retention_benchmarks") as any).upsert(
      {
        key,
        value: JSON.parse(JSON.stringify(value)),
        updated_at: now,
      },
      { onConflict: "key" }
    );

    if (error) {
      console.error(`[sync] Benchmark upsert error for ${key}:`, error);
    }
  }
}

// ============================================================
// Main sync handler
// ============================================================

export const maxDuration = 300; // 5 minutes (Vercel Pro)
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startTime = Date.now();

  // Optional auth check for cron
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    const url = new URL(request.url);
    const secretParam = url.searchParams.get("secret");

    if (authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Initialize Supabase with service role (bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Create sync log entry
  const { data: syncLog, error: logError } = await supabase
    .from("retention_sync_log")
    .insert({ status: "running" })
    .select("id")
    .single();

  if (logError) {
    console.error("[sync] Failed to create sync log:", logError);
  }

  const syncLogId = syncLog?.id;
  const errors: string[] = [];

  try {
    // ──────────────────────────────────────────────
    // Step 1: Fetch all buyers from KeyCRM
    // ──────────────────────────────────────────────
    console.log("[sync] Step 1: Fetching all buyers...");
    const buyers = await fetchAllBuyers();
    console.log(`[sync] Fetched ${buyers.length} buyers`);

    // ──────────────────────────────────────────────
    // Step 2: Fetch ALL orders in bulk (much faster than per-buyer)
    // With ~7800 customers, fetching orders individually would need
    // 7800+ API calls. Bulk fetch needs total_orders/50 calls.
    // ──────────────────────────────────────────────
    console.log("[sync] Step 2: Fetching all orders (bulk)...");
    const ordersByBuyer = await fetchAllOrdersBulk();
    const totalOrders = Array.from(ordersByBuyer.values()).reduce(
      (sum, orders) => sum + orders.length,
      0
    );
    console.log(
      `[sync] Fetched ${totalOrders} orders for ${ordersByBuyer.size} buyers`
    );

    // ──────────────────────────────────────────────
    // Step 3: Compute intelligence for each buyer
    // ──────────────────────────────────────────────
    console.log("[sync] Step 3: Computing customer intelligence...");
    const allIntelligence: CustomerIntelligenceRow[] = [];
    let skippedNoPhone = 0;

    for (const buyer of buyers) {
      try {
        // Skip buyers without phone
        if (!buyer.phone || buyer.phone.length === 0 || !buyer.phone[0]) {
          skippedNoPhone++;
          continue;
        }

        const phone = normalizePhone(buyer.phone[0]);
        if (!phone || phone.length < 10) {
          skippedNoPhone++;
          continue;
        }

        const orders = ordersByBuyer.get(buyer.id) || [];
        const intelligence = computeCustomerIntelligence(buyer, orders);

        allIntelligence.push({
          ...intelligence,
          // These will be filled by benchmarks later
          percentile_spend: null,
          percentile_frequency: null,
          is_below_avg_basket: false,
        });

        // Check time limit
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          console.log(
            `[sync] Time limit approaching, processed ${allIntelligence.length}/${buyers.length} buyers`
          );
          errors.push(
            `Partial sync: processed ${allIntelligence.length}/${buyers.length} buyers before time limit`
          );
          break;
        }
      } catch (err) {
        const msg = `Error processing buyer ${buyer.id}: ${err}`;
        console.error(`[sync] ${msg}`);
        errors.push(msg);
      }
    }

    console.log(
      `[sync] Computed intelligence for ${allIntelligence.length} customers (skipped ${skippedNoPhone} without phone)`
    );

    // ──────────────────────────────────────────────
    // Step 4: Compute global benchmarks
    // ──────────────────────────────────────────────
    console.log("[sync] Step 4: Computing benchmarks...");
    const benchmarks = computeBenchmarks(allIntelligence);

    // ──────────────────────────────────────────────
    // Step 5: Upsert all customer intelligence in batches
    // ──────────────────────────────────────────────
    console.log("[sync] Step 5: Upserting customer intelligence...");
    for (let i = 0; i < allIntelligence.length; i += DB_BATCH_SIZE) {
      const batch = allIntelligence.slice(i, i + DB_BATCH_SIZE);
      await upsertBatch(supabase, batch);
      console.log(
        `[sync] Upserted batch ${Math.floor(i / DB_BATCH_SIZE) + 1}/${Math.ceil(allIntelligence.length / DB_BATCH_SIZE)}`
      );
    }

    // ──────────────────────────────────────────────
    // Step 6: Update percentiles (requires all data in DB)
    // ──────────────────────────────────────────────
    console.log("[sync] Step 6: Updating percentiles...");
    await updatePercentiles(supabase, benchmarks);

    // ──────────────────────────────────────────────
    // Step 7: Store global benchmarks
    // ──────────────────────────────────────────────
    console.log("[sync] Step 7: Storing benchmarks...");
    await storeBenchmarks(supabase, benchmarks);

    // ──────────────────────────────────────────────
    // Done
    // ──────────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    console.log(`[sync] Completed in ${Math.round(durationMs / 1000)}s`);

    // Update sync log
    if (syncLogId) {
      await supabase
        .from("retention_sync_log")
        .update({
          status: errors.length > 0 ? "completed_with_errors" : "completed",
          finished_at: new Date().toISOString(),
          customers_processed: allIntelligence.length,
          orders_fetched: totalOrders,
          errors: errors.length > 0 ? errors : [],
          duration_ms: durationMs,
        })
        .eq("id", syncLogId);
    }

    return NextResponse.json({
      ok: true,
      stats: {
        total_buyers: buyers.length,
        customers_processed: allIntelligence.length,
        orders_fetched: totalOrders,
        skipped_no_phone: skippedNoPhone,
        duration_seconds: Math.round(durationMs / 1000),
        errors: errors.length,
        benchmarks: {
          avg_order_value: benchmarks.avg_order_value_all,
          avg_interval_days: benchmarks.avg_interval_all,
          segment_distribution: benchmarks.segment_distribution,
          product_adoption_rates: benchmarks.product_adoption_rates,
        },
      },
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[sync] Fatal error after ${Math.round(durationMs / 1000)}s:`, err);

    // Update sync log
    if (syncLogId) {
      await supabase
        .from("retention_sync_log")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          errors: [...errors, errorMsg],
          duration_ms: durationMs,
        })
        .eq("id", syncLogId);
    }

    return NextResponse.json(
      {
        ok: false,
        error: errorMsg,
        duration_seconds: Math.round(durationMs / 1000),
      },
      { status: 500 }
    );
  }
}

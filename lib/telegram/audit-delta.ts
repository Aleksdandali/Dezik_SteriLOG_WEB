// Compute a per-audit "delta_summary" against the most recent APPROVED audit
// at the same location. Lets reviewers spot suspicious переучёти at a glance:
//   - lots of changed items vs prior baseline → physical work was done
//   - zero changes → likely a copy-paste / fake count
//   - one huge % swing → check that item before approving
//
// Baseline is pulled from within the same response set (no extra DB calls);
// when there is no earlier approved audit in the set, summary is null.
//
// Items are keyed by `${item_type}::${name}` so renamed-but-same-type items
// don't collide and raw/finished products with the same name stay separate.

type AuditItem = {
  name: string;
  quantity: number;
  item_type: string;
};

export type AuditDeltaSummary = {
  baseline_audit_id: string;
  baseline_date: string;
  items_with_delta: number;
  largest_delta_pct: number;
};

export type AuditForDelta = {
  id: string;
  location: string;
  audit_date: string;
  status: string;
  ops_inventory_audit_items: AuditItem[];
};

function itemKey(it: AuditItem): string {
  return `${it.item_type}::${it.name}`;
}

/**
 * Returned-item shape: original item + baseline_quantity for reviewer's
 * item-level Δ display. null = no baseline (new item or no prior audit).
 */
type ItemWithBaseline<I> = I & { baseline_quantity: number | null };

function summarize(
  current: AuditForDelta,
  baseline: AuditForDelta,
): AuditDeltaSummary {
  const baselineByKey = new Map(
    baseline.ops_inventory_audit_items.map(i => [itemKey(i), i.quantity]),
  );
  let itemsWithDelta = 0;
  let largestDeltaPct = 0;
  for (const it of current.ops_inventory_audit_items) {
    const prev = baselineByKey.get(itemKey(it));
    if (prev == null) {
      // New item not present in baseline = a change worth noting.
      itemsWithDelta++;
      continue;
    }
    if (prev !== it.quantity) {
      itemsWithDelta++;
      const pct = prev === 0
        ? (it.quantity === 0 ? 0 : 100)
        : Math.abs((it.quantity - prev) / prev) * 100;
      if (pct > largestDeltaPct) largestDeltaPct = pct;
    }
  }
  return {
    baseline_audit_id: baseline.id,
    baseline_date: baseline.audit_date,
    items_with_delta: itemsWithDelta,
    largest_delta_pct: Math.round(largestDeltaPct * 10) / 10,
  };
}

/**
 * Annotate each audit in `list` with a `delta_summary` field AND inject a
 * `baseline_quantity` on every item (null = no baseline). Returns a new array.
 * Item-level baseline lets the detail view show per-item Δ without a 2nd fetch.
 */
export function withDeltaSummaries<T extends AuditForDelta>(
  list: T[],
): Array<
  Omit<T, 'ops_inventory_audit_items'> & {
    delta_summary: AuditDeltaSummary | null;
    ops_inventory_audit_items: ItemWithBaseline<T['ops_inventory_audit_items'][number]>[];
  }
> {
  // Group approved audits by location, sorted by date ASC, so for each entry
  // we can find the most recent approved one strictly before it in O(log n).
  const approvedByLoc = new Map<string, AuditForDelta[]>();
  for (const a of list) {
    if (a.status !== 'approved') continue;
    const arr = approvedByLoc.get(a.location) ?? [];
    arr.push(a);
    approvedByLoc.set(a.location, arr);
  }
  for (const arr of approvedByLoc.values()) {
    arr.sort((x, y) => x.audit_date.localeCompare(y.audit_date));
  }

  return list.map(audit => {
    const candidates = approvedByLoc.get(audit.location) ?? [];
    // Pick latest approved audit with audit_date < current.audit_date AND id != current.id.
    // For 'pending' audits we want the latest approved before today; for 'approved'
    // audits we want the one immediately preceding this one.
    let baseline: AuditForDelta | null = null;
    for (const c of candidates) {
      if (c.id === audit.id) continue;
      if (c.audit_date < audit.audit_date) baseline = c;
      else break;
    }
    const baselineByKey = baseline
      ? new Map(baseline.ops_inventory_audit_items.map(i => [itemKey(i), i.quantity]))
      : null;
    const itemsWithBaseline = audit.ops_inventory_audit_items.map(it => ({
      ...it,
      baseline_quantity: baselineByKey?.get(itemKey(it)) ?? null,
    })) as ItemWithBaseline<T['ops_inventory_audit_items'][number]>[];
    return {
      ...audit,
      ops_inventory_audit_items: itemsWithBaseline,
      delta_summary: baseline ? summarize(audit, baseline) : null,
    };
  });
}

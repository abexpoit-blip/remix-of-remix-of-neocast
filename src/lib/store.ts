import { supabase } from "@/integrations/supabase/client";

/**
 * The API caps every single response at 1000 rows (server-side `max-rows`),
 * so `.limit(5000)` silently returned only the newest 1000 cards — which made
 * uploads past 1000 look like they had failed and older cards look deleted.
 * This helper pages through with `.range()` until every row is fetched.
 */
const PAGE_SIZE = 1000;

export const fetchAllPages = async <T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  hardCap = 100000,
): Promise<T[]> => {
  const out: T[] = [];
  for (let from = 0; from < hardCap; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
};

export type DeliveryType = "key" | "download" | "instant";


export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  active: boolean;
}

export interface Product {
  id: string;
  category_id: string | null;
  title: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  price: number;
  compare_at_price: number | null;
  delivery_type: DeliveryType;
  download_url: string | null;
  instant_content: string | null;
  featured: boolean;
  active: boolean;
  sold_count: number;
  stock: number;
  created_at: string;
  bin: string | null;
  brand: string | null;
  country: string | null;
  base: string | null;
  base_date: string;
  exp_month: string | null;
  exp_year: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  has_phone: boolean;
  has_email: boolean;
  refundable: boolean;
}


export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  title: string;
  unit_price: number;
  quantity: number;
  delivered_content: string | null;
}

export interface Order {
  id: string;
  user_id: string;
  order_no: string;
  status: string;
  total: number;
  created_at: string;
  order_items?: OrderItem[];
}

export interface Deposit {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  admin_note: string | null;
  created_at: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  instructions: string | null;
  address: string | null;
  active: boolean;
  sort_order: number;
}

export interface AdminUserRow {
  id: string;
  username: string;
  email: string | null;
  balance: number;
  blocked: boolean;
  created_at: string;
  roles: string[];
}

const num = (v: unknown) => Number(v ?? 0);

/* ---------------- catalog ---------------- */

export const listCategories = async (includeInactive = false): Promise<Category[]> => {
  let q = supabase.from("categories").select("*").order("sort_order");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Category[];
};

/** Hard cap so a huge stock table can never freeze the browser / blow up the response. */
export const PRODUCT_FETCH_LIMIT = 3000;

export const listProducts = async (
  opts: { categoryId?: string | null; search?: string; includeInactive?: boolean; limit?: number } = {},
) => {
  const limit = Math.min(opts.limit ?? PRODUCT_FETCH_LIMIT, PRODUCT_FETCH_LIMIT);
  let q = supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!opts.includeInactive) q = q.eq("active", true);
  if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts.search?.trim()) q = q.ilike("title", `%${opts.search.trim()}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((p) => ({ ...p, price: num(p.price), compare_at_price: p.compare_at_price == null ? null : num(p.compare_at_price) })) as Product[];
};


export const purchaseProduct = async (productId: string, quantity: number) => {
  const { data, error } = await supabase.rpc("purchase_product", { _product_id: productId, _quantity: quantity });
  if (error) throw new Error(translatePurchaseError(error.message));
  return data as string;
};

/** Purchase then return the actually delivered content (keys / link / text). */
export const purchaseAndDeliver = async (
  productId: string,
  quantity = 1,
): Promise<{ orderId: string; content: string }> => {
  const orderId = await purchaseProduct(productId, quantity);
  const { data, error } = await supabase
    .from("order_items")
    .select("delivered_content, title")
    .eq("order_id", orderId);
  if (error) throw error;
  const content = (data ?? [])
    .map((i) => (i.delivered_content ?? "").trim())
    .filter(Boolean)
    .join("\n");
  return { orderId, content };
};


export const translatePurchaseError = (msg: string) => {
  if (msg.includes("insufficient_balance")) return "Insufficient balance.";
  if (msg.includes("out_of_stock")) return "Out of stock.";
  if (msg.includes("product_unavailable")) return "Item unavailable.";
  if (msg.includes("invalid_quantity")) return "Invalid quantity.";
  if (msg.includes("not_authenticated")) return "Please sign in.";
  return msg;
};

/* ---------------- orders ---------------- */

export const listMyOrders = async (): Promise<Order[]> => {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Order[];
};

/* ---------------- deposits ---------------- */

export const listPaymentMethods = async (includeInactive = false): Promise<PaymentMethod[]> => {
  let q = supabase.from("payment_methods").select("*").order("sort_order");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PaymentMethod[];
};

export const listMyDeposits = async (): Promise<Deposit[]> => {
  const { data, error } = await supabase.from("deposits").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Deposit[];
};

export const createDeposit = async (input: { amount: number; method: string; reference: string }) => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Please sign in.");
  const { error } = await supabase.from("deposits").insert({
    user_id: auth.user.id,
    amount: input.amount,
    method: input.method,
    reference: input.reference,
    status: "pending",
  });
  if (error) throw error;
};

/* ---------------- admin ---------------- */

export const adminListUsers = async (): Promise<AdminUserRow[]> => {
  const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: auth }] = await Promise.all([
    supabase.from("profiles").select("id, username, email, balance, blocked, created_at").order("created_at", { ascending: false }),
    supabase.from("user_roles").select("user_id, role"),
    supabase.auth.getUser(),
  ]);
  if (pErr) throw pErr;
  if (rErr) throw rErr;
  const byUser = new Map<string, string[]>();
  (roles ?? []).forEach((r) => {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r.role as string);
    byUser.set(r.user_id, list);
  });
  const viewerId = auth?.user?.id ?? "";
  const viewerIsSuper = (byUser.get(viewerId) ?? []).includes("superadmin");
  return (profiles ?? [])
    .filter((p) => viewerIsSuper || p.id === viewerId || !(byUser.get(p.id) ?? []).includes("superadmin"))
    .map((p) => ({
      id: p.id,
      username: p.username,
      email: p.email,
      balance: num(p.balance),
      blocked: Boolean(p.blocked),
      created_at: p.created_at,
      roles: byUser.get(p.id) ?? [],
    }));
};


export const adminAdjustBalance = async (userId: string, amount: number, description: string) => {
  const { error } = await supabase.rpc("admin_adjust_balance", { _user_id: userId, _amount: amount, _description: description });
  if (error) throw error;
};

export type ManagedRole = "superadmin" | "admin" | "seller" | "buyer";

export const adminSetRole = async (userId: string, role: ManagedRole, grant: boolean) => {
  const { error } = await supabase.rpc("admin_set_role", { _user_id: userId, _role: role, _grant: grant });
  if (error) throw error;
};

export const adminSetBlocked = async (userId: string, blocked: boolean) => {
  const { error } = await supabase.from("profiles").update({ blocked }).eq("id", userId);
  if (error) throw error;
};

export const adminListDeposits = async (): Promise<(Deposit & { username?: string })[]> => {
  const { data, error } = await supabase.from("deposits").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((d) => d.user_id))];
  if (ids.length === 0) return [];
  const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.username]));
  return (data ?? []).map((d) => ({ ...d, amount: num(d.amount), username: nameById.get(d.user_id) })) as (Deposit & { username?: string })[];
};

export const adminSetDepositStatus = async (id: string, status: string, note?: string) => {
  const { error } = await supabase.rpc("admin_set_deposit_status", { _deposit_id: id, _status: status, _note: note });
  if (error) throw error;
};

export const adminListOrders = async (): Promise<(Order & { username?: string })[]> => {
  const { data, error } = await supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((o) => o.user_id))];
  if (ids.length === 0) return [];
  const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.username]));
  return (data ?? []).map((o) => ({ ...o, username: nameById.get(o.user_id) })) as unknown as (Order & { username?: string })[];
};

export const adminStats = async () => {
  const [users, products, orders, deposits] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("total"),
    supabase.from("deposits").select("amount, status"),
  ]);
  const revenue = (orders.data ?? []).reduce((s, o) => s + num(o.total), 0);
  const pendingDeposits = (deposits.data ?? []).filter((d) => d.status === "pending").length;
  return {
    users: users.count ?? 0,
    products: products.count ?? 0,
    orders: (orders.data ?? []).length,
    revenue,
    pendingDeposits,
  };
};

/* ---------------- site settings ---------------- */

export const readSiteSettings = async (): Promise<Record<string, string>> => {
  const { data, error } = await supabase.from("site_settings").select("key, value");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? ""]));
};

export const writeSiteSetting = async (key: string, value: string) => {
  const { error } = await supabase.from("site_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
};

/* ---------------- admin: catalog ---------------- */

export interface ProductInput {
  id?: string;
  category_id: string | null;
  title: string;
  slug: string;
  short_description?: string | null;
  description?: string | null;
  image_url?: string | null;
  price: number;
  compare_at_price?: number | null;
  delivery_type: DeliveryType;
  download_url?: string | null;
  instant_content?: string | null;
  featured?: boolean;
  active?: boolean;
  bin?: string | null;
  brand?: string | null;
  country?: string | null;
  base?: string | null;
  base_date?: string;
  exp_month?: string | null;
  exp_year?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  has_phone?: boolean;
  has_email?: boolean;
  refundable?: boolean;
}

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `item-${Date.now()}`;

export const adminSaveProduct = async (input: ProductInput): Promise<string> => {
  if (input.id) {
    const { id, ...rest } = input;
    const { error } = await supabase.from("products").update(rest).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from("products").insert(input).select("id").single();
  if (error) throw error;
  return data.id as string;
};

export const adminDeleteProduct = async (id: string) => {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
};

export const adminSaveCategory = async (input: { id?: string; name: string; slug: string; icon?: string | null; sort_order?: number; active?: boolean }) => {
  if (input.id) {
    const { id, ...rest } = input;
    const { error } = await supabase.from("categories").update(rest).eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("categories").insert(input);
  if (error) throw error;
};

export const adminDeleteCategory = async (id: string) => {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
};

/** Bulk-add card/key lines to a product and re-sync its stock. */
export const adminAddKeys = async (productId: string, lines: string[]) => {
  const rows = lines.map((l) => l.trim()).filter(Boolean).map((content) => ({ product_id: productId, content }));
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("product_keys").insert(rows);
  if (error) throw error;
  await adminSyncStock(productId);
  return rows.length;
};

export const adminSyncStock = async (productId: string) => {
  const { count, error } = await supabase
    .from("product_keys")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("is_sold", false);
  if (error) throw error;
  await supabase.from("products").update({ stock: count ?? 0 }).eq("id", productId);
  return count ?? 0;
};

/* ---------------- admin: bulk CSV upload ----------------
   Format: bin,brand,country,state,city,zip,exp_month,exp_year,price
--------------------------------------------------------- */

export interface BulkCardRow {
  bin: string;
  brand: string;
  country: string;
  state: string;
  city: string;
  zip: string;
  exp_month: string;
  exp_year: string;
  price: number;
}

export const parseBulkCards = (text: string): { rows: BulkCardRow[]; errors: string[] } => {
  const rows: BulkCardRow[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim();
    if (!raw) return;
    if (/^bin\s*,/i.test(raw)) return; // header
    const parts = raw.split(",").map((p) => p.trim());
    if (parts.length < 9) { errors.push(`Row ${i + 1}: 9 fields required`); return; }
    const [bin, brand, country, state, city, zip, m, y, price] = parts;
    if (!/^\d{6,8}$/.test(bin)) { errors.push(`Row ${i + 1}: invalid BIN «${bin}»`); return; }
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) { errors.push(`Row ${i + 1}: invalid price «${price}»`); return; }
    rows.push({
      bin,
      brand: (brand || "").toUpperCase(),
      country: (country || "").toUpperCase(),
      state: state || "",
      city: city || "",
      zip: zip || "",
      exp_month: String(Number(m) || m).padStart(2, "0").slice(0, 2),
      exp_year: (y || "").slice(-2),
      price: p,
    });
  });
  return { rows, errors };
};

/** Split a list into fixed-size chunks so big uploads never blow up a single request. */
const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const CHUNK = 200;

/** Retries a chunk on transient network / timeout failures so a big upload never dies half-way silently. */
const withRetry = async <T,>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      const transient = msg.includes("fetch") || msg.includes("network") || msg.includes("timeout") || msg.includes("504") || msg.includes("502");
      if (!transient || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
};


export const adminBulkCreateCards = async (
  rows: BulkCardRow[],
  categoryId: string | null = null,
  opts: { base?: string | null; baseDate?: string | null } = {},
) => {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    category_id: categoryId,
    base: opts.base?.trim() || null,
    base_date: opts.baseDate || todayISO(),
    title: `${r.brand || "CARD"} ${r.bin} · ${r.city || r.state || r.country}`,
    slug: `${r.bin}-${r.zip || "x"}-${Math.random().toString(36).slice(2, 8)}`,
    price: r.price,
    delivery_type: "instant" as DeliveryType,
    instant_content: `${r.bin} | ${r.exp_month}/${r.exp_year} | ${r.city} ${r.state} ${r.zip} | ${r.country}`,
    active: true,
    bin: r.bin,
    brand: r.brand || null,
    country: r.country || null,
    state: r.state || null,
    city: r.city || null,
    zip: r.zip || null,
    exp_month: r.exp_month || null,
    exp_year: r.exp_year || null,
  }));
  for (const part of chunk(payload, CHUNK)) {
    const { error } = await supabase.from("products").insert(part);
    if (error) throw error;
  }
  return payload.length;
};


/* -------- admin: publish full cards (Admin → Card Upload tab) --------
   Each parsed card becomes its own product with one product_key holding
   the full pipe-delimited line that the buyer downloads as .txt.
--------------------------------------------------------------------- */

export interface FullCardInput {
  cc: string;
  month: string;
  year: string;
  cvv: string;
  name: string;
  addr: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  tel: string;
  email: string;
  brand: string;
  bin: string;
  base: string;
  price: number;
  refundable: boolean;
  category_id?: string | null;
}

export const adminPublishFullCards = async (
  cards: FullCardInput[],
  onProgress?: (done: number, total: number) => void,
  baseDate?: string | null,
) => {
  if (!cards.length) return 0;
  const clean = (s: string) => (!s || s.toLowerCase() === "null" ? "" : s);
  const stamp = Date.now().toString(36);

  const products = cards.map((c, i) => ({
    category_id: c.category_id ?? null,
    title: `${c.brand} ${c.bin} · ${clean(c.city) || clean(c.state) || clean(c.country) || "—"}`,
    slug: `${c.bin}-${stamp}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    price: c.price,
    delivery_type: "key" as DeliveryType,
    active: true,
    // Exactly one key per product, so stock is known up front — no extra round-trips.
    stock: 1,
    bin: c.bin,
    brand: c.brand || null,
    country: clean(c.country) || null,
    state: clean(c.state) || null,
    city: clean(c.city) || null,
    zip: clean(c.zip) || null,
    exp_month: clean(c.month) || null,
    exp_year: clean(c.year) || null,
    base: c.base,
    base_date: baseDate || todayISO(),
    refundable: c.refundable,
    has_phone: !!clean(c.tel),
    has_email: !!clean(c.email),
  }));

  const lineFor = (c: FullCardInput) => [
    c.base, c.price, c.cc, clean(c.month), clean(c.year), clean(c.cvv),
    clean(c.name), clean(c.addr), clean(c.city), clean(c.state), clean(c.zip),
    clean(c.country), clean(c.tel), clean(c.email), "", "",
  ].join("|");

  const bySlug = new Map(products.map((p, i) => [p.slug, cards[i]]));
  let created = 0;

  for (const part of chunk(products, CHUNK)) {
    const { data, error } = await withRetry(async () =>
      await supabase.from("products").insert(part).select("id, slug"),
    );
    if (error) throw error;
    const keys = (data ?? [])
      .map((row) => {
        const card = bySlug.get(row.slug as string);
        return card ? { product_id: row.id as string, content: lineFor(card) } : null;
      })
      .filter(Boolean) as { product_id: string; content: string }[];
    if (keys.length) {
      const { error: kerr } = await withRetry(async () => await supabase.from("product_keys").insert(keys));
      if (kerr) throw kerr;
    }
    created += data?.length ?? 0;
    onProgress?.(created, products.length);
  }


  return created;
};


/* ---------------- admin: overview + announcements (Supabase-backed) ---------------- */

export interface AdminOverview {
  totalRevenue: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  totalUsers: number;
  totalSellers: number;
  cardsAvailable: number;
  todaySalesCount: number;
  todaySalesAmount: number;
  todayDeposits: number;
  totalDeposits: number;
  pendingPayouts: number;
  totalPayoutsPaid: number;
  openTickets: number;
  pendingApps: number;
  dailyRevenue: Array<{ day: string; revenue: number; orders: number }>;
  topSellers: Array<{ id: string; username: string; cards_sold: number; total_sold: number }>;
  recentOrders: Array<{ id: string; total: number; status: string; created_at: string; buyer: string }>;
}

export const adminOverview = async (): Promise<AdminOverview> => {
  const [orders, deposits, users, roles, keys] = await Promise.all([
    supabase.from("orders").select("id, user_id, total, status, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("deposits").select("amount, status, created_at"),
    supabase.from("profiles").select("id, username"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("product_keys").select("is_sold"),
  ]);

  const nameById = new Map((users.data ?? []).map((u) => [u.id, u.username]));
  const orderRows = orders.data ?? [];
  const depositRows = deposits.data ?? [];
  const keyRows = keys.data ?? [];

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const since = (days: number) => Date.now() - days * dayMs;
  const revenueSince = (ts: number) =>
    orderRows.filter((o) => Date.parse(o.created_at) >= ts).reduce((s, o) => s + num(o.total), 0);

  const byDay = new Map<string, { revenue: number; orders: number }>();
  orderRows.forEach((o) => {
    const day = o.created_at.slice(0, 10);
    const cur = byDay.get(day) ?? { revenue: 0, orders: 0 };
    cur.revenue += num(o.total); cur.orders += 1;
    byDay.set(day, cur);
  });

  const todayOrders = orderRows.filter((o) => Date.parse(o.created_at) >= startOfDay.getTime());

  return {
    totalRevenue: orderRows.reduce((s, o) => s + num(o.total), 0),
    todayRevenue: revenueSince(startOfDay.getTime()),
    weekRevenue: revenueSince(since(7)),
    monthRevenue: revenueSince(since(30)),
    totalUsers: (users.data ?? []).length,
    totalSellers: (roles.data ?? []).filter((r) => r.role === "seller").length,
    cardsAvailable: keyRows.filter((k) => !k.is_sold).length,
    todaySalesCount: todayOrders.length,
    todaySalesAmount: todayOrders.reduce((s, o) => s + num(o.total), 0),
    todayDeposits: depositRows
      .filter((d) => d.status === "approved" && Date.parse(d.created_at) >= startOfDay.getTime())
      .reduce((s, d) => s + num(d.amount), 0),
    totalDeposits: depositRows.filter((d) => d.status === "approved").reduce((s, d) => s + num(d.amount), 0),
    pendingPayouts: 0,
    totalPayoutsPaid: 0,
    openTickets: 0,
    pendingApps: 0,
    dailyRevenue: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-14)
      .map(([day, v]) => ({ day, revenue: v.revenue, orders: v.orders })),
    topSellers: [],
    recentOrders: orderRows.slice(0, 10).map((o) => ({
      id: o.id,
      total: num(o.total),
      status: o.status,
      created_at: o.created_at,
      buyer: nameById.get(o.user_id) ?? "—",
    })),
  };
};

export interface SystemSnapshot {
  timestamp: string;
  users: { total: number; admins: number; sellers: number; buyers: number; banned: number };
  cards: { total: number; available: number; sold: number; reserved: number };
  wallets: { count: number; total_balance: number; max_balance: number; avg_balance: number };
  orders: { total: number; revenue: number };
  pending_seller_applications: number;
  sellers_breakdown: Array<{ id: string; username: string; balance: number }>;
}

export const adminSystemSnapshot = async (): Promise<SystemSnapshot> => {
  const [profiles, roles, keys, orders] = await Promise.all([
    supabase.from("profiles").select("id, username, balance, blocked"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("product_keys").select("is_sold"),
    supabase.from("orders").select("total"),
  ]);
  const profileRows = profiles.data ?? [];
  const roleRows = roles.data ?? [];
  const keyRows = keys.data ?? [];
  const balances = profileRows.map((p) => num(p.balance));
  const sellerIds = new Set(roleRows.filter((r) => r.role === "seller").map((r) => r.user_id));

  return {
    timestamp: new Date().toISOString(),
    users: {
      total: profileRows.length,
      admins: roleRows.filter((r) => r.role === "admin").length,
      sellers: sellerIds.size,
      buyers: roleRows.filter((r) => r.role === "buyer").length,
      banned: profileRows.filter((p) => p.blocked).length,
    },
    cards: {
      total: keyRows.length,
      available: keyRows.filter((k) => !k.is_sold).length,
      sold: keyRows.filter((k) => k.is_sold).length,
      reserved: 0,
    },
    wallets: {
      count: balances.length,
      total_balance: balances.reduce((s, b) => s + b, 0),
      max_balance: balances.length ? Math.max(...balances) : 0,
      avg_balance: balances.length ? balances.reduce((s, b) => s + b, 0) / balances.length : 0,
    },
    orders: {
      total: (orders.data ?? []).length,
      revenue: (orders.data ?? []).reduce((s, o) => s + num(o.total), 0),
    },
    pending_seller_applications: 0,
    sellers_breakdown: profileRows
      .filter((p) => sellerIds.has(p.id))
      .map((p) => ({ id: p.id, username: p.username, balance: num(p.balance) })),
  };
};

/* ---------------- live stock feed (latest products) ---------------- */

export interface StockUpdate {
  id: string;
  label: string;
  count: number;
  created_at: string;
}

export interface StockBrand {
  brand: string;
  count: number;
}

/** Latest stock drops for the home page live feed. */
export const listLatestStock = async (limit = 5): Promise<StockUpdate[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("id, base, base_date, created_at")
    .eq("active", true)
    .gt("stock", 0)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  const groups = new Map<string, StockUpdate>();
  for (const product of data ?? []) {
    const date = String(product.base_date ?? product.created_at.slice(0, 10));
    const base = product.base?.trim() || "Unassigned base";
    const key = `${date}__${base}`;
    const current = groups.get(key);
    if (current) current.count += 1;
    else groups.set(key, { id: key, label: `${base} · ${date}`, count: 1, created_at: product.created_at });
  }
  return [...groups.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
};

export const listStockBrands = async (): Promise<StockBrand[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("brand")
    .eq("active", true)
    .gt("stock", 0)
    .limit(5000);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const product of data ?? []) {
    const brand = (product.brand?.trim() || "Other").toUpperCase();
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand))
    .slice(0, 8);
};


export interface Announcement {
  id: string;
  title: string;
  body: string;
  kind: string;
  created_at: string;
}

export const listAnnouncements = async (): Promise<Announcement[]> => {
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, kind, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a) => ({ ...a, body: a.body ?? "" }));
};

export const adminCreateAnnouncement = async (input: { title: string; body: string; kind: string }) => {
  const { error } = await supabase.from("announcements").insert({
    title: input.title,
    body: input.body,
    kind: input.kind,
  });
  if (error) throw error;
};

export const adminDeleteAnnouncement = async (id: string) => {
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw error;
};

/* ---------------- admin: card moderation ---------------- */

export interface AdminCardRow {
  id: string;
  bin: string;
  brand: string;
  country: string;
  price: number;
  status: "available" | "sold" | "hidden" | "expired";
  created_at: string;
  exp_month?: string;
  exp_year?: string;
  category_id: string | null;
}

const cardStatus = (p: {
  active: boolean | null; stock: number | null; sold_count: number | null;
  exp_month: string | null; exp_year: string | null;
}): AdminCardRow["status"] => {
  const m = Number(p.exp_month), y = Number(p.exp_year);
  if (m >= 1 && m <= 12 && y > 0) {
    const full = y < 100 ? 2000 + y : y;
    const end = new Date(full, m, 1);
    if (end.getTime() < Date.now()) return "expired";
  }
  if (!p.active) return "hidden";
  if ((p.stock ?? 0) <= 0) return "sold";
  return "available";
};

export const adminListCards = async (opts: {
  search?: string;
  status?: "all" | "available" | "sold" | "hidden" | "expired";
} = {}): Promise<AdminCardRow[]> => {
  let q = supabase
    .from("products")
    .select("id, bin, brand, country, price, active, stock, sold_count, exp_month, exp_year, created_at, category_id")
    .order("created_at", { ascending: false })
    .limit(5000);
  const s = opts.search?.trim();
  if (s) q = q.or(`bin.ilike.%${s}%,brand.ilike.%${s}%,country.ilike.%${s}%,title.ilike.%${s}%`);
  const { data, error } = await q;
  if (error) throw error;
  const rows: AdminCardRow[] = (data ?? []).map((p) => ({
    id: p.id,
    bin: p.bin ?? "—",
    brand: p.brand ?? "—",
    country: p.country ?? "—",
    price: Number(p.price ?? 0),
    status: cardStatus(p),
    created_at: p.created_at,
    exp_month: p.exp_month ?? undefined,
    exp_year: p.exp_year ?? undefined,
    category_id: p.category_id ?? null,
  }));
  const f = opts.status ?? "all";
  return f === "all" ? rows : rows.filter((r) => r.status === f);
};

export const adminUpdateCards = async (
  ids: string[],
  patch: { price?: number; active?: boolean; category_id?: string | null },
) => {
  if (ids.length === 0) return;
  // Chunked: a single .in() with thousands of ids overflows the request URL.
  for (const part of chunk(ids, 200)) {
    const { error } = await supabase.from("products").update(patch).in("id", part);
    if (error) throw error;
  }
};

export const adminDeleteCards = async (ids: string[]) => {
  if (ids.length === 0) return;
  for (const part of chunk(ids, 200)) {
    const { error } = await supabase.from("products").delete().in("id", part);
    if (error) throw error;
  }
};


/** Hides every card whose expiry month has passed. Returns how many were hidden. */
export const adminHideExpiredCards = async () => {
  const rows = await adminListCards({ status: "expired" });
  const ids = rows.map((r) => r.id);
  await adminUpdateCards(ids, { active: false });
  return ids.length;
};


/* ---------------- base dates + super-admin card export ---------------- */

/** Local (not UTC) YYYY-MM-DD — matches what the admin sees on their calendar. */
export const todayISO = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface BaseGroup {
  base_date: string;
  base: string;
  total: number;
  available: number;
  sold: number;
}

/** Upload activity grouped by base date + base name (admin dashboard / export filters). */
export const adminListBaseGroups = async (limitDays = 60): Promise<BaseGroup[]> => {
  const since = todayISO(-limitDays);
  const { data, error } = await supabase
    .from("products")
    .select("base, base_date, stock, sold_count")
    .gte("base_date", since)
    .order("base_date", { ascending: false })
    .limit(5000);
  if (error) throw error;
  const map = new Map<string, BaseGroup>();
  (data ?? []).forEach((p) => {
    const key = `${p.base_date}__${p.base ?? "—"}`;
    const g = map.get(key) ?? { base_date: String(p.base_date), base: p.base ?? "—", total: 0, available: 0, sold: 0 };
    g.total += 1;
    g.available += Number(p.stock ?? 0) > 0 ? 1 : 0;
    g.sold += Number(p.sold_count ?? 0);
    map.set(key, g);
  });
  return [...map.values()].sort((a, b) => (a.base_date < b.base_date ? 1 : -1));
};

export interface ExportFilter {
  from: string;
  to: string;
  base?: string | null;
  includeSold?: boolean;
}

export interface ExportedCard {
  base_date: string;
  base: string;
  bin: string;
  brand: string;
  country: string;
  state: string;
  city: string;
  zip: string;
  exp_month: string;
  exp_year: string;
  price: number;
  sold: boolean;
  content: string;
}

/**
 * Full card export — the raw card lines are only readable by super admins
 * (enforced by the database policy on product_keys), so a normal admin
 * calling this simply gets nothing back.
 */
export const adminExportCards = async (f: ExportFilter): Promise<ExportedCard[]> => {
  let q = supabase
    .from("products")
    .select("id, base, base_date, bin, brand, country, state, city, zip, exp_month, exp_year, price, product_keys(content, is_sold)")
    .gte("base_date", f.from)
    .lte("base_date", f.to)
    .order("base_date", { ascending: false })
    .limit(20000);
  if (f.base) q = q.eq("base", f.base);
  const { data, error } = await q;
  if (error) throw error;

  const out: ExportedCard[] = [];
  (data ?? []).forEach((p) => {
    const keys = (p.product_keys ?? []) as { content: string; is_sold: boolean }[];
    keys.forEach((k) => {
      if (!f.includeSold && k.is_sold) return;
      out.push({
        base_date: String(p.base_date ?? ""),
        base: p.base ?? "",
        bin: p.bin ?? "",
        brand: p.brand ?? "",
        country: p.country ?? "",
        state: p.state ?? "",
        city: p.city ?? "",
        zip: p.zip ?? "",
        exp_month: p.exp_month ?? "",
        exp_year: p.exp_year ?? "",
        price: Number(p.price ?? 0),
        sold: Boolean(k.is_sold),
        content: k.content,
      });
    });
  });
  return out;
};

export const exportedCardsToCsv = (rows: ExportedCard[]) => {
  const head = ["base_date", "base", "bin", "brand", "country", "state", "city", "zip", "exp_month", "exp_year", "price", "sold", "card_line"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [head.join(","), ...rows.map((r) =>
    [r.base_date, r.base, r.bin, r.brand, r.country, r.state, r.city, r.zip, r.exp_month, r.exp_year, r.price, r.sold ? "yes" : "no", r.content].map(esc).join(","),
  )].join("\n");
};

export const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/* ---------------- redeem codes ---------------- */

export interface RedeemCode {
  id: string;
  code: string;
  amount: number;
  note: string | null;
  used_by: string | null;
  used_at: string | null;
  active: boolean;
  created_at: string;
  used_by_username?: string | null;
}

export const generateRedeemCodeString = (prefix = "NEO") => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
    if (i === 3 || i === 7) out += "-";
  }
  return `${prefix}-${out}`;
};

export const adminListRedeemCodes = async (): Promise<RedeemCode[]> => {
  const { data, error } = await supabase
    .from("redeem_codes")
    .select("id, code, amount, note, used_by, used_at, active, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));

  const userIds = [...new Set(rows.map((r) => r.used_by).filter(Boolean) as string[])];
  if (userIds.length === 0) return rows;

  const { data: profs } = await supabase.from("profiles").select("id, username, email").in("id", userIds);
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.username ?? p.email ?? "unknown"]));
  return rows.map((r) => ({ ...r, used_by_username: r.used_by ? nameById.get(r.used_by) ?? "unknown" : null }));
};

export const adminCreateRedeemCode = async (input: { code: string; amount: number; note?: string }) => {
  const { error } = await supabase.from("redeem_codes").insert({
    code: input.code.trim().toUpperCase(),
    amount: input.amount,
    note: input.note?.trim() || null,
  });
  if (error) throw error;
};

export const adminDeleteRedeemCode = async (id: string) => {
  const { error } = await supabase.from("redeem_codes").delete().eq("id", id);
  if (error) throw error;
};

export const redeemCode = async (code: string): Promise<number> => {
  const { data, error } = await supabase.rpc("redeem_code", { _code: code.trim() });
  if (error) throw error;
  return Number(data ?? 0);
};

export const translateRedeemError = (msg: string) => {
  if (msg.includes("code_already_used")) return "This code has already been redeemed.";
  if (msg.includes("code_disabled")) return "This code has already been used or is no longer valid.";
  if (msg.includes("invalid_code")) return "Invalid redeem code.";
  if (msg.includes("not_authenticated")) return "Please sign in first.";
  return msg;
};

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestUrl } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateDepositFee, type DepositFeeMode } from "@/lib/fees";


/** Create an LTC top-up invoice for the signed-in user. */
export const createCryptoInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ amount: z.number().min(1).max(100000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { createLtcInvoice } = await import("@/lib/plisio.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: feeRows, error: feeError } = await context.supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["deposit_fee_percent", "deposit_fee_flat", "deposit_fee_mode"]);
    if (feeError) throw new Error("payment_settings_unavailable");
    const feeSettings = Object.fromEntries((feeRows ?? []).map((row) => [row.key, row.value ?? ""]));
    const feeMode: DepositFeeMode = feeSettings.deposit_fee_mode === "deduct" ? "deduct" : "add";
    const calculation = calculateDepositFee(
      data.amount,
      Number(feeSettings.deposit_fee_percent ?? 0),
      Number(feeSettings.deposit_fee_flat ?? 0),
      feeMode,
    );
    const { credit, fee, charged } = calculation;
    if (credit <= 0 || charged <= 0) throw new Error("invalid_deposit_after_fee");
    const origin = getRequestUrl().origin;

    // clean up anything stale first
    await supabaseAdmin.rpc("expire_stale_deposits");

    const { data: dep, error } = await supabaseAdmin
      .from("deposits")
      .insert({
        user_id: context.userId,
        amount: credit,
        method: "crypto",
        status: "pending",
        crypto_currency: "LTC",
        fee_percent: calculation.percent,
        fee_amount: fee,
        charged_amount: charged,
      })
      .select("id")
      .single();
    if (error || !dep) throw new Error("deposit_create_failed");

    let inv;
    try {
      inv = await createLtcInvoice({
        usdAmount: charged,
        orderNumber: dep.id,
        callbackUrl: `${origin}/api/public/deposit-callback`,
        successUrl: `${origin}/recharge?payment=success&deposit=${dep.id}`,
        failUrl: `${origin}/recharge?payment=failed&deposit=${dep.id}`,
      });
    } catch (e) {
      await supabaseAdmin
        .from("deposits")
        .update({ status: "rejected", admin_note: "Gateway error while creating invoice" })
        .eq("id", dep.id);
      throw e;
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await supabaseAdmin
      .from("deposits")
      .update({
        invoice_id: inv.txn_id,
        wallet_address: inv.wallet_hash,
        crypto_amount: String(inv.amount),
        reference: inv.txn_id,
        invoice_url: inv.invoice_url ?? null,
        expires_at: expiresAt,
      })
      .eq("id", dep.id);

    return {
      deposit_id: dep.id,
      wallet_address: inv.wallet_hash,
      crypto_amount: String(inv.amount),
      currency: "LTC",
      usd_amount: credit,
      fee_percent: calculation.percent,
      fee_amount: fee,
      charged_amount: charged,
      fee_mode: calculation.mode,
      expires_ms: Date.parse(expiresAt),
      status: "pending" as const,
      confirmations: 0,
    };
  });

/** Poll the provider for a deposit and credit the balance when confirmed. */
export const checkDepositStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ deposit_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getOperation, mapStatus } = await import("@/lib/plisio.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: dep } = await supabaseAdmin
      .from("deposits")
      .select("id, user_id, amount, status, invoice_id, confirmations, expires_at")
      .eq("id", data.deposit_id)
      .maybeSingle();
    if (!dep || dep.user_id !== context.userId) throw new Error("not_found");
    if (dep.status !== "pending" || !dep.invoice_id) {
      return { status: dep.status, confirmations: dep.confirmations ?? 0, amount: dep.amount };
    }

    let status: "approved" | "rejected" | "pending" = "pending";
    let rawStatus = "";
    let confirmations = dep.confirmations ?? 0;
    let txUrl: string | null = null;
    let received: string | null = null;
    try {
      const op = await getOperation(dep.invoice_id);
      rawStatus = (op.status || "").toLowerCase();
      status = mapStatus(op.status);
      confirmations = Number(op.confirmations ?? confirmations) || confirmations;
      txUrl = op.tx_url ?? null;
      received = op.amount ?? null;
    } catch {
      return { status: "pending" as const, confirmations, amount: dep.amount };
    }

    const expired = !!dep.expires_at && Date.parse(dep.expires_at) < Date.now();
    if (status === "pending" && expired && rawStatus !== "mismatch") status = "rejected";

    await supabaseAdmin
      .from("deposits")
      .update({
        last_checked_at: new Date().toISOString(),
        tx_url: txUrl,
        received_amount: received,
        ...(rawStatus === "mismatch"
          ? { admin_note: `Payment mismatch — received ${received ?? "?"} LTC, manual review required` }
          : {}),
      })
      .eq("id", dep.id);

    const { data: settled } = await supabaseAdmin.rpc("settle_crypto_deposit", {
      _invoice_id: dep.invoice_id,
      _status: status,
      _confirmations: confirmations,
      _txid: txUrl ?? undefined,
    });

    return {
      status: ((settled as string) ?? status) as string,
      confirmations,
      amount: dep.amount,
    };
  });

/** Reports whether the Plisio API key is configured on the server (never returns the key). */
export const plisioKeyStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(process.env["PLISIO_API_KEY"]),
}));

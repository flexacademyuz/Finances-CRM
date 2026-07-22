import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { asyncHandler } from "./helpers";
import { requireRole } from "../auth/middleware";
import { db } from "../db";
import { payments } from "@shared/schema";
import { createExpenseSchema, updateExpenseSchema } from "@shared/schema";
import { isValidCategory, EXPENSE_CATEGORY_NAMES } from "@shared/expense-categories";
import {
  createExpense,
  listExpenses,
  getExpenseById,
  updateExpense,
  softDeleteExpense,
  expenseTotalsByCategory,
  expenseMatrix,
  type ExpenseFilter,
} from "../storage";
import { monthKey, normalizeMonth, monthLabel, shiftMonth } from "@shared/date";

const router = Router();

// All expense routes require accountant or CEO.
router.use("/expenses", requireRole("accountant", "ceo"));
router.use("/finance", requireRole("ceo"));

/** GET /api/expenses — filterable list (Accountant + CEO). */
router.get(
  "/expenses",
  asyncHandler(async (req, res) => {
    const filter: ExpenseFilter = {};
    const { month, category, subCategory, paymentMethod, recordedBy, includeDeleted } = req.query;
    if (typeof month === "string") filter.month = normalizeMonth(month);
    if (typeof category === "string") filter.category = category;
    if (typeof subCategory === "string") filter.subCategory = subCategory;
    if (paymentMethod === "cash" || paymentMethod === "bank_transfer" || paymentMethod === "card")
      filter.paymentMethod = paymentMethod;
    if (typeof recordedBy === "string") filter.recordedBy = recordedBy;
    // Only the CEO may view soft-deleted rows.
    if ((includeDeleted === "1" || includeDeleted === "true") && req.authUser!.role === "ceo")
      filter.includeDeleted = true;
    res.json(await listExpenses(filter));
  }),
);

/** GET /api/expenses/summary?month= — current-month totals per category. */
router.get(
  "/expenses/summary",
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === "string" ? normalizeMonth(req.query.month) : monthKey();
    const rows = await expenseTotalsByCategory(month);
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byCategory[r.category] = Number(r.total);
      total += Number(r.total);
    }
    res.json({ month, total, byCategory });
  }),
);

router.post(
  "/expenses",
  asyncHandler(async (req, res) => {
    const input = createExpenseSchema.parse(req.body);
    if (!isValidCategory(input.category)) {
      return res.status(400).json({ error: "bad_category", message: "Unknown category." });
    }
    const created = await createExpense({
      category: input.category,
      subCategory: input.subCategory ?? null,
      vendor: input.vendor ?? null,
      amount: input.amount,
      expenseDate: input.expenseDate,
      month: normalizeMonth(input.expenseDate),
      paymentMethod: input.paymentMethod,
      receiptUrl: input.receiptUrl || null,
      description: input.description ?? null,
      recordedBy: req.authUser!.id,
    });
    res.status(201).json(created);
  }),
);

/** Edit — Accountant may edit only their own entries; CEO may edit any. */
router.patch(
  "/expenses/:id",
  asyncHandler(async (req, res) => {
    const existing = await getExpenseById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    if (req.authUser!.role === "accountant" && existing.recordedBy !== req.authUser!.id) {
      return res.status(403).json({ error: "forbidden", message: "You can only edit your own entries." });
    }
    const patch = updateExpenseSchema.parse(req.body);
    const values = {
      ...patch,
      receiptUrl: patch.receiptUrl === "" ? null : patch.receiptUrl,
      ...(patch.expenseDate ? { month: normalizeMonth(patch.expenseDate) } : {}),
    };
    const updated = await updateExpense(req.params.id, values);
    res.json(updated);
  }),
);

/** Soft delete — CEO only (V2 permissions). */
router.delete(
  "/expenses/:id",
  requireRole("ceo"),
  asyncHandler(async (req, res) => {
    const existing = await getExpenseById(req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });
    res.json(await softDeleteExpense(req.params.id));
  }),
);

/**
 * GET /api/finance/overview?year=YYYY — the live REVENUE / EXPENSES / NET PROFIT
 * grid for an academic year (Sep → Aug), matching the original spreadsheet
 * (V2 Change 5). All values computed from the DB.
 */
async function financeOverview(startYear: number) {
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(`${startYear}-09-01`, i));

  // Revenue = student payments (non-voided) per billing month.
  const revRows = await db
    .select({
      month: payments.billingMonth,
      total: sql<string>`coalesce(sum(${payments.amount}), 0)`,
    })
    .from(payments)
    .where(and(inArray(payments.billingMonth, months), eq(payments.voided, false)))
    .groupBy(payments.billingMonth);
  const revByMonth = new Map(revRows.map((r) => [r.month, Number(r.total)]));

  const expRows = await expenseMatrix(months);
  const expByMonthCat = new Map<string, Map<string, number>>();
  for (const r of expRows) {
    if (!expByMonthCat.has(r.month)) expByMonthCat.set(r.month, new Map());
    expByMonthCat.get(r.month)!.set(r.category, Number(r.total));
  }

  const revenue = months.map((m) => revByMonth.get(m) ?? 0);
  const expensesByCategory: Record<string, number[]> = {};
  for (const cat of EXPENSE_CATEGORY_NAMES) {
    expensesByCategory[cat] = months.map((m) => expByMonthCat.get(m)?.get(cat) ?? 0);
  }
  const totalExpenses = months.map((_, i) =>
    EXPENSE_CATEGORY_NAMES.reduce((sum, cat) => sum + expensesByCategory[cat][i], 0),
  );
  const netProfit = months.map((_, i) => revenue[i] - totalExpenses[i]);

  return {
    startYear,
    label: `${startYear}–${startYear + 1}`,
    months: months.map((m) => ({ month: m, label: monthLabel(m) })),
    revenue,
    expensesByCategory,
    totalExpenses,
    netProfit,
    yearTotals: {
      revenue: revenue.reduce((a, b) => a + b, 0),
      expenses: totalExpenses.reduce((a, b) => a + b, 0),
      netProfit: netProfit.reduce((a, b) => a + b, 0),
    },
  };
}

router.get(
  "/finance/overview",
  asyncHandler(async (req, res) => {
    const now = new Date();
    // Default academic year: if before September, the year started last calendar year.
    const defaultStart = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const startYear = req.query.year ? Number(req.query.year) : defaultStart;
    res.json(await financeOverview(startYear));
  }),
);

export default router;

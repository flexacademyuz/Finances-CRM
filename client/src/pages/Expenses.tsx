import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ExternalLink, Receipt, Layers, Coins } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { money, formatDate, avatarColor, initials } from "../lib/format";
import { monthKey } from "@shared/date";
import {
  EXPENSE_CATEGORY_NAMES,
  subCategoriesFor,
  EXPENSE_PAYMENT_METHODS,
} from "@shared/expense-categories";
import type { ExpenseRow, ExpenseSummary } from "../lib/types";
import { Button, Card, Empty, Field, Input, MoneyHint, Modal, Select, Spinner, StatTile } from "../components/ui";

/** Expenses list + add, with per-category month summary (V2 Change 5). */
export function ExpensesPage() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const isCeo = user.role === "ceo";
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const month = monthKey();

  const summary = useQuery({
    queryKey: ["expense-summary", month],
    queryFn: () => api<ExpenseSummary>("/api/expenses/summary"),
  });
  const expenses = useQuery({
    queryKey: ["expenses", category, showDeleted],
    queryFn: () =>
      api<ExpenseRow[]>("/api/expenses", {
        query: {
          category: category || undefined,
          includeDeleted: showDeleted ? "1" : undefined,
        },
      }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const total = expenses.data?.filter((e) => !e.isDeleted).reduce((s, e) => s + Number(e.amount), 0) ?? 0;

  const catCount = summary.data ? Object.keys(summary.data.byCategory).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("expenses")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("expensesSubtitle")}</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={18} /> {t("addExpense")}
        </Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile tint="red" label={t("totalExpenses")} value={money(summary.data?.total ?? 0)} icon={<Receipt size={18} />} sub={new Date().toLocaleDateString("en-US", { month: "long" })} />
        <StatTile tint="violet" label={t("category")} value={catCount} icon={<Layers size={18} />} />
        <StatTile tint="amber" label={t("transactions")} value={expenses.data?.filter((e) => !e.isDeleted).length ?? 0} icon={<Coins size={18} />} />
      </div>

      <Card className="!p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-auto min-w-[150px]" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("category")}</option>
            {EXPENSE_CATEGORY_NAMES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          {isCeo && (
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
              {t("showDeleted")}
            </label>
          )}
        </div>
      </Card>

      {expenses.isLoading ? (
        <Spinner />
      ) : expenses.data?.length ? (
        <>
          <div className="space-y-2">
            {expenses.data.map((e) => (
              <div
                key={e.id}
                className={`flex items-center gap-3 rounded-card bg-surface p-3 shadow-card ring-1 ring-dark/[0.04] transition hover:shadow-card-hover ${e.isDeleted ? "opacity-50" : ""}`}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: avatarColor(e.category) }}>
                  {initials(e.category)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {e.category}{e.subCategory ? ` · ${e.subCategory}` : ""}
                    {e.isDeleted && <span className="text-xs text-status-overdue"> (deleted)</span>}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {formatDate(e.expenseDate, locale)} · {t(e.paymentMethod as "cash" | "bank_transfer" | "card")}
                    {e.vendor ? ` · ${e.vendor}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {e.receiptUrl && (
                    <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-primary">
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <span className="figure font-bold">{money(e.amount)}</span>
                  {isCeo && !e.isDeleted && (
                    <button className="text-status-overdue" onClick={() => del.mutate(e.id)}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Card className="flex justify-between font-bold">
            <span>{t("totalExpenses")}</span>
            <span className="figure">{money(total)}</span>
          </Card>
        </>
      ) : (
        <Empty />
      )}

      {adding && (
        <AddExpenseModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); qc.invalidateQueries(); }} />
      )}
    </div>
  );
}

function AddExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORY_NAMES[0]);
  const [subCategory, setSubCategory] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "card">("cash");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [description, setDescription] = useState("");

  const subs = subCategoriesFor(category);

  const create = useMutation({
    mutationFn: () =>
      api("/api/expenses", {
        method: "POST",
        body: {
          category,
          subCategory: subCategory || undefined,
          vendor: vendor || undefined,
          amount: Number(amount),
          expenseDate,
          paymentMethod,
          receiptUrl: receiptUrl || undefined,
          description: description || undefined,
        },
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal open onClose={onClose} title={t("addExpense")}>
      <div className="max-h-[72vh] space-y-3 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("category")}>
            <Select value={category} onChange={(e) => { setCategory(e.target.value); setSubCategory(""); }}>
              {EXPENSE_CATEGORY_NAMES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("subCategory")}>
            <Select value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
              <option value="">—</option>
              {subs.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("amount")}>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <MoneyHint value={amount} />
          </Field>
          <Field label={t("date")}>
            <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t("method")}>
          <div className="grid grid-cols-3 gap-2">
            {EXPENSE_PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`btn text-xs ${paymentMethod === m ? "btn-primary" : "btn-ghost"}`}
              >
                {t(m as "cash" | "bank_transfer" | "card")}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("vendor")}>
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </Field>
        <Field label={t("receiptUrl")}>
          <Input value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label={t("description")}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {create.isError && (
          <div className="text-sm text-status-overdue">{(create.error as Error).message}</div>
        )}
        <Button className="w-full" disabled={!amount || create.isPending} onClick={() => create.mutate()}>
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

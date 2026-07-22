import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { money, formatDate } from "../lib/format";
import { monthKey } from "@shared/date";
import {
  EXPENSE_CATEGORY_NAMES,
  subCategoriesFor,
  EXPENSE_PAYMENT_METHODS,
} from "@shared/expense-categories";
import type { ExpenseRow, ExpenseSummary } from "../lib/types";
import { Button, Card, Empty, Field, Input, Modal, Select, Spinner } from "../components/ui";

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("expenses")}</h1>
        <Button onClick={() => setAdding(true)}>
          <Plus size={18} /> {t("add")}
        </Button>
      </div>

      {/* Category summary cards */}
      {summary.data && Object.keys(summary.data.byCategory).length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Object.entries(summary.data.byCategory).map(([cat, amt]) => (
            <Card key={cat} className="min-w-[110px] shrink-0">
              <div className="text-xs text-tg-hint">{cat}</div>
              <div className="mt-1 font-bold">{money(amt)}</div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t("category")}</option>
          {EXPENSE_CATEGORY_NAMES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
        {isCeo && (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-tg-hint">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
            {t("showDeleted")}
          </label>
        )}
      </div>

      {expenses.isLoading ? (
        <Spinner />
      ) : expenses.data?.length ? (
        <>
          <div className="space-y-2">
            {expenses.data.map((e) => (
              <Card key={e.id} className={`flex items-center justify-between gap-2 ${e.isDeleted ? "opacity-50" : ""}`}>
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {e.category}
                    {e.subCategory ? ` · ${e.subCategory}` : ""}
                    {e.isDeleted && <span className="text-status-overdue"> (deleted)</span>}
                  </div>
                  <div className="text-xs text-tg-hint">
                    {formatDate(e.expenseDate, locale)} · {t(e.paymentMethod as "cash" | "bank_transfer" | "card")}
                    {e.vendor ? ` · ${e.vendor}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {e.receiptUrl && (
                    <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-tg-link">
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <span className="font-bold">{money(e.amount)}</span>
                  {isCeo && !e.isDeleted && (
                    <button className="text-status-overdue" onClick={() => del.mutate(e.id)}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Card className="flex justify-between font-semibold">
            <span>{t("totalExpenses")}</span>
            <span>{money(total)}</span>
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

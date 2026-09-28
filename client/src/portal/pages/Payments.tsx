import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Receipt, CalendarClock, Tag, Snowflake, ChevronRight } from "lucide-react";
import { fmtDay } from "@shared/notifications";
import { Modal } from "../../components/ui";
import { papi, amountDueNow, type Billing, type Discount, type Freeze, type PaymentItem, type PaymentDetail } from "../api";
import { usePT } from "../i18n";
import { useMe } from "../PortalApp";
import { PCard, SectionTitle, PageSkeleton, ErrorState, EmptyState, BillingStatusPill, money, daysFromToday, relTime } from "../ui";

type BillingResp = { billing: Billing; discounts: Discount[]; freezes: Freeze[] };
type Page = { items: PaymentItem[]; nextBefore: string | null };

export function PaymentsPage() {
  const { t, locale } = usePT();
  const me = useMe();
  const [openId, setOpenId] = useState<string | null>(null);
  const bill = useQuery({ queryKey: ["portal", "billing"], queryFn: () => papi<BillingResp>("/billing") });
  const hist = useInfiniteQuery({
    queryKey: ["portal", "payments"],
    queryFn: ({ pageParam }) => papi<Page>("/payments", { query: { before: pageParam ?? undefined, limit: "15" } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
  });

  if (bill.isLoading) return <PageSkeleton />;
  if (bill.error || !bill.data) return <ErrorState onRetry={() => bill.refetch()} />;
  const { billing: b, discounts, freezes } = bill.data;
  const due = amountDueNow(b);
  const days = daysFromToday(b.nextDueDate);
  const items = hist.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-3 animate-slide-up">
      {/* Current status */}
      <PCard className="!p-5">
        {me.student.sponsored ? (
          <div className="text-sm font-semibold text-status-paid">✓ {t("sponsored")}</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {due > 0 ? (b.status === "overdue" ? t("overdueAmount") : t("dueNow")) : t("allPaid")}
                </div>
                <div className={`figure mt-1 text-3xl font-extrabold tracking-tight ${due > 0 && b.status === "overdue" ? "text-status-overdue" : ""}`}>
                  {money(due, b.currency)}
                </div>
              </div>
              <BillingStatusPill status={b.status} partial={b.balance > 0} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
              <div>
                <div className="flex items-center gap-1 text-xs text-muted">
                  <CalendarClock size={13} /> {t("nextPayment")}
                </div>
                <div className="mt-0.5 font-bold">{fmtDay(b.nextDueDate, locale)}</div>
                <div className={`text-xs ${days < 0 ? "font-semibold text-status-overdue" : "text-muted"}`}>
                  {days > 0 ? t("dueIn", { n: days }) : days === 0 ? t("dueTodayShort") : t("overdueBy", { n: -days })}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">{t("monthlyFee")}</div>
                <div className="figure mt-0.5 font-bold">{money(b.effectiveFee, b.currency)}</div>
              </div>
              {b.balance > 0 && (
                <div className="col-span-2 rounded-2xl bg-warning/10 px-3 py-2">
                  <div className="text-xs font-semibold text-warning">{t("outstanding")}</div>
                  <div className="figure font-bold">{money(b.balance, b.currency)}</div>
                </div>
              )}
            </div>
          </>
        )}
      </PCard>

      {(discounts.length > 0 || freezes.length > 0) && (
        <div className="grid gap-2">
          {discounts.map((d) => (
            <PCard key={d.id} className="flex items-center gap-3 !p-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-violet/15 text-violet">
                <Tag size={16} />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-bold">
                  {t("discount")}: {d.discountType === "percentage" ? `${Number(d.discountValue)}%` : money(Number(d.discountValue), b.currency)}
                </div>
                {d.validTo && <div className="text-xs text-muted">{t("until", { date: fmtDay(monthEnd(d.validTo), locale) })}</div>}
              </div>
            </PCard>
          ))}
          {freezes.map((f) => (
            <PCard key={f.id} className="flex items-center gap-3 !p-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-freeze/15 text-freeze">
                <Snowflake size={16} />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-bold">{t("freeze")}</div>
                <div className="text-xs text-muted">
                  {fmtDay(f.freezeFrom, locale)} → {f.freezeTo ? fmtDay(f.freezeTo, locale) : "…"}
                </div>
              </div>
            </PCard>
          ))}
        </div>
      )}

      <SectionTitle>{t("history")}</SectionTitle>
      {hist.isLoading ? (
        <PageSkeleton />
      ) : hist.error ? (
        <ErrorState onRetry={() => hist.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Receipt size={24} />} title={t("noPayments")} />
      ) : (
        <div className="overflow-hidden rounded-[20px] bg-surface shadow-card ring-1 ring-dark/[0.04]">
          {items.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setOpenId(p.id)}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-bg ${i ? "border-t border-border" : ""}`}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                  p.status === "paid" ? "bg-status-paid/15 text-status-paid" : "bg-warning/15 text-warning"
                }`}
              >
                <Receipt size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{p.monthLabel}</div>
                <div className="text-xs text-muted">
                  {t("monthlyPayment")} · {relTime(p.createdAt, t, locale)}
                </div>
              </div>
              <div className="text-right">
                <div className="figure font-bold">{money(p.amount, b.currency)}</div>
                <div className={`text-[11px] font-bold ${p.status === "paid" ? "text-status-paid" : "text-warning"}`}>
                  {p.status === "paid" ? t("statusPaid") : t("statusPartial")}
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </button>
          ))}
        </div>
      )}
      {hist.hasNextPage && (
        <button className="btn btn-ghost w-full" disabled={hist.isFetchingNextPage} onClick={() => hist.fetchNextPage()}>
          {t("loadMore")}
        </button>
      )}

      {openId && <PaymentSheet id={openId} currency={b.currency} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function monthEnd(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function PaymentSheet({ id, currency, onClose }: { id: string; currency: string; onClose: () => void }) {
  const { t, locale } = usePT();
  const q = useQuery({ queryKey: ["portal", "payment", id], queryFn: () => papi<PaymentDetail>(`/payments/${id}`) });
  const p = q.data;
  return (
    <Modal open onClose={onClose} title={p ? p.monthLabel : t("payment")}>
      {q.isLoading ? (
        <div className="py-8 text-center text-sm text-muted">{t("loading")}</div>
      ) : !p ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <div className="figure text-3xl font-extrabold">{money(p.amount, currency)}</div>
            <div className="mt-2 flex justify-center">
              <BillingStatusPill status={p.status === "paid" ? "paid" : "awaiting_payment"} partial={p.status === "partial"} />
            </div>
          </div>
          <dl className="divide-y divide-border rounded-2xl bg-bg px-4 text-sm">
            <Row label={t("forMonth")} value={p.monthLabel} />
            <Row label={t("paidOn")} value={relTime(p.createdAt, t, locale)} />
            <Row label={t("method")} value={t(p.method)} />
            {p.amountDue != null && <Row label={t("amountDue")} value={money(p.amountDue, currency)} />}
            {p.remaining > 0 && <Row label={t("remaining")} value={money(p.remaining, currency)} danger />}
            {p.refundedAmount > 0 && <Row label={t("refunded")} value={money(p.refundedAmount, currency)} />}
          </dl>
          {p.installments.length > 1 && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("installments")}</div>
              <div className="space-y-1">
                {p.installments.map((x, i) => (
                  <div key={i} className="flex justify-between rounded-xl bg-bg px-3 py-2 text-sm">
                    <span className="text-muted">{relTime(x.at, t, locale)}</span>
                    <span className="figure font-semibold">{money(x.amount, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right font-semibold ${danger ? "text-status-overdue" : ""}`}>{value}</dd>
    </div>
  );
}

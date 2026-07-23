import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { ArrowLeft, Phone, CalendarClock, CalendarCheck } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { money, formatDate } from "../lib/format";
import type { StudentDetail as StudentDetailData } from "../lib/types";
import { Card, Empty, Spinner, StatusBadge, MethodTag } from "../components/ui";
import { StudentActions } from "../components/StudentActions";

/** Full student profile: start date, next-due, and complete payment history. */
export function StudentDetail() {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const params = useParams();
  const id = params.id!;

  const { data, isLoading } = useQuery({
    queryKey: ["student-detail", id],
    queryFn: () => api<StudentDetailData>(`/api/students/${id}/detail`),
  });

  if (isLoading || !data) return <Spinner />;
  const { student, billing, payments, discounts, freezes } = data;

  // Days until (or since) the next payment is due.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const due = new Date(billing.nextDueDate + "T00:00:00Z");
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const dueNote =
    days > 0
      ? t("dueInDays").replace("{n}", String(days))
      : days === 0
        ? t("dueToday")
        : t("overdueByDays").replace("{n}", String(-days));

  const canManage = user.role === "ceo" || user.role === "accountant";

  return (
    <div className="space-y-4">
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1 text-sm text-tg-link"
      >
        <ArrowLeft size={16} /> {t("back")}
      </button>

      {/* Header */}
      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{student.fullName}</div>
            <div className="text-sm text-tg-hint">{student.className}</div>
            {student.phone && (
              <div className="mt-1 inline-flex items-center gap-1 text-sm text-tg-hint">
                <Phone size={13} /> {student.phone}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusBadge status={billing.status} />
            {canManage && (
              <StudentActions
                student={{
                  id: student.id,
                  classId: student.classId,
                  fullName: student.fullName,
                  effectiveFee: String(billing.effectiveFee),
                }}
              />
            )}
          </div>
        </div>
        {(discounts.length > 0 || freezes.length > 0) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {discounts.map((d) => (
              <span key={d.id} className="rounded-full bg-status-discount/10 px-2.5 py-0.5 text-xs font-semibold text-status-discount">
                🏷️ {d.discountType === "percentage" ? `${d.discountValue}%` : money(d.discountValue)} off
              </span>
            ))}
            {freezes.map((f) => (
              <span key={f.id} className="rounded-full bg-status-frozen/10 px-2.5 py-0.5 text-xs font-semibold text-status-frozen">
                🔵 {formatDate(f.freezeFrom, locale)} → {formatDate(f.freezeTo, locale)}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Key billing facts */}
      <div className="grid grid-cols-2 gap-3">
        <Info icon={<CalendarCheck size={15} />} label={t("startDate")} value={formatDate(billing.startDate, locale)} />
        <Info icon={<CalendarClock size={15} />} label={t("nextPayment")} value={formatDate(billing.nextDueDate, locale)} sub={dueNote} subDanger={days < 0} />
        <Info label={t("fee")} value={money(billing.effectiveFee, billing.currency)} />
        <Info label={t("paidThrough")} value={billing.paymentsMade > 0 ? formatDate(billing.paidThrough, locale) : "—"} />
        <Info label={t("monthsEnrolled")} value={String(billing.monthsEnrolled)} />
        <Info label={t("paymentsMade")} value={String(billing.paymentsMade)} />
      </div>

      {/* Payment history */}
      <div>
        <div className="mb-2 text-base font-bold">{t("paymentHistory")}</div>
        {payments.length === 0 ? (
          <Empty>{t("noPayments")}</Empty>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <Card key={p.id} className={`flex items-center justify-between gap-2 ${p.voided ? "opacity-50" : ""}`}>
                <div className="min-w-0">
                  <div className="font-semibold">
                    {money(p.amount, billing.currency)}
                    {p.voided && <span className="text-status-overdue"> (void)</span>}
                  </div>
                  <div className="text-xs text-tg-hint">
                    {formatDate(p.createdAt, locale)}
                    {p.voidReason ? ` · ${p.voidReason}` : ""}
                  </div>
                </div>
                <MethodTag method={p.method} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({
  icon,
  label,
  value,
  sub,
  subDanger,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  subDanger?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center gap-1.5 text-xs text-tg-hint">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-bold">{value}</div>
      {sub && <div className={`text-xs ${subDanger ? "text-status-overdue" : "text-tg-hint"}`}>{sub}</div>}
    </Card>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight, Clock, MapPin, User, Wallet, CalendarCheck, Award, Bell, Snowflake, Tag, Ban, Check } from "lucide-react";
import { renderNotification } from "@shared/notifications";
import { categoryLabel } from "@shared/scores";
import { papi, amountDueNow, type Dashboard } from "../api";
import { usePT } from "../i18n";
import { HomeworkHomeCard } from "../homework/HomeworkPages";
import {
  PCard,
  SectionTitle,
  PageSkeleton,
  ErrorState,
  Ring,
  pctColor,
  money,
  dayLabel,
  daysFromToday,
  relTime,
  BillingStatusPill,
  ATT_COLOR,
  NotifIcon,
} from "../ui";
import { fmtDay } from "@shared/notifications";
import { TodayCard } from "../learn/ui";
import { RankCard } from "../leaderboard/RankCard";

export function HomePage() {
  const { t, locale } = usePT();
  const q = useQuery({ queryKey: ["portal", "dashboard"], queryFn: () => papi<Dashboard>("/dashboard") });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const d = q.data;
  const g = d.group;
  const b = d.billing;
  const due = amountDueNow(b);
  const days = daysFromToday(b.nextDueDate);
  const att = d.attendance.summary;

  const nextLabel = (() => {
    if (!g?.nextLesson) return null;
    const diff = daysFromToday(g.nextLesson.date);
    const day = diff === 0 ? t("today") : diff === 1 ? t("tomorrow") : dayLabel(g.nextLesson.date, locale);
    return `${day} · ${g.nextLesson.start}`;
  })();

  return (
    <div className="space-y-3 animate-slide-up">
      {/* Hero: greeting + group */}
      <div className="hero relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative">
          <div className="text-2xl font-extrabold tracking-tight">{t("hello", { name: d.student.givenName })}</div>
          {g && (
            <>
              <div className="mt-2 text-lg font-bold">{g.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/85">
                {g.teacherName && (
                  <span className="inline-flex items-center gap-1">
                    <User size={14} /> {g.teacherName}
                  </span>
                )}
                {g.room && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={14} /> {t("room")} {g.room}
                  </span>
                )}
              </div>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold backdrop-blur" style={{ background: "rgba(255,255,255,0.18)" }}>
                <Clock size={15} />
                {nextLabel ? `${t("nextClass")}: ${nextLabel}` : t("noUpcoming")}
              </div>
              {g.upcomingCancellations.length > 0 && (
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-white/90">
                  <Ban size={13} /> {t("cancelledOn", { date: g.upcomingCancellations.map((c) => fmtDay(c.date, locale)).join(", ") })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Today's vocabulary practice: the daily learning habit, one tap to start. */}
      <TodayCard compact />

      {/* Homework due next (hidden when the group has none). */}
      <HomeworkHomeCard />

      {/* Weekly rank in my group (and the whole centre). */}
      <RankCard />

      {/* Payment + attendance tiles */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/payments" className="block">
          <PCard className="h-full">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-primary">
                <Wallet size={15} />
              </span>
              {t("payment")}
            </div>
            {d.student.sponsored ? (
              <div className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-status-paid"><Check size={15} /> {t("allPaid")}</div>
            ) : due > 0 ? (
              <>
                <div className={`figure mt-2 text-lg font-extrabold leading-tight ${b.status === "overdue" ? "text-status-overdue" : "text-text"}`}>
                  {money(due, b.currency)}
                </div>
                <div className="mt-1">
                  <BillingStatusPill status={b.status} partial={b.balance > 0} />
                </div>
              </>
            ) : (
              <>
                <div className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-status-paid"><Check size={15} /> {t("allPaid")}</div>
                <div className="mt-1 text-xs text-muted">
                  {t("nextPayment")}: <span className="font-semibold text-text">{fmtDay(b.nextDueDate, locale)}</span>
                </div>
                <div className="text-xs text-muted">{days > 0 ? t("dueIn", { n: days }) : ""}</div>
              </>
            )}
          </PCard>
        </Link>

        <Link href="/attendance" className="block">
          <PCard className="h-full">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-status-paid/15 text-status-paid">
                <CalendarCheck size={15} />
              </span>
              {t("attendance")}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Ring value={att.rate} size={62} stroke={7} color={pctColor(att.rate)} />
              <div className="whitespace-nowrap text-xs leading-5 text-muted">
                <div>
                  <span className="font-bold text-text">{att.present + att.late + att.leftEarly}</span> {t("present")}
                </div>
                <div>
                  <span className="font-bold text-text">{att.absent}</span> {t("absent")}
                </div>
              </div>
            </div>
          </PCard>
        </Link>
      </div>

      {/* Discount / freeze badges */}
      {(b.discount || b.freeze) && (
        <div className="flex flex-wrap gap-2">
          {b.discount && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet/15 px-3 py-1 text-xs font-bold text-violet">
              <Tag size={13} /> {t("discount")}:{" "}
              {b.discount.discountType === "percentage" ? `${Number(b.discount.discountValue)}%` : money(Number(b.discount.discountValue), b.currency)}
            </span>
          )}
          {b.freeze && (
            <span className="inline-flex items-center gap-1 rounded-full bg-freeze/15 px-3 py-1 text-xs font-bold text-freeze">
              <Snowflake size={13} /> {t("freeze")}
            </span>
          )}
        </div>
      )}

      {/* Recent attendance strip */}
      {d.attendance.recent.length > 0 && (
        <Link href="/attendance" className="block">
          <PCard className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-muted">
                {t("last30", { rate: d.attendance.last30.rate == null ? "—" : `${d.attendance.last30.rate}%` })}
              </div>
              <div className="mt-2 flex gap-1.5">
                {[...d.attendance.recent].reverse().map((r) => (
                  <span
                    key={r.id}
                    title={`${r.date} · ${t(r.status)}`}
                    className="h-3 flex-1 rounded-full"
                    style={{ background: ATT_COLOR[r.status], maxWidth: 28 }}
                  />
                ))}
              </div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </PCard>
        </Link>
      )}

      {/* Latest score */}
      <Link href="/progress" className="block">
        <PCard className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet/15 text-violet">
            <Award size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-muted">{t("latestScore")}</div>
            {d.latestScore ? (
              <>
                <div className="truncate font-bold">
                  {categoryLabel(d.latestScore.category, locale)}: {d.latestScore.score} / {d.latestScore.maxScore}
                </div>
                <div className="truncate text-xs text-muted">
                  {d.latestScore.title} · {fmtDay(d.latestScore.scoreDate, locale)}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted">{t("noScores")}</div>
            )}
          </div>
          {d.latestScore && (
            <span className="figure text-xl font-extrabold" style={{ color: pctColor(d.latestScore.percent) }}>
              {Math.round(d.latestScore.percent)}%
            </span>
          )}
        </PCard>
      </Link>

      {/* Notifications preview */}
      <SectionTitle
        action={
          <Link href="/notifications" className="text-sm font-semibold text-primary">
            {t("seeAll")}
          </Link>
        }
      >
        <span className="inline-flex items-center gap-2">
          <Bell size={16} /> {t("notificationsTitle")}
          {d.unread > 0 && (
            <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">{t("newCount", { n: d.unread })}</span>
          )}
        </span>
      </SectionTitle>
      {d.notifications.length === 0 ? (
        <PCard className="text-center text-sm text-muted">{t("noNotifications")}</PCard>
      ) : (
        <div className="space-y-2">
          {d.notifications.map((n) => {
            const r = renderNotification(n.type, n.params, locale);
            return (
              <Link key={n.id} href="/notifications" className="block">
                <PCard className="flex gap-3 !p-3.5">
                  <NotifIcon icon={r.icon} tone={r.tone} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">{r.title}</span>
                      {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </div>
                    <div className="line-clamp-2 text-sm text-muted">{r.body}</div>
                    <div className="mt-0.5 text-[11px] text-muted">{relTime(n.createdAt, t, locale)}</div>
                  </div>
                </PCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

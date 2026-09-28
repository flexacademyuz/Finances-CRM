/**
 * Student-profile panels for staff: attendance summary + history, scores, and
 * the student's Telegram / portal link (codes, linked accounts, preview).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Copy, Eye, KeyRound, Trash2, Plus, Pencil } from "lucide-react";
import type { AttendanceStatus } from "@shared/schema";
import type { AttendanceSummary } from "@shared/attendance";
import { SCORE_CATEGORIES, categoryLabel, scorePercent, type ScoreAnalytics } from "@shared/scores";
import { tashkentDate } from "@shared/lesson-schedule";
import { can } from "@shared/permissions";
import { api } from "../lib/api";
import { useI18n, type StringKey } from "../lib/i18n";
import { useSession } from "../lib/session";
import { formatDate } from "../lib/format";
import { haptic } from "../lib/telegram";
import { Button, Card, Field, Input, Modal, Select } from "./ui";
import { ATT_BG } from "./GroupAttendance";
import { EditScoreModal, type ScoreRow } from "./GroupScores";

type AttResp = {
  summary: AttendanceSummary;
  last30: AttendanceSummary;
  records: { id: string; date: string; status: AttendanceStatus; note: string | null; className: string }[];
};

export function StudentAttendancePanel({ studentId }: { studentId: string }) {
  const { t, locale } = useI18n();
  const [all, setAll] = useState(false);
  const q = useQuery({
    queryKey: ["student-attendance", studentId],
    queryFn: () => api<AttResp>(`/api/attendance/students/${studentId}`),
    retry: false,
  });
  if (q.error || !q.data) return null; // no access (e.g. not this teacher's) → hide quietly
  const { summary: s, last30, records } = q.data;
  const shown = all ? records : records.slice(0, 12);
  return (
    <div>
      <div className="mb-2 text-base font-bold">{t("attendance")}</div>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-extrabold">{s.rate == null ? "—" : `${s.rate}%`}</span>
          <span className="text-xs text-muted">
            {t("last30days")}: {last30.rate == null ? "—" : `${last30.rate}%`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["present", "late", "absent", "excused", "left_early"] as const).map((k) => {
            const n = k === "left_early" ? s.leftEarly : s[k];
            return (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-pill bg-bg px-2.5 py-1 font-semibold">
                <span className={`h-2 w-2 rounded-full ${ATT_BG[k]}`} />
                {t(`att_${k}` as StringKey)} {n}
              </span>
            );
          })}
        </div>
        {records.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {shown.map((r) => (
              <span
                key={r.id}
                title={`${formatDate(r.date + "T00:00:00", locale)} · ${t(`att_${r.status}` as StringKey)}${r.note ? ` · ${r.note}` : ""}`}
                className={`grid h-7 min-w-[2.2rem] place-items-center rounded-lg px-1 text-[10px] font-bold text-white ${ATT_BG[r.status]}`}
              >
                {r.date.slice(8, 10)}.{r.date.slice(5, 7)}
              </span>
            ))}
            {records.length > 12 && (
              <button className="text-xs font-semibold text-primary" onClick={() => setAll((v) => !v)}>
                {all ? "−" : `+${records.length - 12}`}
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

type ScoresResp = { scores: ScoreRow[]; analytics: ScoreAnalytics };

export function StudentScoresPanel({ studentId, isOwnTeacher }: { studentId: string; isOwnTeacher: boolean }) {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ScoreRow | null>(null);
  const q = useQuery({
    queryKey: ["student-scores", studentId],
    queryFn: () => api<ScoresResp>(`/api/students/${studentId}/scores`),
    retry: false,
  });
  if (q.error || !q.data) return null;
  const canEdit = isOwnTeacher || can(user, "manage_scores");
  const { scores, analytics } = q.data;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-base font-bold">{t("scores")}</div>
        {canEdit && (
          <Button variant="ghost" className="!py-1.5" onClick={() => setAdding(true)}>
            <Plus size={15} /> {t("addScore")}
          </Button>
        )}
      </div>
      <Card className="space-y-2">
        {scores.length === 0 ? (
          <div className="text-sm text-muted">{t("noScoresYet")}</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-pill bg-primary-soft px-2.5 py-1 font-bold text-primary">
                {t("average")} {analytics.average}%
              </span>
              {analytics.byCategory.slice(0, 5).map((c) => (
                <span key={c.category} className="rounded-pill bg-bg px-2.5 py-1 font-semibold">
                  {categoryLabel(c.category, locale)} {c.average}%
                </span>
              ))}
            </div>
            {scores.slice(0, 15).map((s) => (
              <div key={s.id} className="flex items-center gap-2 border-t border-border pt-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{s.title}</div>
                  <div className="truncate text-xs text-muted">
                    {categoryLabel(s.category, locale)} · {formatDate(s.scoreDate + "T00:00:00", locale)}
                    {s.comment ? ` · “${s.comment}”` : ""}
                  </div>
                </div>
                <span className="figure text-sm font-bold">
                  {Number(s.score)}/{Number(s.maxScore)}
                </span>
                <span className="w-12 text-right text-xs font-bold text-muted">{scorePercent(Number(s.score), Number(s.maxScore))}%</span>
                {canEdit && (
                  <button className="rounded-lg bg-bg p-1.5 text-muted" onClick={() => setEditing(s)} aria-label={t("edit")}>
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </Card>
      {adding && <AddScoreModal studentId={studentId} onClose={() => setAdding(false)} />}
      {editing && <EditScoreModal score={editing} onClose={() => setEditing(null)} invalidateKey={["student-scores", studentId]} />}
    </div>
  );
}

function AddScoreModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [category, setCategory] = useState("test");
  const [title, setTitle] = useState("");
  const [score, setScore] = useState("");
  const [max, setMax] = useState("100");
  const [date, setDate] = useState(tashkentDate());
  const [comment, setComment] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const m = useMutation({
    mutationFn: () =>
      api(`/api/students/${studentId}/scores`, {
        method: "POST",
        body: {
          category,
          title: title.trim() || categoryLabel(category, locale),
          score: Number(score),
          maxScore: Number(max),
          scoreDate: date,
          comment: comment.trim() || null,
          attachmentUrl: attachmentUrl.trim() || null,
        },
      }),
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries({ queryKey: ["student-scores", studentId] });
      onClose();
    },
  });
  const valid = score !== "" && Number(max) > 0 && Number(score) >= 0 && Number(score) <= Number(max);
  return (
    <Modal open onClose={onClose} title={t("addScore")}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("category")}>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {SCORE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t("scoreTitle")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${categoryLabel(category, locale)} 1`} maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("score")}>
            <Input type="number" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} />
          </Field>
          <Field label={t("maxScore")}>
            <Input type="number" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
          </Field>
        </div>
        <Field label={t("comment")}>
          <textarea className="input min-h-[80px]" value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <Field label={`${t("attachmentLink")} (${t("optional")})`}>
          <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="https://…" />
        </Field>
        {m.isError && <div className="text-sm text-status-overdue">{(m.error as Error).message}</div>}
        <Button className="w-full" disabled={!valid || m.isPending} onClick={() => m.mutate()}>
          {t("save")}
        </Button>
      </div>
    </Modal>
  );
}

type TgResp = {
  accounts: { id: string; username: string | null; firstName: string | null; method: string; verifiedAt: string; botBlocked: boolean }[];
  botUsername: string | null;
};

export function StudentTelegramPanel({ studentId, isOwnTeacher }: { studentId: string; isOwnTeacher: boolean }) {
  const { t, locale } = useI18n();
  const { user } = useSession();
  const qc = useQueryClient();
  const [code, setCode] = useState<{ formatted: string; deepLink: string | null; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const q = useQuery({
    queryKey: ["student-telegram", studentId],
    queryFn: () => api<TgResp>(`/api/students/${studentId}/telegram`),
    retry: false,
  });
  const gen = useMutation({
    mutationFn: () => api<{ formatted: string; deepLink: string | null; expiresAt: string }>(`/api/students/${studentId}/telegram/code`, { method: "POST" }),
    onSuccess: (r) => {
      setCode(r);
      setCopied(false);
    },
  });
  const unlink = useMutation({
    mutationFn: (accountId: string) => api(`/api/students/${studentId}/telegram/${accountId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student-telegram", studentId] }),
  });
  if (q.error || !q.data) return null;
  const canIssue = isOwnTeacher || can(user, "edit_student");
  const canUnlink = user.role === "ceo" || user.role === "accountant";
  const canPreview = user.role === "ceo" || user.role === "accountant";

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard blocked — the code is visible to copy manually */
    }
  };

  return (
    <div>
      <div className="mb-2 text-base font-bold">{t("studentPortal")}</div>
      <Card className="space-y-3">
        {q.data.accounts.length === 0 ? (
          <div className="text-sm text-muted">{t("notLinkedYet")}</div>
        ) : (
          q.data.accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#229ED9]/15 text-[#229ED9]">
                <Send size={14} />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-semibold">{a.username ? `@${a.username}` : a.firstName ?? "Telegram"}</div>
                <div className="text-xs text-muted">
                  {a.method === "phone" ? t("verifiedByPhone") : t("verifiedByCode")} · {formatDate(a.verifiedAt, locale)}
                  {a.botBlocked && <span className="text-status-overdue"> · {t("botBlocked")}</span>}
                </div>
              </div>
              {canUnlink && (
                <button
                  className="rounded-lg bg-bg p-1.5 text-status-overdue"
                  title={t("unlinkAccount")}
                  onClick={() => window.confirm(t("unlinkAccountConfirm")) && unlink.mutate(a.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}

        {code && (
          <div className="rounded-btn bg-primary-soft p-3 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">{t("linkCode")}</div>
            <div className="figure my-1 text-2xl font-extrabold tracking-[0.2em]">{code.formatted}</div>
            <div className="text-xs text-muted">{t("linkCodeNote")}</div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button variant="ghost" className="!py-1.5" onClick={() => copy(code.deepLink ? `${code.deepLink}\n${code.formatted}` : code.formatted)}>
                <Copy size={14} /> {copied ? t("copied") : t("copy")}
              </Button>
              {code.deepLink && (
                <a className="btn btn-ghost !py-1.5" href={code.deepLink} target="_blank" rel="noreferrer">
                  <Send size={14} /> t.me
                </a>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {canIssue && (
            <Button variant="ghost" className="!py-1.5" disabled={gen.isPending} onClick={() => gen.mutate()}>
              <KeyRound size={14} /> {code ? t("newCode") : t("generateLinkCode")}
            </Button>
          )}
          {canPreview && (
            <a className="btn btn-ghost !py-1.5" href={`/portal?as=${studentId}`}>
              <Eye size={14} /> {t("viewAsStudent")}
            </a>
          )}
        </div>
        {gen.isError && <div className="text-sm text-status-overdue">{(gen.error as Error).message}</div>}
      </Card>
    </div>
  );
}

/** Student-app homework: the list (to do / done) and one homework (hand in, feedback). */
import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, ClipboardList, ExternalLink, Layers, Send, MessageSquareText } from "lucide-react";
import { fmtDue } from "@shared/homework";
import type { ApiError } from "../../lib/api";
import { apiUpload } from "../../lib/api";
import { haptic } from "../../lib/telegram";
import { AddFileTile, FileThumb, prepareUpload } from "../../components/HomeworkFiles";
import { PCard, PageSkeleton, ErrorState, EmptyState, SectionTitle } from "../ui";
import { portalHeaders, previewStudentId } from "../api";
import { setSelectedSet } from "../learn/api";
import { hwApi, StatePill, timeLeft, useHT, type HwDetail, type HwListItem } from "./shared";

export function useHomeworkList() {
  return useQuery({ queryKey: ["portal", "homework"], queryFn: () => hwApi<HwListItem[]>("") });
}

const OPEN = new Set(["todo", "overdue", "returned", "submitted"]);

export function HomeworkListPage() {
  const { t } = useHT();
  const q = useHomeworkList();
  const [tab, setTab] = useState<"open" | "done">("open");
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  // Needs action first (returned, overdue), then by deadline.
  const rank = { returned: 0, overdue: 1, todo: 2, submitted: 3, done: 4 } as const;
  const open = q.data.filter((h) => OPEN.has(h.state)).sort((a, b) => rank[a.state] - rank[b.state] || a.dueAt.localeCompare(b.dueAt));
  const done = q.data.filter((h) => h.state === "done");
  const list = tab === "open" ? open : done;

  return (
    <div className="space-y-3 animate-slide-up">
      <div className="inline-flex w-full rounded-full bg-surface p-1 shadow-card ring-1 ring-dark/[0.04]">
        {(["open", "done"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex-1 rounded-full py-2 text-sm font-bold transition ${tab === k ? "bg-primary text-white shadow-brand" : "text-muted"}`}
          >
            {k === "open" ? t("toDo") : t("done")} <span className="figure opacity-80">({k === "open" ? open.length : done.length})</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<ClipboardList size={24} />} title={tab === "open" ? t("nothingToDo") : t("nothingDone")} />
      ) : (
        <div className="space-y-2">
          {list.map((h) => (
            <HomeworkRow key={h.id} h={h} />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeworkRow({ h }: { h: HwListItem }) {
  const { t, locale } = useHT();
  const soon = h.state === "todo" && new Date(h.dueAt).getTime() - Date.now() < 24 * 3600_000;
  return (
    <Link href={`/homework/${h.id}`} className="block">
      <PCard className="!p-3.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatePill state={h.state} />
              {h.kind === "vocabulary" && <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[11px] font-bold text-violet">{t("vocabulary")}</span>}
            </div>
            <div className="mt-1.5 font-bold leading-snug">{h.title}</div>
            <div className={`mt-0.5 text-xs ${h.state === "overdue" || soon ? "font-semibold text-danger" : "text-muted"}`}>
              {t("due", { d: fmtDue(h.dueAt, locale) })}
              {h.state === "todo" && ` · ${t("dueIn", { n: timeLeft(h.dueAt, locale) })}`}
              {h.late && h.state !== "todo" && ` · ${t("late")}`}
            </div>
            {h.vocab && h.state !== "done" && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-dark/[0.07]">
                  <div className="h-full rounded-full bg-violet" style={{ width: `${Math.min(100, (h.vocab.percent / Math.max(1, h.vocab.target)) * 100)}%` }} />
                </div>
                <span className="figure text-xs font-bold">
                  {h.vocab.percent}% / {h.vocab.target}%
                </span>
              </div>
            )}
          </div>
          {h.state === "done" && h.score != null && h.maxScore != null ? (
            <div className="text-right">
              <div className="figure text-lg font-extrabold text-status-paid">{h.score}</div>
              <div className="text-[11px] text-muted">/ {h.maxScore}</div>
            </div>
          ) : (
            <ChevronRight size={18} className="mt-1 text-muted" />
          )}
        </div>
      </PCard>
    </Link>
  );
}

/** Compact card for the portal Home: what's due next. */
export function HomeworkHomeCard() {
  const { t, locale } = useHT();
  const q = useHomeworkList();
  if (!q.data || q.data.length === 0) return null;
  const open = q.data.filter((h) => h.state === "todo" || h.state === "overdue" || h.state === "returned");
  const next = [...open].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  return (
    <Link href="/homework" className="block">
      <PCard className="flex items-center gap-3 !p-3.5">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${open.length ? "bg-warning/15 text-warning" : "bg-status-paid/15 text-status-paid"}`}>
          <ClipboardList size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted">{t("homework")}</div>
          <div className="truncate font-bold">{open.length ? t("pendingN", { n: open.length }) : t("allDone")}</div>
          {next && <div className="truncate text-[11px] text-muted">{t("nextDue", { t: next.title, d: fmtDue(next.dueAt, locale) })}</div>}
        </div>
        <ChevronRight size={18} className="text-muted" />
      </PCard>
    </Link>
  );
}

export function HomeworkDetailPage() {
  const { t, locale } = useHT();
  const [, params] = useRoute("/homework/:id");
  const id = params?.id ?? "";
  const [, go] = useLocation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["portal", "homework", id], queryFn: () => hwApi<HwDetail>(`/${id}`), enabled: !!id });
  const [text, setText] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const preview = !!previewStudentId();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["portal", "homework"] });
  };
  const submitM = useMutation({
    mutationFn: () => hwApi(`/${id}/submit`, { method: "POST", body: { text: text ?? q.data?.submission?.answerText ?? "", linkUrl: link ?? q.data?.submission?.linkUrl ?? "" } }),
    onSuccess: () => {
      haptic("success");
      setErr(null);
      setText(null);
      setLink(null);
      refresh();
    },
    onError: (e: ApiError) => setErr(e.code === "empty_submission" ? t("empty") : e.message),
  });

  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const h = q.data;
  const sub = h.submission;
  const files = sub?.files ?? [];
  const editable = h.kind === "task" && sub?.status !== "accepted" && !preview;
  const answer = text ?? sub?.answerText ?? "";
  const linkVal = link ?? sub?.linkUrl ?? "";

  const upload = async (list: File[]) => {
    setUploading(true);
    setErr(null);
    try {
      for (const f of list) {
        const { blob, name } = await prepareUpload(f);
        await apiUpload(`/api/student/homework/${h.id}/files`, blob, name, portalHeaders());
      }
    } catch (e) {
      setErr(t("uploadFailed", { m: (e as Error).message }));
    } finally {
      setUploading(false);
      void q.refetch();
    }
  };
  const removeFile = async (fileId: string) => {
    try {
      await hwApi(`/${h.id}/files/${fileId}`, { method: "DELETE" });
    } finally {
      void q.refetch();
    }
  };
  const practise = () => {
    if (!h.stage) return;
    setSelectedSet(h.stage.resourceId);
    void qc.resetQueries({ queryKey: ["portal", "learn"] });
    go(`/learn/stage/${h.stage.id}`);
  };
  const buttonLabel = sub?.status === "returned" ? t("resubmit") : sub?.status === "submitted" ? t("update") : t("submit");

  return (
    <div className="space-y-3 animate-slide-up">
      <Link href="/homework" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ArrowLeft size={16} /> {t("back")}
      </Link>

      <PCard>
        <StatePill state={h.state} />
        <h1 className="mt-2 text-xl font-extrabold leading-tight tracking-tight">{h.title}</h1>
        <div className={`mt-1 text-sm ${h.state === "overdue" ? "font-semibold text-danger" : "text-muted"}`}>
          {t("due", { d: fmtDue(h.dueAt, locale) })}
          {h.state === "todo" && ` · ${t("dueIn", { n: timeLeft(h.dueAt, locale) })}`}
        </div>
        {h.instructions && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{h.instructions}</p>}
        {h.linkUrl && (
          <a href={h.linkUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
            <ExternalLink size={15} /> {t("openLink")}
          </a>
        )}
        {h.files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {h.files.map((f) => (
              <FileThumb key={f.id} file={f} src={`/api/student/homework/files/${f.id}`} headers={portalHeaders()} />
            ))}
          </div>
        )}
      </PCard>

      {h.kind === "vocabulary" && h.vocab && h.stage && (
        <PCard>
          <div className="text-sm font-semibold text-muted">{t("vocabTask", { n: h.stage.position })}</div>
          <p className="mt-1 text-sm">{t("vocabGoal", { p: h.vocab.target, n: h.stage.position })}</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-dark/[0.07]">
              <div className="h-full rounded-full bg-violet transition-[width] duration-700" style={{ width: `${Math.min(100, (h.vocab.percent / Math.max(1, h.vocab.target)) * 100)}%` }} />
            </div>
            <span className="figure text-sm font-extrabold">
              {h.vocab.learned}/{h.vocab.total}
            </span>
          </div>
          {h.state !== "done" && (
            <>
              <button
                type="button"
                onClick={practise}
                className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-extrabold text-white shadow-tactile active:translate-y-[3px] active:shadow-tactile-press"
              >
                <Layers size={18} /> {t("practiseNow")}
              </button>
              <div className="mt-2 text-center text-[11px] text-muted">{t("completesItself")}</div>
            </>
          )}
        </PCard>
      )}

      {sub && (sub.status === "returned" || sub.status === "accepted") && (sub.feedback || sub.score != null) && (
        <PCard className={sub.status === "returned" ? "ring-2 ring-danger/30" : "ring-2 ring-status-paid/30"}>
          <div className={`flex items-center gap-2 font-extrabold ${sub.status === "returned" ? "text-danger" : "text-status-paid"}`}>
            <MessageSquareText size={18} /> {sub.status === "returned" ? t("returnedTitle") : t("acceptedTitle")}
          </div>
          {sub.score != null && h.maxScore != null && (
            <div className="mt-2 text-sm">
              {t("mark")}: <b className="figure text-lg">{sub.score}</b> / {h.maxScore}
            </div>
          )}
          {sub.feedback && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-bg px-3 py-2 text-sm">{sub.feedback}</p>}
        </PCard>
      )}

      {h.kind === "task" && (
        <>
          <SectionTitle>{t("yourAnswer")}</SectionTitle>
          <PCard className="space-y-3">
            {sub?.status === "submitted" && <div className="rounded-xl bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">{t("waitingCheck")}</div>}
            {sub?.submittedAt && sub.status !== "draft" && (
              <div className="text-xs text-muted">
                {t("submittedOn", { d: fmtDue(sub.submittedAt, locale) })}
                {sub.late ? ` · ${t("late")}` : ""}
              </div>
            )}
            {editable ? (
              <>
                <textarea
                  value={answer}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  maxLength={10000}
                  placeholder={t("answerPlaceholder")}
                  className="w-full resize-y rounded-2xl border border-border bg-bg px-3.5 py-3 text-[15px] outline-none focus:border-primary"
                />
                <input
                  value={linkVal}
                  onChange={(e) => setLink(e.target.value)}
                  inputMode="url"
                  placeholder={t("linkPlaceholder")}
                  className="h-11 w-full rounded-2xl border border-border bg-bg px-3.5 text-sm outline-none focus:border-primary"
                />
                <div>
                  <div className="flex flex-wrap gap-2">
                    {files.map((f) => (
                      <FileThumb key={f.id} file={f} src={`/api/student/homework/files/${f.id}`} headers={portalHeaders()} onRemove={() => void removeFile(f.id)} />
                    ))}
                    {files.length < 8 && <AddFileTile onFiles={(l) => void upload(l)} busy={uploading} label={t("addPhoto")} />}
                  </div>
                  <div className="mt-1.5 text-[11px] text-muted">{t("photosHint")}</div>
                </div>
                {err && <div className="text-sm font-semibold text-danger">{err}</div>}
                <button
                  type="button"
                  disabled={submitM.isPending || uploading}
                  onClick={() => submitM.mutate()}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-extrabold text-white shadow-tactile transition active:translate-y-[3px] active:shadow-tactile-press disabled:opacity-50"
                >
                  <Send size={17} /> {buttonLabel}
                </button>
              </>
            ) : (
              <>
                {sub?.answerText && <p className="whitespace-pre-wrap text-[15px]">{sub.answerText}</p>}
                {sub?.linkUrl && (
                  <a href={sub.linkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary">
                    <ExternalLink size={15} /> {sub.linkUrl}
                  </a>
                )}
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {files.map((f) => (
                      <FileThumb key={f.id} file={f} src={`/api/student/homework/files/${f.id}`} headers={portalHeaders()} />
                    ))}
                  </div>
                )}
                {preview && <div className="text-xs text-muted">{t("previewOnly")}</div>}
              </>
            )}
          </PCard>
        </>
      )}
    </div>
  );
}

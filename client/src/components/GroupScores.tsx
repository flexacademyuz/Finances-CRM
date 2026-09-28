/**
 * A group's scores: assessments list (class average per test) and a fast
 * whole-group entry form — pick the test once, type each student's score.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { SCORE_CATEGORIES, categoryLabel, scorePercent } from "@shared/scores";
import { tashkentDate } from "@shared/lesson-schedule";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { haptic } from "../lib/telegram";
import { formatDate } from "../lib/format";
import { Button, Card, Empty, Field, Input, Modal, Select, Spinner } from "./ui";

export type ScoreRow = {
  id: string;
  studentId: string;
  studentName: string;
  category: string;
  title: string;
  score: string;
  maxScore: string;
  scoreDate: string;
  comment: string | null;
  teacherName: string | null;
};

type Assessment = { category: string; title: string; scoreDate: string; maxScore: string; count: number; averagePct: string };

export function GroupScores({
  classId,
  roster,
  canEdit,
}: {
  classId: string;
  roster: { id: string; fullName: string }[];
  canEdit: boolean;
}) {
  const { t, locale } = useI18n();
  const [adding, setAdding] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScoreRow | null>(null);
  const q = useQuery({
    queryKey: ["group-scores", classId],
    queryFn: () => api<{ assessments: Assessment[]; scores: ScoreRow[] }>(`/api/groups/${classId}/scores`),
  });

  const keyOf = (x: { category: string; title: string; scoreDate: string }) => `${x.category}|${x.title.toLowerCase()}|${x.scoreDate}`;

  return (
    <div className="space-y-3">
      {canEdit && (
        <Button className="w-full" onClick={() => setAdding(true)} disabled={roster.length === 0}>
          <Plus size={16} /> {t("addScores")}
        </Button>
      )}
      {q.isLoading ? (
        <Spinner />
      ) : !q.data?.assessments.length ? (
        <Empty>{t("noScoresYet")}</Empty>
      ) : (
        <div className="space-y-2">
          {q.data.assessments.map((a) => {
            const k = keyOf(a);
            const open = openKey === k;
            const rows = q.data!.scores.filter((s) => keyOf(s) === k);
            const avg = Number(a.averagePct);
            return (
              <Card key={k} className="!p-0">
                <button className="flex w-full items-center gap-3 p-3.5 text-left" onClick={() => setOpenKey(open ? null : k)}>
                  <div
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xs font-extrabold ${
                      avg >= 80 ? "bg-status-paid/15 text-status-paid" : avg >= 60 ? "bg-warning/15 text-warning" : "bg-status-overdue/15 text-status-overdue"
                    }`}
                  >
                    {Math.round(avg)}%
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{a.title}</div>
                    <div className="truncate text-xs text-muted">
                      {categoryLabel(a.category, locale)} · {formatDate(a.scoreDate + "T00:00:00", locale)} · {a.count} · max {Number(a.maxScore)}
                    </div>
                  </div>
                  {open ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
                </button>
                {open && (
                  <div className="border-t border-border">
                    {rows.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 border-b border-border px-3.5 py-2 last:border-b-0">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{r.studentName}</div>
                          {r.comment && <div className="truncate text-xs text-muted">“{r.comment}”</div>}
                        </div>
                        <span className="figure text-sm font-bold">
                          {Number(r.score)} / {Number(r.maxScore)}
                        </span>
                        {canEdit && (
                          <button className="rounded-lg bg-bg p-1.5 text-muted" onClick={() => setEditing(r)} aria-label={t("edit")}>
                            <Pencil size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {adding && <BulkScoreModal classId={classId} roster={roster} onClose={() => setAdding(false)} />}
      {editing && <EditScoreModal score={editing} onClose={() => setEditing(null)} invalidateKey={["group-scores", classId]} />}
    </div>
  );
}

function BulkScoreModal({ classId, roster, onClose }: { classId: string; roster: { id: string; fullName: string }[]; onClose: () => void }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>("test");
  const [title, setTitle] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [date, setDate] = useState(tashkentDate());
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [commentFor, setCommentFor] = useState<string | null>(null);

  const max = Number(maxScore);
  const entries = roster
    .filter((s) => scores[s.id] !== undefined && scores[s.id] !== "")
    .map((s) => ({ studentId: s.id, score: Number(scores[s.id]), comment: comments[s.id]?.trim() || null }));
  const invalid = entries.some((e) => !Number.isFinite(e.score) || e.score < 0 || e.score > max);

  const m = useMutation({
    mutationFn: () =>
      api(`/api/groups/${classId}/scores`, {
        method: "POST",
        body: { category, title: title.trim() || categoryLabel(category, locale), maxScore: max, scoreDate: date, entries },
      }),
    onSuccess: () => {
      haptic("success");
      qc.invalidateQueries({ queryKey: ["group-scores", classId] });
      onClose();
    },
    onError: () => haptic("error"),
  });

  return (
    <>
    <Modal open={!commentFor} onClose={onClose} title={t("addScores")}>
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
          <Field label={t("maxScore")}>
            <Input type="number" inputMode="decimal" min={1} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
          </Field>
        </div>
        <Field label={t("scoreTitle")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${categoryLabel(category, locale)} 1`} maxLength={120} />
        </Field>
        <Field label={t("date")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <div className="rounded-btn border border-border">
          {roster.map((s, i) => {
            const v = scores[s.id] ?? "";
            const bad = v !== "" && (Number(v) > max || Number(v) < 0);
            return (
              <div key={s.id} className={`flex items-center gap-2 px-3 py-2 ${i ? "border-t border-border" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{s.fullName}</div>
                  {comments[s.id] && <div className="truncate text-xs text-muted">“{comments[s.id]}”</div>}
                </div>
                <button
                  className={`rounded-lg px-2 py-1 text-xs font-semibold ${comments[s.id] ? "bg-primary-soft text-primary" : "bg-bg text-muted"}`}
                  onClick={() => setCommentFor(s.id)}
                >
                  💬
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  value={v}
                  onChange={(e) => setScores((x) => ({ ...x, [s.id]: e.target.value }))}
                  className={`input !w-20 !py-1.5 text-right ${bad ? "!border-danger" : ""}`}
                  placeholder="—"
                  aria-label={`${s.fullName} ${t("score")}`}
                />
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">{t("scoresBlankNote")}</p>
        {m.isError && <div className="text-sm text-status-overdue">{(m.error as Error).message}</div>}
        <Button className="w-full" disabled={!entries.length || invalid || !(max > 0) || m.isPending} onClick={() => m.mutate()}>
          {t("save")} · {entries.length}
        </Button>
      </div>
    </Modal>

      {commentFor && (
        <Modal open onClose={() => setCommentFor(null)} title={roster.find((r) => r.id === commentFor)?.fullName ?? ""}>
          <Field label={t("comment")}>
            <textarea
              className="input min-h-[90px]"
              value={comments[commentFor] ?? ""}
              maxLength={1000}
              onChange={(e) => setComments((x) => ({ ...x, [commentFor]: e.target.value }))}
            />
          </Field>
          <Button className="mt-3 w-full" onClick={() => setCommentFor(null)}>
            {t("done")}
          </Button>
        </Modal>
      )}
    </>
  );
}

export function EditScoreModal({
  score,
  onClose,
  invalidateKey,
}: {
  score: ScoreRow;
  onClose: () => void;
  invalidateKey: unknown[];
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const [value, setValue] = useState(String(Number(score.score)));
  const [max, setMax] = useState(String(Number(score.maxScore)));
  const [comment, setComment] = useState(score.comment ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = () => {
    haptic("success");
    qc.invalidateQueries({ queryKey: invalidateKey });
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      api(`/api/scores/${score.id}`, { method: "PATCH", body: { score: Number(value), maxScore: Number(max), comment: comment.trim() || null } }),
    onSuccess: done,
  });
  const del = useMutation({ mutationFn: () => api(`/api/scores/${score.id}`, { method: "DELETE" }), onSuccess: done });
  const valid = Number(max) > 0 && Number(value) >= 0 && Number(value) <= Number(max);
  return (
    <Modal open onClose={onClose} title={`${score.studentName} — ${score.title}`}>
      <div className="space-y-3">
        <div className="text-sm text-muted">
          {categoryLabel(score.category, locale)} · {formatDate(score.scoreDate + "T00:00:00", locale)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("score")}>
            <Input type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label={t("maxScore")}>
            <Input type="number" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
          </Field>
        </div>
        {valid && <div className="text-sm font-semibold">= {scorePercent(Number(value), Number(max))}%</div>}
        <Field label={t("comment")}>
          <textarea className="input min-h-[80px]" value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} />
        </Field>
        {(save.isError || del.isError) && (
          <div className="text-sm text-status-overdue">{((save.error ?? del.error) as Error).message}</div>
        )}
        <div className="flex gap-2">
          {confirmDelete ? (
            <Button variant="danger" className="flex-1" disabled={del.isPending} onClick={() => del.mutate()}>
              {t("confirmDelete")}
            </Button>
          ) : (
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} /> {t("delete")}
            </Button>
          )}
          <Button className="flex-1" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {t("save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

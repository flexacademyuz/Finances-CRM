/**
 * Staff grammar manager (inside Learning): topics per level with a publish
 * toggle, and a topic editor for its build / test sentences. Validation is
 * the server's (400 { error: "invalid", problems }), shown in the modal.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, Pencil, Save, ChevronRight } from "lucide-react";
import type { GrammarAdminItem, GrammarAdminTopic, GrammarAdminTopicDetail } from "@shared/grammar/types";
import { levelLabel, levelRank } from "@shared/learning/types";
import { api, type ApiError } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { Button, Card, Empty, Field, Input, Modal, Segmented, Spinner } from "../../components/ui";

const L = {
  noTopics: { en: "No grammar topics yet. They are imported automatically on server start.", uz: "Grammatika mavzulari hali yo'q. Server ishga tushganda avtomatik import qilinadi." },
  draft: { en: "Draft", uz: "Qoralama" },
  published: { en: "Published", uz: "E'lon qilingan" },
  publish: { en: "Publish", uz: "E'lon qilish" },
  unpublish: { en: "Unpublish", uz: "E'londan olish" },
  publishConfirm: { en: "Publish this topic? Students of this level will see it right away.", uz: "Bu mavzu e'lon qilinsinmi? Shu darajadagi o'quvchilar uni darhol ko'radi." },
  unpublishConfirm: { en: "Hide this topic from students? Their progress is kept.", uz: "Bu mavzu o'quvchilardan yashirilsinmi? Natijalar saqlanadi." },
  build: { en: "Build sentences", uz: "Gap tuzish" },
  test: { en: "Test sentences", uz: "Test gaplari" },
  edited: { en: "edited", uz: "tahrirlangan" },
  hidden: { en: "hidden", uz: "yashirilgan" },
  back: { en: "All topics", uz: "Barcha mavzular" },
  rule: { en: "Explanation", uz: "Tushuntirish" },
  pattern: { en: "Pattern", uz: "Tuzilishi" },
  edit: { en: "Edit sentence", uz: "Gapni tahrirlash" },
  uz: { en: "Uzbek (prompt)", uz: "O'zbekcha (topshiriq)" },
  en: { en: "English (model answer)", uz: "Inglizcha (namuna javob)" },
  alts: { en: "Also accepted (one per line)", uz: "Yana qabul qilinadi (har qatorda bittadan)" },
  traps: { en: "Trap words (comma separated)", uz: "Tuzoq so'zlar (vergul bilan)" },
  status: { en: "Status", uz: "Holati" },
  active: { en: "Active", uz: "Faol" },
  save: { en: "Save", uz: "Saqlash" },
  cancel: { en: "Cancel", uz: "Bekor qilish" },
  problems: { en: "Please fix:", uz: "Tuzating:" },
  alsoOk: { en: "also", uz: "yana" },
  trapsShort: { en: "traps", uz: "tuzoq" },
} as const;
type Lk = keyof typeof L;

export function GrammarAdmin() {
  const { locale } = useI18n();
  const l = (k: Lk) => L[k][locale];
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const topics = useQuery({
    queryKey: ["learning", "grammar", "topics"],
    // Accept a bare array or { topics } (the contract only names the item type).
    queryFn: async () => {
      const r = await api<GrammarAdminTopic[] | { topics: GrammarAdminTopic[] }>("/api/learning/grammar/topics");
      return Array.isArray(r) ? r : r.topics ?? [];
    },
    retry: false,
  });
  const toggle = useMutation({
    mutationFn: (x: { id: string; status: "draft" | "published" }) => api(`/api/learning/grammar/topics/${x.id}`, { method: "PATCH", body: { status: x.status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["learning", "grammar"] }),
  });
  const setStatus = (t: GrammarAdminTopic) => {
    const next = t.status === "published" ? "draft" : "published";
    if (window.confirm(l(next === "published" ? "publishConfirm" : "unpublishConfirm"))) toggle.mutate({ id: t.id, status: next });
  };

  const byLevel = useMemo(() => {
    const m = new Map<string, GrammarAdminTopic[]>();
    for (const t of topics.data ?? []) m.set(t.level, [...(m.get(t.level) ?? []), t]);
    return [...m.entries()].sort((a, b) => levelRank(a[0]) - levelRank(b[0])).map(([lv, ts]) => [lv, ts.sort((a, b) => a.position - b.position)] as const);
  }, [topics.data]);

  if (topics.isLoading) return <Spinner />;
  if (topics.error) return <Empty>{(topics.error as ApiError).message}</Empty>;
  if (openId) return <TopicEditor id={openId} onBack={() => setOpenId(null)} onToggle={setStatus} busy={toggle.isPending} l={l} />;
  if (byLevel.length === 0) return <Empty>{l("noTopics")}</Empty>;

  return (
    <div className="space-y-5">
      {toggle.error && <div className="text-sm text-danger">{(toggle.error as ApiError).message}</div>}
      {byLevel.map(([lv, ts]) => (
        <div key={lv}>
          <div className="mb-2">
            <span className="badge-pill">{levelLabel(lv, locale) || lv}</span>
          </div>
          <Card className="divide-y divide-border !p-0">
            {ts.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpenId(t.id)}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-extrabold text-primary">{t.position}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-snug">{locale === "uz" ? t.title.uz || t.title.en : t.title.en}</span>
                    <span className="block text-xs text-muted">
                      {t.buildCount} {l("build").toLowerCase()} · {t.testCount} {l("test").toLowerCase()}
                      {t.editedCount > 0 && ` · ${t.editedCount} ${l("edited")}`}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </button>
                <PublishControl t={t} onToggle={setStatus} busy={toggle.isPending} l={l} />
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}

function PublishControl({ t, onToggle, busy, l }: { t: GrammarAdminTopic; onToggle: (t: GrammarAdminTopic) => void; busy: boolean; l: (k: Lk) => string }) {
  const pub = t.status === "published";
  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${pub ? "bg-status-paid/15 text-status-paid" : "bg-warning/15 text-warning"}`}>
        {pub ? l("published") : l("draft")}
      </span>
      <Button variant={pub ? "ghost" : "primary"} className="!px-3 !py-1.5" disabled={busy} onClick={() => onToggle(t)}>
        {pub ? <EyeOff size={14} /> : <Eye size={14} />} {pub ? l("unpublish") : l("publish")}
      </Button>
    </div>
  );
}

function TopicEditor({
  id,
  onBack,
  onToggle,
  busy,
  l,
}: {
  id: string;
  onBack: () => void;
  onToggle: (t: GrammarAdminTopic) => void;
  busy: boolean;
  l: (k: Lk) => string;
}) {
  const { locale } = useI18n();
  const q = useQuery({
    queryKey: ["learning", "grammar", "topic", id],
    queryFn: () => api<GrammarAdminTopicDetail>(`/api/learning/grammar/topics/${id}`),
    retry: false,
  });
  const [kind, setKind] = useState<"build" | "test">("build");
  const [editing, setEditing] = useState<GrammarAdminItem | null>(null);
  const backBtn = (
    <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
      <ArrowLeft size={16} /> {l("back")}
    </button>
  );
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data)
    return (
      <div className="space-y-3">
        {backBtn}
        <Empty>{(q.error as ApiError | null)?.message}</Empty>
      </div>
    );
  const d = q.data;
  const items = d.items.filter((x) => x.kind === kind).sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-4">
      {backBtn}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              {levelLabel(d.level, locale) || d.level} · #{d.position}
            </div>
            <div className="text-lg font-extrabold leading-snug">{d.title.en}</div>
            <div className="text-sm text-muted">{d.title.uz}</div>
          </div>
          <PublishControl t={d} onToggle={onToggle} busy={busy} l={l} />
        </div>
        <details className="rounded-xl bg-bg px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold">{l("rule")}</summary>
          <div className="mt-2 whitespace-pre-line">{d.explanation.uz}</div>
          <div className="mt-2">
            <span className="text-xs font-semibold uppercase text-muted">{l("pattern")}: </span>
            <b>{d.explanation.pattern}</b>
          </div>
          <ul className="mt-2 space-y-1">
            {d.explanation.examples.map((e, i) => (
              <li key={i}>
                <b>{e.en}</b> <span className="text-muted">· {e.uz}</span>
              </li>
            ))}
          </ul>
        </details>
      </Card>

      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "build", label: `${l("build")} (${d.items.filter((x) => x.kind === "build").length})` },
          { value: "test", label: `${l("test")} (${d.items.filter((x) => x.kind === "test").length})` },
        ]}
      />

      {items.length === 0 ? (
        <Empty />
      ) : (
        <Card className="divide-y divide-border !p-0">
          {items.map((it) => (
            <div key={it.id} className={`flex items-start gap-3 px-4 py-3 ${it.active ? "" : "opacity-55"}`}>
              <span className="w-6 shrink-0 pt-0.5 text-right text-xs font-bold text-muted">{it.position}</span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="break-words text-muted">{it.uz}</div>
                <div className="break-words font-bold">{it.en}</div>
                {it.alt.length > 0 && (
                  <div className="mt-0.5 break-words text-xs text-muted">
                    {l("alsoOk")}: {it.alt.join(" | ")}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {it.traps.map((tr, i) => (
                    <span key={i} className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold text-danger">
                      {tr}
                    </span>
                  ))}
                  {it.edited && <span className="badge-pill">{l("edited")}</span>}
                  {!it.active && <span className="chip">{l("hidden")}</span>}
                </div>
              </div>
              <button className="btn btn-ghost shrink-0 !px-2 !py-1.5" aria-label={l("edit")} onClick={() => setEditing(it)}>
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </Card>
      )}

      <ItemModal key={editing?.id ?? "none"} item={editing} topicId={id} onClose={() => setEditing(null)} l={l} />
    </div>
  );
}

function ItemModal({ item, topicId, onClose, l }: { item: GrammarAdminItem | null; topicId: string; onClose: () => void; l: (k: Lk) => string }) {
  const qc = useQueryClient();
  const init = useMemo(
    () => ({
      uz: item?.uz ?? "",
      en: item?.en ?? "",
      alt: (item?.alt ?? []).join("\n"),
      traps: (item?.traps ?? []).join(", "),
      active: item?.active ?? true,
    }),
    [item],
  );
  const [f, setF] = useState(init);
  const save = useMutation({
    mutationFn: () => {
      const alt = f.alt.split("\n").map((s) => s.trim()).filter(Boolean);
      const traps = f.traps.split(",").map((s) => s.trim()).filter(Boolean);
      // Only send what changed, so "edited" reflects real edits.
      const body: Record<string, unknown> = {};
      if (f.uz.trim() !== init.uz) body.uz = f.uz.trim();
      if (f.en.trim() !== init.en) body.en = f.en.trim();
      if (alt.join("\n") !== init.alt) body.alt = alt;
      if (traps.join(", ") !== init.traps) body.traps = traps;
      if (f.active !== init.active) body.active = f.active;
      if (Object.keys(body).length === 0) return Promise.resolve(null);
      return api<GrammarAdminItem>(`/api/learning/grammar/items/${item!.id}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["learning", "grammar", "topic", topicId] });
      void qc.invalidateQueries({ queryKey: ["learning", "grammar", "topics"] });
      onClose();
    },
  });
  const err = save.error as ApiError | null;
  const problems = Array.isArray(err?.data?.problems) ? (err!.data!.problems as unknown[]).map(String) : [];
  return (
    <Modal open={!!item} onClose={onClose} title={l("edit")}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={l("uz")}>
          <Input required value={f.uz} onChange={(e) => setF((s) => ({ ...s, uz: e.target.value }))} />
        </Field>
        <Field label={l("en")}>
          <Input required value={f.en} autoCapitalize="off" spellCheck={false} onChange={(e) => setF((s) => ({ ...s, en: e.target.value }))} />
        </Field>
        <Field label={l("alts")}>
          <textarea
            className="input min-h-[72px]"
            value={f.alt}
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setF((s) => ({ ...s, alt: e.target.value }))}
          />
        </Field>
        <Field label={l("traps")}>
          <Input value={f.traps} autoCapitalize="off" spellCheck={false} onChange={(e) => setF((s) => ({ ...s, traps: e.target.value }))} placeholder="are, am" />
        </Field>
        <div>
          <span className="label">{l("status")}</span>
          <Segmented
            value={f.active ? "on" : "off"}
            onChange={(v) => setF((s) => ({ ...s, active: v === "on" }))}
            options={[
              { value: "on", label: l("active") },
              { value: "off", label: l("hidden") },
            ]}
          />
        </div>
        {err &&
          (problems.length > 0 ? (
            <div className="rounded-xl bg-danger/5 p-3 text-sm text-danger">
              <div className="font-semibold">{l("problems")}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-sm text-danger">{err.message}</div>
          ))}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            {l("cancel")}
          </Button>
          <Button type="submit" className="flex-1" disabled={save.isPending}>
            <Save size={15} /> {l("save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

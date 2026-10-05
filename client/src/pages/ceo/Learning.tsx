/**
 * Learning management (manage_learning — CEO by default): learning overview,
 * the words students struggle with, stage-completion / daily-goal settings,
 * and the vocabulary manager (search, add, edit, move between stages, remove).
 * Dense by design — this is the staff side; students get the Mini App.
 */
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Users, Activity, Target, Plus, Pencil, Trash2, Save, Search, RotateCcw, Eye, EyeOff } from "lucide-react";
import { POS_LABELS, levelLabel, type VocabSettings } from "@shared/learning/types";
import { api, type ApiError } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { Button, Card, Field, Input, Select, StatTile, Modal, Spinner, Empty } from "../../components/ui";

const L = {
  title: { en: "Learning", uz: "Ta'lim" },
  subtitle: { en: "Vocabulary content, stages and how students are doing.", uz: "Lug'at, bosqichlar va o'quvchilar natijalari." },
  words: { en: "Words", uz: "So'zlar" },
  stages: { en: "stages", uz: "bosqich" },
  learners: { en: "Learners", uz: "O'rganuvchilar" },
  active7: { en: "Active (7 days)", uz: "Faol (7 kun)" },
  accuracy7: { en: "Accuracy (7 days)", uz: "Aniqlik (7 kun)" },
  answers: { en: "answers", uz: "javob" },
  hardest: { en: "Hardest words", uz: "Eng qiyin so'zlar" },
  hardestHint: { en: "Most-missed words across all students (at least 3 answers).", uz: "Barcha o'quvchilar eng ko'p xato qilgan so'zlar (kamida 3 javob)." },
  errorRate: { en: "error rate", uz: "xato" },
  settings: { en: "Settings", uz: "Sozlamalar" },
  completion: { en: "Stage complete at (% mastered)", uz: "Bosqich yakuni (% o'zlashtirilgan)" },
  dailyNew: { en: "New words per day", uz: "Kuniga yangi so'zlar" },
  dailyReview: { en: "Reviews per day (max)", uz: "Kuniga takrorlash (maks.)" },
  dailyEx: { en: "Exercises per set", uz: "To'plamdagi mashqlar" },
  save: { en: "Save", uz: "Saqlash" },
  saved: { en: "Saved", uz: "Saqlandi" },
  vocabulary: { en: "Vocabulary", uz: "Lug'at" },
  allStages: { en: "All stages", uz: "Barcha bosqichlar" },
  stage: { en: "Stage", uz: "Bosqich" },
  search: { en: "Search word or meaning", uz: "So'z yoki ma'no qidirish" },
  add: { en: "Add word", uz: "So'z qo'shish" },
  edit: { en: "Edit word", uz: "So'zni tahrirlash" },
  word: { en: "English word", uz: "Inglizcha so'z" },
  translation: { en: "Uzbek translation", uz: "O'zbekcha tarjima" },
  pos: { en: "Part of speech", uz: "So'z turkumi" },
  phonetic: { en: "Pronunciation (IPA)", uz: "Talaffuz (IPA)" },
  example: { en: "Example (wrap the word in {braces})", uz: "Misol (so'zni {qavs} ichiga oling)" },
  difficulty: { en: "Difficulty (1-5)", uz: "Qiyinlik (1-5)" },
  imageUrl: { en: "Image URL (optional)", uz: "Rasm havolasi (ixtiyoriy)" },
  note: { en: "Editor note", uz: "Izoh" },
  remove: { en: "Remove", uz: "O'chirish" },
  removeConfirm: { en: "Remove this word? Students won't see it; their history is kept.", uz: "Bu so'zni olib tashlaysizmi? O'quvchilar ko'rmaydi, tarix saqlanadi." },
  showRemoved: { en: "Show removed", uz: "O'chirilganlarni ko'rsatish" },
  restore: { en: "Restore", uz: "Qaytarish" },
  removed: { en: "removed", uz: "o'chirilgan" },
  edited: { en: "edited", uz: "tahrirlangan" },
  loadMore: { en: "Load more", uz: "Yana yuklash" },
  noContent: { en: "No vocabulary imported yet. It is imported automatically on server start.", uz: "Lug'at hali import qilinmagan. Server ishga tushganda avtomatik import qilinadi." },
  cancel: { en: "Cancel", uz: "Bekor qilish" },
  draft: { en: "Draft", uz: "Qoralama" },
  draftHint: {
    en: "Draft: students can't see this set yet. Review the words and translations, then publish.",
    uz: "Qoralama: o'quvchilar bu to'plamni hali ko'rmaydi. So'z va tarjimalarni tekshirib, e'lon qiling.",
  },
  publishedHint: {
    en: "Published: students in groups of this level study these words.",
    uz: "E'lon qilingan: shu darajadagi guruh o'quvchilari bu so'zlarni o'rganadi.",
  },
  publish: { en: "Publish to students", uz: "O'quvchilarga e'lon qilish" },
  unpublish: { en: "Unpublish", uz: "E'londan olish" },
  publishConfirm: {
    en: "Publish this set? Students in groups of this level will see it right away.",
    uz: "Bu to'plam e'lon qilinsinmi? Shu darajadagi guruh o'quvchilari uni darhol ko'radi.",
  },
  unpublishConfirm: {
    en: "Hide this set from students? Their progress is kept.",
    uz: "Bu to'plam o'quvchilardan yashirilsinmi? Ularning natijalari saqlanadi.",
  },
} as const;

type Resource = { id: string; title: string; level: string | null; status: string; words: number; stages: number; settings: VocabSettings };
type Unit = { id: string; position: number; title: string; words: number };
type Item = {
  id: string;
  word: string;
  translation: string;
  partOfSpeech: string | null;
  phonetic: string | null;
  example: string | null;
  difficulty: number;
  imageUrl: string | null;
  note: string | null;
  unitId: string;
  stage: number;
  position: number;
  active: boolean;
  editedFields: string[];
};
type Overview = {
  words: number;
  stages: number;
  learners: number;
  activeLearners7d: number;
  answers7d: number;
  accuracy7d: number | null;
  hardest: { id: string; word: string; translation: string; stage: number; attempts: number; errorRate: number }[];
};

export function LearningPage() {
  const { locale } = useI18n();
  const l = (k: keyof typeof L) => L[k][locale];
  const qc = useQueryClient();
  const resources = useQuery({ queryKey: ["learning", "resources"], queryFn: () => api<Resource[]>("/api/learning/resources") });
  const [selected, setSelected] = useState<string | null>(null);
  const r = resources.data?.find((x) => x.id === selected) ?? resources.data?.[0];
  const overview = useQuery({
    queryKey: ["learning", "overview", r?.id],
    queryFn: () => api<Overview>("/api/learning/overview", { query: { resource: r!.id } }),
    enabled: !!r,
    retry: false,
  });
  const publish = useMutation({
    mutationFn: (status: "published" | "draft") => api(`/api/learning/resources/${r!.id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["learning"] }),
  });

  if (resources.isLoading) return <Spinner />;
  if (!r) return <Empty>{l("noContent")}</Empty>;
  const o = overview.data;
  const draft = r.status !== "published";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{l("title")}</h1>
        <p className="text-sm text-muted">{l("subtitle")}</p>
      </div>

      {/* One tab per vocabulary set (course level). */}
      <div className="flex flex-wrap gap-2">
        {resources.data!.map((x) => (
          <button
            key={x.id}
            onClick={() => setSelected(x.id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
              x.id === r.id ? "bg-primary text-white shadow-brand" : "bg-surface text-muted ring-1 ring-border"
            }`}
          >
            {levelLabel(x.level, locale) || x.title}
            {x.status !== "published" && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${x.id === r.id ? "bg-white/25" : "bg-warning/15 text-warning"}`}>
                {l("draft")}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card className={`flex flex-wrap items-center gap-3 ${draft ? "ring-2 ring-warning/40" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{r.title}</div>
          <div className="text-sm text-muted">{draft ? l("draftHint") : l("publishedHint")}</div>
        </div>
        {draft ? (
          <Button onClick={() => window.confirm(l("publishConfirm")) && publish.mutate("published")} disabled={publish.isPending}>
            <Eye size={15} /> {l("publish")}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => window.confirm(l("unpublishConfirm")) && publish.mutate("draft")} disabled={publish.isPending}>
            <EyeOff size={15} /> {l("unpublish")}
          </Button>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile tint="blue" label={l("words")} value={r.words} sub={`${r.stages} ${l("stages")}`} icon={<BookOpen size={17} />} />
        <StatTile tint="violet" label={l("learners")} value={o?.learners ?? "—"} icon={<Users size={17} />} />
        <StatTile tint="green" label={l("active7")} value={o?.activeLearners7d ?? "—"} sub={o ? `${o.answers7d} ${l("answers")}` : undefined} icon={<Activity size={17} />} />
        <StatTile tint="amber" label={l("accuracy7")} value={o?.accuracy7d == null ? "—" : `${o.accuracy7d}%`} icon={<Target size={17} />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <VocabularyManager key={r.id} resource={r} l={l} />
        <div className="space-y-5">
          <SettingsCard key={r.id} resource={r} l={l} />
          <Card>
            <div className="font-bold">{l("hardest")}</div>
            <p className="mb-3 text-xs text-muted">{l("hardestHint")}</p>
            {!o || o.hardest.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {o.hardest.map((w) => (
                  <li key={w.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1 truncate">
                      <b>{w.word}</b> <span className="text-muted">· {w.translation}</span>
                    </span>
                    <span className="chip">
                      {l("stage")} {w.stage}
                    </span>
                    <span className="w-14 text-right font-bold text-danger">{w.errorRate}%</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

type Lf = (k: keyof typeof L) => string;

function SettingsCard({ resource, l }: { resource: Resource; l: Lf }) {
  const qc = useQueryClient();
  const [f, setF] = useState(resource.settings);
  useEffect(() => setF(resource.settings), [resource.settings]);
  const save = useMutation({
    mutationFn: () =>
      api(`/api/learning/resources/${resource.id}/settings`, {
        method: "PATCH",
        body: {
          completionThreshold: f.completionThreshold,
          dailyNewWords: f.dailyNewWords,
          dailyReviewWords: f.dailyReviewWords,
          dailyExercises: f.dailyExercises,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["learning", "resources"] }),
  });
  const num = (k: keyof VocabSettings, v: string) => setF((s) => ({ ...s, [k]: Number(v) }));
  return (
    <Card className="space-y-3">
      <div className="font-bold">{l("settings")}</div>
      <Field label={l("completion")}>
        <Input type="number" min={10} max={100} value={Math.round(f.completionThreshold * 100)} onChange={(e) => num("completionThreshold", String(Number(e.target.value) / 100))} />
      </Field>
      <div className="grid grid-cols-3 items-end gap-2">
        <Field label={l("dailyNew")}>
          <Input type="number" min={0} max={100} value={f.dailyNewWords} onChange={(e) => num("dailyNewWords", e.target.value)} />
        </Field>
        <Field label={l("dailyReview")}>
          <Input type="number" min={0} max={200} value={f.dailyReviewWords} onChange={(e) => num("dailyReviewWords", e.target.value)} />
        </Field>
        <Field label={l("dailyEx")}>
          <Input type="number" min={3} max={30} value={f.dailyExercises} onChange={(e) => num("dailyExercises", e.target.value)} />
        </Field>
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
        <Save size={15} /> {save.isSuccess ? l("saved") : l("save")}
      </Button>
      {save.error && <div className="text-sm text-danger">{(save.error as ApiError).message}</div>}
    </Card>
  );
}

function VocabularyManager({ resource, l }: { resource: Resource; l: Lf }) {
  const qc = useQueryClient();
  const units = useQuery({
    queryKey: ["learning", "units", resource.id],
    queryFn: () => api<{ units: Unit[] }>("/api/learning/units", { query: { resource: resource.id } }),
  });
  const [unit, setUnit] = useState("");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [inactive, setInactive] = useState(false);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(h);
  }, [q]);

  const items = useInfiniteQuery({
    queryKey: ["learning", "items", resource.id, unit, debounced, inactive],
    queryFn: ({ pageParam }) =>
      api<{ items: Item[]; nextAfter: number | null }>("/api/learning/items", {
        query: { resource: resource.id, unit, q: debounced, after: String(pageParam), limit: "100", inactive: inactive ? "1" : undefined },
      }),
    initialPageParam: 0,
    getNextPageParam: (p) => p.nextAfter ?? undefined,
  });
  const rows = items.data?.pages.flatMap((p) => p.items) ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["learning"] });
  };
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/learning/items/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const restore = useMutation({
    mutationFn: (id: string) => api(`/api/learning/items/${id}`, { method: "PATCH", body: { active: true } }),
    onSuccess: refresh,
  });

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto font-bold">{l("vocabulary")}</div>
        <Button onClick={() => setEditing("new")}>
          <Plus size={15} /> {l("add")}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
        <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="">{l("allStages")}</option>
          {units.data?.units.map((u) => (
            <option key={u.id} value={u.id}>
              {l("stage")} {u.position} ({u.words})
            </option>
          ))}
        </Select>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder={l("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> {l("showRemoved")}
        </label>
      </div>

      {items.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="hidden py-2 pr-2 sm:table-cell">#</th>
                <th className="py-2 pr-2">{l("word")}</th>
                <th className="py-2 pr-2">{l("translation")}</th>
                <th className="hidden py-2 pr-2 md:table-cell">{l("pos")}</th>
                <th className="hidden py-2 pr-2 sm:table-cell">{l("stage")}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((it) => (
                <tr key={it.id} className={it.active ? "" : "opacity-50"}>
                  <td className="hidden py-2 pr-2 text-muted sm:table-cell">{it.position}</td>
                  <td className="py-2 pr-2">
                    <div className="font-bold">{it.word}</div>
                    {it.phonetic && <div className="text-xs text-muted">{it.phonetic}</div>}
                  </td>
                  <td className="py-2 pr-2">
                    {it.translation}
                    {it.editedFields.length > 0 && <span className="ml-1.5 badge-pill">{l("edited")}</span>}
                    {!it.active && <span className="ml-1.5 chip">{l("removed")}</span>}
                    {it.note && <div className="text-xs text-warning">{it.note}</div>}
                  </td>
                  <td className="hidden py-2 pr-2 text-muted md:table-cell">{it.partOfSpeech ? POS_LABELS[it.partOfSpeech]?.en ?? it.partOfSpeech : ""}</td>
                  <td className="hidden py-2 pr-2 sm:table-cell">{it.stage}</td>
                  <td className="whitespace-nowrap py-2 text-right">
                    <button className="btn btn-ghost !px-2 !py-1.5" aria-label={l("edit")} onClick={() => setEditing(it)}>
                      <Pencil size={14} />
                    </button>
                    {it.active ? (
                      <button
                        className="btn btn-ghost ml-1 !px-2 !py-1.5 text-danger"
                        aria-label={l("remove")}
                        onClick={() => window.confirm(l("removeConfirm")) && remove.mutate(it.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : (
                      <button className="btn btn-ghost ml-1 !px-2 !py-1.5" aria-label={l("restore")} onClick={() => restore.mutate(it.id)}>
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.hasNextPage && (
        <Button variant="ghost" className="w-full" onClick={() => items.fetchNextPage()} disabled={items.isFetchingNextPage}>
          {l("loadMore")}
        </Button>
      )}

      <ItemModal
        key={editing === "new" ? "new" : editing?.id ?? "none"}
        open={editing != null}
        item={editing === "new" ? null : editing}
        units={units.data?.units ?? []}
        defaultUnit={unit}
        resourceId={resource.id}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
        l={l}
      />
    </Card>
  );
}

function ItemModal({
  open,
  item,
  units,
  defaultUnit,
  resourceId,
  onClose,
  onSaved,
  l,
}: {
  open: boolean;
  item: Item | null;
  units: Unit[];
  defaultUnit: string;
  resourceId: string;
  onClose: () => void;
  onSaved: () => void;
  l: Lf;
}) {
  const init = useMemo(
    () => ({
      word: item?.word ?? "",
      translation: item?.translation ?? "",
      partOfSpeech: item?.partOfSpeech ?? "",
      phonetic: item?.phonetic ?? "",
      example: item?.example ?? "",
      difficulty: item?.difficulty ?? 1,
      imageUrl: item?.imageUrl ?? "",
      note: item?.note ?? "",
      unitId: item?.unitId ?? defaultUnit ?? units[0]?.id ?? "",
    }),
    [item, defaultUnit, units],
  );
  const [f, setF] = useState(init);
  const set = (k: keyof typeof f, v: string | number) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...f,
        partOfSpeech: f.partOfSpeech || null,
        phonetic: f.phonetic || null,
        example: f.example || null,
        note: f.note || null,
        unitId: f.unitId || units[0]?.id,
      };
      if (!item) return api("/api/learning/items", { method: "POST", body: { ...body, resourceId } });
      // Only send what changed, so "edited" marks exactly the admin's changes.
      const diff: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body)) if (v !== (init as Record<string, unknown>)[k] && !(v === null && (init as Record<string, unknown>)[k] === "")) diff[k] = v;
      return api(`/api/learning/items/${item.id}`, { method: "PATCH", body: diff });
    },
    onSuccess: onSaved,
  });
  return (
    <Modal open={open} onClose={onClose} title={item ? l("edit") : l("add")}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label={l("word")}>
            <Input required value={f.word} onChange={(e) => set("word", e.target.value)} />
          </Field>
          <Field label={l("translation")}>
            <Input required value={f.translation} onChange={(e) => set("translation", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={l("stage")}>
            <Select value={f.unitId} onChange={(e) => set("unitId", e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {l("stage")} {u.position}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={l("pos")}>
            <Select value={f.partOfSpeech} onChange={(e) => set("partOfSpeech", e.target.value)}>
              <option value="">—</option>
              {Object.entries(POS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.en}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={l("phonetic")}>
            <Input value={f.phonetic} onChange={(e) => set("phonetic", e.target.value)} />
          </Field>
          <Field label={l("difficulty")}>
            <Input type="number" min={1} max={5} value={f.difficulty} onChange={(e) => set("difficulty", Number(e.target.value))} />
          </Field>
        </div>
        <Field label={l("example")}>
          <Input value={f.example} onChange={(e) => set("example", e.target.value)} placeholder="I {go} to school every day." />
        </Field>
        <Field label={l("imageUrl")}>
          <Input value={f.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://" />
        </Field>
        <Field label={l("note")}>
          <Input value={f.note} onChange={(e) => set("note", e.target.value)} />
        </Field>
        {save.error && <div className="text-sm text-danger">{(save.error as ApiError).message}</div>}
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

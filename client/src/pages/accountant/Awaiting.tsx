import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { StudentRow, Class } from "../../lib/types";
import { Card, Empty, Select, Spinner, StatusBadge } from "../../components/ui";

/** Dedicated Awaiting Payment / Overdue list, filter + sort (spec §3.3). */
export function AwaitingPage() {
  const { t } = useI18n();
  const [classId, setClassId] = useState("");
  const [sort, setSort] = useState<"status" | "name">("status");

  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });
  const list = useQuery({
    queryKey: ["awaiting", classId],
    queryFn: () => api<StudentRow[]>("/api/awaiting", { query: { classId: classId || undefined } }),
  });

  const order = { overdue: 0, awaiting_payment: 1, frozen: 2, not_due: 3, paid: 4 } as const;
  const rows = [...(list.data ?? [])].sort((a, b) =>
    sort === "name" ? a.fullName.localeCompare(b.fullName) : order[a.status] - order[b.status],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("awaiting")}</h1>

      <div className="flex gap-2">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">{t("classes")}</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as "status" | "name")}>
          <option value="status">{t("status")}</option>
          <option value="name">{t("student")}</option>
        </Select>
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : rows.length ? (
        <div className="space-y-2">
          {rows.map((s) => (
            <Card key={s.id} className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{s.fullName}</div>
                <div className="text-xs text-tg-hint">
                  {s.className} · {money(s.effectiveFee)}
                  {s.phone ? ` · ${s.phone}` : ""}
                </div>
              </div>
              <StatusBadge status={s.status} />
            </Card>
          ))}
        </div>
      ) : (
        <Empty />
      )}
    </div>
  );
}

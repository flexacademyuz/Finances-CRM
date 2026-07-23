import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Folder, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { money } from "../../lib/format";
import type { Class } from "../../lib/types";
import { Card, Empty, Spinner } from "../../components/ui";

/** Teacher's own classes as folders → each opens its roster + payment table. */
export function MyClasses() {
  const { t } = useI18n();
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api<Class[]>("/api/classes") });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("myClasses")}</h1>

      {classes.isLoading ? (
        <Spinner />
      ) : classes.data?.length ? (
        <div className="space-y-2">
          {classes.data.map((c) => (
            <Card key={c.id} className="flex items-center justify-between gap-2">
              <Link href={`/class/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Folder size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-tg-hint">
                    {money(c.defaultFee)}
                    {c.schedule ? ` · ${c.schedule}` : ""}
                  </span>
                </span>
              </Link>
              <ChevronRight size={18} className="shrink-0 text-tg-hint" />
            </Card>
          ))}
        </div>
      ) : (
        <Empty />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { getInitData } from "../lib/telegram";
import { Card } from "../components/ui";

/**
 * Temporary diagnostic screen: shows what THIS account's requests actually
 * return (status + row counts), so we can see why a role sees empty lists.
 * Uses raw fetch (not React Query) so errors are visible, not swallowed.
 */
type Probe = { path: string; status: number | string; count: number | string; note?: string };

export function DebugPage() {
  const [me, setMe] = useState<string>("(loading)");
  const [probes, setProbes] = useState<Probe[]>([]);
  const [initLen, setInitLen] = useState(0);

  useEffect(() => {
    const initData = getInitData();
    setInitLen(initData.length);
    const headers = { Authorization: `tma ${initData}`, "Content-Type": "application/json" };

    async function run() {
      // /api/me
      try {
        const r = await fetch("/api/me", { headers });
        const j = await r.json();
        setMe(`status ${r.status} · role=${j?.user?.role ?? "?"} · tgId=${j?.user?.telegramId ?? "?"} · name=${j?.user?.fullName ?? "?"}`);
      } catch (e) {
        setMe("ERROR " + (e as Error).message);
      }

      const paths = ["/api/students", "/api/classes", "/api/teachers", "/api/health"];
      const results: Probe[] = [];
      for (const p of paths) {
        try {
          const r = await fetch(p, { headers });
          let count: number | string = "-";
          let note = "";
          try {
            const j = await r.json();
            if (Array.isArray(j)) count = j.length;
            else note = JSON.stringify(j).slice(0, 120);
          } catch {
            note = "(non-JSON)";
          }
          results.push({ path: p, status: r.status, count, note });
        } catch (e) {
          results.push({ path: p, status: "FETCH_ERR", count: "-", note: (e as Error).message });
        }
      }
      setProbes(results);
    }
    run();
  }, []);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Diagnostics</h1>
      <Card>
        <div className="text-xs text-tg-hint">origin</div>
        <div className="break-all text-sm">{window.location.origin}</div>
        <div className="mt-2 text-xs text-tg-hint">initData length (0 = not opened via Telegram)</div>
        <div className="text-sm">{initLen}</div>
        <div className="mt-2 text-xs text-tg-hint">/api/me</div>
        <div className="break-all text-sm">{me}</div>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-tg-hint">
              <th className="py-1">endpoint</th>
              <th className="py-1">status</th>
              <th className="py-1">count</th>
            </tr>
          </thead>
          <tbody>
            {probes.map((p) => (
              <tr key={p.path} className="border-t border-border align-top">
                <td className="py-1 pr-2">{p.path.replace("/api/", "")}</td>
                <td className="py-1 pr-2">{p.status}</td>
                <td className="py-1">{p.count}{p.note ? ` ${p.note}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="text-xs text-tg-hint">
        Screenshot this on both the CEO and the Accountant accounts and send it over.
      </div>
    </div>
  );
}

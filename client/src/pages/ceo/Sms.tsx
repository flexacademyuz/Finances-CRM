import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Button, Card, Field, Input } from "../../components/ui";
import type { SmsOverview, SmsTestResult } from "../../lib/types";

/**
 * CEO-only SMS control panel: shows whether parent SMS is live / dry-run / off,
 * lets you send a test message to any phone (the "prove it works" tool), and
 * lists the recent outbound-SMS log. Everything here is diagnostic, so the copy
 * is intentionally plain English.
 */
export function SmsPage() {
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ["sms"],
    queryFn: () => api<SmsOverview>("/api/sms"),
  });

  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<SmsTestResult | null>(null);

  const test = useMutation({
    mutationFn: (live: boolean) =>
      api<SmsTestResult>("/api/sms/test", {
        method: "POST",
        body: { phone, text: text || undefined, live },
      }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["sms"] });
    },
  });

  const cfg = overview.data?.config;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Parent SMS</h1>

      {/* Status */}
      <Card className="space-y-3">
        <div className="text-sm font-semibold">Status</div>
        {overview.isLoading && <div className="text-sm text-tg-hint">Loading…</div>}
        {cfg && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <StatusPill label="Feature" on={cfg.enabled} onText="ON" offText="OFF" />
            <StatusPill
              label="Mode"
              on={!cfg.dryRun}
              onText="LIVE (real texts)"
              offText="Dry-run (log only)"
              invert
            />
            <StatusPill label="Credentials" on={cfg.configured} onText="Set" offText="Missing" />
            <div className="rounded-btn bg-bg px-3 py-2 ring-1 ring-border">
              <div className="text-xs text-tg-hint">Sender</div>
              <div className="font-semibold">{cfg.sender}</div>
            </div>
          </div>
        )}
        <p className="text-xs text-tg-hint">
          These are controlled by the Railway environment variables (SMS_ENABLED, SMS_DRY_RUN,
          ESKIZ_EMAIL, ESKIZ_PASSWORD, ESKIZ_SENDER). Change them there, then redeploy.
        </p>
      </Card>

      {/* Test send */}
      <Card className="space-y-3">
        <div className="text-sm font-semibold">Send a test</div>
        <p className="text-xs text-tg-hint">
          Send a test message to your own phone to prove delivery works — even before your own
          message templates are approved (it uses an Eskiz-approved test text by default).
        </p>
        <Field label="Phone number">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998 90 123 45 67"
            inputMode="tel"
          />
        </Field>
        <Field label="Message (optional)">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Bu Eskiz dan test"
          />
        </Field>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            disabled={phone.length < 3 || test.isPending}
            onClick={() => test.mutate(false)}
          >
            Preview (no send)
          </Button>
          <Button
            className="flex-1"
            disabled={phone.length < 3 || test.isPending}
            onClick={() => test.mutate(true)}
          >
            Send real test
          </Button>
        </div>

        {test.isError && (
          <div className="rounded-btn bg-status-overdue/10 px-3 py-2 text-sm text-status-overdue">
            {(test.error as Error).message}
          </div>
        )}
        {result && (
          <div
            className={`rounded-btn px-3 py-2 text-sm ring-1 ${
              result.ok
                ? "bg-status-paid/10 text-status-paid ring-status-paid/20"
                : "bg-status-overdue/10 text-status-overdue ring-status-overdue/20"
            }`}
          >
            {result.dryRun ? (
              <>Preview only — would send to <b>{result.to}</b>: “{result.message}”</>
            ) : result.ok ? (
              <>
                ✅ Sent to <b>{result.to}</b>
                {result.providerMessageId ? ` (id ${result.providerMessageId})` : ""}. Check the
                phone.
              </>
            ) : (
              <>❌ Failed to send to {result.to}: {result.error}</>
            )}
          </div>
        )}
      </Card>

      {/* Log */}
      <Card className="space-y-3">
        <div className="text-sm font-semibold">Recent messages</div>
        {overview.data && overview.data.messages.length === 0 && (
          <div className="text-sm text-tg-hint">No messages logged yet.</div>
        )}
        <div className="space-y-2">
          {(overview.data?.messages ?? []).map((m) => (
            <div key={m.id} className="rounded-btn bg-bg px-3 py-2 ring-1 ring-border">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{m.toPhone}</span>
                <span className={`text-xs font-semibold ${statusColor(m.status)}`}>{m.status}</span>
              </div>
              <div className="mt-0.5 text-xs text-tg-hint">
                {m.kind === "payment_receipt" ? "Receipt" : "Overdue"} ·{" "}
                {new Date(m.createdAt).toLocaleString()}
              </div>
              <div className="mt-1 text-sm">{m.body}</div>
              {m.error && <div className="mt-1 text-xs text-status-overdue">{m.error}</div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatusPill({
  label,
  on,
  onText,
  offText,
  invert,
}: {
  label: string;
  on: boolean;
  onText: string;
  offText: string;
  invert?: boolean;
}) {
  // `invert` = "on" is the cautious state (live sending), so colour it amber.
  const good = invert ? !on : on;
  return (
    <div className="rounded-btn bg-bg px-3 py-2 ring-1 ring-border">
      <div className="text-xs text-tg-hint">{label}</div>
      <div className={`font-semibold ${good ? "text-status-paid" : "text-status-awaiting"}`}>
        {on ? onText : offText}
      </div>
    </div>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "sent":
      return "text-status-paid";
    case "failed":
      return "text-status-overdue";
    case "skipped":
      return "text-tg-hint";
    default:
      return "text-status-awaiting";
  }
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { clearToken } from "../lib/auth";
import { isTelegram } from "../lib/telegram";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import type { PaymentGroupStatus } from "../lib/types";
import { Button, Card, Field, Input, Spinner } from "../components/ui";

/**
 * Self-service account recovery: set a login username + password so you can
 * re-link a new Telegram account to this profile if you ever lose the old one.
 */
export function AccountPage() {
  const { t } = useI18n();
  const { user } = useSession();
  const qc = useQueryClient();
  const [username, setUsername] = useState(user.loginUsername ?? "");
  const [password, setPassword] = useState("");

  const save = useMutation({
    mutationFn: () => api("/api/me/credentials", { method: "PATCH", body: { username, password } }),
    onSuccess: () => { setPassword(""); qc.invalidateQueries({ queryKey: ["me"] }); },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("myAccount")}</h1>
      <Card className="space-y-3">
        <div className="text-sm">
          <span className="font-semibold">{user.fullName}</span>
          <span className="text-tg-hint"> · {t(user.role)}</span>
        </div>
        <p className="text-sm text-tg-hint">{t("accountRecoveryNote")}</p>
        <Field label={t("username")}>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
        </Field>
        <Field label={t("password")}>
          <Input
            type="password"
            value={password}
            placeholder="••••••"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {save.isError && <div className="text-sm text-status-overdue">{(save.error as Error).message}</div>}
        {save.isSuccess && <div className="text-sm text-status-paid">{t("credentialsSaved")}</div>}
        <Button
          className="w-full"
          disabled={username.length < 3 || password.length < 6 || save.isPending}
          onClick={() => save.mutate()}
        >
          {t("saveCredentials")}
        </Button>
      </Card>

      {user.role === "ceo" && <PaymentGroupCard />}

      {/* Log out only applies to a browser session (Telegram uses initData). */}
      {!isTelegram() && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => { clearToken(); window.location.reload(); }}
        >
          {t("logOut")}
        </Button>
      )}
    </div>
  );
}

/** CEO-only: shows which Telegram group receives payment notifications. */
function PaymentGroupCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["payment-group"],
    queryFn: () => api<PaymentGroupStatus>("/api/settings/payment-group"),
  });

  const unlink = useMutation({
    mutationFn: () => api("/api/settings/payment-group/unlink", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-group"] }),
  });

  return (
    <Card className="space-y-3">
      <div className="text-sm font-semibold">📣 {t("paymentNotifications")}</div>
      {status.isLoading ? (
        <Spinner />
      ) : status.data?.linked ? (
        <>
          <div className="rounded-lg bg-status-paid/10 px-3 py-2 text-sm">
            <div className="text-xs text-tg-hint">{t("groupLinked")}</div>
            <div className="font-semibold">
              {status.data.title ?? `chat ${status.data.chatId}`}
            </div>
          </div>
          <p className="text-xs text-tg-hint">{t("linkedGroupHint")}</p>
          {unlink.isError && (
            <div className="text-sm text-status-overdue">{(unlink.error as Error).message}</div>
          )}
          <Button
            variant="ghost"
            className="w-full text-status-overdue"
            disabled={unlink.isPending}
            onClick={() => unlink.mutate()}
          >
            {t("unlinkGroup")}
          </Button>
        </>
      ) : (
        <>
          <div className="text-sm text-tg-hint">{t("groupNotLinked")}</div>
          <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-tg-text">
            {t("linkGroupHint")}
          </p>
        </>
      )}
    </Card>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { clearToken } from "../lib/auth";
import { isTelegram } from "../lib/telegram";
import { useI18n } from "../lib/i18n";
import { useSession } from "../lib/session";
import { Button, Card, Field, Input } from "../components/ui";

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

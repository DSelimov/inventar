import type { Metadata } from "next";
import { KeyRound, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Field, Input } from "@/components/ui/fields";
import { Form } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { changeOwnPassword, logoutEverywhere, setEmailDigest } from "@/lib/actions/members";
import { cancelTotpSetup, confirmTotpSetup, disableTotp, hideRecoveryCodes, readRecoveryCodesOnce, regenerateRecoveryCodes, startTotpSetup, updateName } from "@/lib/actions/profile";
import { countSessions, findMembership, requireContext } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { qrPngDataUrl } from "@/lib/pdf";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { otpauthUrl } from "@/lib/totp";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Профил" };

export default async function ProfilePage() {
  const ctx = await requireContext();
  const [sessionCount, membership, recoveryCodes] = await Promise.all([countSessions(ctx.user.id), findMembership(ctx.user.id, ctx.org.id), readRecoveryCodesOnce()]);
  const u = ctx.user;
  const pendingSecret = !u.totpEnabledAt && u.totpPendingEnc ? decrypt(u.totpPendingEnc) : null;
  const qr = pendingSecret ? await qrPngDataUrl(otpauthUrl(pendingSecret, u.email)) : null;
  const recoveryLeft = u.totpRecoveryHashes?.length ?? 0;

  return (
    <>
      <PageHeader title="Профил" description={`${u.email} · ${ROLE_LABELS[ctx.role]} в ${ctx.org.name}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Лични данни" />
            <CardBody>
              <Form action={updateName} resetOnSuccess={false} className="flex flex-wrap items-end gap-3">
                <Field label="Име" className="min-w-52 flex-1">
                  <Input name="name" defaultValue={u.name} required maxLength={200} />
                </Field>
                <SubmitButton variant="secondary">Запази</SubmitButton>
              </Form>
              <p className="mt-2 text-xs text-muted">Имейлът ({u.email}) е потребителското име и не се сменя оттук.</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Парола" description="След смяна всички други устройства излизат от акаунта." />
            <CardBody>
              <Form action={changeOwnPassword} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Field label="Текуща парола">
                  <Input name="currentPassword" type="password" required autoComplete="current-password" />
                </Field>
                <Field label="Нова парола">
                  <Input name="password" type="password" minLength={8} required autoComplete="new-password" />
                </Field>
                <SubmitButton variant="secondary">Смени</SubmitButton>
              </Form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Сесии" />
            <CardBody className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-muted">
                Активни сесии: <strong className="text-text">{sessionCount}</strong> (браузъри и устройства, в които сте влезли)
              </span>
              <Form action={logoutEverywhere}>
                <ConfirmButton variant="secondary" size="sm" message="Да изляза ли от всички устройства, включително това?">
                  <LogOut className="h-4 w-4" />
                  Изход от всички устройства
                </ConfirmButton>
              </Form>
            </CardBody>
          </Card>

          {can(ctx.role, "delete") && (
            <Card>
              <CardHeader title="Имейли" />
              <CardBody>
                <Form action={setEmailDigest} resetOnSuccess={false} className="flex flex-wrap items-center justify-between gap-3">
                  <Checkbox name="emailDigest" defaultChecked={membership?.emailDigest ?? true} label="Дневен имейл с известия (ниска наличност, закъснели пратки, изтичащи партиди)" />
                  <SubmitButton variant="secondary" size="sm">
                    Запази
                  </SubmitButton>
                </Form>
              </CardBody>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Двуфакторна защита
                {u.totpEnabledAt ? <Badge tone="success">Включена</Badge> : <Badge>Изключена</Badge>}
              </span>
            }
            description="При вход освен паролата се иска и код от приложение на телефона (Google Authenticator, Microsoft Authenticator, 1Password…)."
          />
          <CardBody className="space-y-4">
            {recoveryCodes && (
              <div className="rounded-xl border border-warning/40 bg-warning-soft p-4">
                <p className="text-sm font-medium text-warning">Кодове за възстановяване — запишете ги сега, няма да се покажат отново.</p>
                <p className="mt-1 text-xs text-warning">Всеки код влиза веднъж, ако нямате достъп до телефона.</p>
                <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm" data-recovery-codes>
                  {recoveryCodes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <Form action={hideRecoveryCodes} className="mt-3">
                  <Button type="submit" size="sm" variant="secondary">
                    Записах ги
                  </Button>
                </Form>
              </div>
            )}

            {u.totpEnabledAt ? (
              <>
                <p className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  Включена на {formatDate(u.totpEnabledAt)}. Неизползвани кодове за възстановяване: <strong>{recoveryLeft}</strong>
                </p>
                <Form action={regenerateRecoveryCodes} className="flex flex-wrap items-end gap-2">
                  <Field label="Парола" className="min-w-40 flex-1">
                    <Input name="password" type="password" required autoComplete="current-password" />
                  </Field>
                  <Field label="Код от приложението" className="min-w-40 flex-1">
                    <Input name="code" inputMode="numeric" required autoComplete="one-time-code" />
                  </Field>
                  <SubmitButton variant="secondary">
                    <KeyRound className="h-4 w-4" />
                    Нови кодове
                  </SubmitButton>
                </Form>
                <Form action={disableTotp} className="space-y-2 border-t border-line pt-4">
                  <p className="text-sm font-medium">Изключване</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input name="password" type="password" required placeholder="Парола" autoComplete="current-password" aria-label="Парола" />
                    <Input name="code" inputMode="numeric" required placeholder="Код от приложението" autoComplete="one-time-code" aria-label="Код" />
                  </div>
                  <ConfirmButton variant="danger" size="sm" message="Да изключа ли двуфакторната защита?">
                    <ShieldOff className="h-4 w-4" />
                    Изключи
                  </ConfirmButton>
                </Form>
              </>
            ) : pendingSecret && qr ? (
              <>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Сканирайте QR кода с приложението за удостоверяване.</li>
                  <li>Въведете 6-цифрения код, който приложението показва.</li>
                </ol>
                <div className="flex flex-wrap items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URL, генериран на сървъра */}
                  <img src={qr} alt="QR код за приложението за удостоверяване" width={180} height={180} className="rounded-lg border border-line" />
                  <div className="min-w-0 flex-1 text-xs text-muted">
                    Или въведете ключа ръчно:
                    <div className="mt-1 break-all font-mono text-sm text-text" data-totp-secret>
                      {pendingSecret.replace(/(.{4})/g, "$1 ").trim()}
                    </div>
                  </div>
                </div>
                <Form action={confirmTotpSetup} className="flex flex-wrap items-end gap-2">
                  <Field label="Код" className="w-40">
                    <Input name="code" inputMode="numeric" pattern="[0-9 ]{6,7}" required autoComplete="one-time-code" placeholder="123456" />
                  </Field>
                  <SubmitButton>
                    <ShieldCheck className="h-4 w-4" />
                    Включи
                  </SubmitButton>
                </Form>
                <Form action={cancelTotpSetup}>
                  <Button type="submit" variant="ghost" size="sm">
                    Откажи
                  </Button>
                </Form>
              </>
            ) : (
              <Form action={startTotpSetup}>
                <SubmitButton>
                  <ShieldCheck className="h-4 w-4" />
                  Настрой двуфакторна защита
                </SubmitButton>
              </Form>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

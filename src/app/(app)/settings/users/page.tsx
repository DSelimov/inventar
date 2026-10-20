import type { Metadata } from "next";
import { Send, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table } from "@/components/ui/table";
import { ROLES } from "@/db/control-schema";
import { addMember, changeRole, removeMember, resendInvite } from "@/lib/actions/members";
import { requireContext } from "@/lib/auth";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";
import { listMembers } from "@/lib/members";
import { mailConfigured } from "@/lib/mail";
import { isPendingInvite } from "@/lib/password-tokens";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Потребители" };

export default async function UsersPage() {
  const ctx = await requireContext("manage");
  const members = await listMembers(ctx.org.id);
  const assignable = ROLES.filter((r) => r !== "owner" || ctx.role === "owner");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Членове" description={`${members.length} потребители с достъп до ${ctx.org.name}.`} />
        <Table>
          <thead>
            <tr>
              <th>Потребител</th>
              <th>Роля</th>
              <th>Добавен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="flex items-center gap-2 font-medium">
                    {m.user.name}
                    {isPendingInvite(m.user) && <Badge tone="warning">Поканен</Badge>}
                  </div>
                  <div className="text-xs text-muted">{m.user.email}</div>
                </td>
                <td>
                  {m.userId === ctx.user.id || (m.role === "owner" && ctx.role !== "owner") ? (
                    <Badge tone="accent">{ROLE_LABELS[m.role]}</Badge>
                  ) : (
                    <form action={changeRole.bind(null, m.id)} className="flex items-center gap-2">
                      <Select name="role" defaultValue={m.role} className="w-auto">
                        {assignable.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="ghost" size="sm">
                        Запази
                      </Button>
                    </form>
                  )}
                </td>
                <td className="text-muted">{formatDate(m.createdAt)}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                  {isPendingInvite(m.user) && (
                    <form action={resendInvite.bind(null, m.id)}>
                      <SubmitButton variant="ghost" size="sm" title="Изпрати поканата отново" aria-label="Изпрати поканата отново">
                        <Send className="h-4 w-4" />
                      </SubmitButton>
                    </form>
                  )}
                  {m.userId !== ctx.user.id && m.role !== "owner" && (
                    <form action={removeMember.bind(null, m.id)}>
                      <ConfirmButton variant="ghost" size="sm" message={`Да премахна ли ${m.user.name} от организацията?`} aria-label="Премахни">
                        <X className="h-4 w-4" />
                      </ConfirmButton>
                    </form>
                  )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Добави потребител" description="Новите потребители получават покана по имейл с линк за парола. Ако имейлът вече има акаунт, той просто получава достъп." />
          <CardBody>
            <form action={addMember} className="space-y-3">
              <Field label="Име">
                <Input name="name" required />
              </Field>
              <Field label="Имейл">
                <Input name="email" type="email" required />
              </Field>
              <Field label="Начална парола (по избор)" hint={mailConfigured() ? "Оставете празно, за да изпратим покана. Иначе мин. 8 знака — съобщете я лично." : "SMTP не е настроен: поканата се записва само в лога на сървъра. Може да зададете парола (мин. 8 знака)."}>
                <Input name="password" type="password" minLength={8} autoComplete="new-password" />
              </Field>
              <Field label="Роля">
                <Select name="role" defaultValue="staff">
                  {assignable.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton className="w-full">
                <UserPlus className="h-4 w-4" />
                Добави
              </SubmitButton>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Роли" />
          <CardBody>
            <dl className="space-y-2 text-sm">
              {ROLES.map((r) => (
                <div key={r}>
                  <dt className="font-medium">{ROLE_LABELS[r]}</dt>
                  <dd className="text-muted">{ROLE_DESCRIPTIONS[r]}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

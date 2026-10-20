import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html: string };

const g = globalThis as unknown as { __mailer?: Transporter | null };

/** SMTP транспорт от env; null ако SMTP_HOST не е зададен (dev: писмата се печатат в конзолата). */
function transporter(): Transporter | null {
  if (g.__mailer !== undefined) return g.__mailer;
  const host = process.env.SMTP_HOST;
  if (!host) return (g.__mailer = null);
  const port = Number(process.env.SMTP_PORT || 587);
  g.__mailer = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
  });
  return g.__mailer;
}

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

/** Изпраща писмо. Без SMTP го печата в конзолата, за да работи приложението и в dev. */
export async function sendMail(mail: Mail) {
  const t = transporter();
  if (!t) {
    console.log(`\n[mail] SMTP не е настроен — писмото не е изпратено.\nДо: ${mail.to}\nТема: ${mail.subject}\n\n${mail.text}\n`);
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, ...mail });
}

// ----------------------------------------------------------------- templates
function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Писмо с един бутон: текстова и проста HTML версия. */
function layout(o: { subject: string; to: string; brand: string; lines: string[]; button: string; url: string; footer: string }): Mail {
  const text = [...o.lines, "", `${o.button}: ${o.url}`, "", o.footer, "", `— ${o.brand}`].join("\n");
  const html = `<!doctype html><html lang="bg"><body style="margin:0;background:#f4f5f7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111827">
<div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
<div style="font-weight:600;font-size:16px;margin-bottom:20px">${escape(o.brand)}</div>
${o.lines.map((l) => `<p style="margin:0 0 12px;line-height:1.5">${escape(l)}</p>`).join("")}
<p style="margin:24px 0"><a href="${escape(o.url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:500">${escape(o.button)}</a></p>
<p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:1.5">Ако бутонът не работи, отворете: <br><a href="${escape(o.url)}" style="color:#4f46e5;word-break:break-all">${escape(o.url)}</a></p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">${escape(o.footer)}</p>
</div></body></html>`;
  return { to: o.to, subject: o.subject, text, html };
}

const brandOf = (orgName?: string) => (orgName ? `${orgName} · Инвентар` : "Инвентар");

export function passwordResetMail(o: { to: string; name: string; url: string; orgName?: string }) {
  return layout({
    to: o.to,
    subject: "Нова парола за Инвентар",
    brand: brandOf(o.orgName),
    lines: [`Здравейте, ${o.name}!`, "Получихме заявка за нова парола за вашия акаунт. Линкът е валиден 1 час и може да се използва веднъж."],
    button: "Задайте нова парола",
    url: o.url,
    footer: "Ако не сте заявили нова парола, игнорирайте това писмо — паролата ви остава същата.",
  });
}

export function invitationMail(o: { to: string; name: string; url: string; orgName: string; invitedBy: string }) {
  return layout({
    to: o.to,
    subject: `Покана за ${o.orgName} в Инвентар`,
    brand: brandOf(o.orgName),
    lines: [`Здравейте, ${o.name}!`, `${o.invitedBy} ви покани в организация „${o.orgName}“. Задайте парола, за да влезете. Линкът е валиден 7 дни.`],
    button: "Приемете поканата",
    url: o.url,
    footer: "Ако не очаквате тази покана, игнорирайте писмото.",
  });
}

export function accessGrantedMail(o: { to: string; name: string; url: string; orgName: string; invitedBy: string }) {
  return layout({
    to: o.to,
    subject: `Достъп до ${o.orgName} в Инвентар`,
    brand: brandOf(o.orgName),
    lines: [`Здравейте, ${o.name}!`, `${o.invitedBy} ви даде достъп до организация „${o.orgName}“. Влезте със съществуващия си имейл и парола.`],
    button: "Вход",
    url: o.url,
    footer: "Ако не очаквате това писмо, свържете се с администратора на организацията.",
  });
}

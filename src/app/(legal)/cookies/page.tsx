import type { Metadata } from "next";

export const metadata: Metadata = { title: "Бисквитки" };

export default function CookiesPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Бисквитки</h1>
      <p>„Инвентар“ използва само строго необходими бисквитки — без тях входът и формите не работят. Не използваме рекламни или аналитични бисквитки и проследяване.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <code>inv_session</code> — сесия на влезлия потребител (httpOnly, до изхода или изтичането).
        </li>
        <li>
          <code>inv_2fa</code> — временен знак при вход с двуфакторна защита (минути).
        </li>
        <li>
          <code>inv_flash</code> — съобщение за успех след действие (до 60 секунди).
        </li>
      </ul>
      <p>Тъй като бисквитките са необходими за услугата, не се изисква съгласие; можете да ги изтриете от браузъра, но тогава ще трябва да влезете отново.</p>
    </>
  );
}

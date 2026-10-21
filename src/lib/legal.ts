/**
 * Данни на оператора на платформата за правните страници (Общи условия, поверителност, договор за
 * обработване, бисквитки). Докато не са попълнени в env, страниците показват [ПОЛЕ] и надпис „чернова“.
 * Текстовете са шаблон — преди пускане ги прегледайте с юрист.
 */
export const LEGAL_VERSION = "2026-10-21";

const v = (key: string, placeholder: string) => process.env[key]?.trim() || `[${placeholder}]`;

export const OPERATOR = {
  name: v("LEGAL_COMPANY_NAME", "ИМЕ НА ФИРМАТА"),
  eik: v("LEGAL_COMPANY_EIK", "ЕИК"),
  address: v("LEGAL_COMPANY_ADDRESS", "АДРЕС НА УПРАВЛЕНИЕ"),
  email: v("LEGAL_CONTACT_EMAIL", "ИМЕЙЛ ЗА КОНТАКТ"),
  dpoEmail: v("LEGAL_DPO_EMAIL", "ИМЕЙЛ ЗА ЛИЧНИ ДАННИ"),
  hosting: v("LEGAL_HOSTING", "ХОСТИНГ ДОСТАВЧИК И ДЪРЖАВА В ЕС"),
};

/** true, докато някое поле е празно — страниците показват предупреждение. */
export const LEGAL_DRAFT = Object.values(OPERATOR).some((x) => x.startsWith("["));

export const DELETION_GRACE_DAYS = 30;

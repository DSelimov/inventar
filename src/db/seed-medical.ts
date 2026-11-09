/* Демо склад за медицински стоки.  pnpm db:seed:medical
   Създава (или пресъздава) организация medical (medical.<APP_DOMAIN>, база inv_medical) с ~110 артикула
   в 13 групи, три локации, партиди със срок на годност, серийни номера, партньори, поръчки и движения.
   Не пипа останалите организации. Вход със съществуващия потребител: admin@demo.bg / demo1234. */
import { addDays, format, subDays } from "date-fns";
import { and, desc, eq, gt } from "drizzle-orm";
import { applyMovement } from "@/lib/stock";
import { nextNumber } from "@/lib/numbering";
import { controlDb } from "./control";
import { memberships, organizations, plans, users } from "./control-schema";
import { closeTenantPools, dropTenantDatabase, getTenantDb, provisionTenant, tenantDbName, type TenantDb } from "./tenant";
import * as t from "./tenant-schema";

const SUBDOMAIN = "medical";
const ORG_NAME = "МедСнаб Дистрибуция ЕООД";
const today = new Date();
const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** EAN-13 с български префикс 380 и коректна контролна цифра. */
function ean13(n: number) {
  const base = `380${String(4400000 + n).padStart(9, "0")}`;
  const sum = [...base].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
}

type Loc = "main" | "pharmacy" | "cold";
type Def = {
  sku: string;
  name: string;
  unit?: string;
  cost: number;
  price: number;
  min: number;
  /** Начална наличност в основната локация на групата. */
  qty: number;
  tracking?: "lot" | "serial";
  /** Дни до изтичане на началната партида (по подразбиране 400–700). */
  expiryDays?: number;
  /** Допълнително количество в аптеката. */
  pharmacy?: number;
  decimals?: number;
  fields?: Record<string, string>;
};
type Group = { key: string; name: string; color: string; description: string; loc: Loc; prefix: string; items: Def[] };

const GROUPS: Group[] = [
  {
    key: "rx",
    name: "Лекарства по лекарско предписание",
    color: "#c0392b",
    description: "Rx продукти; отпускат се само срещу рецепта.",
    loc: "main",
    prefix: "RX",
    items: [
      { sku: "AMOX-500", name: "Амоксицилин 500 мг капсули x16", unit: "оп.", cost: 4.1, price: 7.9, min: 30, qty: 120, tracking: "lot", fields: { "Активно вещество": "Амоксицилин", "Лекарствена форма": "Капсули" } },
      { sku: "AZIT-500", name: "Азитромицин 500 мг таблетки x3", unit: "оп.", cost: 5.6, price: 10.5, min: 20, qty: 64, tracking: "lot", fields: { "Активно вещество": "Азитромицин", "Лекарствена форма": "Таблетки" } },
      { sku: "CEFU-500", name: "Цефуроксим 500 мг таблетки x14", unit: "оп.", cost: 8.2, price: 14.9, min: 15, qty: 40, tracking: "lot", fields: { "Активно вещество": "Цефуроксим", "Лекарствена форма": "Таблетки" } },
      { sku: "META-850", name: "Метформин 850 мг таблетки x30", unit: "оп.", cost: 2.3, price: 4.6, min: 40, qty: 150, tracking: "lot", fields: { "Активно вещество": "Метформин", "Лекарствена форма": "Таблетки" } },
      { sku: "AMLO-5", name: "Амлодипин 5 мг таблетки x30", unit: "оп.", cost: 1.9, price: 3.8, min: 40, qty: 130, tracking: "lot", fields: { "Активно вещество": "Амлодипин", "Лекарствена форма": "Таблетки" } },
      { sku: "BISO-5", name: "Бизопролол 5 мг таблетки x30", unit: "оп.", cost: 2.4, price: 4.9, min: 30, qty: 90, tracking: "lot", fields: { "Активно вещество": "Бизопролол", "Лекарствена форма": "Таблетки" } },
      { sku: "ATOR-20", name: "Аторвастатин 20 мг таблетки x30", unit: "оп.", cost: 3.1, price: 6.4, min: 30, qty: 18, tracking: "lot", fields: { "Активно вещество": "Аторвастатин", "Лекарствена форма": "Таблетки" } },
      { sku: "OMEP-20", name: "Омепразол 20 мг капсули x28", unit: "оп.", cost: 2.7, price: 5.5, min: 30, qty: 110, tracking: "lot", fields: { "Активно вещество": "Омепразол", "Лекарствена форма": "Капсули" } },
      { sku: "PRED-5", name: "Преднизолон 5 мг таблетки x20", unit: "оп.", cost: 1.6, price: 3.2, min: 15, qty: 45, tracking: "lot", expiryDays: 25, fields: { "Активно вещество": "Преднизолон", "Лекарствена форма": "Таблетки" } },
      { sku: "DICL-AMP", name: "Диклофенак 75 мг/3 мл ампули x5", unit: "оп.", cost: 3.4, price: 6.8, min: 20, qty: 60, tracking: "lot", fields: { "Активно вещество": "Диклофенак", "Лекарствена форма": "Инжекционен разтвор" } },
      { sku: "CEFT-1G", name: "Цефтриаксон 1 г прах за инжекционен разтвор", unit: "фл.", cost: 1.8, price: 3.9, min: 50, qty: 200, tracking: "lot", fields: { "Активно вещество": "Цефтриаксон", "Лекарствена форма": "Инжекционен разтвор" } },
      { sku: "LEVO-50", name: "Левотироксин 50 мкг таблетки x50", unit: "оп.", cost: 2.2, price: 4.5, min: 20, qty: 75, tracking: "lot", fields: { "Активно вещество": "Левотироксин", "Лекарствена форма": "Таблетки" } },
    ],
  },
  {
    key: "otc",
    name: "Лекарства без рецепта",
    color: "#e67e22",
    description: "OTC продукти за аптеката и болничните отделения.",
    loc: "main",
    prefix: "OTC",
    items: [
      { sku: "PARA-500", name: "Парацетамол 500 мг таблетки x20", unit: "оп.", cost: 0.9, price: 2.2, min: 60, qty: 300, pharmacy: 80, tracking: "lot", fields: { "Активно вещество": "Парацетамол", "Лекарствена форма": "Таблетки" } },
      { sku: "IBU-400", name: "Ибупрофен 400 мг таблетки x20", unit: "оп.", cost: 1.4, price: 3.4, min: 50, qty: 240, pharmacy: 60, tracking: "lot", fields: { "Активно вещество": "Ибупрофен", "Лекарствена форма": "Таблетки" } },
      { sku: "ASA-100", name: "Ацетилсалицилова киселина 100 мг x30", unit: "оп.", cost: 1.1, price: 2.9, min: 40, qty: 160, pharmacy: 40, tracking: "lot", fields: { "Активно вещество": "Ацетилсалицилова киселина", "Лекарствена форма": "Таблетки" } },
      { sku: "METAM-500", name: "Метамизол 500 мг таблетки x20", unit: "оп.", cost: 0.8, price: 2.1, min: 40, qty: 180, tracking: "lot", fields: { "Активно вещество": "Метамизол", "Лекарствена форма": "Таблетки" } },
      { sku: "LORA-10", name: "Лоратадин 10 мг таблетки x10", unit: "оп.", cost: 1.3, price: 3.6, min: 30, qty: 95, pharmacy: 25, tracking: "lot", fields: { "Активно вещество": "Лоратадин", "Лекарствена форма": "Таблетки" } },
      { sku: "LOPE-2", name: "Лоперамид 2 мг капсули x10", unit: "оп.", cost: 1.2, price: 3.1, min: 20, qty: 70, tracking: "lot", fields: { "Активно вещество": "Лоперамид", "Лекарствена форма": "Капсули" } },
      { sku: "AMBR-SIR", name: "Амброксол сироп 15 мг/5 мл 100 мл", unit: "бр.", cost: 2.6, price: 5.9, min: 20, qty: 55, pharmacy: 15, tracking: "lot", expiryDays: 40, fields: { "Активно вещество": "Амброксол", "Лекарствена форма": "Сироп" } },
      { sku: "XYLO-SPR", name: "Ксилометазолин спрей за нос 0,1 % 10 мл", unit: "бр.", cost: 1.9, price: 4.4, min: 25, qty: 80, pharmacy: 20, tracking: "lot", fields: { "Активно вещество": "Ксилометазолин", "Лекарствена форма": "Спрей" } },
      { sku: "DICL-GEL", name: "Диклофенак гел 1 % 50 г", unit: "бр.", cost: 2.8, price: 6.2, min: 20, qty: 12, tracking: "lot", fields: { "Активно вещество": "Диклофенак", "Лекарствена форма": "Гел" } },
      { sku: "PANT-CRM", name: "Декспантенол крем 5 % 30 г", unit: "бр.", cost: 2.4, price: 5.6, min: 15, qty: 48, pharmacy: 12, tracking: "lot", fields: { "Активно вещество": "Декспантенол", "Лекарствена форма": "Крем" } },
      { sku: "ORS-SAS", name: "Перорални рехидратиращи соли сашета x10", unit: "оп.", cost: 1.7, price: 3.9, min: 15, qty: 40, tracking: "lot", fields: { "Активно вещество": "Електролити", "Лекарствена форма": "Прах" } },
    ],
  },
  {
    key: "vit",
    name: "Витамини и хранителни добавки",
    color: "#f1c40f",
    description: "Витамини, минерали и пробиотици.",
    loc: "main",
    prefix: "VIT",
    items: [
      { sku: "VITC-1000", name: "Витамин C 1000 мг ефервесцентни таблетки x20", unit: "оп.", cost: 2.1, price: 5.4, min: 30, qty: 140, pharmacy: 30, tracking: "lot" },
      { sku: "VITD-2000", name: "Витамин D3 2000 IU капсули x60", unit: "оп.", cost: 3.9, price: 9.9, min: 25, qty: 88, pharmacy: 20, tracking: "lot" },
      { sku: "MG-B6", name: "Магнезий + B6 таблетки x50", unit: "оп.", cost: 3.2, price: 7.8, min: 25, qty: 96, tracking: "lot" },
      { sku: "ZN-25", name: "Цинк 25 мг таблетки x30", unit: "оп.", cost: 2.5, price: 6.1, min: 20, qty: 60, tracking: "lot" },
      { sku: "PROB-10", name: "Пробиотик 10 щама капсули x30", unit: "оп.", cost: 6.8, price: 15.9, min: 15, qty: 42, tracking: "lot", expiryDays: 18 },
      { sku: "OMEGA3", name: "Омега-3 1000 мг капсули x90", unit: "оп.", cost: 7.4, price: 16.9, min: 15, qty: 36, tracking: "lot" },
      { sku: "FE-FOL", name: "Желязо + фолиева киселина таблетки x30", unit: "оп.", cost: 3.6, price: 8.4, min: 15, qty: 9, tracking: "lot" },
      { sku: "MULTI", name: "Мултивитамини таблетки x30", unit: "оп.", cost: 4.5, price: 10.9, min: 20, qty: 70, tracking: "lot" },
    ],
  },
  {
    key: "dress",
    name: "Превързочни материали",
    color: "#3498db",
    description: "Марли, бинтове, лейкопласти и стерилни компреси.",
    loc: "main",
    prefix: "DRS",
    items: [
      { sku: "GAUZE-10", name: "Стерилни марлени компреси 10x10 см x10", unit: "оп.", cost: 0.65, price: 1.6, min: 100, qty: 520, pharmacy: 60 },
      { sku: "GAUZE-5", name: "Стерилни марлени компреси 5x5 см x10", unit: "оп.", cost: 0.4, price: 1.1, min: 100, qty: 380 },
      { sku: "BAND-ELAST-8", name: "Еластичен бинт 8 см x 5 м", unit: "бр.", cost: 0.9, price: 2.4, min: 60, qty: 210, pharmacy: 30 },
      { sku: "BAND-ELAST-10", name: "Еластичен бинт 10 см x 5 м", unit: "бр.", cost: 1.1, price: 2.8, min: 60, qty: 180 },
      { sku: "BAND-GAUZE", name: "Марлен бинт 10 см x 10 м", unit: "бр.", cost: 0.35, price: 0.95, min: 150, qty: 640 },
      { sku: "PLAST-ROLL", name: "Лейкопласт на ролка 2,5 см x 5 м", unit: "бр.", cost: 0.7, price: 1.9, min: 80, qty: 260, pharmacy: 40 },
      { sku: "PLAST-STRIP", name: "Пластири с тампон, асорти x20", unit: "оп.", cost: 0.85, price: 2.5, min: 60, qty: 34, pharmacy: 25 },
      { sku: "COTTON-100", name: "Медицински памук 100 г", unit: "пакет", cost: 0.75, price: 1.8, min: 50, qty: 190 },
      { sku: "FOAM-DRS", name: "Пенообразна превръзка 10x10 см", unit: "бр.", cost: 2.9, price: 6.5, min: 40, qty: 120 },
      { sku: "HYDRO-DRS", name: "Хидроколоидна превръзка 10x10 см", unit: "бр.", cost: 3.4, price: 7.6, min: 30, qty: 75 },
      { sku: "TRIANG", name: "Триъгълна кърпа за имобилизация", unit: "бр.", cost: 0.6, price: 1.7, min: 30, qty: 90 },
    ],
  },
  {
    key: "syr",
    name: "Спринцовки, игли и катетри",
    color: "#9b59b6",
    description: "Консумативи за еднократна употреба за инжекции и инфузии.",
    loc: "main",
    prefix: "SYR",
    items: [
      { sku: "SYR-2", name: "Спринцовка 2 мл, еднократна", cost: 0.04, price: 0.12, min: 1000, qty: 4800 },
      { sku: "SYR-5", name: "Спринцовка 5 мл, еднократна", cost: 0.05, price: 0.15, min: 1000, qty: 5200 },
      { sku: "SYR-10", name: "Спринцовка 10 мл, еднократна", cost: 0.07, price: 0.2, min: 800, qty: 3100 },
      { sku: "SYR-20", name: "Спринцовка 20 мл, еднократна", cost: 0.12, price: 0.32, min: 400, qty: 260 },
      { sku: "SYR-INS", name: "Инсулинова спринцовка 1 мл с игла", cost: 0.09, price: 0.25, min: 500, qty: 1900 },
      { sku: "NDL-21G", name: "Игла 21G (0,8 x 40 мм)", cost: 0.02, price: 0.07, min: 2000, qty: 9000 },
      { sku: "NDL-23G", name: "Игла 23G (0,6 x 30 мм)", cost: 0.02, price: 0.07, min: 2000, qty: 7600 },
      { sku: "CAN-20G", name: "Периферна венозна канюла 20G", cost: 0.38, price: 0.95, min: 300, qty: 1150, tracking: "lot" },
      { sku: "CAN-22G", name: "Периферна венозна канюла 22G", cost: 0.38, price: 0.95, min: 300, qty: 980, tracking: "lot" },
      { sku: "INF-SET", name: "Система за инфузия с въздуховод", cost: 0.28, price: 0.75, min: 500, qty: 2200, tracking: "lot" },
      { sku: "CATH-F14", name: "Уретрален катетър Foley CH14", cost: 0.9, price: 2.3, min: 100, qty: 340, tracking: "lot" },
      { sku: "CATH-F16", name: "Уретрален катетър Foley CH16", cost: 0.9, price: 2.3, min: 100, qty: 85, tracking: "lot" },
      { sku: "URINE-BAG", name: "Уринаторна торба 2000 мл", cost: 0.32, price: 0.85, min: 200, qty: 760 },
    ],
  },
  {
    key: "ppe",
    name: "Ръкавици и лични предпазни средства",
    color: "#16a085",
    description: "Ръкавици, маски, престилки и шапки за еднократна употреба.",
    loc: "main",
    prefix: "PPE",
    items: [
      { sku: "GLV-NIT-S", name: "Нитрилни ръкавици без пудра, размер S x100", unit: "кутия", cost: 3.2, price: 6.9, min: 40, qty: 140 },
      { sku: "GLV-NIT-M", name: "Нитрилни ръкавици без пудра, размер M x100", unit: "кутия", cost: 3.2, price: 6.9, min: 80, qty: 320 },
      { sku: "GLV-NIT-L", name: "Нитрилни ръкавици без пудра, размер L x100", unit: "кутия", cost: 3.2, price: 6.9, min: 60, qty: 210 },
      { sku: "GLV-LAT-STER", name: "Стерилни хирургични латексови ръкавици 7,5 (чифт)", unit: "чифт", cost: 0.42, price: 1.1, min: 300, qty: 1200 },
      { sku: "MASK-3PLY", name: "Медицинска маска тип IIR x50", unit: "кутия", cost: 2.1, price: 4.9, min: 60, qty: 280, pharmacy: 30 },
      { sku: "MASK-FFP2", name: "Респиратор FFP2 без клапан", cost: 0.35, price: 0.99, min: 300, qty: 1400 },
      { sku: "GOWN-ISO", name: "Изолационна престилка, нетъкан текстил", cost: 0.65, price: 1.6, min: 200, qty: 150 },
      { sku: "CAP-BOUF", name: "Хирургическа шапка тип „боне“ x100", unit: "пакет", cost: 2.4, price: 5.5, min: 20, qty: 64 },
      { sku: "SHOE-COV", name: "Калцуни за еднократна употреба x100", unit: "пакет", cost: 1.9, price: 4.2, min: 20, qty: 58 },
      { sku: "FACE-SHLD", name: "Защитен шлем за лице", cost: 0.9, price: 2.4, min: 50, qty: 160 },
    ],
  },
  {
    key: "dis",
    name: "Дезинфектанти и антисептици",
    color: "#27ae60",
    description: "За ръце, кожа, повърхности и инструменти.",
    loc: "main",
    prefix: "DIS",
    items: [
      { sku: "HAND-500", name: "Дезинфектант за ръце на алкохолна основа 500 мл", unit: "бут.", cost: 2.3, price: 5.2, min: 60, qty: 240, pharmacy: 20, tracking: "lot" },
      { sku: "HAND-1L", name: "Дезинфектант за ръце 1 л с помпа", unit: "бут.", cost: 3.9, price: 8.5, min: 40, qty: 130, tracking: "lot" },
      { sku: "SKIN-250", name: "Кожен антисептик, оцветен 250 мл", unit: "бут.", cost: 2.6, price: 5.8, min: 40, qty: 110, tracking: "lot" },
      { sku: "POVID-100", name: "Повидон-йод разтвор 10 % 100 мл", unit: "бут.", cost: 2.2, price: 4.9, min: 30, qty: 85, pharmacy: 15, tracking: "lot" },
      { sku: "H2O2-100", name: "Кислородна вода 3 % 100 мл", unit: "бут.", cost: 0.45, price: 1.2, min: 50, qty: 210, pharmacy: 30, tracking: "lot" },
      { sku: "ETH-70-1L", name: "Етилов алкохол 70 % 1 л", unit: "бут.", cost: 3.1, price: 6.6, min: 40, qty: 26, tracking: "lot" },
      { sku: "SURF-5L", name: "Дезинфектант за повърхности, концентрат 5 л", unit: "туба", cost: 18.5, price: 34, min: 10, qty: 32, decimals: 0, tracking: "lot" },
      { sku: "INSTR-1L", name: "Препарат за дезинфекция на инструменти 1 л", unit: "бут.", cost: 11.2, price: 21.5, min: 10, qty: 28, tracking: "lot" },
      { sku: "WIPES-100", name: "Дезинфекционни кърпички за повърхности x100", unit: "оп.", cost: 2.8, price: 6.2, min: 30, qty: 96, tracking: "lot" },
    ],
  },
  {
    key: "diag",
    name: "Диагностика и бързи тестове",
    color: "#2980b9",
    description: "Тест-ленти, бързи тестове, термометри и консумативи за измерване.",
    loc: "main",
    prefix: "DX",
    items: [
      { sku: "GLU-STRIP", name: "Тест-ленти за глюкомер x50", unit: "оп.", cost: 8.9, price: 17.5, min: 30, qty: 110, pharmacy: 20, tracking: "lot" },
      { sku: "LANCET-100", name: "Ланцети за глюкомер x100", unit: "оп.", cost: 2.4, price: 5.5, min: 20, qty: 70, tracking: "lot" },
      { sku: "COVID-AG", name: "Бърз антигенен тест COVID-19 / грип", unit: "бр.", cost: 1.6, price: 4.5, min: 100, qty: 420, pharmacy: 50, tracking: "lot", expiryDays: 35 },
      { sku: "STREP-A", name: "Бърз тест Стрептокок А x20", unit: "оп.", cost: 22, price: 39, min: 5, qty: 14, tracking: "lot" },
      { sku: "CRP-TEST", name: "Бърз тест CRP x10", unit: "оп.", cost: 18, price: 33, min: 5, qty: 3, tracking: "lot" },
      { sku: "URINE-STR", name: "Тест-ленти за урина 10 показателя x100", unit: "оп.", cost: 9.5, price: 18.9, min: 10, qty: 36, tracking: "lot" },
      { sku: "PREG-TEST", name: "Тест за бременност, касета", unit: "бр.", cost: 0.6, price: 2.4, min: 50, qty: 190, pharmacy: 40, tracking: "lot" },
      { sku: "THERM-DIG", name: "Дигитален термометър", unit: "бр.", cost: 1.8, price: 5.9, min: 30, qty: 85, pharmacy: 20 },
      { sku: "ECG-ELEC", name: "ЕКГ електроди за еднократна употреба x50", unit: "оп.", cost: 3.4, price: 7.5, min: 20, qty: 64, tracking: "lot" },
      { sku: "US-GEL-5L", name: "Ехографски гел 5 л", unit: "туба", cost: 7.8, price: 14.9, min: 5, qty: 18 },
    ],
  },
  {
    key: "dev",
    name: "Медицински уреди",
    color: "#34495e",
    description: "Апаратура със сериен номер и гаранция.",
    loc: "main",
    prefix: "DEV",
    items: [
      { sku: "BP-ARM", name: "Апарат за кръвно налягане, автоматичен, за рамо", cost: 24, price: 49, min: 5, qty: 12, tracking: "serial", fields: { Производител: "MedLine", "Гаранция (месеци)": "36", "Клас на изделието": "IIa" } },
      { sku: "BP-WRIST", name: "Апарат за кръвно налягане за китка", cost: 16, price: 34, min: 5, qty: 8, tracking: "serial", fields: { Производител: "MedLine", "Гаранция (месеци)": "24", "Клас на изделието": "IIa" } },
      { sku: "OXI-FING", name: "Пулсоксиметър за пръст", cost: 9.5, price: 22, min: 10, qty: 25, tracking: "serial", fields: { Производител: "OxiCare", "Гаранция (месеци)": "12", "Клас на изделието": "IIa" } },
      { sku: "GLUCOM", name: "Глюкомер с комплект за старт", cost: 11, price: 26, min: 5, qty: 15, tracking: "serial", fields: { Производител: "GlucoSense", "Гаранция (месеци)": "60", "Клас на изделието": "IIb" } },
      { sku: "NEBUL", name: "Компресорен инхалатор", cost: 28, price: 59, min: 3, qty: 6, tracking: "serial", fields: { Производител: "AirMed", "Гаранция (месеци)": "36", "Клас на изделието": "IIa" } },
      { sku: "THERM-IR", name: "Безконтактен инфрачервен термометър", cost: 14, price: 32, min: 5, qty: 10, tracking: "serial", fields: { Производител: "ThermoPro", "Гаранция (месеци)": "24", "Клас на изделието": "IIa" } },
      { sku: "STETH", name: "Стетоскоп, двустранна слушалка", cost: 12, price: 27, min: 3, qty: 7, tracking: "serial", fields: { Производител: "Auscult", "Гаранция (месеци)": "24", "Клас на изделието": "I" } },
      { sku: "ECG-12", name: "Електрокардиограф 12-канален", cost: 1450, price: 2390, min: 1, qty: 2, tracking: "serial", fields: { Производител: "CardioTech", "Гаранция (месеци)": "24", "Клас на изделието": "IIa" } },
      { sku: "SUCTION", name: "Аспиратор хирургичен, преносим", cost: 310, price: 540, min: 1, qty: 1, tracking: "serial", fields: { Производител: "MedFlow", "Гаранция (месеци)": "24", "Клас на изделието": "IIa" } },
      { sku: "O2-CONC", name: "Кислороден концентратор 5 л/мин", cost: 620, price: 1090, min: 1, qty: 3, tracking: "serial", fields: { Производител: "AirMed", "Гаранция (месеци)": "36", "Клас на изделието": "IIb" } },
    ],
  },
  {
    key: "ortho",
    name: "Ортопедия и рехабилитация",
    color: "#8e44ad",
    description: "Шини, ортези, колани и помощни средства.",
    loc: "main",
    prefix: "ORT",
    items: [
      { sku: "KNEE-M", name: "Ортеза за коляно, размер M", cost: 9.5, price: 24, min: 5, qty: 14, fields: { Размер: "M" } },
      { sku: "KNEE-L", name: "Ортеза за коляно, размер L", cost: 9.5, price: 24, min: 5, qty: 11, fields: { Размер: "L" } },
      { sku: "WRIST-SPL", name: "Шина за китка с алуминиева планка", cost: 6.8, price: 17, min: 5, qty: 16, fields: { Размер: "универсален" } },
      { sku: "LUMBAR-L", name: "Лумбален колан, размер L", cost: 11, price: 27, min: 4, qty: 9, fields: { Размер: "L" } },
      { sku: "COLLAR-SOFT", name: "Мека шийна яка", cost: 4.2, price: 11, min: 5, qty: 18, fields: { Размер: "универсален" } },
      { sku: "CRUTCH", name: "Патерица алуминиева, регулируема", cost: 8.5, price: 19, min: 4, qty: 12, fields: { Размер: "регулируем" } },
      { sku: "WALKER", name: "Проходилка сгъваема", cost: 32, price: 64, min: 2, qty: 4, fields: { Размер: "регулируем" } },
      { sku: "WHEELCH", name: "Инвалидна количка стандартна", cost: 145, price: 259, min: 1, qty: 2, fields: { Размер: "46 см седалка" } },
      { sku: "SPLINT-SAM", name: "Моделируема шина 11 x 91 см", cost: 5.4, price: 12.5, min: 10, qty: 30, fields: { Размер: "11 x 91 см" } },
    ],
  },
  {
    key: "lab",
    name: "Лабораторни консумативи",
    color: "#d35400",
    description: "Вакуумни епруветки, контейнери и пипети.",
    loc: "main",
    prefix: "LAB",
    items: [
      { sku: "VAC-EDTA", name: "Вакуумна епруветка EDTA K3 3 мл x100", unit: "оп.", cost: 6.5, price: 12.9, min: 20, qty: 80, tracking: "lot" },
      { sku: "VAC-SERUM", name: "Вакуумна епруветка серум с гел 5 мл x100", unit: "оп.", cost: 7.2, price: 13.9, min: 20, qty: 72, tracking: "lot" },
      { sku: "VAC-CITR", name: "Вакуумна епруветка цитрат 2,7 мл x100", unit: "оп.", cost: 7.8, price: 14.9, min: 10, qty: 30, tracking: "lot" },
      { sku: "VAC-NDL", name: "Игла за вакуумно вземане на кръв 21G x100", unit: "оп.", cost: 5.9, price: 11.5, min: 15, qty: 48, tracking: "lot" },
      { sku: "URINE-CUP", name: "Контейнер за урина 100 мл, стерилен", cost: 0.08, price: 0.25, min: 1000, qty: 3600 },
      { sku: "STOOL-CUP", name: "Контейнер за фекална проба с лъжичка", cost: 0.1, price: 0.3, min: 500, qty: 420 },
      { sku: "PIPET-TIP", name: "Накрайници за пипета 200 мкл x1000", unit: "оп.", cost: 4.4, price: 8.9, min: 10, qty: 25 },
      { sku: "SLIDE-50", name: "Предметни стъкла x50", unit: "оп.", cost: 1.6, price: 3.5, min: 10, qty: 44 },
      { sku: "SWAB-TR", name: "Тампон с транспортна среда, стерилен", cost: 0.45, price: 1.1, min: 200, qty: 650, tracking: "lot" },
    ],
  },
  {
    key: "surg",
    name: "Хирургични консумативи",
    color: "#7f8c8d",
    description: "Конци, скалпели, стерилни комплекти и инструменти.",
    loc: "main",
    prefix: "SUR",
    items: [
      { sku: "SUT-30-PGA", name: "Резорбируем конец PGA 3-0 с игла x12", unit: "оп.", cost: 14, price: 26, min: 10, qty: 36, tracking: "lot" },
      { sku: "SUT-40-NYL", name: "Нерезорбируем конец найлон 4-0 с игла x12", unit: "оп.", cost: 11, price: 21, min: 10, qty: 30, tracking: "lot" },
      { sku: "SCALP-11", name: "Скалпел за еднократна употреба №11 x10", unit: "оп.", cost: 2.9, price: 6.4, min: 10, qty: 44, tracking: "lot" },
      { sku: "SCALP-22", name: "Скалпел за еднократна употреба №22 x10", unit: "оп.", cost: 2.9, price: 6.4, min: 10, qty: 38, tracking: "lot" },
      { sku: "DRAPE-SET", name: "Стерилен комплект за малка хирургия", unit: "компл.", cost: 4.8, price: 10.5, min: 20, qty: 65, tracking: "lot" },
      { sku: "SKIN-STAP", name: "Кожен стаплер 35 скоби", cost: 6.2, price: 13.5, min: 5, qty: 4, tracking: "lot" },
      { sku: "FORCEPS", name: "Пинсета анатомична 14 см, инокс", cost: 2.6, price: 6.9, min: 10, qty: 28 },
      { sku: "SCISSORS", name: "Ножица хирургична права 14 см", cost: 3.4, price: 8.5, min: 10, qty: 22 },
      { sku: "NEEDLE-HLD", name: "Иглодържател Mayo-Hegar 16 см", cost: 6.8, price: 15.9, min: 5, qty: 9 },
    ],
  },
  {
    key: "cold",
    name: "Хладилни продукти",
    color: "#00a8cc",
    description: "Ваксини, инсулини и биологични продукти — съхранение при 2–8 °C.",
    loc: "cold",
    prefix: "CLD",
    items: [
      { sku: "INS-RAP", name: "Инсулин бързодействащ 100 IU/мл писалка x5", unit: "оп.", cost: 28, price: 41, min: 10, qty: 35, tracking: "lot", fields: { Съхранение: "2–8 °C" } },
      { sku: "INS-BAS", name: "Инсулин базален 100 IU/мл писалка x5", unit: "оп.", cost: 34, price: 49, min: 10, qty: 28, tracking: "lot", fields: { Съхранение: "2–8 °C" } },
      { sku: "VAC-FLU", name: "Ваксина срещу грип, сезон 2026/2027", unit: "доза", cost: 9.5, price: 16, min: 50, qty: 240, tracking: "lot", expiryDays: 150, fields: { Съхранение: "2–8 °C" } },
      { sku: "VAC-TET", name: "Ваксина тетанус-дифтерия", unit: "доза", cost: 6.2, price: 11.5, min: 20, qty: 60, tracking: "lot", fields: { Съхранение: "2–8 °C" } },
      { sku: "VAC-HEPB", name: "Ваксина хепатит B за възрастни", unit: "доза", cost: 14, price: 24, min: 20, qty: 15, tracking: "lot", fields: { Съхранение: "2–8 °C" } },
      { sku: "EPO-4000", name: "Епоетин 4000 IU предварително напълнена спринцовка", unit: "бр.", cost: 38, price: 56, min: 5, qty: 12, tracking: "lot", fields: { Съхранение: "2–8 °C" } },
      { sku: "OXYTO-10", name: "Окситоцин 10 IU/мл ампули x10", unit: "оп.", cost: 7.4, price: 12.9, min: 5, qty: 14, tracking: "lot", expiryDays: 22, fields: { Съхранение: "2–8 °C" } },
      { sku: "TUBERC", name: "Туберкулин PPD 5 TU/0,1 мл флакон", unit: "фл.", cost: 18, price: 29, min: 3, qty: 6, tracking: "lot", fields: { Съхранение: "2–8 °C" } },
    ],
  },
];

/** Данни на фирмата за документите (Настройки → Фирма). */
const COMPANY = {
  legalName: ORG_NAME,
  eik: "206814374",
  vatNumber: "BG206814374",
  address: "гр. Пловдив 4003, ул. Производствена 8",
  phone: "+359 32 555 120",
  mol: "д-р Елена Димитрова",
  bank: "Демо Банк АД",
  iban: "BG28DEMO96611020345678",
};

const FIELDS: Record<string, Array<{ name: string; type: "text" | "number" | "select"; options?: string[] }>> = {
  rx: [
    { name: "Активно вещество", type: "text" },
    { name: "Лекарствена форма", type: "select", options: ["Таблетки", "Капсули", "Сироп", "Инжекционен разтвор", "Спрей", "Гел", "Крем", "Прах"] },
  ],
  otc: [
    { name: "Активно вещество", type: "text" },
    { name: "Лекарствена форма", type: "select", options: ["Таблетки", "Капсули", "Сироп", "Инжекционен разтвор", "Спрей", "Гел", "Крем", "Прах"] },
  ],
  dev: [
    { name: "Производител", type: "text" },
    { name: "Гаранция (месеци)", type: "number" },
    { name: "Клас на изделието", type: "select", options: ["I", "IIa", "IIb", "III"] },
  ],
  ortho: [{ name: "Размер", type: "text" }],
  cold: [{ name: "Съхранение", type: "select", options: ["2–8 °C", "Под −15 °C"] }],
};

async function recreateOrg() {
  const [existing] = await controlDb.select().from(organizations).where(eq(organizations.subdomain, SUBDOMAIN));
  if (existing) {
    await dropTenantDatabase(existing.dbName || tenantDbName(SUBDOMAIN));
    await controlDb.delete(memberships).where(eq(memberships.organizationId, existing.id));
    await controlDb.delete(organizations).where(eq(organizations.id, existing.id));
  } else {
    await dropTenantDatabase(tenantDbName(SUBDOMAIN));
  }
  const [pro] = await controlDb.select({ id: plans.id }).from(plans).where(eq(plans.code, "pro"));
  const [{ id }] = await controlDb
    .insert(organizations)
    .values({ name: ORG_NAME, subdomain: SUBDOMAIN, dbName: tenantDbName(SUBDOMAIN), planId: pro?.id ?? null, subscriptionStatus: "active" })
    .$returningId();
  const [org] = await controlDb.select().from(organizations).where(eq(organizations.id, id));
  return provisionTenant(org);
}

async function seed(db: TenantDb, admin: { id: number; name: string }) {
  const actor = { id: admin.id, name: admin.name };
  await db.insert(t.settings).values([
    { key: "lowStockAlerts", value: "true" },
    { key: "windowDays", value: "30" },
    { key: "deadStockDays", value: "90" },
    // фиктивни, но валидни данни (контролни цифри на ЕИК и IBAN)
    ...Object.entries(COMPANY).map(([k, value]) => ({ key: `company.${k}`, value })),
  ]);

  const [{ id: mainId }, { id: pharmacyId }, { id: coldId }] = await db
    .insert(t.locations)
    .values([
      { name: "Централен склад", code: "MAIN", address: "Пловдив, ул. Производствена 8", isDefault: true },
      { name: "Аптека „Здраве“", code: "PH1", address: "Пловдив, бул. Руски 42" },
      { name: "Хладилна камера 2–8 °C", code: "COLD", address: "Пловдив, ул. Производствена 8, склад 2" },
    ])
    .$returningId();
  const locId = { main: mainId, pharmacy: pharmacyId, cold: coldId } satisfies Record<Loc, number>;

  // групи, полета и артикули
  const itemIds = new Map<string, number>();
  let n = 0;
  for (const g of GROUPS) {
    const [{ id: categoryId }] = await db.insert(t.categories).values({ name: g.name, color: g.color, description: g.description }).$returningId();
    const fieldIds = new Map<string, number>();
    for (const [i, f] of (FIELDS[g.key] ?? []).entries()) {
      const [{ id }] = await db
        .insert(t.fieldDefinitions)
        .values({ categoryId, name: f.name, type: f.type, options: f.options ? JSON.stringify(f.options) : null, sortOrder: i })
        .$returningId();
      fieldIds.set(f.name, id);
    }
    for (const d of g.items) {
      n++;
      const [{ id }] = await db
        .insert(t.items)
        .values({
          sku: `${g.prefix}-${d.sku}`,
          barcode: ean13(n),
          name: d.name,
          categoryId,
          unit: d.unit ?? "бр.",
          minQuantity: d.min,
          unitCost: d.cost,
          unitPrice: d.price,
          tracking: d.tracking ?? "none",
          quantityDecimals: d.decimals ?? 0,
        })
        .$returningId();
      itemIds.set(d.sku, id);
      const values = Object.entries(d.fields ?? {}).filter(([k]) => fieldIds.has(k));
      if (values.length) await db.insert(t.itemFieldValues).values(values.map(([k, v]) => ({ itemId: id, fieldId: fieldIds.get(k)!, value: v })));
    }
  }

  // начални наличности през applyMovement: нива, партиди, серийни номера, себестойност и история
  async function backdate(daysAgo: number) {
    const [last] = await db.select({ id: t.stockMovements.id }).from(t.stockMovements).orderBy(desc(t.stockMovements.id)).limit(1);
    if (last) await db.update(t.stockMovements).set({ createdAt: subDays(today, daysAgo) }).where(eq(t.stockMovements.id, last.id));
  }
  async function receive(g: Group, d: Def, location: number, quantity: number, daysAgo: number, reason: string, lotSuffix = "A") {
    const itemId = itemIds.get(d.sku)!;
    let lot: { lotNumber: string; expiryDate?: string | null } | undefined;
    if (d.tracking === "serial") {
      lot = { lotNumber: Array.from({ length: quantity }, (_, i) => `${d.sku}-${lotSuffix}${String(i + 1).padStart(4, "0")}`).join(",") };
    } else if (d.tracking === "lot") {
      const days = d.expiryDays ?? 400 + ((itemId * 37) % 300);
      lot = { lotNumber: `${g.prefix}${String(itemId).padStart(3, "0")}-${lotSuffix}`, expiryDate: iso(addDays(today, lotSuffix === "A" ? days : days + 180)) };
    }
    await db.transaction((tx) => applyMovement(tx, { actor, itemId, locationId: location, type: "in", quantity, reason, lot, unitCost: d.cost }));
    await backdate(daysAgo);
  }
  async function issue(d: Def, location: number, quantity: number, daysAgo: number, reason: string) {
    const itemId = itemIds.get(d.sku)!;
    let lot: { lotId: number } | undefined;
    if (d.tracking) {
      const [l] = await db
        .select({ id: t.lots.id })
        .from(t.lots)
        .where(and(eq(t.lots.itemId, itemId), eq(t.lots.locationId, location), gt(t.lots.quantity, 0)))
        .orderBy(t.lots.expiryDate, t.lots.id)
        .limit(1);
      if (!l) return;
      lot = { lotId: l.id };
      if (d.tracking === "serial") quantity = 1;
    }
    await db.transaction((tx) => applyMovement(tx, { actor, itemId, locationId: location, type: "out", quantity, reason, lot }));
    await backdate(daysAgo);
  }

  for (const g of GROUPS) {
    for (const d of g.items) {
      await receive(g, d, locId[g.loc], d.qty, 75, "Начална наличност");
      if (d.pharmacy) await receive(g, d, pharmacyId, d.pharmacy, 75, "Начална наличност", "P");
    }
  }

  // доставки през последния месец (втора партида) и ежедневни изписвания към отделения и аптеката
  const all = GROUPS.flatMap((g) => g.items.map((d) => ({ g, d })));
  const fastMovers = all.filter(({ d }) => d.qty >= 100 && d.tracking !== "serial");
  for (const [i, { g, d }] of fastMovers.slice(0, 18).entries()) {
    await receive(g, d, locId[g.loc], Math.round(d.qty * 0.3), 20 - (i % 15), "Доставка", "B");
  }
  let saleNo = 5100;
  for (let day = 30; day >= 1; day -= 2) {
    for (const [i, { g, d }] of all.entries()) {
      if ((i + day) % 9 !== 0) continue;
      const q = Math.max(1, Math.round(d.qty * 0.04));
      await issue(d, locId[g.loc], q, day, i % 2 ? `Изписване към отделение — заявка №${saleNo++}` : `Продажба №${saleNo++}`);
    }
    for (const { d } of all.filter(({ d }) => d.pharmacy).slice(day % 5, (day % 5) + 3)) {
      await issue(d, pharmacyId, Math.max(1, Math.round(d.pharmacy! * 0.05)), day, `Аптека, касов бон №${saleNo++}`);
    }
  }

  // партньори
  const [{ id: pharmaDist }, { id: medTech }, { id: hygiene }, { id: labSupply }, { id: hospital }, { id: dkc }, { id: dental }] = await db
    .insert(t.partners)
    .values([
      { type: "supplier", name: "Фарма Дистрибуция АД", contactName: "Мария Петрова", email: "orders@pharmadist.bg", phone: "+359 32 600 100", leadTimeDays: 2, address: "гр. Пловдив, бул. Кукленско шосе 17" },
      { type: "supplier", name: "МедТех Снабдяване ООД", contactName: "Георги Иванов", email: "sales@medtech-supply.bg", phone: "+359 2 955 4410", leadTimeDays: 7, address: "гр. София, ул. Самоковско шосе 2" },
      { type: "supplier", name: "Хигиена Плюс ЕООД", email: "office@higienaplus.bg", phone: "+359 52 611 220", leadTimeDays: 4, address: "гр. Варна, ЗПЗ, ул. Девня 5" },
      { type: "supplier", name: "Лаб Консулт ООД", email: "lab@labconsult.bg", leadTimeDays: 5 },
      { type: "customer", name: "МБАЛ „Здраве“ ЕООД", contactName: "Аптека на болницата", email: "apteka@mbal-zdrave.bg", phone: "+359 32 902 300", address: "гр. Пловдив, ул. Болнична 1" },
      { type: "customer", name: "ДКЦ „Изток“ ООД", email: "snabdyavane@dkc-iztok.bg", phone: "+359 32 640 010" },
      { type: "customer", name: "Дентален център „Бяла“ ООД", email: "office@dental-byala.bg" },
      { type: "customer", name: "Медицински център „Вита“", email: "vita@mc-vita.bg" },
      { type: "both", name: "Аптека „Лайф“ ЕООД", email: "life@apteka-life.bg" },
    ])
    .$returningId();

  const id = (sku: string) => itemIds.get(sku)!;
  const def = (sku: string) => all.find(({ d }) => d.sku === sku)!.d;
  const orderRows: Array<{ type: "purchase" | "sales"; partnerId: number; status: "draft" | "confirmed" | "partial"; days: number; expected: number; notes?: string; lines: Array<[string, number]> }> = [
    { type: "purchase", partnerId: pharmaDist, status: "confirmed", days: 2, expected: 1, lines: [["ATOR-20", 60], ["FE-FOL", 40], ["PRED-5", 30], ["DICL-GEL", 40]] },
    { type: "purchase", partnerId: hygiene, status: "confirmed", days: 3, expected: 2, lines: [["ETH-70-1L", 80], ["HAND-500", 120], ["GOWN-ISO", 400]] },
    { type: "purchase", partnerId: medTech, status: "draft", days: 0, expected: 9, notes: "Да се потвърди цената на концентратора.", lines: [["O2-CONC", 2], ["BP-ARM", 10], ["SUCTION", 1]] },
    { type: "purchase", partnerId: labSupply, status: "confirmed", days: 1, expected: 4, lines: [["CRP-TEST", 10], ["VAC-CITR", 20], ["SYR-20", 600]] },
    { type: "sales", partnerId: hospital, status: "confirmed", days: 1, expected: 1, notes: "Доставка до болничната аптека, вход откъм ул. Болнична.", lines: [["SYR-5", 1000], ["NDL-21G", 2000], ["GLV-NIT-M", 40], ["INF-SET", 300], ["CEFT-1G", 100]] },
    { type: "sales", partnerId: dkc, status: "confirmed", days: 2, expected: 0, lines: [["VAC-FLU", 80], ["MASK-3PLY", 20], ["HAND-1L", 12]] },
    { type: "sales", partnerId: dental, status: "draft", days: 0, expected: 3, lines: [["GLV-NIT-S", 20], ["MASK-3PLY", 10], ["SUT-40-NYL", 4]] },
  ];
  for (const o of orderRows) {
    const number = await nextNumber(db, o.type);
    const [{ id: orderId }] = await db
      .insert(t.orders)
      .values({
        type: o.type,
        number,
        partnerId: o.partnerId,
        locationId: o.lines.some(([sku]) => sku.startsWith("VAC-F")) ? coldId : mainId,
        status: o.status,
        orderDate: iso(subDays(today, o.days)),
        expectedDate: iso(addDays(today, o.expected)),
        notes: o.notes ?? null,
        createdBy: admin.id,
      })
      .$returningId();
    await db.insert(t.orderLines).values(o.lines.map(([sku, quantity]) => ({ orderId, itemId: id(sku), quantity, unitPrice: o.type === "purchase" ? def(sku).cost : def(sku).price })));
  }

  const [{ id: kitER }, { id: kitDiab }] = await db
    .insert(t.collections)
    .values([
      { name: "Комплект за спешен шкаф", color: "#c0392b", description: "Минимален запас за спешния шкаф на отделение." },
      { name: "Диабет — стартов пакет", color: "#2980b9", description: "Всичко за новодиагностициран пациент." },
    ])
    .$returningId();
  await db.insert(t.collectionItems).values([
    ...["DICL-AMP", "CEFT-1G", "SYR-5", "SYR-10", "NDL-21G", "CAN-20G", "INF-SET", "GAUZE-10", "GLV-NIT-M", "SKIN-250"].map((s) => ({ collectionId: kitER, itemId: id(s) })),
    ...["GLUCOM", "GLU-STRIP", "LANCET-100", "SYR-INS", "INS-RAP", "INS-BAS"].map((s) => ({ collectionId: kitDiab, itemId: id(s) })),
  ]);

  await db.insert(t.calendarEvents).values([
    { title: "Проверка на температурния дневник — хладилна камера", date: iso(addDays(today, 2)), type: "reminder" },
    { title: "Тримесечна инвентаризация на лекарствата", date: iso(addDays(today, 6)), type: "reminder", notes: "Централен склад и аптека." },
    { title: "Метрологична проверка на апаратите за кръвно", date: iso(addDays(today, 12)), type: "deadline" },
    { title: "Посещение: Фарма Дистрибуция — договор 2027", date: iso(addDays(today, 9)), type: "event" },
  ]);

  return { items: n, groups: GROUPS.length };
}

async function main() {
  const [admin] = await controlDb.select().from(users).where(eq(users.email, "admin@demo.bg"));
  if (!admin) throw new Error("Няма потребител admin@demo.bg — изпълнете първо pnpm db:seed.");
  const [worker] = await controlDb.select().from(users).where(eq(users.email, "sklad@demo.bg"));

  const org = await recreateOrg();
  await controlDb.insert(memberships).values([
    { userId: admin.id, organizationId: org.id, role: "owner" },
    ...(worker ? [{ userId: worker.id, organizationId: org.id, role: "staff" as const }] : []),
  ]);
  const r = await seed(getTenantDb(org), { id: admin.id, name: admin.name });

  const domain = process.env.APP_DOMAIN ?? "localhost:3000";
  console.log(`Заредена: ${ORG_NAME} (${org.dbName}) — ${r.items} артикула в ${r.groups} групи.`);
  console.log(`Вход: http://${SUBDOMAIN}.${domain}/login  ·  admin@demo.bg / demo1234`);
}

main()
  .then(async () => {
    await closeTenantPools();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

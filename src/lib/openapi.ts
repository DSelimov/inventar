/**
 * OpenAPI 3.1 описание на REST API-то. Единственият източник за документацията:
 * /api/v1/openapi.json (машинно четимо), /docs/api (четимо) и /docs/api/console (интерактивно).
 */
import { EVENT_TYPES, FIELD_TYPES, ITEM_STATUSES, MOVEMENT_TYPES, ORDER_STATUSES, ORDER_TYPES, PARTNER_TYPES, SHIPMENT_DIRECTIONS, SHIPMENT_STATUSES, TRACKING_MODES, WEBHOOK_EVENTS } from "@/db/schema";
import { WEBHOOK_EVENT_LABELS } from "./webhook-labels";

export const API_VERSION = "1.0.0";

type Schema = Record<string, unknown>;

// ------------------------------------------------------------- schema helpers
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const nullable = (s: Schema): Schema => ({ ...s, type: Array.isArray(s.type) ? s.type : [s.type, "null"] });
const str = (description: string, extra: Schema = {}): Schema => ({ type: "string", description, ...extra });
const int = (description: string, extra: Schema = {}): Schema => ({ type: "integer", description, ...extra });
const num = (description: string, extra: Schema = {}): Schema => ({ type: "number", description, ...extra });
const bool = (description: string): Schema => ({ type: "boolean", description });
const date = (description: string): Schema => ({ type: "string", format: "date", description: `${description} (ГГГГ-ММ-ДД)`, example: "2026-10-20" });
const datetime = (description: string): Schema => ({ type: "string", format: "date-time", description, example: "2026-10-20T08:00:00.000Z" });
const enumOf = (values: readonly string[], description: string): Schema => ({ type: "string", enum: [...values], description });
const arr = (items: Schema, description?: string): Schema => ({ type: "array", items, ...(description ? { description } : {}) });
const obj = (properties: Record<string, Schema>, required: string[] = [], description?: string): Schema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  ...(description ? { description } : {}),
});

// ------------------------------------------------------------------- schemas
const schemas: Record<string, Schema> = {
  Error: obj({ error: str("Съобщение за грешка на български.", { example: "Невалиден API ключ." }) }, ["error"], "Всички грешки връщат този формат."),

  Location: obj(
    {
      id: int("Идентификатор", { example: 1 }),
      organizationId: int("Организация"),
      name: str("Име", { example: "Основен склад" }),
      code: nullable(str("Кратък код", { example: "MAIN" })),
      address: nullable(str("Адрес")),
      isDefault: bool("Локация по подразбиране за нови движения и пратки."),
      active: bool("Неактивните локации не се показват в избори, но пазят история."),
      createdAt: datetime("Създадена"),
    },
    ["id", "name", "isDefault", "active"],
  ),

  FieldDefinition: obj(
    {
      id: int("Идентификатор"),
      categoryId: int("Категория"),
      name: str("Име на полето", { example: "Размер" }),
      type: enumOf(FIELD_TYPES, "Тип: text, number, date, select (избор), boolean (да/не)."),
      options: nullable(str("За select: JSON масив от допустими стойности.", { example: '["S","M","L"]' })),
      required: bool("Задължително при запис на артикул."),
      sortOrder: int("Подредба"),
    },
    ["id", "categoryId", "name", "type", "required"],
  ),

  Category: obj(
    {
      id: int("Идентификатор"),
      organizationId: int("Организация"),
      name: str("Име", { example: "Електроника" }),
      description: nullable(str("Описание")),
      color: str("Цвят (hex)", { example: "#4f46e5" }),
      createdAt: datetime("Създадена"),
      fields: arr(ref("FieldDefinition"), "Персонализирани полета на категорията."),
    },
    ["id", "name", "color"],
  ),

  StockLevel: obj(
    {
      itemId: int("Артикул"),
      locationId: int("Локация"),
      quantity: int("Количество в локацията", { example: 40 }),
      minQuantity: int("Минимум за локацията (0 = няма)"),
      location: ref("Location"),
    },
    ["itemId", "locationId", "quantity"],
  ),

  Lot: obj(
    {
      id: int("Идентификатор"),
      itemId: int("Артикул"),
      locationId: int("Локация"),
      lotNumber: str("Номер на партида (за серийни артикули = серийният номер)", { example: "KF-2605" }),
      serialNumber: nullable(str("Сериен номер, само при tracking = serial")),
      expiryDate: nullable(date("Срок на годност")),
      quantity: int("Налично количество в партидата (0 или 1 за серийни)"),
      createdAt: datetime("Създадена"),
      location: ref("Location"),
    },
    ["id", "itemId", "locationId", "lotNumber", "quantity"],
  ),

  ItemFieldValue: obj(
    {
      itemId: int("Артикул"),
      fieldId: int("Поле"),
      value: str("Стойност като текст; за boolean: \"true\"/\"false\"; за date: ГГГГ-ММ-ДД."),
      field: ref("FieldDefinition"),
    },
    ["itemId", "fieldId", "value"],
  ),

  Item: obj(
    {
      id: int("Идентификатор", { example: 1 }),
      organizationId: int("Организация"),
      sku: str("Уникален код в организацията", { example: "EL-MISHKA-01" }),
      barcode: nullable(str("Баркод (EAN/QR)", { example: "3800100000011" })),
      name: str("Име", { example: "Безжична мишка" }),
      description: nullable(str("Описание")),
      categoryId: nullable(int("Категория")),
      parentId: nullable(int("Родителски артикул, ако това е вариант")),
      variantLabel: nullable(str("Етикет на варианта", { example: "L / Черен" })),
      tracking: enumOf(TRACKING_MODES, "none = без проследяване; lot = партиди (срок на годност); serial = серийни номера."),
      quantity: int("Обща наличност във всички локации (кеширана сума)", { example: 50 }),
      minQuantity: int("Минимум; при достигане се вдига сигнал и webhook item.low_stock"),
      unit: str("Мерна единица", { example: "бр." }),
      unitCost: num("Доставна цена за единица", { example: 12.5 }),
      unitPrice: num("Продажна цена за единица", { example: 24.9 }),
      status: enumOf(ITEM_STATUSES, "active или archived"),
      createdAt: datetime("Създаден"),
      updatedAt: datetime("Последна промяна"),
      category: nullable(ref("Category")),
      stockLevels: arr(ref("StockLevel"), "Наличност по локации."),
    },
    ["id", "sku", "name", "tracking", "quantity", "minQuantity", "unit", "unitCost", "unitPrice", "status"],
  ),

  ItemImage: obj(
    {
      id: int("Идентификатор", { example: 7 }),
      itemId: int("Артикул", { example: 1 }),
      width: int("Ширина на пълния размер (до 1600px)", { example: 1600 }),
      height: int("Височина на пълния размер", { example: 1200 }),
      sortOrder: int("Подредба; първата снимка е главната"),
      createdAt: datetime("Качена"),
      url: str("Пълен размер (image/webp); изисква API ключ", { example: "/api/v1/items/1/images/7" }),
      thumbnailUrl: str("Миниатюра 400×400 (image/webp); изисква API ключ", { example: "/api/v1/items/1/images/7?size=thumb" }),
    },
    ["id", "itemId", "width", "height", "sortOrder", "url", "thumbnailUrl"],
  ),

  ItemDetail: {
    allOf: [
      ref("Item"),
      obj({
        images: arr(ref("ItemImage"), "Снимки; първата е главната."),
        lots: arr(ref("Lot"), "Партиди/серийни номера с наличност > 0."),
        fieldValues: arr(ref("ItemFieldValue"), "Стойности на персонализираните полета."),
        variants: arr(ref("Item"), "Варианти (дъщерни артикули)."),
      }),
    ],
  },

  ItemCreate: obj(
    {
      name: str("Име (задължително)", { example: "Безжична мишка" }),
      sku: str("Код; ако липсва, се генерира от името", { example: "EL-MISHKA-02" }),
      barcode: str("Баркод"),
      description: str("Описание"),
      categoryId: int("Категория"),
      unit: str("Мерна единица, по подразбиране „бр.“"),
      unitCost: num("Доставна цена"),
      unitPrice: num("Продажна цена"),
      minQuantity: int("Минимално количество"),
      tracking: enumOf(TRACKING_MODES, "Режим на проследяване; по подразбиране none."),
    },
    ["name"],
  ),

  ItemUpdate: obj(
    {
      name: str("Име"),
      sku: str("Код"),
      barcode: nullable(str("Баркод")),
      description: nullable(str("Описание")),
      categoryId: nullable(int("Категория")),
      unit: str("Мерна единица"),
      unitCost: num("Доставна цена"),
      unitPrice: num("Продажна цена"),
      minQuantity: int("Минимално количество"),
      status: enumOf(ITEM_STATUSES, "active или archived"),
    },
    [],
    "Изпращат се само полетата, които се променят.",
  ),

  StockRow: obj(
    {
      itemId: int("Артикул"),
      sku: str("Код"),
      name: str("Име"),
      locationId: int("Локация"),
      location: str("Име на локацията"),
      quantity: int("Количество"),
      minQuantity: int("Минимум за локацията"),
      unit: str("Мерна единица"),
    },
    ["itemId", "sku", "locationId", "quantity"],
  ),

  MovementCreate: obj(
    {
      itemId: int("Артикул по идентификатор (или sku)"),
      sku: str("Артикул по код (или itemId)", { example: "EL-USBC-2M" }),
      locationId: int("Локация (задължително)", { example: 1 }),
      type: enumOf(["in", "out", "adjust"], "in = приход (+), out = разход (−), adjust = задава точното количество в локацията. adjust не е позволен за артикули с партиди/серийни номера."),
      quantity: int("Положително цяло число", { example: 5 }),
      reason: str("Причина, записва се в историята", { example: "Онлайн поръчка №1042" }),
      lotNumber: str("При приход на артикул с партиди: номер на партидата. При серийни: серийни номера, разделени със запетая, колкото е количеството."),
      expiryDate: date("Срок на годност на партидата (при приход)"),
      lotId: int("При разход на артикул с партиди: от коя партида (вж. ItemDetail.lots)."),
    },
    ["locationId", "type", "quantity"],
  ),

  MovementResult: obj(
    {
      itemId: int("Артикул"),
      sku: str("Код"),
      delta: int("Приложената промяна със знак", { example: 5 }),
      after: int("Обща наличност след движението", { example: 120 }),
    },
    ["itemId", "sku", "delta", "after"],
  ),

  Partner: obj(
    {
      id: int("Идентификатор"),
      name: str("Име", { example: "ТехСъплай ООД" }),
      type: enumOf(PARTNER_TYPES, "supplier = доставчик, customer = клиент, both = и двете"),
      email: nullable(str("Имейл")),
      phone: nullable(str("Телефон")),
      leadTimeDays: nullable(int("Срок на доставка в дни")),
      orderCount: int("Брой поръчки"),
    },
    ["id", "name", "type"],
  ),

  ShipmentLine: obj(
    {
      id: int("Идентификатор"),
      shipmentId: int("Пратка"),
      itemId: int("Артикул"),
      quantity: int("Количество"),
      lotNumber: nullable(str("Входяща, с партиди: партидата, която ще се създаде при доставка.")),
      expiryDate: nullable(date("Срок на годност на партидата")),
      lotId: nullable(int("Изходяща, с партиди: от коя партида се взема.")),
      item: ref("Item"),
      lot: nullable(ref("Lot")),
    },
    ["id", "shipmentId", "itemId", "quantity"],
  ),

  Shipment: obj(
    {
      id: int("Идентификатор"),
      organizationId: int("Организация"),
      reference: str("Референция", { example: "ПЗ-2026-001/1" }),
      direction: enumOf(SHIPMENT_DIRECTIONS, "inbound = входяща (получаване), outbound = изходяща (изпращане)"),
      status: enumOf(SHIPMENT_STATUSES, "pending → in_transit → delivered | cancelled"),
      locationId: nullable(int("Локация на получаване/изпращане")),
      orderId: nullable(int("Свързана поръчка")),
      partnerId: nullable(int("Партньор от списъка")),
      partner: nullable(str("Партньор като свободен текст")),
      carrier: nullable(str("Куриер")),
      trackingNumber: nullable(str("Номер за проследяване")),
      expectedDate: nullable(date("Очаквана дата")),
      deliveredAt: nullable(datetime("Момент на доставка")),
      notes: nullable(str("Бележки")),
      createdAt: datetime("Създадена"),
      lines: arr(ref("ShipmentLine")),
      location: nullable(ref("Location")),
    },
    ["id", "reference", "direction", "status", "lines"],
  ),

  ShipmentStatusChange: obj({ status: enumOf(["in_transit", "delivered", "cancelled"], "Новият статус. delivered прилага наличността (и партидите) в една транзакция и обновява свързаната поръчка.") }, ["status"]),

  OrderLine: obj(
    {
      id: int("Идентификатор"),
      orderId: int("Поръчка"),
      itemId: int("Артикул"),
      quantity: int("Поръчано количество"),
      fulfilledQuantity: int("Доставено до момента (сума от доставените пратки)"),
      unitPrice: num("Единична цена"),
      item: ref("Item"),
    },
    ["id", "orderId", "itemId", "quantity", "fulfilledQuantity", "unitPrice"],
  ),

  Order: obj(
    {
      id: int("Идентификатор"),
      organizationId: int("Организация"),
      type: enumOf(ORDER_TYPES, "purchase = поръчка за доставка (от доставчик), sales = клиентска поръчка"),
      number: str("Номер", { example: "ПЗ-2026-001" }),
      partnerId: nullable(int("Партньор")),
      locationId: nullable(int("Локация")),
      status: enumOf(ORDER_STATUSES, "draft → confirmed → partial → completed | cancelled"),
      orderDate: nullable(date("Дата на поръчка")),
      expectedDate: nullable(date("Очаквана дата")),
      notes: nullable(str("Бележки")),
      createdAt: datetime("Създадена"),
      partner: nullable(ref("Partner")),
      location: nullable(ref("Location")),
      lines: arr(ref("OrderLine")),
      shipments: arr(ref("Shipment"), "Само в детайлния изглед."),
    },
    ["id", "type", "number", "status", "lines"],
  ),

  WebhookEnvelope: obj(
    {
      event: enumOf(WEBHOOK_EVENTS, "Тип на събитието"),
      createdAt: datetime("Момент на събитието"),
      data: { type: "object", description: "Данни за събитието; зависят от типа (вж. Webhooks)." },
    },
    ["event", "createdAt", "data"],
  ),
};

// ------------------------------------------------------------------ helpers
const bearer = [{ bearerAuth: [] }];
const errorResponses = (extra: Record<string, string> = {}) => ({
  "401": { description: "Липсва или е невалиден API ключ.", content: { "application/json": { schema: ref("Error") } } },
  "403": { description: "Ключът няма нужното право (read/write).", content: { "application/json": { schema: ref("Error") } } },
  "429": {
    description: "Превишен лимит от заявки за ключа. Изчакайте Retry-After секунди.",
    headers: {
      "Retry-After": { description: "Секунди до нов опит", schema: { type: "integer" } },
      "X-RateLimit-Limit": { description: "Заявки в минута", schema: { type: "integer" } },
      "X-RateLimit-Remaining": { description: "Оставащи заявки в текущата минута", schema: { type: "integer" } },
      "X-RateLimit-Reset": { description: "Край на текущата минута (Unix секунди)", schema: { type: "integer" } },
    },
    content: { "application/json": { schema: ref("Error") } },
  },
  ...Object.fromEntries(Object.entries(extra).map(([code, description]) => [code, { description, content: { "application/json": { schema: ref("Error") } } }])),
});
const ok = (schema: Schema, description = "Успех") => ({ "200": { description, content: { "application/json": { schema } } } });
const created = (schema: Schema, description = "Създадено") => ({ "201": { description, content: { "application/json": { schema } } } });
const data = (schema: Schema): Schema => obj({ data: schema }, ["data"]);
const body = (schema: Schema, example?: unknown) => ({ required: true, content: { "application/json": { schema, ...(example ? { example } : {}) } } });
const idParam = (what: string) => ({ name: "id", in: "path", required: true, description: `Идентификатор на ${what}`, schema: { type: "integer" } });
const q = (name: string, description: string, schema: Schema = { type: "string" }) => ({ name, in: "query", required: false, description, schema });

export const WEBHOOK_PAYLOAD_EXAMPLES: Record<(typeof WEBHOOK_EVENTS)[number], Record<string, unknown>> = {
  "item.created": { id: 12, sku: "EL-MISHKA-02", name: "Безжична мишка", unitCost: 12.5, unitPrice: 24.9, source: "api" },
  "item.updated": { id: 12, name: "Безжична мишка Pro", unitPrice: 29.9 },
  "item.low_stock": { itemId: 2, sku: "EL-KLAV-01", name: "Механична клавиатура", quantity: 8, minQuantity: 10 },
  "movement.created": { itemId: 3, sku: "EL-USBC-2M", locationId: 1, type: "out", delta: -4, quantityAfter: 111 },
  "shipment.created": { id: 7, reference: "ПЗ-2026-003/1", direction: "inbound", orderId: 3, lines: [{ itemId: 7, quantity: 40 }] },
  "shipment.status_changed": { id: 7, reference: "ПЗ-2026-003/1", status: "delivered" },
  "order.created": { id: 3, number: "ПЗ-2026-003", type: "purchase", lines: [{ itemId: 7, quantity: 40, unitPrice: 9.4 }] },
  "order.status_changed": { id: 3, number: "ПЗ-2026-003", status: "completed" },
};

// --------------------------------------------------------------------- spec
export function buildOpenApi(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Инвентар API",
      version: API_VERSION,
      description: [
        "REST API на системата за инвентар. Всички заявки и отговори са JSON (UTF-8).",
        "",
        "**Автентикация.** Създайте API ключ от *Настройки › API* и го изпращайте в заглавието `Authorization: Bearer inv_…`.",
        "Ключът е обвързан с една организация: виждате и променяте само нейните данни. Ключ с право *четене* може да ползва само GET; за POST/PATCH е нужно право *запис*.",
        "",
        "**Грешки.** Винаги `{ \"error\": \"…\" }` с HTTP код 400 (невалидна заявка), 401 (ключ), 403 (права), 404 (не е намерено), 409 (конфликт, напр. дублиран код), 422 (невалидни полета), 429 (лимит), 500 (вътрешна грешка; детайлите са само в лога на сървъра).",
        "",
        "**Лимит.** До 600 заявки в минута за един API ключ. Всеки отговор съдържа `X-RateLimit-Limit`, `X-RateLimit-Remaining` и `X-RateLimit-Reset` (Unix време в секунди). При превишаване: HTTP 429 с `Retry-After` (секунди).",
        "",
        "**Дати.** Полетата с дата са `ГГГГ-ММ-ДД`; моментите във времето са ISO 8601 в UTC.",
        "",
        "**Количества.** Цели числа в мерната единица на артикула. Наличността никога не пада под нула — заявка, която би го направила, връща 400.",
      ].join("\n"),
    },
    servers: [{ url: serverUrl, description: "Текущата инсталация" }],
    tags: [
      { name: "Артикули", description: "Артикули, варианти, персонализирани полета." },
      { name: "Наличности", description: "Количества по локации и складови движения." },
      { name: "Пратки", description: "Входящи и изходящи пратки и техните статуси." },
      { name: "Поръчки", description: "Поръчки за доставка и клиентски поръчки." },
      { name: "Справочни данни", description: "Локации, партньори, категории." },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "inv_<48 hex>", description: "API ключ от Настройки › API." },
      },
      schemas,
    },
    security: bearer,
    paths: {
      "/api/v1/items": {
        get: {
          tags: ["Артикули"],
          summary: "Списък артикули",
          description: "Търси по име, код или баркод (без значение на главни/малки букви). Връща наличността по локации за всеки артикул.",
          operationId: "listItems",
          parameters: [q("q", "Търсене по име, код или баркод."), q("page", "Страница, от 1.", { type: "integer", default: 1 }), q("pageSize", "Размер на страницата, до 200.", { type: "integer", default: 50, maximum: 200 })],
          responses: { ...ok(obj({ data: arr(ref("Item")), page: int("Страница"), pageSize: int("Размер"), total: int("Общ брой резултати") }, ["data", "page", "pageSize", "total"])), ...errorResponses() },
        },
        post: {
          tags: ["Артикули"],
          summary: "Създава артикул",
          description: "Кодът (sku) трябва да е уникален в организацията; ако липсва, се генерира от името. Началната наличност се задава отделно чрез POST /api/v1/movements.",
          operationId: "createItem",
          requestBody: body(ref("ItemCreate"), { sku: "EL-MISHKA-02", name: "Безжична мишка Pro", barcode: "3800100000999", categoryId: 1, unitCost: 15, unitPrice: 29.9, minQuantity: 5 }),
          responses: { ...created(data(ref("Item"))), ...errorResponses({ "409": "Вече има артикул с този код.", "422": "Липсва задължително поле." }) },
        },
      },
      "/api/v1/items/{id}": {
        get: {
          tags: ["Артикули"],
          summary: "Артикул със снимки, партиди, полета и варианти",
          operationId: "getItem",
          parameters: [idParam("артикула")],
          responses: { ...ok(data(ref("ItemDetail"))), ...errorResponses({ "404": "Артикулът не е намерен." }) },
        },
        patch: {
          tags: ["Артикули"],
          summary: "Променя артикул",
          description: "Частична промяна: изпращат се само полетата за промяна. Количеството не се променя тук — използвайте движения.",
          operationId: "updateItem",
          parameters: [idParam("артикула")],
          requestBody: body(ref("ItemUpdate"), { unitPrice: 27.9, minQuantity: 8 }),
          responses: { ...ok(data(ref("Item"))), ...errorResponses({ "404": "Артикулът не е намерен.", "422": "Няма полета за промяна." }) },
        },
      },
      "/api/v1/items/{id}/images": {
        get: {
          tags: ["Артикули"],
          summary: "Снимки на артикул",
          operationId: "listItemImages",
          parameters: [idParam("артикула")],
          responses: { ...ok(data(arr(ref("ItemImage")))), ...errorResponses() },
        },
        post: {
          tags: ["Артикули"],
          summary: "Качва снимки",
          description: `multipart/form-data с едно или повече полета \`file\` (JPG, PNG, WebP, GIF, AVIF; до 10 MB на файл, до 12 снимки на артикул). Снимките се завъртат по EXIF, метаданните (вкл. GPS) се премахват и се записват като WebP до 1600px плюс миниатюра 400×400. Пример: \`curl -H "Authorization: Bearer inv_…" -F file=@snimka.jpg …/api/v1/items/1/images\``,
          operationId: "uploadItemImages",
          parameters: [idParam("артикула")],
          requestBody: {
            required: true,
            content: { "multipart/form-data": { schema: obj({ file: arr({ type: "string", format: "binary" }, "Един или повече файла.") }, ["file"]) } },
          },
          responses: { ...created(data(arr(ref("ItemImage"))), "Всички снимки на артикула след качването"), ...errorResponses({ "404": "Артикулът не е намерен.", "422": "Невалиден файл, твърде голям или над лимита от снимки." }) },
        },
      },
      "/api/v1/items/{id}/images/{imageId}": {
        get: {
          tags: ["Артикули"],
          summary: "Изображение (файл)",
          description: "Връща самото изображение като image/webp.",
          operationId: "getItemImage",
          parameters: [idParam("артикула"), { name: "imageId", in: "path", required: true, description: "Идентификатор на снимката", schema: { type: "integer" } }, q("size", "full (по подразбиране) или thumb.", { type: "string", enum: ["full", "thumb"], default: "full" })],
          responses: { "200": { description: "Изображението", content: { "image/webp": { schema: { type: "string", format: "binary" } } } }, ...errorResponses({ "404": "Снимката не е намерена." }) },
        },
        delete: {
          tags: ["Артикули"],
          summary: "Изтрива снимка",
          operationId: "deleteItemImage",
          parameters: [idParam("артикула"), { name: "imageId", in: "path", required: true, description: "Идентификатор на снимката", schema: { type: "integer" } }],
          responses: { ...ok(data(obj({ id: int("Изтритата снимка"), deleted: bool("true") }))), ...errorResponses({ "404": "Снимката не е намерена." }) },
        },
      },
      "/api/v1/stock": {
        get: {
          tags: ["Наличности"],
          summary: "Наличност по локации",
          description: "Един ред за всяка двойка артикул × локация, за която има запис.",
          operationId: "listStock",
          parameters: [q("itemId", "Филтър по артикул.", { type: "integer" })],
          responses: { ...ok(data(arr(ref("StockRow")))), ...errorResponses() },
        },
      },
      "/api/v1/movements": {
        post: {
          tags: ["Наличности"],
          summary: "Складово движение",
          description: [
            "Прилага приход, разход или корекция в дадена локация. Обновява наличността на локацията, партидата (ако има) и общата наличност, и записва ред в историята.",
            "",
            "- Артикули **без проследяване**: достатъчни са `locationId`, `type`, `quantity`.",
            "- Артикули с **партиди** (`tracking = lot`): при `in` подайте `lotNumber` (и по желание `expiryDate`); при `out` подайте `lotId`.",
            "- Артикули със **серийни номера** (`tracking = serial`): при `in` подайте в `lotNumber` серийните номера, разделени със запетая — броят им трябва да е равен на `quantity`; при `out` подайте `lotId` на серийния номер с `quantity = 1`.",
            "- `adjust` задава абсолютното количество в локацията и не е позволен за проследявани артикули.",
            "",
            "При падане на или под минимума се изпраща webhook `item.low_stock`; при всяко движение — `movement.created`.",
          ].join("\n"),
          operationId: "createMovement",
          requestBody: body(ref("MovementCreate"), { sku: "EL-USBC-2M", locationId: 1, type: "out", quantity: 2, reason: "Онлайн поръчка №1042" }),
          responses: { ...created(data(ref("MovementResult"))), ...errorResponses({ "400": "Недостатъчна наличност, липсваща партида или невалидно количество.", "404": "Артикулът не е намерен.", "422": "Невалиден тип или липсващо поле." }) },
        },
      },
      "/api/v1/shipments": {
        get: {
          tags: ["Пратки"],
          summary: "Списък пратки",
          operationId: "listShipments",
          parameters: [q("status", "Филтър по статус.", { type: "string", enum: [...SHIPMENT_STATUSES] })],
          responses: { ...ok(data(arr(ref("Shipment")))), ...errorResponses() },
        },
      },
      "/api/v1/shipments/{id}": {
        get: {
          tags: ["Пратки"],
          summary: "Пратка с редове",
          operationId: "getShipment",
          parameters: [idParam("пратката")],
          responses: { ...ok(data(ref("Shipment"))), ...errorResponses({ "404": "Пратката не е намерена." }) },
        },
      },
      "/api/v1/shipments/{id}/status": {
        post: {
          tags: ["Пратки"],
          summary: "Сменя статуса на пратка",
          description: [
            "Позволени преходи: `pending → in_transit`, `pending|in_transit → delivered`, `pending|in_transit → cancelled`. Доставена или отказана пратка не може да се променя.",
            "",
            "`delivered` прилага всички редове като движения (входяща: приход; изходяща: разход) в една транзакция, създава партидите/серийните номера от редовете и увеличава изпълнението на свързаната поръчка (тя става `partial` или `completed`). Ако някой ред с проследяван артикул няма партида, заявката се отхвърля и нищо не се променя.",
          ].join("\n"),
          operationId: "setShipmentStatus",
          parameters: [idParam("пратката")],
          requestBody: body(ref("ShipmentStatusChange"), { status: "delivered" }),
          responses: {
            ...ok(data(obj({ id: int("Пратка"), reference: str("Референция"), status: enumOf(SHIPMENT_STATUSES, "Новият статус") }))),
            ...errorResponses({ "400": "Непозволен преход, липсваща партида или недостатъчна наличност.", "404": "Пратката не е намерена.", "422": "Невалиден статус." }),
          },
        },
      },
      "/api/v1/orders": {
        get: {
          tags: ["Поръчки"],
          summary: "Списък поръчки",
          operationId: "listOrders",
          parameters: [q("type", "purchase или sales.", { type: "string", enum: [...ORDER_TYPES] }), q("status", "Филтър по статус.", { type: "string", enum: [...ORDER_STATUSES] })],
          responses: { ...ok(data(arr(ref("Order")))), ...errorResponses() },
        },
      },
      "/api/v1/orders/{id}": {
        get: {
          tags: ["Поръчки"],
          summary: "Поръчка с редове и пратки",
          description: "`fulfilledQuantity` на всеки ред показва колко е доставено; остатъкът е `quantity − fulfilledQuantity`.",
          operationId: "getOrder",
          parameters: [idParam("поръчката")],
          responses: { ...ok(data(ref("Order"))), ...errorResponses({ "404": "Поръчката не е намерена." }) },
        },
      },
      "/api/v1/locations": {
        get: { tags: ["Справочни данни"], summary: "Локации (вкл. неактивни)", operationId: "listLocations", responses: { ...ok(data(arr(ref("Location")))), ...errorResponses() } },
      },
      "/api/v1/partners": {
        get: { tags: ["Справочни данни"], summary: "Партньори", operationId: "listPartners", responses: { ...ok(data(arr(ref("Partner")))), ...errorResponses() } },
      },
      "/api/v1/categories": {
        get: { tags: ["Справочни данни"], summary: "Категории с полета", operationId: "listCategories", responses: { ...ok(data(arr(ref("Category")))), ...errorResponses() } },
      },
    },
    webhooks: Object.fromEntries(
      WEBHOOK_EVENTS.map((event) => [
        event,
        {
          post: {
            summary: WEBHOOK_EVENT_LABELS[event],
            description: `Изпраща се като POST към URL адреса на webhook-а, когато настъпи събитие \`${event}\`. Тялото е WebhookEnvelope; \`data\` е като в примера.`,
            requestBody: { content: { "application/json": { schema: ref("WebhookEnvelope"), example: { event, createdAt: "2026-10-20T08:00:00.000Z", data: WEBHOOK_PAYLOAD_EXAMPLES[event] } } } },
            responses: { "200": { description: "Всеки 2xx отговор се счита за успешна доставка." } },
          },
        },
      ]),
    ),
  };
}

export type OpenApiDoc = ReturnType<typeof buildOpenApi>;
export { EVENT_TYPES, MOVEMENT_TYPES };

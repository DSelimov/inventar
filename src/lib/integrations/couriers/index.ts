import "server-only";
import type { ProviderId } from "../core";
import { boxnow } from "./boxnow";
import { econt } from "./econt";
import { speedy } from "./speedy";
import type { Courier } from "./types";

export const COURIERS = { econt, speedy, boxnow } satisfies Partial<Record<ProviderId, Courier>>;
export type CourierId = keyof typeof COURIERS;
export const isCourier = (v: string): v is CourierId => v in COURIERS;

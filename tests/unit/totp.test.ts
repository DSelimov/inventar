import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, hotp, otpauthUrl, consumeRecoveryCode, verifyTotp } from "@/lib/totp";

// RFC 6238, приложение B (SHA-1, ключ "12345678901234567890", 8 цифри)
const RFC_KEY = Buffer.from("12345678901234567890");
const RFC = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
] as const;

describe("TOTP", () => {
  it.each(RFC)("RFC 6238 вектор t=%i → %s", (t, code) => {
    expect(hotp(RFC_KEY, Math.floor(t / 30), 8)).toBe(code);
  });

  it("base32 в двете посоки", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
  });

  it("проверка с ±30 s, отхвърляне на грешен и на вече използван код", () => {
    const secret = base32Encode(RFC_KEY);
    const now = 59_000;
    const step = Math.floor(now / 30_000);
    const code = hotp(RFC_KEY, step);
    expect(verifyTotp(secret, code, null, now)).toBe(step);
    expect(verifyTotp(secret, code, null, now + 30_000)).toBe(step); // часовникът на телефона изостава
    expect(verifyTotp(secret, code, null, now + 90_000)).toBeNull(); // твърде стар
    expect(verifyTotp(secret, code, step, now)).toBeNull(); // вече използван
    expect(verifyTotp(secret, "000000", null, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
  });

  it("otpauth адрес за QR кода", () => {
    expect(otpauthUrl("ABC", "ivan@firma.bg")).toBe("otpauth://totp/%D0%98%D0%BD%D0%B2%D0%B5%D0%BD%D1%82%D0%B0%D1%80%3Aivan%40firma.bg?secret=ABC&issuer=%D0%98%D0%BD%D0%B2%D0%B5%D0%BD%D1%82%D0%B0%D1%80&algorithm=SHA1&digits=6&period=30");
  });

  it("кодове за възстановяване: еднократни, без значение на малки букви и тирета", () => {
    const { codes, hashes } = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    const rest = consumeRecoveryCode(hashes, codes[3].toLowerCase().replace("-", ""));
    expect(rest).toHaveLength(9);
    expect(consumeRecoveryCode(rest!, codes[3])).toBeNull();
    expect(consumeRecoveryCode(hashes, "NOPE-NOPE")).toBeNull();
  });
});

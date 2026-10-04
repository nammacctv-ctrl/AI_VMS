import { describe, expect, it } from "vitest";
import { isValidImei, normaliseInput } from "@/lib/orders/imei";
import { canTransition, isTerminal } from "@/lib/orders/state";

describe("IMEI", () => {
  it("accepts valid IMEIs and rejects typos", () => {
    expect(isValidImei("490154203237518")).toBe(true);
    expect(isValidImei("356938035643809")).toBe(true);
    expect(isValidImei("490154203237519")).toBe(false); // wrong check digit
    expect(isValidImei("490154203237581")).toBe(false); // two digits swapped
    expect(isValidImei("49015420323751")).toBe(false);  // 14 digits
    expect(isValidImei("4901542032375180")).toBe(false);
    expect(isValidImei("49015420323751a")).toBe(false);
    expect(isValidImei("")).toBe(false);
  });
  it("strips spaces and dashes for IMEI input only", () => {
    expect(normaliseInput("imei", " 49-0154 2032 37518 ")).toBe("490154203237518");
    expect(normaliseInput("text", "  user name ")).toBe("user name");
    expect(normaliseInput("serial", "AB-12 3")).toBe("AB-12 3");
  });
});

describe("order state machine", () => {
  it("allows only the forward paths", () => {
    expect(canTransition("pending", "processing")).toBe(true);
    expect(canTransition("pending", "failed")).toBe(true);
    expect(canTransition("processing", "completed")).toBe(true);
    expect(canTransition("processing", "failed")).toBe(true);
    expect(canTransition("pending", "completed")).toBe(false);
    expect(canTransition("completed", "failed")).toBe(false);
    expect(canTransition("failed", "pending")).toBe(false);
    expect(isTerminal("completed") && isTerminal("failed")).toBe(true);
    expect(isTerminal("pending") || isTerminal("processing")).toBe(false);
  });
});

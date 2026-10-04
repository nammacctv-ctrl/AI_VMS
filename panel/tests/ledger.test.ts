import { describe, expect, it } from "vitest";
import { LedgerError, validateEntries } from "@/lib/ledger/ledger";

describe("validateEntries", () => {
  it("accepts a balanced pair", () => {
    expect(() => validateEntries([{ accountId: "a", amountMinor: -500n }, { accountId: "b", amountMinor: 500n }])).not.toThrow();
  });
  it("rejects unbalanced, single, zero and non-bigint entries", () => {
    expect(() => validateEntries([{ accountId: "a", amountMinor: -500n }, { accountId: "b", amountMinor: 400n }])).toThrow(LedgerError);
    expect(() => validateEntries([{ accountId: "a", amountMinor: 0n }])).toThrow(LedgerError);
    expect(() => validateEntries([{ accountId: "a", amountMinor: 0n }, { accountId: "b", amountMinor: 0n }])).toThrow(LedgerError);
    expect(() => validateEntries([{ accountId: "a", amountMinor: -1 as unknown as bigint }, { accountId: "b", amountMinor: 1 as unknown as bigint }])).toThrow(LedgerError);
  });
});

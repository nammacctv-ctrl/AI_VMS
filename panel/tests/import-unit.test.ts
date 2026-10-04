import { describe, expect, it } from "vitest";
import { mapRows, normaliseKind, parseTable, rupeesToPaise } from "@/lib/catalog/csv";

describe("spreadsheet parsing", () => {
  it("parses CSV with quotes, commas inside quotes, escaped quotes and CRLF", () => {
    const t = parseTable('code,name,cost\r\nA1,"Samsung, FRP ""Pro""",85.50\r\nA2,Plain,10\r\n\r\n');
    expect(t).toEqual([["code", "name", "cost"], ["A1", 'Samsung, FRP "Pro"', "85.50"], ["A2", "Plain", "10"]]);
  });
  it("detects tab-separated text pasted from Excel or Google Sheets", () => {
    expect(parseTable("code\tname\tcost\nA1\tSamsung FRP\t85")).toEqual([["code", "name", "cost"], ["A1", "Samsung FRP", "85"]]);
  });
  it("keeps a multi-line quoted cell together and drops a leading byte-order mark", () => {
    expect(parseTable('﻿code,name\nA1,"line one\nline two"')).toEqual([["code", "name"], ["A1", "line one\nline two"]]);
  });
  it("matches common supplier column names loosely", () => {
    const m = mapRows(parseTable("Service ID,Service Name,Group,Price,Time,Type\nX1,Samsung FRP,Samsung,85,10-60 min,IMEI"));
    expect(m.missing).toEqual([]);
    expect(m.rows[0]).toEqual({ line: 2, externalRef: "X1", name: "Samsung FRP", category: "Samsung", inputKind: "IMEI", cost: "85", deliveryTime: "10-60 min" });
  });
  it("flags rows with more cells than the header (an unquoted comma inside a value would shift every column)", () => {
    const m = mapRows(parseTable("code,name,cost\nA1,Fine,85\nA2,Shifted,1,5\nA3,\"Quoted, ok\",10\nA4,Trailing,5,\n"));
    expect(m.badRows.map((b) => b.line)).toEqual([3]); // A4 only has an empty trailing cell, which is harmless
    expect(m.badRows[0]!.message).toMatch(/more columns than the header/);
  });
  it("reports which required columns are missing", () => {
    expect(mapRows(parseTable("name,price\nA,1")).missing).toEqual(["code"]);
    expect(mapRows(parseTable("foo,bar\n1,2")).missing).toEqual(["code", "name", "cost"]);
  });
  it("converts rupee text to paise exactly and refuses anything else", () => {
    expect(rupeesToPaise("85")).toBe(8500);
    expect(rupeesToPaise("₹1,250.5")).toBe(125050);
    expect(rupeesToPaise("Rs. 12.05")).toBe(1205);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise("12,50,000")).toBe(125000000); // Indian grouping
    expect(rupeesToPaise("1,250,000.75")).toBe(125000075); // Western grouping
    // anything ambiguous is refused, so a wrong price can never slip in
    for (const bad of ["", "abc", "-5", "1.234", "1e5", "12 34", "NaN", "1,5", "12,34", "1,2345", ",5", "1,,000", "5,", "99999999999"]) expect(rupeesToPaise(bad), bad).toBeNull();
  });
  it("understands input types", () => {
    expect(normaliseKind("IMEI")).toBe("imei");
    expect(normaliseKind("Serial No")).toBe("serial");
    expect(normaliseKind("")).toBe("text");
    expect(normaliseKind("username")).toBe("text");
    expect(normaliseKind("banana")).toBeNull();
  });
});

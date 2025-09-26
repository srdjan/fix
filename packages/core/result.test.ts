import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std/testing/asserts.ts";
import { all, err, flatMap, map, mapErr, ok } from "./result.ts";

Deno.test("ok creates successful result", () => {
  const result = ok("success");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, "success");
  }
});

Deno.test("err creates error result", () => {
  const result = err("error");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, "error");
  }
});

Deno.test("map transforms successful result", () => {
  const result = ok(5);
  const mapped = map(result, (x: number) => x * 2);
  assertEquals(mapped.ok, true);
  if (mapped.ok) {
    assertEquals(mapped.value, 10);
  }
});

Deno.test("map preserves error result", () => {
  const result = err("error");
  const mapped = map(result, (x: number) => x * 2);
  assertEquals(mapped.ok, false);
  if (!mapped.ok) {
    assertEquals(mapped.error, "error");
  }
});

Deno.test("flatMap chains successful results", () => {
  const result = ok(5);
  const chained = flatMap(result, (x: number) => ok(x * 2));
  assertEquals(chained.ok, true);
  if (chained.ok) {
    assertEquals(chained.value, 10);
  }
});

Deno.test("flatMap chains to error result", () => {
  const result = ok(5);
  const chained = flatMap(result, (_x: number) => err("chained error"));
  assertEquals(chained.ok, false);
  if (!chained.ok) {
    assertEquals(chained.error, "chained error");
  }
});

Deno.test("flatMap preserves original error", () => {
  const result = err("original error");
  const chained = flatMap(result, (x: number) => ok(x * 2));
  assertEquals(chained.ok, false);
  if (!chained.ok) {
    assertEquals(chained.error, "original error");
  }
});

Deno.test("mapErr transforms error result", () => {
  const result = err("error");
  const mapped = mapErr(result, (e: string) => `transformed: ${e}`);
  assertEquals(mapped.ok, false);
  if (!mapped.ok) {
    assertEquals(mapped.error, "transformed: error");
  }
});

Deno.test("mapErr preserves successful result", () => {
  const result = ok("success");
  const mapped = mapErr(result, (e: string) => `transformed: ${e}`);
  assertEquals(mapped.ok, true);
  if (mapped.ok) {
    assertEquals(mapped.value, "success");
  }
});

Deno.test("all combines successful results", () => {
  const results = [ok(1), ok(2), ok(3)] as const;
  const combined = all(results);
  assertEquals(combined.ok, true);
  if (combined.ok) {
    assertEquals(combined.value, [1, 2, 3]);
  }
});

Deno.test("all returns first error", () => {
  const results = [ok(1), err("error2"), err("error3")] as const;
  const combined = all(results);
  assertEquals(combined.ok, false);
  if (!combined.ok) {
    assertEquals(combined.error, "error2");
  }
});

Deno.test("all handles empty array", () => {
  const results: Array<ReturnType<typeof ok<number>>> = [];
  const combined = all(results);
  assertEquals(combined.ok, true);
  if (combined.ok) {
    assertEquals(combined.value, []);
  }
});

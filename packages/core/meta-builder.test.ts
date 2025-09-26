import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { mergeMeta, meta } from "./meta-builder.ts";

Deno.test("meta builder creates empty meta", () => {
  const m = meta().build();
  assertEquals(Object.keys(m).length, 0);
});

Deno.test("meta builder adds http capability", () => {
  const m = meta().withHttp("https://api.example.com").build();
  assertEquals(m.http?.baseUrl, "https://api.example.com");
  assertEquals(m.http?.auth, undefined);
});

Deno.test("meta builder adds http with auth", () => {
  const m = meta().withHttp("https://api.example.com", "bearer").build();
  assertEquals(m.http?.baseUrl, "https://api.example.com");
  assertEquals(m.http?.auth, "bearer");
});

Deno.test("meta builder adds kv capability", () => {
  const m = meta().withKv("test-namespace").build();
  assertEquals(m.kv?.namespace, "test-namespace");
});

Deno.test("meta builder adds db capability", () => {
  const m = meta().withDb("ro").build();
  assertEquals(m.db?.role, "ro");
});

Deno.test("meta builder adds queue capability", () => {
  const m = meta().withQueue("test-queue").build();
  assertEquals(m.queue?.name, "test-queue");
});

Deno.test("meta builder adds time capability", () => {
  const m = meta().withTime().build();
  assertEquals(typeof m.time, "object");
});

Deno.test("meta builder adds crypto capability", () => {
  const m = meta().withCrypto().build();
  assertEquals(typeof m.crypto, "object");
});

Deno.test("meta builder adds log capability", () => {
  const m = meta().withLog("debug").build();
  assertEquals(m.log?.level, "debug");
});

Deno.test("meta builder adds fs capability", () => {
  const m = meta().withFs({ tempDir: true }).build();
  assertEquals(m.fs?.tempDir, true);
});

Deno.test("meta builder adds lock capability", () => {
  const m = meta().withLock().build();
  assertEquals(typeof m.lock, "object");
});

Deno.test("meta builder adds socket capability", () => {
  const m = meta().withSocket().build();
  assertEquals(typeof m.socket, "object");
});

Deno.test("meta builder adds retry policy", () => {
  const m = meta().withRetry(3, 100).build();
  assertEquals(m.retry?.times, 3);
  assertEquals(m.retry?.delayMs, 100);
});

Deno.test("meta builder adds timeout policy", () => {
  const m = meta().withTimeout({ ms: 5000 }).build();
  assertEquals(m.timeout?.ms, 5000);
});

Deno.test("meta builder adds circuit breaker policy", () => {
  const m = meta().withCircuit("test-circuit").build();
  assertEquals(m.circuit?.name, "test-circuit");
});

Deno.test("meta builder chains multiple capabilities", () => {
  const m = meta()
    .withHttp("https://api.example.com")
    .withKv("test-ns")
    .withDb("rw")
    .withLog("info")
    .withRetry(2, 50)
    .build();

  assertEquals(m.http?.baseUrl, "https://api.example.com");
  assertEquals(m.kv?.namespace, "test-ns");
  assertEquals(m.db?.role, "rw");
  assertEquals(m.log?.level, "info");
  assertEquals(m.retry?.times, 2);
});

Deno.test("mergeMeta combines two meta objects", () => {
  const m1 = meta().withHttp("https://api.example.com").build();
  const m2 = meta().withKv("test-ns").build();
  const merged = mergeMeta(m1, m2);

  assertEquals(merged.http?.baseUrl, "https://api.example.com");
  assertEquals(merged.kv?.namespace, "test-ns");
});

Deno.test("mergeMeta second meta overrides first", () => {
  const m1 = meta().withLog("debug").build();
  const m2 = meta().withLog("info").build();
  const merged = mergeMeta(m1, m2);

  assertEquals(merged.log?.level, "info");
});

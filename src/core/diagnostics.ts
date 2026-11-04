export async function doctor(probe: (name: "menu" | "product" | "rating" | "exchange" | "page") => Promise<{ ok: boolean; message?: string }>, auth: Record<string, unknown>, authProbe?: () => Promise<{ status: number; body: unknown }>) {
  const names = ["menu", "product", "rating", "exchange", "page"] as const;
  const checks = await Promise.all(names.map(async name => {
    try { return { name, ...await probe(name) }; } catch { return { name, ok: false, message: "Probe failed" }; }
  }));
  let authenticated: boolean | null = null;
  if (authProbe) {
    try {
      const response = await authProbe();
      const body = response.body;
      authenticated = response.status === 200 && body !== null && typeof body === "object" && "retCode" in body && String(body.retCode) === "200";
    } catch { /* A missing session or network failure cannot establish authentication. */ }
  }
  return { ok: checks.every(check => check.ok), checks, auth: { ...auth, authenticated } };
}

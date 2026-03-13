/** Shared HTTP helpers for the formalization pipeline. */

/** Fetch a JSON API route, throwing on non-OK responses. */
export async function fetchApi<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export async function verifyLean(leanCode: string) {
  const res = await fetch("/api/verification/lean", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leanCode }),
  });
  const data = await res.json();
  return { valid: Boolean(data.valid), errors: (data.errors as string | undefined) ?? "" };
}

export async function generateLean(
  informalProof: string,
  previousAttempt?: string,
  errors?: string,
  instruction?: string,
  contextLeanCode?: string,
) {
  const data = await fetchApi<{ leanCode: string }>(
    "/api/formalization/lean",
    { informalProof, previousAttempt, errors, instruction, contextLeanCode },
  );
  return data.leanCode;
}

export async function generateSemiformal(text: string) {
  const data = await fetchApi<{ proof: string }>(
    "/api/formalization/semiformal",
    { text },
  );
  return data.proof;
}

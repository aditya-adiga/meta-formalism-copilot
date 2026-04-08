/** Strip markdown code fences if present, regardless of language tag. */
export function stripCodeFences(raw: string): string {
  const fenced = raw.match(/```(?:\w*)?[\r\n]([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

/** Strip the leading code fence from partial/streaming text.
 *  Unlike stripCodeFences, this works on incomplete text where the closing fence hasn't arrived yet. */
export function stripLeadingCodeFence(raw: string): string {
  return raw.replace(/^```\w*\r?\n/, "");
}

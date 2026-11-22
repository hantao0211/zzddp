export function pagePhotoUrl(id: string, size: "thumb" | "screen" | "full" = "screen", download = false) {
  const query = new URLSearchParams();
  if (size !== "full") query.set("size", size);
  if (download) query.set("download", "1");
  return `/assistant-api/learning/pages/${encodeURIComponent(id)}${query.size ? "?" + query : ""}`;
}

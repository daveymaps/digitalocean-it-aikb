export function redact(value = "") {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <redacted>")
    .replace(/Basic\s+[A-Za-z0-9._~+/=-]+/gi, "Basic <redacted>")
    .replace(/(api[_-]?key|token|password|secret|client_secret)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "<ip-address>");
}

export function adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join(" ");
  if (node.text) return node.text;
  if (node.content) return adfToText(node.content);
  return "";
}

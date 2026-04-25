const STACK_LINES = 8;
const RESPONSE_SNIPPET_LIMIT = 1024;
const STDERR_SNIPPET_LIMIT = 1024;

function cleanText(value, limit) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!limit || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function limitLines(value, maxLines) {
  const lines = String(value ?? '').split(/\r?\n/).filter(line => line.length > 0);
  if (!maxLines || lines.length <= maxLines) return lines;
  return lines.slice(0, maxLines);
}

function normalizeCurlMeta(err = {}) {
  const curl = err.curl && typeof err.curl === 'object' ? err.curl : {};
  const exitCode = Number.isFinite(Number.parseInt(curl.exitCode, 10))
    ? Number.parseInt(curl.exitCode, 10)
    : Number.isFinite(Number.parseInt(err.exitCode, 10))
      ? Number.parseInt(err.exitCode, 10)
      : undefined;
  const timedOut = curl.timedOut !== undefined ? Boolean(curl.timedOut) : (err.timedOut !== undefined ? Boolean(err.timedOut) : undefined);
  const timeoutMs = Number.isFinite(Number.parseInt(curl.timeoutMs, 10))
    ? Number.parseInt(curl.timeoutMs, 10)
    : Number.isFinite(Number.parseInt(err.timeoutMs, 10))
      ? Number.parseInt(err.timeoutMs, 10)
      : undefined;
  const stderrSnippet = cleanText(curl.stderrSnippet || err.stderrSnippet || err.stderr || '', STDERR_SNIPPET_LIMIT);

  const meta = {};
  if (exitCode !== undefined) meta.exitCode = exitCode;
  if (timedOut !== undefined) meta.timedOut = timedOut;
  if (timeoutMs !== undefined) meta.timeoutMs = timeoutMs;
  if (stderrSnippet) meta.stderrSnippet = stderrSnippet;
  return meta;
}

function toErrorDetails(err) {
  if (!err) return null;

  const stack = limitLines(err.stack || '', STACK_LINES).join('\n');
  const details = {
    name: cleanText(err.name || 'Error', 80),
    message: cleanText(err.message || String(err), 500),
  };

  if (stack) details.stack = stack;

  const code = err.code || err.errno;
  if (code !== undefined && code !== null && String(code).trim()) {
    details.code = String(code).trim();
  }

  if (err.errno !== undefined && err.errno !== null && String(err.errno).trim()) {
    details.errno = String(err.errno).trim();
  }

  if (err.syscall !== undefined && err.syscall !== null && String(err.syscall).trim()) {
    details.syscall = String(err.syscall).trim();
  }

  if (err.httpStatus !== undefined && err.httpStatus !== null && String(err.httpStatus).trim()) {
    const parsedStatus = Number.parseInt(err.httpStatus, 10);
    details.httpStatus = Number.isFinite(parsedStatus) ? parsedStatus : String(err.httpStatus).trim();
  }

  const curl = normalizeCurlMeta(err);
  if (Object.keys(curl).length > 0) {
    details.curl = curl;
  }

  const responseSnippet = cleanText(err.responseSnippet || err.responseText || err.body || '', RESPONSE_SNIPPET_LIMIT);
  if (responseSnippet) {
    details.responseSnippet = responseSnippet;
  }

  return details;
}

module.exports = {
  toErrorDetails,
};

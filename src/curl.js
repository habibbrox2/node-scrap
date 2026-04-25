const { spawn } = require('child_process');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:108.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
];

let curlQueue = Promise.resolve();
let nextAllowedAt = 0;

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  const waitMs = Math.max(0, Number.parseInt(ms, 10) || 0);
  if (!waitMs) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, waitMs));
}

function getRequestConfig() {
  return {
    minIntervalMs: Math.max(
      0,
      Math.min(5000, Number.parseInt(process.env.SCRAPER_REQUEST_MIN_INTERVAL_MS || '0', 10) || 0)
    ),
    maxRetries: Math.max(0, Number.parseInt(process.env.SCRAPER_REQUEST_MAX_RETRIES || '2', 10) || 0),
    retryBaseMs: Math.max(0, Number.parseInt(process.env.SCRAPER_REQUEST_RETRY_BASE_MS || '500', 10) || 0),
    retryMaxMs: Math.max(0, Number.parseInt(process.env.SCRAPER_REQUEST_RETRY_MAX_MS || '5000', 10) || 0),
  };
}

function clampSnippet(value, limit = 1024) {
  const text = String(value ?? '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function runCurl(args, options = {}) {
  const { input, timeout = 20000 } = options;

  return new Promise((resolve, reject) => {
    const child = spawn('curl.exe', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', err => {
      clearTimeout(timer);
      err.exitCode = typeof child.exitCode === 'number' ? child.exitCode : undefined;
      err.timedOut = timedOut;
      err.timeoutMs = timeout;
      err.stderrSnippet = clampSnippet(stderr, 1024);
      err.curl = {
        exitCode: typeof child.exitCode === 'number' ? child.exitCode : undefined,
        timedOut,
        timeoutMs: timeout,
        stderrSnippet: clampSnippet(stderr, 1024),
      };
      reject(err);
    });

    child.on('close', code => {
      clearTimeout(timer);

      if (timedOut) {
        const err = new Error(`curl timed out after ${timeout}ms`);
        err.exitCode = code;
        err.timedOut = true;
        err.timeoutMs = timeout;
        err.stderrSnippet = clampSnippet(stderr, 1024);
        err.curl = {
          exitCode: code,
          timedOut: true,
          timeoutMs: timeout,
          stderrSnippet: clampSnippet(stderr, 1024),
        };
        return reject(err);
      }

      if (code !== 0) {
        const err = new Error(clampSnippet(stderr.trim() || `curl exited with code ${code}`, 1024));
        err.exitCode = code;
        err.timedOut = false;
        err.timeoutMs = timeout;
        err.stderrSnippet = clampSnippet(stderr, 1024);
        err.curl = {
          exitCode: code,
          timedOut: false,
          timeoutMs: timeout,
          stderrSnippet: clampSnippet(stderr, 1024),
        };
        return reject(err);
      }

      resolve({ stdout, stderr });
    });

    if (typeof input === 'string' && input.length > 0) {
      child.stdin.write(input);
    }

    child.stdin.end();
  });
}

function scheduleRequest(task) {
  const { minIntervalMs } = getRequestConfig();
  const run = curlQueue.then(async () => {
    const waitMs = Math.max(0, nextAllowedAt - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const startedAt = Date.now();
    try {
      return await task();
    } finally {
      nextAllowedAt = startedAt + minIntervalMs;
    }
  });

  curlQueue = run.catch(() => {});
  return run;
}

function buildHeaderArgs(headers = {}) {
  return Object.entries({
    'User-Agent': getRandomUserAgent(),
    'Accept-Language': 'bn,en-US;q=0.9,en;q=0.8',
    ...headers,
  }).flatMap(([key, value]) => [
    '-H',
    `${key}: ${value}`,
  ]);
}

function parseCurlHttpResponse(stdout, statusMarker) {
  let responseBody = stdout;
  let statusCode = 0;
  const markerIndex = stdout.lastIndexOf(statusMarker);

  if (markerIndex >= 0) {
    responseBody = stdout.slice(0, markerIndex).replace(/\r?\n$/, '');
    const statusRaw = stdout.slice(markerIndex + statusMarker.length).trim();
    statusCode = Number.parseInt(statusRaw, 10) || 0;
  }

  return {
    statusCode,
    body: responseBody,
  };
}

function buildHttpError(message, { statusCode, body, timeout, stderr, exitCode, timedOut }) {
  const err = new Error(message);
  err.httpStatus = statusCode;
  err.responseSnippet = clampSnippet(body || '', 1024);
  err.exitCode = exitCode;
  err.timedOut = Boolean(timedOut);
  err.timeoutMs = timeout;
  err.stderrSnippet = clampSnippet(stderr || '', 1024);
  err.curl = {
    exitCode,
    timedOut: Boolean(timedOut),
    timeoutMs: timeout,
    stderrSnippet: clampSnippet(stderr || '', 1024),
  };
  return err;
}

function isRetryableCurlError(err, statusCode) {
  if (statusCode === 429 || (Number.isFinite(statusCode) && statusCode >= 500)) return true;
  if (err?.timedOut) return true;

  const code = Number.parseInt(err?.exitCode, 10);
  if ([6, 7, 16, 18, 28, 35, 52, 56].includes(code)) return true;

  const errno = String(err?.code || err?.errno || '').toUpperCase();
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE'].includes(errno)) {
    return true;
  }

  const message = String(err?.message || '').toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('connection reset') ||
    message.includes('could not resolve host') ||
    message.includes('failed to connect') ||
    message.includes('received http code 429') ||
    message.includes('server error')
  );
}

function computeRetryDelay(attempt) {
  const { retryBaseMs, retryMaxMs } = getRequestConfig();
  const backoff = retryBaseMs * (2 ** Math.max(0, attempt - 1));
  return Math.min(retryMaxMs, backoff);
}

async function curlGet(url, options = {}) {
  const { headers = {}, timeout = 20000 } = options;
  const { maxRetries } = getRequestConfig();
  const attempts = Math.max(0, maxRetries) + 1;
  const statusMarker = '__CURL_HTTP_STATUS__';
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await scheduleRequest(() => {
        const args = [
          '--silent',
          '--show-error',
          '--location',
          '--compressed',
          ...buildHeaderArgs(headers),
          '--write-out',
          `\n${statusMarker}:%{http_code}`,
          url,
        ];

        return runCurl(args, { timeout });
      });

      const parsed = parseCurlHttpResponse(response.stdout, statusMarker);
      if (parsed.statusCode && (parsed.statusCode < 200 || parsed.statusCode >= 300)) {
        const httpErr = buildHttpError(
          `curl GET failed with HTTP ${parsed.statusCode}`,
          {
            statusCode: parsed.statusCode,
            body: parsed.body,
            timeout,
            stderr: response.stderr,
            exitCode: 0,
            timedOut: false,
          }
        );

        if (attempt < attempts && isRetryableCurlError(httpErr, parsed.statusCode)) {
          lastError = httpErr;
          await sleep(computeRetryDelay(attempt));
          continue;
        }

        throw httpErr;
      }

      return parsed.body;
    } catch (err) {
      lastError = err;
      const statusCode = Number.parseInt(err?.httpStatus, 10) || 0;
      if (attempt < attempts && isRetryableCurlError(err, statusCode)) {
        await sleep(computeRetryDelay(attempt));
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('curl GET failed');
}

async function curlPostJson(url, payload, options = {}) {
  const { headers = {}, timeout = 30000 } = options;
  const body = JSON.stringify(payload);
  const statusMarker = '__CURL_HTTP_STATUS__:';
  const response = await scheduleRequest(() => {
    const args = [
      '--silent',
      '--show-error',
      '--location',
      '--compressed',
      '-X',
      'POST',
      ...buildHeaderArgs({
        'Content-Type': 'application/json',
        ...headers,
      }),
      '--data-binary',
      '@-',
      '--write-out',
      `\n${statusMarker}%{http_code}`,
      url,
    ];

    return runCurl(args, { input: body, timeout });
  });

  return parseCurlHttpResponse(response.stdout, statusMarker);
}

async function curlPostForm(url, payload, options = {}) {
  const { headers = {}, timeout = 30000 } = options;
  const body = new URLSearchParams(payload || {}).toString();

  const response = await scheduleRequest(() => {
    const args = [
      '--silent',
      '--show-error',
      '--location',
      '--compressed',
      '-X',
      'POST',
      ...buildHeaderArgs({
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        ...headers,
      }),
      '--data-binary',
      '@-',
      url,
    ];

    return runCurl(args, { input: body, timeout });
  });

  return response.stdout;
}

module.exports = {
  curlGet,
  curlPostJson,
  curlPostForm,
};

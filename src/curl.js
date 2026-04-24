const { spawn } = require('child_process');

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'bn,en-US;q=0.9,en;q=0.8',
};

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
      reject(err);
    });

    child.on('close', code => {
      clearTimeout(timer);

      if (timedOut) {
        return reject(new Error(`curl timed out after ${timeout}ms`));
      }

      if (code !== 0) {
        return reject(new Error(stderr.trim() || `curl exited with code ${code}`));
      }

      resolve({ stdout, stderr });
    });

    if (typeof input === 'string' && input.length > 0) {
      child.stdin.write(input);
    }

    child.stdin.end();
  });
}

function buildHeaderArgs(headers = {}) {
  return Object.entries({ ...DEFAULT_HEADERS, ...headers }).flatMap(([key, value]) => [
    '-H',
    `${key}: ${value}`,
  ]);
}

async function curlGet(url, options = {}) {
  const { headers = {}, timeout = 20000 } = options;

  const args = [
    '--silent',
    '--show-error',
    '--location',
    '--compressed',
    ...buildHeaderArgs(headers),
    url,
  ];

  const { stdout } = await runCurl(args, { timeout });
  return stdout;
}

async function curlPostJson(url, payload, options = {}) {
  const { headers = {}, timeout = 30000 } = options;
  const body = JSON.stringify(payload);

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
    url,
  ];

  const { stdout } = await runCurl(args, { input: body, timeout });
  return stdout;
}

module.exports = {
  curlGet,
  curlPostJson,
};

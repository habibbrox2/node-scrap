<?php
declare(strict_types=1);

/**
 * Simple PUSH endpoint example for Brox Scraper
 * - Supports both articles and mobiles payload
 * - Optional Bearer token check
 * - Stores each request as JSONL log
 */

header('Content-Type: application/json; charset=utf-8');

// -------------------------
// Basic config
// -------------------------
$requireAuth = false; // true করলে Bearer token বাধ্যতামূলক হবে
$authToken = 'CHANGE_ME_SECRET_TOKEN';
$logDir = __DIR__ . '/logs';
$logFile = $logDir . '/push-received.jsonl';

if (!is_dir($logDir)) {
    mkdir($logDir, 0775, true);
}

// -------------------------
// Helpers
// -------------------------
function respond(int $statusCode, array $body): void
{
    http_response_code($statusCode);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getBearerToken(): string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (preg_match('/Bearer\s+(.+)/i', (string)$header, $m)) {
        return trim($m[1]);
    }
    return '';
}

// -------------------------
// Validate request
// -------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, [
        'ok' => false,
        'message' => 'Method not allowed. Use POST.',
    ]);
}

if ($requireAuth) {
    $incomingToken = getBearerToken();
    if ($incomingToken === '' || !hash_equals($authToken, $incomingToken)) {
        respond(401, [
            'ok' => false,
            'message' => 'Unauthorized',
        ]);
    }
}

$raw = file_get_contents('php://input');
if ($raw === false || trim($raw) === '') {
    respond(400, [
        'ok' => false,
        'message' => 'Empty body',
    ]);
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    respond(400, [
        'ok' => false,
        'message' => 'Invalid JSON payload',
    ]);
}

// -------------------------
// Understand payload shape
// -------------------------
$kind = 'unknown';
$count = 0;

if (isset($payload['articles']) && is_array($payload['articles'])) {
    $kind = 'articles';
    $count = count($payload['articles']);
} elseif (isset($payload['mobiles']) && is_array($payload['mobiles'])) {
    $kind = 'mobiles';
    $count = count($payload['mobiles']);
}

// -------------------------
// Persist raw payload log
// -------------------------
$logEntry = [
    'receivedAt' => gmdate('c'),
    'remoteIp' => $_SERVER['REMOTE_ADDR'] ?? null,
    'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
    'kind' => $kind,
    'count' => $count,
    'source' => $payload['source'] ?? null,
    'trigger' => $payload['trigger'] ?? null,
    'payload' => $payload,
];

file_put_contents(
    $logFile,
    json_encode($logEntry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
    FILE_APPEND | LOCK_EX
);

respond(200, [
    'ok' => true,
    'message' => 'Push received',
    'kind' => $kind,
    'count' => $count,
]);


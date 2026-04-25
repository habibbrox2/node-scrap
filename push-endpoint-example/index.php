<?php
declare(strict_types=1);

/**
 * Simple PUSH endpoint example for Brox Scraper
 * - Supports both articles and mobiles payload
 * - Optional Bearer token check
 * - Stores each request in MySQL (mysqli) and JSONL fallback log
 */

header('Content-Type: application/json; charset=utf-8');

// -------------------------
// Basic config
// -------------------------
$requireAuth = false; // true করলে Bearer token বাধ্যতামূলক হবে
$authToken = 'CHANGE_ME_SECRET_TOKEN';

// -------------------------
// MySQL (mysqli) config
// -------------------------
$useMysqli = true; // shared hosting এ true রাখুন
$dbHost = 'localhost';
$dbUser = 'db_username';
$dbPass = 'db_password';
$dbName = 'db_name';
$dbPort = 3306;

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

function connectMysqli(
    bool $useMysqli,
    string $dbHost,
    string $dbUser,
    string $dbPass,
    string $dbName,
    int $dbPort
): ?mysqli {
    if (!$useMysqli) {
        return null;
    }
    if (!extension_loaded('mysqli')) {
        return null;
    }

    mysqli_report(MYSQLI_REPORT_OFF);
    $conn = @new mysqli($dbHost, $dbUser, $dbPass, $dbName, $dbPort);
    if ($conn->connect_errno) {
        return null;
    }

    $conn->set_charset('utf8mb4');
    return $conn;
}

function ensurePushLogTable(mysqli $conn): bool
{
    $sql = <<<SQL
CREATE TABLE IF NOT EXISTS push_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  received_at DATETIME NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'unknown',
  item_count INT NOT NULL DEFAULT 0,
  source VARCHAR(100) NULL,
  trigger_name VARCHAR(100) NULL,
  remote_ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  payload_json LONGTEXT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_received_at (received_at),
  KEY idx_kind (kind),
  KEY idx_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;

    return (bool)$conn->query($sql);
}

function savePushLogToDb(mysqli $conn, array $entry): bool
{
    $sql = "INSERT INTO push_logs (received_at, kind, item_count, source, trigger_name, remote_ip, user_agent, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return false;
    }

    $receivedAt = date('Y-m-d H:i:s');
    $kind = (string)($entry['kind'] ?? 'unknown');
    $count = (int)($entry['count'] ?? 0);
    $source = isset($entry['source']) ? (string)$entry['source'] : null;
    $trigger = isset($entry['trigger']) ? (string)$entry['trigger'] : null;
    $remoteIp = isset($entry['remoteIp']) ? (string)$entry['remoteIp'] : null;
    $userAgent = isset($entry['userAgent']) ? (string)$entry['userAgent'] : null;
    $payloadJson = json_encode($entry['payload'] ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    $stmt->bind_param(
        'ssisssss',
        $receivedAt,
        $kind,
        $count,
        $source,
        $trigger,
        $remoteIp,
        $userAgent,
        $payloadJson
    );

    $ok = $stmt->execute();
    $stmt->close();
    return (bool)$ok;
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
$items = [];

// New unified shape: `items` (preferred)
if (isset($payload['items']) && is_array($payload['items'])) {
    $items = $payload['items'];

    $contentType = isset($payload['contentType']) ? strtolower(trim((string)$payload['contentType'])) : '';
    if ($contentType === 'mobile') {
        $kind = 'mobiles';
    } elseif ($contentType === 'article') {
        $kind = 'articles';
    } else {
        $kind = 'items';
    }
    $count = count($items);
} elseif (isset($payload['articles']) && is_array($payload['articles'])) {
    // Legacy shape: `articles`
    $kind = 'articles';
    $items = $payload['articles'];
    $count = count($items);
} elseif (isset($payload['mobiles']) && is_array($payload['mobiles'])) {
    // Legacy shape: `mobiles`
    $kind = 'mobiles';
    $items = $payload['mobiles'];
    $count = count($items);
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

// Try MySQL first (mysqli), fallback to jsonl file log.
$storedIn = 'file';
$conn = connectMysqli($useMysqli, $dbHost, $dbUser, $dbPass, $dbName, $dbPort);
if ($conn instanceof mysqli) {
    if (ensurePushLogTable($conn) && savePushLogToDb($conn, $logEntry)) {
        $storedIn = 'mysqli';
    }
    $conn->close();
}

if ($storedIn !== 'mysqli') {
    file_put_contents(
        $logFile,
        json_encode($logEntry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );
}

respond(200, [
    'ok' => true,
    'message' => 'Push received',
    'kind' => $kind,
    'count' => $count,
    'itemsKey' => isset($payload['items']) ? 'items' : (isset($payload['articles']) ? 'articles' : (isset($payload['mobiles']) ? 'mobiles' : null)),
    'storedIn' => $storedIn,
]);

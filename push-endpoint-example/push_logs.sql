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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

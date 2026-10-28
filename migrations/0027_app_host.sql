-- v3.33: the address the administrator uses. Once known, the Worker's
-- workers.dev and preview addresses redirect there instead of serving the app.
CREATE TABLE IF NOT EXISTS app_host (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hostname TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

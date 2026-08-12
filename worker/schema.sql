-- D1 Schema for milloin

CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    admin_token_hash TEXT NOT NULL,
    is_closed INTEGER DEFAULT 0,
    final_option_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS options (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL,
    option_text TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS voters (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL,
    voter_name TEXT NOT NULL,
    voter_token TEXT NOT NULL,
    ip_hash TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS votes (
    voter_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    decision TEXT CHECK(decision IN ('yes', 'no', 'maybe')),
    PRIMARY KEY (voter_id, option_id),
    FOREIGN KEY (voter_id) REFERENCES voters(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_options_poll ON options(poll_id);
CREATE INDEX IF NOT EXISTS idx_voters_poll ON voters(poll_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_id);

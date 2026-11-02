-- FitSaathi schema v1. Every table carries created_at / updated_at (ISO timestamps).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  kind TEXT NOT NULL,
  schedule_json TEXT NOT NULL,
  reminder_time TEXT,
  reminder_enabled INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_logs (
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('done', 'skip', 'miss')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);

CREATE TABLE IF NOT EXISTS supplements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dose TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL,
  alarm INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supplement_logs (
  supplement_id TEXT NOT NULL,
  date TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (supplement_id, date)
);

CREATE TABLE IF NOT EXISTS water_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  ml INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_water_logs_date ON water_logs(date);

CREATE TABLE IF NOT EXISTS weight_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  kg REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weight_logs_date ON weight_logs(date);

CREATE TABLE IF NOT EXISTS food_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_local TEXT,
  category TEXT NOT NULL,
  serving_label TEXT NOT NULL,
  serving_grams REAL NOT NULL,
  kcal REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  vegetarian INTEGER NOT NULL DEFAULT 1,
  custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  food_id TEXT NOT NULL,
  food_name TEXT NOT NULL,
  servings REAL NOT NULL,
  kcal REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  outside_window INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meal_logs_date ON meal_logs(date);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  date TEXT NOT NULL,
  weight_kg REAL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alarms (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  hour INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  days_json TEXT NOT NULL DEFAULT '[]',
  date TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_log_sched ON notification_log(scheduled_for);

CREATE TABLE IF NOT EXISTS steps (
  date TEXT PRIMARY KEY,
  steps INTEGER NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS points_ledger (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_points_ledger_date ON points_ledger(date);

CREATE TABLE IF NOT EXISTS weekly_summaries (
  week_start TEXT PRIMARY KEY,
  week_end TEXT NOT NULL,
  habits_pct REAL NOT NULL,
  avg_water_ml REAL NOT NULL,
  workouts_done INTEGER NOT NULL,
  weight_delta_kg REAL,
  avg_kcal REAL,
  avg_protein_g REAL,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database file path
const DB_PATH = process.env.DB_PATH || join(__dirname, '../../data/reactflux.db');

// Ensure data directory exists
import { mkdirSync } from 'fs';
const dataDir = dirname(DB_PATH);
mkdirSync(dataDir, { recursive: true });

// Initialize database connection
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize schema
function initializeSchema() {
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  console.log('Database schema initialized');
}

// Run initialization
initializeSchema();

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

export default db;

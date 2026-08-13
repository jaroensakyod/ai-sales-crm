// Load .env so integration tests can reach the DB. No-ops if .env is absent
// (unit tests that don't need env still run).
import "dotenv/config";

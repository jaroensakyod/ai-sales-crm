-- HNSW index for RAG similarity search on knowledge_chunks.embedding.
-- Cosine distance (vector_cosine_ops) matches Gemini text-embedding-004 usage.
-- HNSW (unlike IVFFlat) builds fine on an empty table, so it is safe here.
-- Queries still filter tenant_id first; pgvector 0.8 iterative scans handle the
-- post-filter. A composite/partial ANN index per tenant can come later if needed.
CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_hnsw"
  ON "knowledge_chunks"
  USING hnsw ("embedding" vector_cosine_ops);

-- Additive migration: collections are distinct from tags; existing data remains intact.
CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS paper_collections (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, collection_id)
);
CREATE INDEX IF NOT EXISTS idx_paper_tags_tag ON paper_tags(tag_id, paper_id);
CREATE INDEX IF NOT EXISTS idx_paper_collections_collection ON paper_collections(collection_id, paper_id);
CREATE INDEX IF NOT EXISTS idx_notes_annotation ON notes(annotation_id);

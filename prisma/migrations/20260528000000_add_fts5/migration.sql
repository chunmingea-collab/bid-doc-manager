-- Full-text search index over File.fileName / extractedText / correctedText.
-- We use external content (no synchronized rowid) and store the File.id as
-- an UNINDEXED column so we can join back to File.

CREATE VIRTUAL TABLE IF NOT EXISTS "file_fts" USING fts5(
  "id" UNINDEXED,
  "fileName",
  "extractedText",
  "correctedText",
  tokenize = 'unicode61'
);

-- Backfill from existing rows
INSERT INTO "file_fts" ("id", "fileName", "extractedText", "correctedText")
SELECT "id", "fileName", "extractedText", COALESCE("correctedText", '')
FROM "File"
WHERE "isDeleted" = 0;

-- Keep the FTS index in sync with File row mutations
CREATE TRIGGER IF NOT EXISTS "file_fts_ai" AFTER INSERT ON "File"
WHEN NEW."isDeleted" = 0
BEGIN
  INSERT INTO "file_fts" ("id", "fileName", "extractedText", "correctedText")
  VALUES (NEW."id", NEW."fileName", NEW."extractedText", COALESCE(NEW."correctedText", ''));
END;

CREATE TRIGGER IF NOT EXISTS "file_fts_ad" AFTER DELETE ON "File"
BEGIN
  DELETE FROM "file_fts" WHERE "id" = OLD."id";
END;

CREATE TRIGGER IF NOT EXISTS "file_fts_au" AFTER UPDATE OF "fileName", "extractedText", "correctedText", "isDeleted" ON "File"
BEGIN
  DELETE FROM "file_fts" WHERE "id" = OLD."id";
  INSERT INTO "file_fts" ("id", "fileName", "extractedText", "correctedText")
  SELECT NEW."id", NEW."fileName", NEW."extractedText", COALESCE(NEW."correctedText", '')
  WHERE NEW."isDeleted" = 0;
END;

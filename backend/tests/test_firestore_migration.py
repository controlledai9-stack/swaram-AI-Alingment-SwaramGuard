import sqlite3

from app.storage.base import COLLECTIONS
from app.storage.sqlite_store import SQLiteStore
from scripts.migrate_sqlite_to_firestore import migrate


def test_migration_preserves_ids_owners_and_existing_docs(tmp_path):
    path = tmp_path / "source.db"
    source = SQLiteStore(str(path), workspace="demo")
    destination = SQLiteStore(":memory:", workspace="demo")
    for collection in COLLECTIONS:
        source.put(collection, "source-id", {"value": collection})
    source.put("runs", "owned", {"owner": "original@example.com"})
    source.put("runs", "existing", {"value": "source"})
    destination.put("runs", "existing", {"value": "destination"})
    SQLiteStore(str(path), workspace="other").put("runs", "other", {})

    def copy_batch(collection, docs, dry_run=False):
        missing = {doc_id for doc_id in docs if destination.get(collection, doc_id) is None}
        if not dry_run:
            destination.put_many(collection, [(doc_id, docs[doc_id]) for doc_id in missing])
        return missing

    with sqlite3.connect(path) as reader:
        preview = list(migrate(reader, "demo", lambda c, docs: copy_batch(c, docs, dry_run=True), "admin@example.com"))
        assert destination.get("runs", "source-id") is None
        assert list(migrate(reader, "demo", copy_batch, "admin@example.com")) == preview
        assert all(missing == 0 for _, _, missing, _ in migrate(reader, "demo", copy_batch))

    assert {collection for collection, *_ in preview} == set(COLLECTIONS)
    assert ("runs", 3, 2, 1) in preview
    assert destination.get("runs", "source-id") == {"value": "runs", "owner": "admin@example.com"}
    assert destination.get("runs", "owned") == {"owner": "original@example.com"}
    assert destination.get("runs", "existing") == {"value": "destination"}
    assert destination.get("runs", "other") is None

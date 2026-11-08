"""Copy a SwaramGuard SQLite workspace to Firestore without overwriting documents."""
from __future__ import annotations

import argparse
from contextlib import closing
from itertools import islice
import json
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.storage.base import COLLECTIONS
from app.storage.firestore_store import FirestoreStore


def migrate(source, workspace, copy_batch, owner=None):
    for collection in COLLECTIONS:
        rows = source.execute(
            "SELECT doc_id, data FROM docs WHERE workspace = ? AND collection = ? ORDER BY doc_id",
            (workspace, collection),
        )
        total = missing = assigned = 0
        while chunk := list(islice(rows, 200)):
            docs = {doc_id: json.loads(data) for doc_id, data in chunk}
            owners = set()
            if collection == "runs" and owner:
                for doc_id, data in docs.items():
                    if not data.get("owner"):
                        data["owner"] = owner
                        owners.add(doc_id)
            new_ids = copy_batch(collection, docs)
            total += len(docs)
            missing += len(new_ids)
            assigned += len(owners.intersection(new_ids))
        yield collection, total, missing, assigned


def firestore_batch_writer(store, dry_run):
    from google.cloud.firestore_v1 import transactional

    @transactional
    def create_missing(transaction, refs, docs):
        existing = {snap.id for snap in store.db.get_all(refs, transaction=transaction) if snap.exists}
        new_ids = docs.keys() - existing
        for ref in refs:
            if ref.id in new_ids:
                transaction.create(ref, docs[ref.id])
        return new_ids

    def copy_batch(collection, docs):
        refs = [store._col(collection).document(doc_id) for doc_id in docs]
        if dry_run:
            existing = {snap.id for snap in store.db.get_all(refs) if snap.exists}
            return docs.keys() - existing
        return create_missing(store.db.transaction(), refs, docs)

    return copy_batch


def main():
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, default=Path(settings.sqlite_path))
    parser.add_argument("--workspace", default=settings.workspace)
    parser.add_argument("--owner", help="Assign this email to copied runs without an owner")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--inventory", action="store_true", help="Count source documents without connecting to Firestore")
    mode.add_argument("--dry-run", action="store_true", help="Compare with Firestore without writing")
    mode.add_argument("--apply", action="store_true", help="Copy missing documents to Firestore")
    args = parser.parse_args()
    owner = args.owner.strip().lower() if args.owner else None
    path = args.sqlite.resolve()
    if not path.is_file():
        parser.error(f"SQLite file does not exist: {path}")

    with closing(sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)) as source:
        source.execute("BEGIN")
        if args.inventory:
            copy_batch = lambda collection, docs: set(docs)
        else:
            store = FirestoreStore(args.workspace, settings.firebase_credentials, settings.firebase_project_id)
            copy_batch = firestore_batch_writer(store, args.dry_run)
        print(f"Workspace: {args.workspace}", flush=True)
        for collection, total, missing, assigned in migrate(source, args.workspace, copy_batch, owner):
            if args.inventory:
                print(f"{collection}: {total} source documents", flush=True)
            else:
                action = "would copy" if args.dry_run else "copied"
                print(f"{collection}: {total} source, {total - missing} skipped, {missing} {action}, "
                      f"{assigned} owner assignments", flush=True)


if __name__ == "__main__":
    main()

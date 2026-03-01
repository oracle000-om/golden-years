"""
Embedding + Vector Store Worker — ResNet50 + Milvus Lite

Unified Python worker that:
1. Generates 2048-d ResNet50 embeddings from animal photos
2. Stores/retrieves embeddings via Milvus Lite (file-based vector DB)
3. Performs similarity search for matching

Communicates with Node.js via JSON lines on stdin/stdout.

Commands:
  {"cmd": "embed",  "id": "...", "url": "..."}
  {"cmd": "insert", "id": "...", "embedding": [...], "species": "DOG", "shelter_id": "..."}
  {"cmd": "search", "embedding": [...], "species": "DOG", "limit": 10, "threshold": 0.70}
  {"cmd": "delete", "ids": ["...", "..."]}
  {"cmd": "count"}
  {"cmd": "embed_and_insert", "id": "...", "url": "...", "species": "DOG", "shelter_id": "...", "age_segment": "SENIOR"}

Ported from sniff-api/models/embedding.py + sniff-api/database.py
"""

import sys
import json
import io
import os
import urllib.request
import numpy as np
import torch
import torchvision.transforms as transforms
from torchvision import models
from pymilvus import connections, Collection, FieldSchema, CollectionSchema, DataType, utility

# ── Config ──────────────────────────────────────────────

EMBEDDING_DIM = 2048
MODEL_NAME = "resnet50-imagenet-v1"
COLLECTION_NAME = "animal_embeddings"
DB_PATH = os.getenv("MILVUS_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "..", "data", "vectors.db"))

# ── Model Setup ─────────────────────────────────────────

def create_model(device: str = "cpu"):
    """Load ResNet50 with classification head removed."""
    model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
    model = torch.nn.Sequential(*list(model.children())[:-1])
    model.eval()
    model.to(device)
    return model

# ImageNet preprocessing — matches Sniff's pipeline exactly
transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# ── Image Loading ───────────────────────────────────────

def download_image(url: str, timeout: int = 15) -> np.ndarray | None:
    """Download image from URL and return as RGB numpy array."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "GoldenYearsClub/1.0 EmbeddingWorker",
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            if len(data) < 500:
                return None
            from PIL import Image
            img = Image.open(io.BytesIO(data)).convert("RGB")
            return np.array(img)
    except Exception:
        return None

def load_image_bytes(b64_data: str) -> np.ndarray | None:
    """Load image from base64-encoded data and return as RGB numpy array."""
    try:
        import base64
        from PIL import Image
        raw = base64.b64decode(b64_data)
        if len(raw) < 500:
            return None
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        return np.array(img)
    except Exception:
        return None

# ── Embedding Generation ───────────────────────────────

def generate_embedding(model, image_rgb: np.ndarray, device: str = "cpu") -> np.ndarray:
    """Generate 2048-d L2-normalized embedding from RGB image array."""
    img_tensor = transform(image_rgb).unsqueeze(0).to(device)
    with torch.no_grad():
        embedding = model(img_tensor)
    embedding = embedding.squeeze().cpu().numpy()
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    return embedding

# ── Milvus Lite Vector Store ───────────────────────────

def init_milvus():
    """Initialize Milvus connection. Uses Zilliz Cloud when configured, local file otherwise."""
    zilliz_endpoint = os.getenv("ZILLIZ_ENDPOINT")
    zilliz_token = os.getenv("ZILLIZ_TOKEN", "")

    if zilliz_endpoint:
        connections.connect(alias="default", uri=zilliz_endpoint, token=zilliz_token)
        print(f"[vector_store] Connected to Zilliz Cloud: {zilliz_endpoint[:50]}...", file=sys.stderr, flush=True)
    else:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        connections.connect(alias="default", uri=DB_PATH)
        print(f"[vector_store] Connected to Milvus Lite: {DB_PATH}", file=sys.stderr, flush=True)

    if not utility.has_collection(COLLECTION_NAME):
        _create_collection()

    col = Collection(COLLECTION_NAME)
    col.load()
    print(f"[vector_store] Collection '{COLLECTION_NAME}' loaded ({col.num_entities} vectors)", file=sys.stderr, flush=True)
    return col

def _create_collection():
    """Create the animal embeddings collection — mirrors Sniff's schema."""
    fields = [
        FieldSchema(name="animal_id", dtype=DataType.VARCHAR, max_length=100, is_primary=True),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM),
        FieldSchema(name="species", dtype=DataType.VARCHAR, max_length=20),
        FieldSchema(name="shelter_id", dtype=DataType.VARCHAR, max_length=200),
        FieldSchema(name="age_segment", dtype=DataType.VARCHAR, max_length=20),
        FieldSchema(name="model", dtype=DataType.VARCHAR, max_length=50),
    ]
    schema = CollectionSchema(fields, "Animal visual embeddings for matching + re-entry detection")
    col = Collection(COLLECTION_NAME, schema)
    col.create_index("embedding", {
        "metric_type": "COSINE",
        "index_type": "FLAT",
        "params": {},
    })
    print(f"[vector_store] Created collection: {COLLECTION_NAME}", file=sys.stderr, flush=True)

def do_insert(col, animal_id, embedding, species="", shelter_id="", age_segment="UNKNOWN"):
    """Insert or update an embedding in the collection."""
    # Delete existing if present (upsert)
    try:
        col.delete(f'animal_id == "{animal_id}"')
    except Exception:
        pass
    col.insert([{
        "animal_id": animal_id,
        "embedding": embedding,
        "species": species,
        "shelter_id": shelter_id,
        "age_segment": age_segment,
        "model": MODEL_NAME,
    }])

def do_search(col, embedding, species=None, limit=10, threshold=0.70):
    """Search for similar embeddings. Returns list of {id, similarity}."""
    expr = f'species == "{species}"' if species else None
    results = col.search(
        data=[embedding],
        anns_field="embedding",
        param={"metric_type": "COSINE", "params": {}},
        limit=limit,
        expr=expr,
        output_fields=["animal_id", "species", "shelter_id", "age_segment"],
    )
    matches = []
    for hit in results[0]:
        sim = 1.0 - hit.distance  # COSINE metric returns distance, we want similarity
        if sim >= threshold:
            matches.append({
                "id": hit.entity.get("animal_id"),
                "similarity": round(sim, 4),
                "species": hit.entity.get("species"),
                "shelter_id": hit.entity.get("shelter_id"),
                "age_segment": hit.entity.get("age_segment"),
            })
    return matches

def do_delete(col, ids):
    """Delete embeddings by animal IDs."""
    ids_str = ", ".join(f'"{i}"' for i in ids)
    col.delete(f"animal_id in [{ids_str}]")
    col.flush()

# ── Main Loop ──────────────────────────────────────────

def main():
    device = "cpu"
    print(f"[embed_worker] Loading ResNet50 on {device}...", file=sys.stderr, flush=True)
    model = create_model(device)
    print(f"[embed_worker] Model ready.", file=sys.stderr, flush=True)

    col = init_milvus()

    # Signal ready
    sys.stdout.write(json.dumps({
        "ready": True,
        "model": MODEL_NAME,
        "dim": EMBEDDING_DIM,
        "vectors": col.num_entities,
    }) + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            _respond({"ok": False, "error": "Invalid JSON"})
            continue

        cmd = req.get("cmd", "embed")
        try:
            if cmd == "embed":
                _handle_embed(req, model, device)
            elif cmd == "insert":
                _handle_insert(req, col)
            elif cmd == "embed_and_insert":
                _handle_embed_and_insert(req, model, device, col)
            elif cmd == "search":
                _handle_search(req, col)
            elif cmd == "delete":
                _handle_delete(req, col)
            elif cmd == "count":
                col.flush()
                _respond({"ok": True, "count": col.num_entities})
            else:
                _respond({"ok": False, "error": f"Unknown command: {cmd}"})
        except Exception as e:
            _respond({"ok": False, "id": req.get("id"), "error": str(e)[:200]})

def _respond(data):
    sys.stdout.write(json.dumps(data) + "\n")
    sys.stdout.flush()

def _handle_embed(req, model, device):
    item_id = req.get("id", "unknown")
    url = req.get("url")
    image_data = req.get("image_data")  # base64-encoded image
    if not url and not image_data:
        _respond({"id": item_id, "embedding": None, "ok": False, "error": "No URL or image_data"})
        return
    image = load_image_bytes(image_data) if image_data else download_image(url)
    if image is None:
        _respond({"id": item_id, "embedding": None, "ok": False, "error": "Image load failed"})
        return
    emb = generate_embedding(model, image, device)
    _respond({"id": item_id, "embedding": emb.tolist(), "ok": True})

def _handle_insert(req, col):
    animal_id = req.get("id")
    embedding = req.get("embedding")
    if not animal_id or not embedding:
        _respond({"ok": False, "error": "Missing id or embedding"})
        return
    do_insert(col, animal_id, embedding,
              species=req.get("species", ""),
              shelter_id=req.get("shelter_id", ""),
              age_segment=req.get("age_segment", "UNKNOWN"))
    _respond({"ok": True, "id": animal_id, "cmd": "insert"})

def _handle_embed_and_insert(req, model, device, col):
    """Generate embedding from URL or base64 data and immediately store in Milvus."""
    item_id = req.get("id", "unknown")
    url = req.get("url")
    image_data = req.get("image_data")  # base64-encoded image
    if not url and not image_data:
        _respond({"id": item_id, "ok": False, "error": "No URL or image_data"})
        return
    image = load_image_bytes(image_data) if image_data else download_image(url)
    if image is None:
        _respond({"id": item_id, "ok": False, "error": "Image load failed"})
        return
    emb = generate_embedding(model, image, device)
    do_insert(col, item_id, emb.tolist(),
              species=req.get("species", ""),
              shelter_id=req.get("shelter_id", ""),
              age_segment=req.get("age_segment", "UNKNOWN"))
    _respond({"id": item_id, "ok": True, "cmd": "embed_and_insert"})

def _handle_search(req, col):
    embedding = req.get("embedding")
    if not embedding:
        _respond({"ok": False, "error": "Missing embedding"})
        return
    matches = do_search(col, embedding,
                        species=req.get("species"),
                        limit=req.get("limit", 10),
                        threshold=req.get("threshold", 0.70))
    _respond({"ok": True, "cmd": "search", "matches": matches})

def _handle_delete(req, col):
    ids = req.get("ids", [])
    if not ids:
        _respond({"ok": False, "error": "Missing ids"})
        return
    do_delete(col, ids)
    _respond({"ok": True, "cmd": "delete", "deleted": len(ids)})

if __name__ == "__main__":
    main()

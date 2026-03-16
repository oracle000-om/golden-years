"""
Export ResNet50 to ONNX format for Node.js inference.

One-time script: creates data/resnet50-embedding.onnx that can be
loaded by onnxruntime-node in the ONNX embedding provider.

Usage:
    python3 scraper/cv/export_resnet50_onnx.py
"""

import os
import torch
import torch.nn as nn
from torchvision import models

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "resnet50-embedding.onnx")

def main():
    print("Loading ResNet50 with ImageNet weights...")
    model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)

    # Remove classification head — same as embed_worker.py
    model = nn.Sequential(*list(model.children())[:-1], nn.Flatten())
    model.eval()

    # Create dummy input matching ImageNet preprocessing
    dummy_input = torch.randn(1, 3, 224, 224)

    # Test PyTorch output
    with torch.no_grad():
        pytorch_output = model(dummy_input)
    print(f"PyTorch output shape: {pytorch_output.shape}")  # Should be [1, 2048]

    # Export to ONNX
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Exporting to {OUTPUT_PATH}...")
    torch.onnx.export(
        model,
        dummy_input,
        OUTPUT_PATH,
        input_names=["input"],
        output_names=["embedding"],
        dynamic_axes={
            "input": {0: "batch_size"},
            "embedding": {0: "batch_size"},
        },
        opset_version=17,
    )

    # Verify with ONNX Runtime
    import onnxruntime as ort
    import numpy as np

    session = ort.InferenceSession(OUTPUT_PATH)
    onnx_output = session.run(None, {"input": dummy_input.numpy()})[0]
    print(f"ONNX output shape: {onnx_output.shape}")

    # Compare outputs
    pytorch_np = pytorch_output.numpy()
    cosine_sim = np.dot(pytorch_np.flatten(), onnx_output.flatten()) / (
        np.linalg.norm(pytorch_np) * np.linalg.norm(onnx_output)
    )
    print(f"Cosine similarity (PyTorch vs ONNX): {cosine_sim:.6f}")

    if cosine_sim > 0.9999:
        print("✅ Export verified — outputs match")
    else:
        print(f"⚠️  Outputs differ (similarity: {cosine_sim:.6f})")

    file_size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"Model size: {file_size_mb:.1f} MB")

if __name__ == "__main__":
    main()

import pandas as pd
import numpy as np

# CHANGE THIS to your actual path
IN_PATH  = "data.csv"
OUT_PATH = "train.csv"

df = pd.read_csv(IN_PATH)

# Check required columns exist
required = ["canonical_transcription", "noisy_transcription", "accuracy"]
missing = [c for c in required if c not in df.columns]
if missing:
    raise ValueError(f"Missing columns in train.csv: {missing}")

# Build the formatted dataframe
out = pd.DataFrame()
out["canonical_text"] = df["canonical_transcription"].astype(str)
out["student_text"]   = df["noisy_transcription"].astype(str)

# Normalize label -> [0,1]
lab = pd.to_numeric(df["accuracy"], errors="coerce")
maxv = np.nanmax(lab.values)
if np.isnan(maxv):  # all NaN?
    maxv = 1.0
if 1.5 < maxv <= 10.5:
    lab = lab / 10.0
elif 10.5 < maxv <= 100.5:
    lab = lab / 100.0
out["label"] = lab.clip(0.0, 1.0).fillna(0.0)

# Optional columns your training script supports
# If you have per-word confidence lists later, put them here as JSON strings like "[0.9,0.8,...]"
out["confidences"]    = ""
out["suffix_ref"]     = ""
out["suffix_student"] = ""

# Keep source metadata if you want (optional)
if "title" in df.columns:
    out["source_file"] = df["title"].astype(str)
else:
    out["source_file"] = "train.csv"

out.to_csv(OUT_PATH, index=False)
print(f"Wrote: {OUT_PATH}")
print(out.head(3))

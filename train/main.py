#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Suffix-aware Kannada pronunciation evaluation
End-to-end: feature extraction -> MLP training -> evaluation -> save artifacts.

Dependencies:
  pip install torch numpy pandas scikit-learn
"""

import argparse
import json
import math
import os
import re
import unicodedata
from typing import List, Tuple, Optional

import numpy as np
import pandas as pd
from difflib import SequenceMatcher

from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error
from joblib import dump

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

# -----------------------------
# Utilities: text normalization
# -----------------------------
PUNCT_PATTERN = re.compile(r"[^\w\s\u0C80-\u0CFF]", flags=re.UNICODE)

def normalize_text(s: str) -> str:
    """Basic normalization: NFKC, strip, collapse whitespace, drop punctuation."""
    if not isinstance(s, str):
        return ""
    s = unicodedata.normalize("NFKC", s)
    s = PUNCT_PATTERN.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def tokenize(s: str) -> List[str]:
    """Whitespace tokenization after normalization."""
    return normalize_text(s).split()


# ----------------------------------
# Token-level Levenshtein (edit dist)
# ----------------------------------
def levenshtein_distance(a_tokens: List[str], b_tokens: List[str]) -> int:
    n, m = len(a_tokens), len(b_tokens)
    if n == 0:
        return m
    if m == 0:
        return n
    dp = np.zeros((n + 1, m + 1), dtype=np.int32)
    dp[:, 0] = np.arange(n + 1)
    dp[0, :] = np.arange(m + 1)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if a_tokens[i - 1] == b_tokens[j - 1] else 1
            dp[i, j] = min(
                dp[i - 1, j] + 1,        # deletion
                dp[i, j - 1] + 1,        # insertion
                dp[i - 1, j - 1] + cost  # substitution
            )
    return int(dp[n, m])


# -------------------------------------------
# Suffix extraction (heuristic longest-match)
# -------------------------------------------
# You can expand/tune this lexicon to your stories/curriculum.
KAN_SFX_LEXICON = [
    # plural/honorific/dative/case/tense markers (illustrative set)
    "ಗಳು",  # gaḷu (plural)
    "ಗಳು",  # duplicate okay; keep unique in your final list
    "ಗೆ",   # ge (dative)
    "ಲ್ಲಿ",  # lli (locative)
    "ಗಳಿಂದ",  # gaḷinda (ablative, e.g., “from the plurals”)
    "ಗಳನ್ನು",   # gaḷannu (accusative plural)
    "ಕ್ಕೆ",  # kke (dative)
    "ದ",    # da (genitive/possessive forms in compounds)
    "ವು",   # vu (neuter/plural variants in verbs/nouns)
    "ತೆ",   # te (nominalizer/abstract)
    "ದೆ",   # de (past/perfective variants)
    "ತಿದೆ", # tide (present perfect-ish aux)
    "ತ್ತಿದೆ", # ttide (progressive)
    "ವನು",  # vanu (masc)
    "ವರು",  # varu (honorific plural)
    "ಳಿಗೆ",  # ḷige
    "ಲಿ",   # li (locative short)
    "ಕೆ",   # ke
]

# Sort by length desc to favor longest matches
KAN_SFX_LEXICON = sorted(set(KAN_SFX_LEXICON), key=len, reverse=True)

def extract_suffix_from_token(token: str, lexicon: List[str]) -> str:
    """Return the longest suffix from lexicon that matches the end of token."""
    for sfx in lexicon:
        if token.endswith(sfx):
            return sfx
    return ""  # no suffix match

def derive_suffix_list(tokens: List[str], lexicon: List[str]) -> List[str]:
    """Derive one suffix per token (coarse heuristic)."""
    return [extract_suffix_from_token(tok, lexicon) for tok in tokens]


# ---------------------------
# Feature extraction per pair
# ---------------------------
def compute_alignment_pairs(ref_tokens: List[str], stu_tokens: List[str]) -> List[Tuple[int, int]]:
    """
    Align tokens using SequenceMatcher's opcodes.
    Returns list of matched index pairs (i_ref, i_stu) where tokens are considered aligned.
    """
    matcher = SequenceMatcher(None, ref_tokens, stu_tokens)
    pairs = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                pairs.append((i1 + k, j1 + k))
        elif tag == "replace":
            # greedily align positions within the block
            span = min(i2 - i1, j2 - j1)
            for k in range(span):
                pairs.append((i1 + k, j1 + k))
        # insert/delete produce no aligned pairs
    return pairs

def suffix_accuracy_from_lists(aligned_pairs: List[Tuple[int,int]],
                               sfx_ref: List[str],
                               sfx_stu: List[str]) -> float:
    """Compute suffix accuracy given aligned token pairs and per-token suffix lists."""
    if not aligned_pairs:
        return 0.0
    matches = 0
    for i_ref, i_stu in aligned_pairs:
        s_ref = sfx_ref[i_ref] if i_ref < len(sfx_ref) else ""
        s_stu = sfx_stu[i_stu] if i_stu < len(sfx_stu) else ""
        matches += 1 if s_ref == s_stu else 0
    return matches / len(aligned_pairs)


def extract_features(
    canonical_text: str,
    student_text: str,
    confidences: Optional[List[float]] = None,
    suffix_ref_list: Optional[List[str]] = None,
    suffix_student_list: Optional[List[str]] = None,
) -> Tuple[np.ndarray, float]:
    """
    Returns:
        features: np.array([match_ratio, edit_distance_avg, length_diff, mean_conf, suffix_acc])
        suffix_acc: float (also used as target component for suffix-aware loss)
    """
    ref_toks = tokenize(canonical_text)
    stu_toks = tokenize(student_text)

    # 1) Match ratio (token-level)
    match_ratio = SequenceMatcher(None, ref_toks, stu_toks).ratio()

    # 2) Normalized edit distance (token-level)
    ed = levenshtein_distance(ref_toks, stu_toks)
    denom = max(len(ref_toks), len(stu_toks), 1)
    edit_distance_avg = ed / denom

    # 3) Length deviation
    length_diff = abs(len(stu_toks) - len(ref_toks)) / max(len(ref_toks), 1)

    # 4) Confidence score (mean)
    mean_conf = float(np.mean(confidences)) if confidences is not None and len(confidences) > 0 else 0.0

    # 5) Suffix accuracy
    aligned_pairs = compute_alignment_pairs(ref_toks, stu_toks)

    # If suffix lists are given (preferred), use them; else derive by lexicon:
    if suffix_ref_list is None or suffix_student_list is None:
        sfx_ref = derive_suffix_list(ref_toks, KAN_SFX_LEXICON)
        sfx_stu = derive_suffix_list(stu_toks, KAN_SFX_LEXICON)
    else:
        sfx_ref = suffix_ref_list
        sfx_stu = suffix_student_list

    suffix_acc = suffix_accuracy_from_lists(aligned_pairs, sfx_ref, sfx_stu)

    features = np.array([match_ratio, edit_distance_avg, length_diff, mean_conf, suffix_acc], dtype=np.float32)
    return features, suffix_acc


# -----------------------
# PyTorch MLP + loss
# -----------------------
class KannadaPronunciationMLP(nn.Module):
    def __init__(self, input_size=5, hidden=(8, 4), dropout=0.2):
        super().__init__()
        self.fc1 = nn.Linear(input_size, hidden[0])
        self.drop1 = nn.Dropout(dropout)
        self.fc2 = nn.Linear(hidden[0], hidden[1])
        self.drop2 = nn.Dropout(dropout)
        self.out = nn.Linear(hidden[1], 1)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.drop1(x)
        x = F.relu(self.fc2(x))
        x = self.drop2(x)
        return torch.sigmoid(self.out(x))  # score in [0,1]

def custom_suffix_loss(y_pred, y_true, suffix_pred, suffix_true, lambda_suffix=1.2):
    """MSE(y, y^) + λ * MSE(suffix_component, suffix_target). Here we use y_pred as proxy for suffix_pred."""
    base = F.mse_loss(y_pred, y_true)
    sfx = F.mse_loss(suffix_pred, suffix_true)
    return base + lambda_suffix * sfx


# -----------------------
# Dataset & Training Loop
# -----------------------
class PronunDataset(Dataset):
    def __init__(self, X: np.ndarray, y: np.ndarray, sfx_y: np.ndarray):
        self.X = torch.tensor(X, dtype=torch.float32)
        self.y = torch.tensor(y.reshape(-1, 1), dtype=torch.float32)
        self.sfx_y = torch.tensor(sfx_y.reshape(-1, 1), dtype=torch.float32)

    def __len__(self):
        return self.X.shape[0]

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx], self.sfx_y[idx]

def train_one_epoch(model, loader, opt, device, lambda_suffix=1.2):
    model.train()
    running = 0.0
    for Xb, yb, sfxb in loader:
        Xb, yb, sfxb = Xb.to(device), yb.to(device), sfxb.to(device)
        opt.zero_grad()
        yhat = model(Xb)
        loss = custom_suffix_loss(yhat, yb, yhat, sfxb, lambda_suffix=lambda_suffix)
        loss.backward()
        opt.step()
        running += loss.item()
    return running / len(loader)

@torch.no_grad()
def evaluate(model, loader, device, lambda_suffix=1.2):
    model.eval()
    losses, preds, trues = [], [], []
    for Xb, yb, sfxb in loader:
        Xb, yb, sfxb = Xb.to(device), yb.to(device), sfxb.to(device)
        yhat = model(Xb)
        loss = custom_suffix_loss(yhat, yb, yhat, sfxb, lambda_suffix=lambda_suffix)
        losses.append(loss.item())
        preds.extend(yhat.cpu().numpy().ravel().tolist())
        trues.extend(yb.cpu().numpy().ravel().tolist())
    rmse = math.sqrt(mean_squared_error(trues, preds))
    # Pearson r
    if np.std(preds) > 0 and np.std(trues) > 0:
        r = float(np.corrcoef(preds, trues)[0,1])
    else:
        r = 0.0
    return float(np.mean(losses)), rmse, r, np.array(preds), np.array(trues)


# -----------------------
# Data loading from CSV
# -----------------------
def parse_jsonish(x):
    """Parse JSON-like strings (or return None/empty)."""
    if isinstance(x, list):
        return x
    if not isinstance(x, str) or x.strip() == "":
        return None
    try:
        return json.loads(x)
    except Exception:
        # try to coerce e.g., "0.9,0.8" to a list
        parts = [p.strip() for p in x.split(",")]
        vals = []
        for p in parts:
            try:
                vals.append(float(p))
            except Exception:
                pass
        return vals if vals else None

def load_and_featurize(csv_path: str):
    df = pd.read_csv(csv_path)

    required = ["canonical_text", "student_text", "label"]
    for col in required:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")

    # Optional columns
    has_suffix_cols = "suffix_ref" in df.columns and "suffix_student" in df.columns
    has_conf = "confidences" in df.columns

    X, sfx_targets, y = [], [], []

    for _, row in df.iterrows():
        canonical_text = str(row["canonical_text"])
        student_text = str(row["student_text"])
        label = float(row["label"])

        confidences = parse_jsonish(row["confidences"]) if has_conf else None

        suffix_ref_list = parse_jsonish(row["suffix_ref"]) if has_suffix_cols else None
        suffix_student_list = parse_jsonish(row["suffix_student"]) if has_suffix_cols else None

        feats, sfx_acc = extract_features(
            canonical_text,
            student_text,
            confidences=confidences,
            suffix_ref_list=suffix_ref_list,
            suffix_student_list=suffix_student_list,
        )
        X.append(feats)
        sfx_targets.append(sfx_acc)
        y.append(label)

    X = np.vstack(X)
    sfx_targets = np.array(sfx_targets, dtype=np.float32)
    y = np.array(y, dtype=np.float32)
    return X, sfx_targets, y


# -----------------------
# Main
# -----------------------
def main(args):
    device = torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")
    print(f"Using device: {device}")

    # Load & featurize
    X, sfx_targets, y = load_and_featurize(args.csv)
    print(f"Loaded {len(y)} samples.")

    # Split
    X_tr, X_te, y_tr, y_te, sfx_tr, sfx_te = train_test_split(
        X, y, sfx_targets, test_size=args.test_size, random_state=42
    )

    # Scale (fit on train only)
    scaler = StandardScaler()
    X_trs = scaler.fit_transform(X_tr)
    X_tes = scaler.transform(X_te)

    # Datasets & loaders
    train_ds = PronunDataset(X_trs, y_tr, sfx_tr)
    test_ds = PronunDataset(X_tes, y_te, sfx_te)

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=0)
    test_loader  = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False, num_workers=0)

    # Model
    model = KannadaPronunciationMLP(input_size=5, hidden=(8,4), dropout=args.dropout).to(device)
    optim = torch.optim.Adam(model.parameters(), lr=args.lr)

    best_rmse = float("inf")
    patience_left = args.patience

    for epoch in range(1, args.epochs + 1):
        tr_loss = train_one_epoch(model, train_loader, optim, device, lambda_suffix=args.lambda_suffix)
        te_loss, te_rmse, te_r, _, _ = evaluate(model, test_loader, device, lambda_suffix=args.lambda_suffix)
        print(f"Epoch {epoch:02d} | train_loss={tr_loss:.4f} | val_loss={te_loss:.4f} | RMSE={te_rmse:.4f} | r={te_r:.3f}")

        # Early stopping on RMSE
        if te_rmse + 1e-6 < best_rmse:
            best_rmse = te_rmse
            patience_left = args.patience
            # Save best checkpoint
            os.makedirs(args.outdir, exist_ok=True)
            torch.save(model.state_dict(), os.path.join(args.outdir, "model.pt"))
            dump(scaler, os.path.join(args.outdir, "scaler.joblib"))
        else:
            patience_left -= 1
            if patience_left == 0:
                print("Early stopping.")
                break

    # Final evaluation on test set (reload best)
    best_model = KannadaPronunciationMLP(input_size=5, hidden=(8,4), dropout=args.dropout).to(device)
    best_model.load_state_dict(torch.load(os.path.join(args.outdir, "model.pt"), map_location=device))
    _, te_rmse, te_r, preds, trues = evaluate(best_model, test_loader, device, lambda_suffix=args.lambda_suffix)
    print(f"\nBest Test RMSE: {te_rmse:.4f} | Pearson r: {te_r:.3f}")

    # Save predictions for inspection
    pred_path = os.path.join(args.outdir, "predictions.csv")
    pd.DataFrame({"y_true": trues, "y_pred": preds}).to_csv(pred_path, index=False)
    print(f"Saved: {pred_path}")
    print(f"Saved model + scaler to: {args.outdir}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=str, required=True, help="Path to input CSV")
    parser.add_argument("--outdir", type=str, default="artifacts", help="Output dir to save model/scaler/preds")
    parser.add_argument("--test_size", type=float, default=0.2, help="Holdout fraction")
    parser.add_argument("--batch_size", type=int, default=32)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--lr", type=float, default=2e-2)
    parser.add_argument("--dropout", type=float, default=0.2)
    parser.add_argument("--lambda_suffix", type=float, default=1.2, help="Weight on suffix-aware loss term")
    parser.add_argument("--patience", type=int, default=6, help="Early stopping patience (epochs)")
    parser.add_argument("--cpu", action="store_true", help="Force CPU even if CUDA is available")
    args = parser.parse_args()
    main(args)

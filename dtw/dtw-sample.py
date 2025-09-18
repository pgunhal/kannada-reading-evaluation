import librosa
import numpy as np
from dtw import dtw
from scipy.spatial.distance import euclidean 
import matplotlib.pyplot as plt

# Load audio files
y1, sr1 = librosa.load('test1.wav')
y2, sr2 = librosa.load('ref1.wav')

# Trim leading/trailing silence/white noise
y1, _ = librosa.effects.trim(y1, top_db=30)
y2, _ = librosa.effects.trim(y2, top_db=30)

print("loaded and trimmed")

# Extract MFCC features
mfcc1 = librosa.feature.mfcc(y=y1, sr=sr1).T
mfcc2 = librosa.feature.mfcc(y=y2, sr=sr2).T

print("abt to dtw")

# Perform DTW
distance, cost_matrix, acc_cost_matrix, path = dtw(mfcc1, mfcc2, dist=euclidean)

print(f"Normalized DTW distance: {distance}")

# Compute normalized cost with leniency
raw_cost = acc_cost_matrix[-1, -1]
avg_len = (len(mfcc1) + len(mfcc2)) / 2
norm_cost = raw_cost / avg_len

# Use smaller alpha to soften penalty
alpha = 0.001
accuracy = 100 * np.exp(-alpha * norm_cost)

print("Raw cost:", raw_cost)
print("Average length:", avg_len)
print("Normalized cost:", norm_cost)
print(f"Similarity Accuracy (lenient): {accuracy:.2f}%")

# Plot cost matrix and warping path
x_path, y_path = path[0], path[1]

plt.figure(figsize=(8, 6))
plt.imshow(acc_cost_matrix.T, origin='lower', cmap='gray', interpolation='nearest')
plt.plot(x_path, y_path, color='red')
plt.xlabel('MFCC 1 (Test)')
plt.ylabel('MFCC 2 (Reference)')
plt.title('DTW Cost Matrix with Optimal Warping Path')
plt.colorbar(label='Accumulated Cost')
plt.tight_layout()
plt.show()

import librosa
import numpy as np
from dtw import dtw
from scipy.spatial.distance import euclidean 
import matplotlib.pyplot as plt


# Load audio files
y1, sr1 = librosa.load('kan-orig.wav')
y2, sr2 = librosa.load('kan-norm.wav')

print("loaded")

# Extract MFCC features
# Transpose MFCCs to have time as the first dimension for DTW
mfcc1 = librosa.feature.mfcc(y=y1, sr=sr1).T
mfcc2 = librosa.feature.mfcc(y=y2, sr=sr2).T

print("abt to dtw")

# Perform DTW
# The 'dtw' function returns the normalized distance, cost matrix, and warping path
distance, cost_matrix, acc_cost_matrix, path = dtw(mfcc1, mfcc2, dist=euclidean)

print(f"Normalized DTW distance: {distance}")

raw_cost = acc_cost_matrix[-1, -1]
path_len = len(path[0])
norm_cost = raw_cost / path_len

print("Raw cost:", raw_cost)
print("Path length:", path_len)
print("Normalized cost:", norm_cost)



# Convert the warping path to two separate lists for plotting
x_path, y_path = path[0], path[1]

plt.figure(figsize=(8, 6))
plt.imshow(acc_cost_matrix.T, origin='lower', cmap='gray', interpolation='nearest')
plt.plot(x_path, y_path, color='red')  # warping path
plt.xlabel('MFCC 1 (Original)')
plt.ylabel('MFCC 2 (normal)')
plt.title('DTW Cost Matrix with Optimal Warping Path')
plt.colorbar(label='Accumulated Cost')
plt.tight_layout()
plt.show()

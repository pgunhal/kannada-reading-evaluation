import os
from google.cloud import speech

def transcribe_audio_to_kannada(audio_path, credentials_path):
    # Set environment variable for authentication
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = credentials_path

    client = speech.SpeechClient()

    with open(audio_path, 'rb') as audio_file:
        content = audio_file.read()

    audio = speech.RecognitionAudio(content=content)

    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=48000,
        language_code="kn-IN",  # Kannada (India)
        audio_channel_count=1
    )

    response = client.recognize(config=config, audio=audio)

    if not response.results:
        print("No transcription could be made.")
        return

    print("\nTranscription:")
    for result in response.results:
        print(result.alternatives[0].transcript)

if __name__ == "__main__":
    audio_path = input("Enter path to WAV audio file: ")
    credentials_path = input("Enter path to your service account JSON key file: ")

    if not os.path.isfile(audio_path):
        print("Invalid audio file path.")
    elif not os.path.isfile(credentials_path):
        print("Invalid credentials file path.")
    else:
        transcribe_audio_to_kannada(audio_path, credentials_path)

from diagrams import Diagram, Cluster, Edge
from diagrams.onprem.client import Users
from diagrams.programming.language import Nodejs, Python, Javascript
from diagrams.programming.framework import React
from diagrams.firebase.develop import Firestore
from diagrams.onprem.mlops import Mlflow
from diagrams.custom import Custom

with Diagram("Adaptive Kannada Pronunciation Evaluation Pipeline", show=False, direction="LR"):
    
    with Cluster("Student Device"):
        student = Users("Student")
        mic = Custom("Mic Input", "./mic_icon.png")  # Ensure mic_icon.png is in the same directory
        browser = React("Kannada Kali UI\n(React Frontend)")
        student >> mic >> browser

    with Cluster("Web Server (Node.js API)"):
        media = Nodejs("MediaRecorder API")
        websocket = Nodejs("WebSocket Streamer")
        audio_proc = Python("FFmpeg\nAudio to LINEAR16")
        browser >> media >> websocket >> audio_proc

    with Cluster("Google Cloud STT"):
        transcription = Python("Speech-to-Text\n(kn-IN)")
        audio_proc >> transcription

    with Cluster("Backend Logic\n(Express.js API)"):
        preprocess = Python("Preprocessing")
        align = Python("Canonical\nAlignment")
        features = Python("Feature Extraction")
        model = Mlflow("Logistic Regression")
        transcription >> preprocess >> align >> features >> model

    with Cluster("Feedback Engine"):
        scoring = Python("Pronunciation Scoring")
        feedback_ui = Javascript("Feedback UI\n(Kannada Kali Site)")
        firebase = Firestore("Firestore (Student Logs)")

        model >> scoring >> feedback_ui
        feedback_ui >> firebase
        feedback_ui >> Edge(label="Retry Prompt") >> browser

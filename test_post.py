import urllib.request
import json

url = "https://script.google.com/macros/s/AKfycbw-W3inokq9yON154w5_XU4QvZrXoBW6S7fMPGVLH-oeEl2u2uRgvUi9LKkLI8-gEZKsw/exec"
data = {
    "smurfName": "Tí Thử Nghiệm",
    "realName": "Test Script",
    "telegramId": "123456",
    "timestamp": "2026-07-13T00:00:00Z"
}

req = urllib.request.Request(
    url, 
    data=json.dumps(data).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode("utf-8")
        print("Response status code:", response.status)
        print("Response body:")
        print(html)
except Exception as e:
    print("Error occurred:", e)

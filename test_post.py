import urllib.request
import json

url = "https://script.google.com/macros/s/AKfycby33FkEEAvDBP0XpMxcn16dm3FkZhh89dUH3BJgIv4x29JZ_n787xaN9Z3ho7JQfnXHFw/exec"
data = {
    "smurfName": "Tí Thử Nghiệm",
    "realName": "Test Auto",
    "telegramId": "99999",
    "telegramUsername": "test_user",
    "telegramFirstName": "Tester",
    "group": "Nhóm A",
    "gender": "Nam",
    "style": "Dễ thương",
    "pose": "Đứng",
    "background": "Làng Xì Trum",
    "additionalInfo": "Dữ liệu test từ hệ thống",
    "referenceImage": "",
    "referenceNotes": ""
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
        print("Status:", response.status)
        print("Body:", html)
except Exception as e:
    print("Error:", e)

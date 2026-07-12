import re

reg_file = "registration.html"
new_url = "https://script.google.com/macros/s/AKfycbw-W3inokq9yON154w5_XU4QvZrXoBW6S7fMPGVLH-oeEl2u2uRgvUi9LKkLI8-gEZKsw/exec"

with open(reg_file, "r", encoding="utf-8") as f:
    content = f.read()

updated = re.sub(r'const GAS_WEBAPP_URL = "[^"]*";', f'const GAS_WEBAPP_URL = "{new_url}";', content)

with open(reg_file, "w", encoding="utf-8") as f:
    f.write(updated)

print("URL updated successfully!")

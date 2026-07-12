import re

reg_file = "registration.html"
new_url = "https://script.google.com/macros/s/AKfycbyVLirBBGrsYjVoLdxKpKE3pOiPeXeuJZek9uFOcWO6T5PVwgRmB4RxwzYh_Yxrg-Mnqw/exec"

with open(reg_file, "r", encoding="utf-8") as f:
    content = f.read()

updated = re.sub(r'const GAS_WEBAPP_URL = "[^"]*";', f'const GAS_WEBAPP_URL = "{new_url}";', content)

with open(reg_file, "w", encoding="utf-8") as f:
    f.write(updated)

print("URL updated successfully!")

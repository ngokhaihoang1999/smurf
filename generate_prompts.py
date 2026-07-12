import csv
import os
import sys

# Đảm bảo mã hóa UTF-8 cho stdout
sys.stdout.reconfigure(encoding='utf-8')

def generate_prompt_for_row(row):
    """
    Ráp dữ liệu Xì Trum thành prompt tiếng Anh chuẩn.
    Các cột mong đợi:
    0: Timestamp, 1: Telegram ID, 2: Username, 3: First Name,
    4: Tên Xì Trum, 5: Tên Thật, 6: Nhóm, 7: Tính Cách, 8: Sở Thích,
    9: Điểm Mạnh, 10: Điểm Yếu, 11: Bio,
    12: Giới Tính, 13: Loại Mũ, 14: Phụ Kiện, 15: Trang Phục, 16: Bối Cảnh
    """
    smurf_name = row[4] if len(row) > 4 else "Xì Trum"
    gender = row[12] if len(row) > 12 else "Nam"
    hat = row[13] if len(row) > 13 else "Mũ trắng cổ điển"
    accessory = row[14] if len(row) > 14 else "Giỏ nấm"
    outfit = row[15] if len(row) > 15 else "Quần yếm trắng cổ điển"
    scenery = row[16] if len(row) > 16 else "Rừng nấm xì trum huyền bí"
    
    # 1. Base style và nhân vật
    if gender.strip() == "Nữ":
        base = "A beautiful 2D cartoon Smurfette character (female Smurf) in Peyo style, soft blue skin, long blonde hair, big friendly eyes, cheerful smiling expression."
    else:
        base = "A cute 2D cartoon Smurf character (male Smurf) in Peyo style, soft blue skin, big friendly eyes, cheerful smiling expression."
        
    # 2. Mũ (Hat)
    hat_desc = ""
    hat_lower = hat.lower()
    if "đỏ" in hat_lower or "papa" in hat_lower:
        hat_desc = "wearing Papa Smurf's iconic red Phrygian cap and a neat white beard"
    elif "rơm" in hat_lower or "nông dân" in hat_lower:
        hat_desc = "wearing a rustic woven straw farmer hat"
    elif "pháp sư" in hat_lower:
        hat_desc = "wearing a tall pointed blue wizard hat with glowing stars pattern"
    elif "hoa" in hat_lower:
        hat_desc = "wearing a cute outdoor sun hat adorned with small forest wildflowers"
    else:
        hat_desc = "wearing a standard curved white Phrygian cap"
        
    # 3. Trang phục & Phụ kiện (Outfit & Accessory)
    outfit_desc = ""
    outfit_lower = outfit.lower()
    if "pháp sư" in outfit_lower or "áo choàng" in outfit_lower:
        outfit_desc = "wearing a starry dark blue wizard robe"
    elif "bảo hộ" in outfit_lower:
        outfit_desc = "wearing light brown mechanic overalls with tiny tools"
    elif "váy" in outfit_lower:
        outfit_desc = "wearing a simple pretty white flower dress"
    else:
        outfit_desc = "wearing classic white overalls"
        
    acc_desc = ""
    acc_lower = accessory.lower()
    if "gậy" in acc_lower:
        acc_desc = "holding a small glowing wooden magic wand emitting golden sparkles"
    elif "sách" in acc_lower:
        acc_desc = "holding a thick leather-bound ancient magical spellbook"
    elif "giỏ" in acc_lower or "nấm" in acc_lower:
        acc_desc = "carrying a wicker basket full of colorful forest mushrooms"
    else:
        acc_desc = f"holding a {accessory.lower()}"
        
    # 4. Bối cảnh (Scenery)
    scene_desc = ""
    scene_lower = scenery.lower()
    if "thí nghiệm" in scene_lower:
        scene_desc = "set inside a magical alchemy lab filled with glowing potions, books, and bubbling flasks, cozy fantasy lighting."
    elif "nhà nấm" in scene_lower:
        scene_desc = "set inside a cozy wooden mushroom cottage interior with a glowing stone fireplace, rustic furniture, warm homey light."
    elif "thác nước" in scene_lower:
        scene_desc = "set against a sparkling crystal waterfall in a magical forest, morning sun beams shining through the trees."
    else:
        scene_desc = "set in a mystical deep forest village with giant colorful mushroom houses, soft magical twilight glow, bokeh background blur."
        
    # 5. Canvas layout constraint (3:4 ratio in 1024x1024 square)
    layout = "All artwork content is composed within a centered 768x1024 pixel vertical rectangle (3:4 ratio) of a 1024x1024 canvas to allow safety crop zones. Clean outlines, high quality illustration, 2d vector art, official cartoon sticker style."
    
    prompt = f"{base} {hat_desc}, {outfit_desc}, {acc_desc}. {scene_desc} {layout}"
    return prompt

def main():
    csv_file = "registration.csv"
    output_file = "generated_prompts.txt"
    
    if not os.path.exists(csv_file):
        print(f"Không tìm thấy file {csv_file}. Đang tự động tải dữ liệu từ Google Sheet...")
        url = "https://docs.google.com/spreadsheets/d/1Sgb2kddv3-DSgA5IZZhexZf4d-ZFjFuBwIYS56JLJPI/export?format=csv"
        try:
            import urllib.request
            urllib.request.urlretrieve(url, csv_file)
            print("Tải thành công registration.csv!")
        except Exception as e:
            print(f"Lỗi tải tự động: {e}")
            print(f"Vui lòng đảm bảo Google Sheet đã được chia sẻ ở chế độ 'Bất kỳ ai có link đều có thể xem' (Anyone with link can view).")
            print(f"Hoặc bạn có thể tải thủ công file CSV và lưu vào thư mục này với tên '{csv_file}'.")
            return
        
    print(f"Đọc dữ liệu từ {csv_file}...")
    
    prompts_created = 0
    with open(csv_file, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        # Bỏ qua dòng header nếu có
        header = next(reader, None)
        
        with open(output_file, mode='w', encoding='utf-8') as out_f:
            for row_idx, row in enumerate(reader):
                if not row or len(row) < 5:
                    continue
                
                smurf_name = row[4].strip()
                real_name = row[5].strip()
                
                prompt = generate_prompt_for_row(row)
                
                # Ghi vào file text
                out_f.write(f"STT: {row_idx + 1} | Cư dân: {smurf_name} ({real_name})\n")
                out_f.write(f"PROMPT:\n{prompt}\n")
                out_f.write("=" * 80 + "\n\n")
                prompts_created += 1
                
    print(f"🎉 Đã sinh {prompts_created} prompts thành công! Kết quả lưu tại: {output_file}")

if __name__ == "__main__":
    main()

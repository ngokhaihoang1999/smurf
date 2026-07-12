import os
import sys
from PIL import Image

def crop_to_3_4(image_path, output_path=None):
    if not os.path.exists(image_path):
        print(f"Error: File {image_path} does not exist.")
        return False
    
    try:
        with Image.open(image_path) as img:
            width, height = img.size
            
            # Target width for a 3:4 ratio based on image height
            target_width = int(height * 3 / 4)
            
            # Center the crop horizontally
            left = (width - target_width) // 2
            right = left + target_width
            top = 0
            bottom = height
            
            cropped_img = img.crop((left, top, right, bottom))
            
            if not output_path:
                base, ext = os.path.splitext(image_path)
                output_path = f"{base}_cropped_3_4{ext}"
                
            cropped_img.save(output_path)
            print(f"Successfully cropped {image_path} to {output_path} ({target_width}x{height})")
            return True
    except Exception as e:
        print(f"Error processing image: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python crop_3_4.py <path_to_image> [output_path]")
    else:
        img_path = sys.argv[1]
        out_path = sys.argv[2] if len(sys.argv) > 2 else None
        crop_to_3_4(img_path, out_path)

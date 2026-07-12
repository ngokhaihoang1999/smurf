/**
 * GOOGLE APPS SCRIPT MIDDLEWARE FOR SMURF VILLAGE REGISTRY
 * 
 * Hướng dẫn cài đặt:
 * 1. Mở Google Sheet bạn muốn lưu dữ liệu.
 * 2. Vào Tiện ích mở rộng (Extensions) -> Apps Script.
 * 3. Xóa hết code cũ, dán toàn bộ đoạn code dưới đây vào.
 * 4. Nhấn Lưu (Save).
 * 5. Nhấn Triển khai (Deploy) -> Triển khai mới (New deployment).
 *    - Chọn loại triển khai: Ứng dụng web (Web app).
 *    - Mô tả: Smurf Registration API.
 *    - Thực thi dưới danh nghĩa: Tôi (tài khoản email của bạn).
 *    - Ai có quyền truy cập: Bất kỳ ai (Anyone).
 * 6. Copy URL Web App sau khi triển khai dán vào biến `GAS_WEBAPP_URL` trong file `registration.html`.
 */

// Tiền xử lý dữ liệu để chống tấn công Formula Injection (CWE-1236) vào Google Sheets
function sanitizeInput(val) {
  if (val === null || val === undefined) return "";
  var str = String(val).trim();
  // Nếu bắt đầu bằng =, +, -, @, chèn thêm dấu nháy đơn ' ở đầu để Google Sheets coi là text thường, tránh tự động chạy công thức
  if (/^[=\+\-\@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function doPost(e) {
  var sheet;
  try {
    sheet = SpreadsheetApp.openById("1Sgb2kddv3-DSgA5IZZhexZf4d-ZFjFuBwIYS56JLJPI").getActiveSheet();
  } catch (err) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  }
  var DRIVE_FOLDER_ID = "1aLOyh5r1PJqgfpSfNqj37mGNZJ18Ctyi";
  
  // Tạo tiêu đề cột nếu sheet còn trống
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Timestamp", 
      "Telegram ID", 
      "Telegram Username", 
      "Telegram First Name", 
      "Tên Xì Trum", 
      "Tên Thật", 
      "Nhóm", 
      "Giới Tính", 
      "Sở Thích", 
      "Điểm Mạnh", 
      "Điểm Yếu", 
      "Tính Cách", 
      "Bio - Tự Bạch", 
      "Giới Tính Xì Trum", 
      "Kiểu Mũ", 
      "Màu Mũ",
      "Màu Tóc",
      "Phụ Kiện Mặt",
      "Trang Phục",
      "Đạo Cụ Cầm Tay",
      "Biểu Cảm",
      "Dáng Đứng (Pose)",
      "Bối Cảnh",
      "Chi Tiết Bổ Sung",
      "Ảnh Tham Khảo Link Drive",
      "Ghi Chú Ảnh"
    ]);
  }
  
  try {
    var data = JSON.parse(e.postData.contents);
    
    // Xử lý upload ảnh base64 nếu có
    var fileUrl = "";
    if (data.referenceImage && data.referenceImage.indexOf("base64,") !== -1) {
      try {
        var parts = data.referenceImage.split(";base64,");
        var contentType = parts[0].split(":")[1];
        var rawData = parts[1];
        var decodedData = Utilities.base64Decode(rawData);
        
        var ext = "png";
        if (contentType.indexOf("jpeg") !== -1 || contentType.indexOf("jpg") !== -1) ext = "jpg";
        else if (contentType.indexOf("gif") !== -1) ext = "gif";
        
        var filename = "ref_" + (data.smurfName || "card").replace(/\s+/g, "_") + "_" + new Date().getTime() + "." + ext;
        var blob = Utilities.newBlob(decodedData, contentType, filename);
        
        var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
        fileUrl = "https://drive.google.com/uc?export=view&id=" + file.getId();
      } catch (fileErr) {
        fileUrl = "Error upload: " + fileErr.toString();
      }
    } else if (data.referenceImage) {
      // Nếu là link ảnh text nhập trực tiếp
      fileUrl = data.referenceImage;
    }
    
    // Ghi dữ liệu dòng mới (Đã được làm sạch)
    sheet.appendRow([
      sanitizeInput(data.timestamp || new Date().toISOString()),
      sanitizeInput(data.telegramId),
      sanitizeInput(data.telegramUsername),
      sanitizeInput(data.telegramFirstName),
      sanitizeInput(data.smurfName),
      sanitizeInput(data.realName),
      sanitizeInput(data.group),
      sanitizeInput(data.personalGender || "Nam"),
      sanitizeInput(data.hobbies),
      sanitizeInput(data.strength),
      sanitizeInput(data.weakness),
      sanitizeInput(data.personality),
      sanitizeInput(data.bio),
      sanitizeInput(data.gender || "Không"),
      sanitizeInput(data.hat || "Không"),
      sanitizeInput(data.hatColor || "Không"),
      sanitizeInput(data.hairColor || "Không"),
      sanitizeInput(data.faceAccessory || "Không"),
      sanitizeInput(data.outfit || "Không"),
      sanitizeInput(data.prop || "Không"),
      sanitizeInput(data.expression || "Không"),
      sanitizeInput(data.pose || "Không"),
      sanitizeInput(data.background || "Không"),
      sanitizeInput(data.additionalInfo),
      sanitizeInput(fileUrl),
      sanitizeInput(data.referenceNotes)
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Đăng ký thành công!", fileUrl: fileUrl }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("✅ API Làng Xì Trum đang hoạt động! Dùng phương thức POST để gửi đăng ký.");
}

// Hàm chạy thử nghiệm để kích hoạt hộp thoại Cấp quyền (Authorization Required) trên giao diện Web GAS
function testPermission() {
  var sheet = SpreadsheetApp.openById("1Sgb2kddv3-DSgA5IZZhexZf4d-ZFjFuBwIYS56JLJPI").getActiveSheet();
  Logger.log("Kết nối Sheet thành công! Tên sheet: " + sheet.getName());
  Logger.log("Số dòng hiện tại: " + sheet.getLastRow());
}

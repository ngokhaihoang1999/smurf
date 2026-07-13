/**
 * GOOGLE APPS SCRIPT MIDDLEWARE FOR SMURF VILLAGE REGISTRY
 * 
 * API Endpoints (via doPost):
 *   action: "register" → Đăng ký cư dân mới (chặn trùng Telegram ID)
 *   action: "lookup"   → Tra cứu cư dân theo Telegram ID
 *   action: "update"   → Cập nhật thông tin cá nhân (chỉ các cột editable)
 *   action: "listAll"  → Liệt kê toàn bộ cư dân (cho Village Square)
 * 
 * Deploy: New deployment → Web app → Execute as Me → Anyone
 */

var SHEET_ID = "1Sgb2kddv3-DSgA5IZZhexZf4d-ZFjFuBwIYS56JLJPI";
var DRIVE_FOLDER_ID = "1aLOyh5r1PJqgfpSfNqj37mGNZJ18Ctyi";

// Cột header chuẩn
var HEADERS = [
  "Timestamp",            // A (1)
  "Telegram ID",          // B (2) ← PRIMARY KEY
  "Telegram Username",    // C (3)
  "Telegram First Name",  // D (4)
  "Tên Xì Trum",         // E (5)  ← editable
  "Tên Thật",            // F (6)  ← editable
  "Nhóm",                // G (7)  ← editable
  "Giới Tính",           // H (8)  ← editable
  "Sở Thích",            // I (9)  ← editable
  "Điểm Mạnh",           // J (10) ← editable
  "Điểm Yếu",            // K (11) ← editable
  "Tính Cách",           // L (12) ← editable
  "Bio - Tự Bạch",       // M (13) ← editable
  "Giới Tính Xì Trum",   // N (14) ← locked (avatar)
  "Kiểu Mũ",             // O (15) ← locked
  "Màu Mũ",              // P (16) ← locked
  "Màu Tóc",             // Q (17) ← locked
  "Phụ Kiện Mặt",        // R (18) ← locked
  "Trang Phục",           // S (19) ← locked
  "Đạo Cụ Cầm Tay",     // T (20) ← locked
  "Biểu Cảm",            // U (21) ← locked
  "Dáng Đứng (Pose)",    // V (22) ← locked
  "Bối Cảnh",            // W (23) ← locked
  "Chi Tiết Bổ Sung",    // X (24) ← locked
  "Ảnh Tham Khảo Link Drive", // Y (25) ← locked
  "Ghi Chú Ảnh"          // Z (26) ← locked
];

// Các cột cho phép chỉnh sửa (index 1-based trong sheet)
var EDITABLE_COLS = {
  "smurfName": 5,     // E
  "realName": 6,      // F
  "group": 7,         // G
  "personalGender": 8,// H
  "hobbies": 9,       // I
  "strength": 10,     // J
  "weakness": 11,     // K
  "personality": 12,  // L
  "bio": 13           // M
};

// Tiền xử lý chống Formula Injection (CWE-1236)
function sanitizeInput(val) {
  if (val === null || val === undefined) return "";
  var str = String(val).trim();
  if (/^[=\+\-\@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
}

// Lấy sheet chính
function getSheet() {
  try {
    return SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  } catch (err) {
    return SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  }
}

// Đảm bảo sheet có header
function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
}

// Tìm hàng theo Telegram ID (cột B = cột 2)
function findRowByTelegramId(sheet, telegramId) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1; // Chỉ có header hoặc trống
  
  var idCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // Cột B, bỏ header
  for (var i = 0; i < idCol.length; i++) {
    if (String(idCol[i][0]).trim() === String(telegramId).trim()) {
      return i + 2; // +2 vì bắt đầu từ hàng 2 (bỏ header) và 1-indexed
    }
  }
  return -1;
}

// Chuyển hàng sheet thành object
function rowToObject(sheet, rowNum) {
  var values = sheet.getRange(rowNum, 1, 1, HEADERS.length).getValues()[0];
  var obj = {};
  // Map header → value
  obj.timestamp = values[0];
  obj.telegramId = String(values[1]);
  obj.telegramUsername = values[2];
  obj.telegramFirstName = values[3];
  obj.smurfName = values[4];
  obj.realName = values[5];
  obj.group = values[6];
  obj.personalGender = values[7];
  obj.hobbies = values[8];
  obj.strength = values[9];
  obj.weakness = values[10];
  obj.personality = values[11];
  obj.bio = values[12];
  obj.gender = values[13];
  obj.hat = values[14];
  obj.hatColor = values[15];
  obj.hairColor = values[16];
  obj.faceAccessory = values[17];
  obj.outfit = values[18];
  obj.prop = values[19];
  obj.expression = values[20];
  obj.pose = values[21];
  obj.background = values[22];
  obj.additionalInfo = values[23];
  obj.referenceImageUrl = values[24];
  obj.referenceNotes = values[25];
  return obj;
}

// ═══════════════════════════════════════
// ACTION: LOOKUP
// ═══════════════════════════════════════
function handleLookup(data) {
  var sheet = getSheet();
  ensureHeaders(sheet);
  
  var telegramId = data.telegramId;
  if (!telegramId) {
    return { exists: false, error: "Missing telegramId" };
  }
  
  var rowNum = findRowByTelegramId(sheet, telegramId);
  if (rowNum === -1) {
    return { exists: false };
  }
  
  var userData = rowToObject(sheet, rowNum);
  return { exists: true, data: userData };
}

// ═══════════════════════════════════════
// ACTION: REGISTER
// ═══════════════════════════════════════
function handleRegister(data) {
  var sheet = getSheet();
  ensureHeaders(sheet);
  
  var telegramId = data.telegramId;
  if (!telegramId) {
    return { status: "error", message: "Missing telegramId" };
  }
  
  // Chặn đăng ký trùng
  var existingRow = findRowByTelegramId(sheet, telegramId);
  if (existingRow !== -1) {
    return { status: "duplicate", message: "Telegram ID này đã đăng ký rồi!" };
  }
  
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
    fileUrl = data.referenceImage;
  }
  
  // Ghi dòng mới
  sheet.appendRow([
    sanitizeInput(data.timestamp || new Date().toISOString()),
    sanitizeInput(telegramId),
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
  
  return { status: "success", message: "Đăng ký thành công!", fileUrl: fileUrl };
}

// ═══════════════════════════════════════
// ACTION: UPDATE (chỉ cột editable)
// ═══════════════════════════════════════
function handleUpdate(data) {
  var sheet = getSheet();
  
  var telegramId = data.telegramId;
  if (!telegramId) {
    return { status: "error", message: "Missing telegramId" };
  }
  
  var rowNum = findRowByTelegramId(sheet, telegramId);
  if (rowNum === -1) {
    return { status: "error", message: "Không tìm thấy cư dân với Telegram ID này" };
  }
  
  // Chỉ cập nhật các cột cho phép
  for (var key in EDITABLE_COLS) {
    if (data.hasOwnProperty(key) && data[key] !== undefined && data[key] !== null) {
      var colNum = EDITABLE_COLS[key];
      sheet.getRange(rowNum, colNum).setValue(sanitizeInput(data[key]));
    }
  }
  
  return { status: "success", message: "Cập nhật thành công!" };
}

// ═══════════════════════════════════════
// ACTION: LIST ALL (cho Village Square)
// ═══════════════════════════════════════
function handleListAll() {
  var sheet = getSheet();
  ensureHeaders(sheet);
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { status: "success", residents: [] };
  }
  
  var residents = [];
  for (var r = 2; r <= lastRow; r++) {
    residents.push(rowToObject(sheet, r));
  }
  
  return { status: "success", residents: residents };
}

// ═══════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || "register"; // Mặc định "register" cho backward compat
    
    var result;
    switch (action) {
      case "lookup":
        result = handleLookup(data);
        break;
      case "register":
        result = handleRegister(data);
        break;
      case "update":
        result = handleUpdate(data);
        break;
      case "listAll":
        result = handleListAll();
        break;
      default:
        result = { status: "error", message: "Unknown action: " + action };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("✅ API Làng Xì Trum V2 đang hoạt động! Actions: lookup, register, update, listAll");
}

// Hàm test permission (chạy 1 lần trên GAS web UI để kích hoạt cấp quyền)
function testPermission() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  Logger.log("Sheet: " + sheet.getName() + " | Rows: " + sheet.getLastRow());
  
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log("Drive folder: " + folder.getName());
}

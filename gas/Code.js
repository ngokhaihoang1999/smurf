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
      
      var folder;
      try {
        folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      } catch (folderErr) {
        try {
          folder = DriveApp.getRootFolder();
        } catch (rootErr) {
          throw new Error("Cannot access Drive Folder or Root Folder: " + rootErr.toString());
        }
      }
      
      var file = folder.createFile(blob);
      
      try {
        file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
      } catch (sharingErr) {
        // Ignore domain policy sharing restrictions
      }
      
      fileUrl = '=IMAGE("https://drive.google.com/uc?export=view&id=' + file.getId() + '")';
    } catch (fileErr) {
      fileUrl = "Error upload: " + fileErr.toString();
    }
  } else if (data.referenceImage) {
    if (data.referenceImage.indexOf("http") === 0) {
      fileUrl = '=IMAGE("' + data.referenceImage + '")';
    } else {
      fileUrl = data.referenceImage;
    }
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
    fileUrl,
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
      case "sendChat":
        result = handleSendChat(data);
        break;
      case "getChat":
        result = handleGetChat();
        break;
      case "getReactions":
        result = handleGetReactions();
        break;
      case "updateReaction":
        result = handleUpdateReaction(data);
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
  try {
    var action = (e.parameter && e.parameter.action) || "";
    var result;
    
    switch (action) {
      case "lookup":
        result = handleLookup({ telegramId: e.parameter.telegramId || "" });
        break;
      case "listAll":
        result = handleListAll();
        break;
      case "getChat":
        result = handleGetChat();
        break;
      case "sendChat":
        result = handleSendChat({
          telegramId: e.parameter.telegramId || "",
          smurfName: e.parameter.smurfName || "",
          message: e.parameter.message || "",
          mood: e.parameter.mood || ""
        });
        break;
      case "getReactions":
        result = handleGetReactions();
        break;
      case "updateReaction":
        result = handleUpdateReaction({
          telegramId: e.parameter.telegramId || "",
          smurfName: e.parameter.smurfName || "",
          type: e.parameter.type || "",
          isAdd: e.parameter.isAdd === "true"
        });
        break;
      default:
        result = { status: "ok", message: "API Làng Xì Trum V2.2 — Use ?action=lookup&telegramId=xxx or ?action=listAll" };
    }
    
    var jsonStr = JSON.stringify(result);
    
    // JSONP support: if callback param exists, wrap in callback
    var callback = e.parameter && e.parameter.callback;
    if (callback) {
      return ContentService.createTextOutput(callback + "(" + jsonStr + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    return ContentService.createTextOutput(jsonStr)
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══════════════════════════════════════
// CHAT FUNCTIONALITY
// ═══════════════════════════════════════
function getChatSheet() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(SHEET_ID);
  } catch (err) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  var sheet = ss.getSheetByName("Chat");
  if (!sheet) {
    sheet = ss.insertSheet("Chat");
    sheet.appendRow(["Timestamp", "Telegram ID", "Tên Xì Trum", "Tin Nhắn", "Cảm Xúc (Mood)"]);
  }
  return sheet;
}

function handleSendChat(data) {
  var sheet = getChatSheet();
  var cleanMsg = sanitizeInput(data.message || "");
  var cleanMood = sanitizeInput(data.mood || "normal");
  
  if (cleanMsg.length > 50) cleanMsg = cleanMsg.substring(0, 50); // limit to 50 chars
  
  sheet.appendRow([
    new Date(),
    sanitizeInput(data.telegramId || ""),
    sanitizeInput(data.smurfName || "Khách Ẩn Danh"),
    cleanMsg,
    cleanMood
  ]);
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 31) { // Keep last 30 messages
    sheet.deleteRows(2, lastRow - 31);
  }
  
  return { status: "success" };
}

function handleGetChat() {
  var sheet = getChatSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { status: "success", messages: [] };
  
  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var messages = data.map(function(row) {
    return {
      time: Utilities.formatDate(row[0], "GMT+7", "HH:mm"),
      telegramId: String(row[1]),
      smurfName: String(row[2]),
      message: String(row[3]),
      mood: String(row[4])
    };
  });
  return { status: "success", messages: messages };
}

// ═══════════════════════════════════════
// REACTION / SOCIAL INTERACTIONS ONLINE STORAGE
// ═══════════════════════════════════════
function getReactionsSheet() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(SHEET_ID);
  } catch (err) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  var sheet = ss.getSheetByName("Reactions");
  if (!sheet) {
    sheet = ss.insertSheet("Reactions");
    sheet.appendRow(["Telegram ID", "Tên Xì Trum", "Likes", "Funnys", "Stars", "Cools", "Last Updated"]);
  }
  return sheet;
}

function handleGetReactions() {
  var sheet = getReactionsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { status: "success", reactions: {} };
  
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var reactions = {};
  data.forEach(function(row) {
    var tid = String(row[0]).trim();
    reactions[tid] = {
      likes: Number(row[2]) || 0,
      funnys: Number(row[3]) || 0,
      stars: Number(row[4]) || 0,
      cools: Number(row[5]) || 0
    };
  });
  return { status: "success", reactions: reactions };
}

function handleUpdateReaction(data) {
  var sheet = getReactionsSheet();
  var telegramId = String(data.telegramId).trim();
  var smurfName = String(data.smurfName || "").trim();
  var type = data.type; // "like", "funny", "star", "cool"
  var isAdd = !!data.isAdd;
  
  var colIndex = -1;
  if (type === 'like') colIndex = 3; // Col C
  else if (type === 'funny') colIndex = 4; // Col D
  else if (type === 'star') colIndex = 5; // Col E
  else if (type === 'cool') colIndex = 6; // Col F
  
  if (colIndex === -1) return { status: "error", message: "Invalid reaction type: " + type };
  
  // Find existing row
  var lastRow = sheet.getLastRow();
  var rowNum = -1;
  if (lastRow > 1) {
    var idCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < idCol.length; i++) {
      if (String(idCol[i][0]).trim() === telegramId) {
        rowNum = i + 2;
        break;
      }
    }
  }
  
  if (rowNum === -1) {
    // Append new row
    var newRow = [telegramId, smurfName, 0, 0, 0, 0, new Date()];
    if (isAdd) newRow[colIndex - 1] = 1;
    sheet.appendRow(newRow);
    rowNum = sheet.getLastRow();
  } else {
    var currentVal = Number(sheet.getRange(rowNum, colIndex).getValue()) || 0;
    var newVal = isAdd ? currentVal + 1 : Math.max(0, currentVal - 1);
    sheet.getRange(rowNum, colIndex).setValue(newVal);
    sheet.getRange(rowNum, 7).setValue(new Date()); // Update timestamp
  }
  
  // Read and return updated values
  var updatedVals = sheet.getRange(rowNum, 1, 1, 7).getValues()[0];
  return {
    status: "success",
    telegramId: telegramId,
    likes: Number(updatedVals[2]) || 0,
    funnys: Number(updatedVals[3]) || 0,
    stars: Number(updatedVals[4]) || 0,
    cools: Number(updatedVals[5]) || 0
  };
}

// Hàm test permission (chạy 1 lần trên GAS web UI để kích hoạt cấp quyền)
function testPermission() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  Logger.log("Sheet: " + sheet.getName() + " | Rows: " + sheet.getLastRow());
  
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log("Drive folder: " + folder.getName());
}

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
        result = handleGetReactions({
          fromTelegramId: e.parameter.fromTelegramId || ""
        });
        break;
      case "updateReaction":
        result = handleUpdateReaction({
          fromTelegramId: e.parameter.fromTelegramId || "",
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

function getReactionLogsSheet() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(SHEET_ID);
  } catch (err) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  var sheet = ss.getSheetByName("ReactionLogs");
  if (!sheet) {
    sheet = ss.insertSheet("ReactionLogs");
    sheet.appendRow(["From Telegram ID", "To Telegram ID", "Reaction Type", "Timestamp"]);
  }
  return sheet;
}

function findReactionRow(sheet, fromId, toId, type) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(fromId).trim() &&
        String(data[i][1]).trim() === String(toId).trim() &&
        String(data[i][2]).trim() === String(type).trim()) {
      return i + 2;
    }
  }
  return -1;
}

// Tính lại toàn bộ Reaction counts chính xác 100% từ ReactionLogs
function recountAllReactions() {
  var logsSheet = getReactionLogsSheet();
  var logsLastRow = logsSheet.getLastRow();
  var summary = {};
  
  if (logsLastRow > 1) {
    var logsData = logsSheet.getRange(2, 1, logsLastRow - 1, 3).getValues();
    logsData.forEach(function(row) {
      var fromId = String(row[0]).trim();
      var toId = String(row[1]).trim();
      var type = String(row[2]).trim();
      
      if (!toId) return;
      if (!summary[toId]) {
        summary[toId] = { likes: 0, funnys: 0, stars: 0, cools: 0 };
      }
      
      if (type === 'like') summary[toId].likes++;
      else if (type === 'funny') summary[toId].funnys++;
      else if (type === 'star') summary[toId].stars++;
      else if (type === 'cool') summary[toId].cools++;
    });
  }
  
  // Đồng bộ lại toàn bộ trang tính Reactions
  var reactionsSheet = getReactionsSheet();
  var lastRow = reactionsSheet.getLastRow();
  
  // Nếu đã có dữ liệu cũ -> cập nhật các cột số lượng
  if (lastRow > 1) {
    var sheetData = reactionsSheet.getRange(2, 1, lastRow - 1, 7).getValues();
    for (var i = 0; i < sheetData.length; i++) {
      var rowNum = i + 2;
      var tid = String(sheetData[i][0]).trim();
      var counts = summary[tid] || { likes: 0, funnys: 0, stars: 0, cools: 0 };
      
      reactionsSheet.getRange(rowNum, 3, 1, 4).setValues([[counts.likes, counts.funnys, counts.stars, counts.cools]]);
      reactionsSheet.getRange(rowNum, 7).setValue(new Date());
    }
  }
  
  return summary;
}

function handleGetReactions(data) {
  // Tính toán lại chính xác từ ReactionLogs trước khi lấy dữ liệu
  var reactions = recountAllReactions();
  
  var myReactions = {};
  var fromTelegramId = data && data.fromTelegramId ? String(data.fromTelegramId).trim() : "";
  if (fromTelegramId) {
    var logsSheet = getReactionLogsSheet();
    var logsLastRow = logsSheet.getLastRow();
    if (logsLastRow > 1) {
      var logsData = logsSheet.getRange(2, 1, logsLastRow - 1, 3).getValues();
      logsData.forEach(function(row) {
        if (String(row[0]).trim() === fromTelegramId) {
          var targetId = String(row[1]).trim();
          var type = String(row[2]).trim();
          var reactionKey = targetId + "_" + type;
          myReactions[reactionKey] = true;
        }
      });
    }
  }
  
  return { status: "success", reactions: reactions, myReactions: myReactions };
}

function handleUpdateReaction(data) {
  var targetId = data.telegramId ? String(data.telegramId).trim() : "";
  var fromTelegramId = data.fromTelegramId ? String(data.fromTelegramId).trim() : "";
  var smurfName = String(data.smurfName || "").trim();
  var type = String(data.type || "").trim(); // "like", "funny", "star", "cool"
  
  if (!fromTelegramId) {
    return { status: "error", message: "Yêu cầu fromTelegramId (Telegram ID của người tương tác)" };
  }
  if (!targetId) {
    return { status: "error", message: "Yêu cầu telegramId (ID cư dân được thả emoji)" };
  }
  
  var validTypes = ['like', 'funny', 'star', 'cool'];
  if (validTypes.indexOf(type) === -1) {
    return { status: "error", message: "Invalid reaction type: " + type };
  }
  
  var logsSheet = getReactionLogsSheet();
  var logRowNum = findReactionRow(logsSheet, fromTelegramId, targetId, type);
  var isAdd = true;
  
  if (logRowNum !== -1) {
    // Đã thả emoji trước đó -> Bỏ thả (Toggle OFF)
    logsSheet.deleteRow(logRowNum);
    isAdd = false;
  } else {
    // Chưa thả emoji -> Thả emoji mới (Toggle ON)
    logsSheet.appendRow([fromTelegramId, targetId, type, new Date()]);
    isAdd = true;
  }
  
  // Tính lại tổng số lượng reaction chính xác từ ReactionLogs cho targetId
  var logsLastRow = logsSheet.getLastRow();
  var likesCount = 0;
  var funnysCount = 0;
  var starsCount = 0;
  var coolsCount = 0;
  
  if (logsLastRow > 1) {
    var logsData = logsSheet.getRange(2, 1, logsLastRow - 1, 3).getValues();
    logsData.forEach(function(row) {
      if (String(row[1]).trim() === targetId) {
        var rType = String(row[2]).trim();
        if (rType === 'like') likesCount++;
        else if (rType === 'funny') funnysCount++;
        else if (rType === 'star') starsCount++;
        else if (rType === 'cool') coolsCount++;
      }
    });
  }
  
  // Cập nhật hoặc tạo dòng tổng hợp trong bảng Reactions
  var reactionsSheet = getReactionsSheet();
  var lastRow = reactionsSheet.getLastRow();
  var rowNum = -1;
  if (lastRow > 1) {
    var idCol = reactionsSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < idCol.length; i++) {
      if (String(idCol[i][0]).trim() === targetId) {
        rowNum = i + 2;
        break;
      }
    }
  }
  
  if (rowNum === -1) {
    reactionsSheet.appendRow([targetId, smurfName, likesCount, funnysCount, starsCount, coolsCount, new Date()]);
  } else {
    reactionsSheet.getRange(rowNum, 2).setValue(smurfName);
    reactionsSheet.getRange(rowNum, 3).setValue(likesCount);
    reactionsSheet.getRange(rowNum, 4).setValue(funnysCount);
    reactionsSheet.getRange(rowNum, 5).setValue(starsCount);
    reactionsSheet.getRange(rowNum, 6).setValue(coolsCount);
    reactionsSheet.getRange(rowNum, 7).setValue(new Date());
  }
  
  return {
    status: "success",
    telegramId: targetId,
    likes: likesCount,
    funnys: funnysCount,
    stars: starsCount,
    cools: coolsCount,
    isAdd: isAdd
  };
}

// Hàm test permission (chạy 1 lần trên GAS web UI để kích hoạt cấp quyền)
function testPermission() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  Logger.log("Sheet: " + sheet.getName() + " | Rows: " + sheet.getLastRow());
  
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log("Drive folder: " + folder.getName());
}

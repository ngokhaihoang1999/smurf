/**
 * GOOGLE APPS SCRIPT MIDDLEWARE FOR SMURF VILLAGE REGISTRY
 * (Supports Google Sign-In with Gmail Primary Key & Backward Compatibility)
 * 
 * API Endpoints (via doPost / doGet):
 *   action: "register" → Đăng ký cư dân mới (chặn trùng Email/ID)
 *   action: "lookup"   → Tra cứu cư dân theo Email/Gmail hoặc Telegram ID
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
  "Email (Gmail)",        // B (2) ← PRIMARY KEY
  "Tên Google",           // C (3)
  "Avatar Google",        // D (4)
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

// Tìm hàng theo Identifier (Email hoặc Telegram ID) ở cột B (cột 2)
function findRowByIdentifier(sheet, idVal) {
  if (!idVal) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1; // Chỉ có header hoặc trống
  
  var targetStr = String(idVal).trim().toLowerCase();
  var idCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues(); // Cột B
  for (var i = 0; i < idCol.length; i++) {
    var valInSheet = String(idCol[i][0]).trim().toLowerCase();
    if (valInSheet === targetStr) {
      return i + 2; // +2 vì bắt đầu từ hàng 2 và 1-indexed
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
  obj.email = String(values[1]);
  obj.telegramId = String(values[1]); // Alias for compatibility
  obj.googleName = values[2];
  obj.googlePicture = values[3];
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
  
  var identifier = data.email || data.telegramId || data.id;
  if (!identifier) {
    return { exists: false, error: "Missing email or telegramId" };
  }
  
  var rowNum = findRowByIdentifier(sheet, identifier);
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
  
  var identifier = data.email || data.telegramId || data.id;
  if (!identifier) {
    return { status: "error", message: "Missing email or identifier" };
  }
  
  // Chặn đăng ký trùng
  var existingRow = findRowByIdentifier(sheet, identifier);
  if (existingRow !== -1) {
    return { status: "duplicate", message: "Tài khoản Gmail này đã đăng ký rồi!" };
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
    sanitizeInput(identifier),
    sanitizeInput(data.googleName || data.telegramUsername || ""),
    sanitizeInput(data.googlePicture || data.telegramFirstName || ""),
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
  
  var identifier = data.email || data.telegramId || data.id;
  if (!identifier) {
    return { status: "error", message: "Missing email or identifier" };
  }
  
  var rowNum = findRowByIdentifier(sheet, identifier);
  if (rowNum === -1) {
    return { status: "error", message: "Không tìm thấy cư dân với Email này!" };
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
    var action = data.action || "register";
    
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
        result = handleGetReactions(data);
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
        result = handleLookup({ email: e.parameter.email || e.parameter.telegramId || "" });
        break;
      case "listAll":
        result = handleListAll();
        break;
      case "getChat":
        result = handleGetChat();
        break;
      case "sendChat":
        result = handleSendChat({
          email: e.parameter.email || e.parameter.telegramId || "",
          smurfName: e.parameter.smurfName || "",
          message: e.parameter.message || "",
          mood: e.parameter.mood || ""
        });
        break;
      case "getReactions":
        result = handleGetReactions({
          fromEmail: e.parameter.fromEmail || e.parameter.fromTelegramId || ""
        });
        break;
      case "updateReaction":
        result = handleUpdateReaction({
          fromEmail: e.parameter.fromEmail || e.parameter.fromTelegramId || "",
          targetEmail: e.parameter.targetEmail || e.parameter.telegramId || "",
          smurfName: e.parameter.smurfName || "",
          type: e.parameter.type || "",
          isAdd: e.parameter.isAdd === "true"
        });
        break;
      default:
        result = { status: "ok", message: "API Làng Xì Trum V3.0 (Google Identity Edition)" };
    }
    
    var jsonStr = JSON.stringify(result);
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
    sheet.appendRow(["Timestamp", "Email (Gmail)", "Tên Xì Trum", "Tin Nhắn", "Cảm Xúc (Mood)"]);
  }
  return sheet;
}

function handleSendChat(data) {
  var sheet = getChatSheet();
  var cleanMsg = sanitizeInput(data.message || "");
  var cleanMood = sanitizeInput(data.mood || "normal");
  var userKey = sanitizeInput(data.email || data.telegramId || "");
  
  if (cleanMsg.length > 50) cleanMsg = cleanMsg.substring(0, 50);
  
  sheet.appendRow([
    new Date(),
    userKey,
    sanitizeInput(data.smurfName || "Cư Dân Xì Trum"),
    cleanMsg,
    cleanMood
  ]);
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 31) {
    sheet.deleteRows(2, lastRow - 31);
  }
  
  return { status: "success" };
}

function handleGetChat() {
  var sheet = getChatSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { status: "success", messages: [] };
  
  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var messages = [];
  for (var i = 0; i < data.length; i++) {
    messages.push({
      timestamp: data[i][0],
      email: data[i][1],
      telegramId: data[i][1], // Alias
      smurfName: data[i][2],
      message: data[i][3],
      mood: data[i][4]
    });
  }
  return { status: "success", messages: messages };
}

// ═══════════════════════════════════════
// EMOJI REACTIONS FUNCTIONALITY (OPTIMIZED FOR HIGH-SCALE & HIGH-SPEED)
// ═══════════════════════════════════════
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
    sheet.appendRow(["Timestamp", "FromEmail", "TargetEmail", "TargetSmurfName", "Type", "Action"]);
  }
  return sheet;
}

function getReactionsSummarySheet() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(SHEET_ID);
  } catch (err) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  var sheet = ss.getSheetByName("Reactions");
  if (!sheet) {
    sheet = ss.insertSheet("Reactions");
    sheet.appendRow(["TargetEmail", "TargetSmurfName", "Likes", "Funnys", "Stars", "Cools"]);
  }
  return sheet;
}

function getUserVotesSheet() {
  var ss;
  try {
    ss = SpreadsheetApp.openById(SHEET_ID);
  } catch (err) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  var sheet = ss.getSheetByName("UserVotes");
  if (!sheet) {
    sheet = ss.insertSheet("UserVotes");
    sheet.appendRow(["FromKey", "TargetKey", "Type", "VoteKey"]);
  }
  return sheet;
}

function normalizeReactionType(t) {
  var str = String(t || '').trim().toLowerCase();
  if (str === 'like' || str === 'likes' || str === 'heart') return 'likes';
  if (str === 'funny' || str === 'funnys' || str === 'party') return 'funnys';
  if (str === 'star' || str === 'stars') return 'stars';
  if (str === 'cool' || str === 'cools' || str === 'fire') return 'cools';
  return 'likes';
}

function getColIndexForType(typeProp) {
  if (typeProp === 'likes') return 3;  // Cột C
  if (typeProp === 'funnys') return 4; // Cột D
  if (typeProp === 'stars') return 5;  // Cột E
  if (typeProp === 'cools') return 6;  // Cột F
  return 3;
}

function handleGetReactions(data) {
  var summarySheet = getReactionsSummarySheet();
  var userVotesSheet = getUserVotesSheet();
  
  var sLast = summarySheet.getLastRow();
  var summaryMap = {};
  if (sLast > 1) {
    var sData = summarySheet.getRange(2, 1, sLast - 1, 6).getValues();
    for (var i = 0; i < sData.length; i++) {
      var emailKey = String(sData[i][0]).trim();
      if (!emailKey) continue;
      var likesCount = Number(sData[i][2]) || 0;
      var funnysCount = Number(sData[i][3]) || 0;
      var starsCount = Number(sData[i][4]) || 0;
      var coolsCount = Number(sData[i][5]) || 0;
      
      summaryMap[emailKey] = {
        likes: likesCount,
        funnys: funnysCount,
        stars: starsCount,
        cools: coolsCount,
        // Full Backward Compatibility aliases
        heart: likesCount,
        party: funnysCount,
        star: starsCount,
        fire: coolsCount,
        like: likesCount,
        funny: funnysCount,
        cool: coolsCount
      };
    }
  }
  
  var myReactions = {};
  var userActiveArrayMap = {};
  var fromEmail = data ? String(data.fromEmail || data.fromTelegramId || '').trim() : '';
  if (fromEmail) {
    var uLast = userVotesSheet.getLastRow();
    if (uLast > 1) {
      var uData = userVotesSheet.getRange(2, 1, uLast - 1, 4).getValues();
      var fromKeyLower = fromEmail.toLowerCase();
      
      for (var j = 0; j < uData.length; j++) {
        var logFrom = String(uData[j][0]).trim().toLowerCase();
        if (logFrom === fromKeyLower) {
          var targetKey = String(uData[j][1]).trim();
          var typeProp = normalizeReactionType(uData[j][2]);
          var shortType = typeProp === 'likes' ? 'like' : (typeProp === 'funnys' ? 'funny' : (typeProp === 'stars' ? 'star' : 'cool'));
          
          myReactions[targetKey + '_' + shortType] = true;
          myReactions[targetKey + '_' + typeProp] = true;
          
          if (!userActiveArrayMap[targetKey]) userActiveArrayMap[targetKey] = [];
          userActiveArrayMap[targetKey].push(shortType);
        }
      }
    }
  }
  
  return {
    status: "success",
    reactions: summaryMap,
    myReactions: myReactions,
    userActiveReactions: userActiveArrayMap
  };
}

function handleUpdateReaction(data) {
  var fromEmail = String(data.fromEmail || data.fromTelegramId || '').trim();
  var targetEmail = String(data.targetEmail || data.telegramId || '').trim();
  var smurfName = data.smurfName || "";
  var rawType = data.type || "like";
  var isAdd = (data.isAdd === true || data.isAdd === "true" || data.isAdd === 1 || data.isAdd === "1");
  
  if (!fromEmail || !targetEmail) {
    return { status: "error", message: "Missing fromEmail or targetEmail" };
  }
  
  var typeProp = normalizeReactionType(rawType);
  var shortType = typeProp === 'likes' ? 'like' : (typeProp === 'funnys' ? 'funny' : (typeProp === 'stars' ? 'star' : 'cool'));
  var targetCol = getColIndexForType(typeProp);
  
  var userVotesSheet = getUserVotesSheet();
  var voteKey = fromEmail.toLowerCase() + "_" + targetEmail.toLowerCase() + "_" + typeProp;
  
  var uLast = userVotesSheet.getLastRow();
  var existingVoteRow = -1;
  if (uLast > 1) {
    var uData = userVotesSheet.getRange(2, 4, uLast - 1, 1).getValues();
    for (var u = 0; u < uData.length; u++) {
      if (String(uData[u][0]).trim().toLowerCase() === voteKey) {
        existingVoteRow = u + 2;
        break;
      }
    }
  }
  
  // Track vote state
  if (isAdd && existingVoteRow === -1) {
    userVotesSheet.appendRow([sanitizeInput(fromEmail), sanitizeInput(targetEmail), typeProp, voteKey]);
  } else if (!isAdd && existingVoteRow !== -1) {
    userVotesSheet.deleteRow(existingVoteRow);
  }
  
  // Append historical log
  try {
    var logsSheet = getReactionLogsSheet();
    logsSheet.appendRow([new Date(), sanitizeInput(fromEmail), sanitizeInput(targetEmail), sanitizeInput(smurfName), typeProp, isAdd ? "ADD" : "REMOVE"]);
  } catch (e) {}
  
  // Update Summary Sheet
  var summarySheet = getReactionsSummarySheet();
  var sLast = summarySheet.getLastRow();
  var targetRow = -1;
  var counts = { likes: 0, funnys: 0, stars: 0, cools: 0 };
  var tKeyLower = targetEmail.toLowerCase();
  
  if (sLast > 1) {
    var sData = summarySheet.getRange(2, 1, sLast - 1, 6).getValues();
    for (var i = 0; i < sData.length; i++) {
      if (String(sData[i][0]).trim().toLowerCase() === tKeyLower) {
        targetRow = i + 2;
        counts.likes = Number(sData[i][2]) || 0;
        counts.funnys = Number(sData[i][3]) || 0;
        counts.stars = Number(sData[i][4]) || 0;
        counts.cools = Number(sData[i][5]) || 0;
        break;
      }
    }
  }
  
  var newCount = (counts[typeProp] || 0) + (isAdd ? 1 : -1);
  if (newCount < 0) newCount = 0;
  counts[typeProp] = newCount;
  
  if (targetRow !== -1) {
    summarySheet.getRange(targetRow, targetCol).setValue(newCount);
    if (smurfName) summarySheet.getRange(targetRow, 2).setValue(sanitizeInput(smurfName));
  } else {
    counts[typeProp] = isAdd ? 1 : 0;
    summarySheet.appendRow([
      sanitizeInput(targetEmail),
      sanitizeInput(smurfName),
      counts.likes,
      counts.funnys,
      counts.stars,
      counts.cools
    ]);
  }
  
  return {
    status: "success",
    targetEmail: targetEmail,
    type: shortType,
    isAdd: isAdd,
    likes: counts.likes,
    funnys: counts.funnys,
    stars: counts.stars,
    cools: counts.cools,
    counts: counts
  };
}

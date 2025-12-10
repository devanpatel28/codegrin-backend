const multer = require("multer");

// ✅ Use memoryStorage for buffers (not diskStorage)
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5 // Max 5 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/webp',
      'image/jpeg', 
      'image/jpg', 
      'image/png', 
      'image/gif', 
      'application/pdf'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and images allowed.'));
    }
  }
});

module.exports = upload;

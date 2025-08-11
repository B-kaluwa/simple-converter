// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const { convertFile } = require('./converter');
const { v4: uuidv4 } = require('uuid');

const app = express();
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'outputs');

async function ensureDirs() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}
ensureDirs();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                     'application/pdf',
                     'image/png','image/jpeg',
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     'text/csv'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(docx|pdf|png|jpg|jpeg|xlsx|csv)$/i)) cb(null, true);
    else cb(new Error('File type not allowed'));
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const outFormat = req.body.targetFormat; // e.g., 'pdf', 'png', 'csv', 'jpg', 'xlsx'
    const jobId = uuidv4();
    const inputPath = req.file.path;
    const outputBase = path.join(OUTPUT_DIR, `${jobId}`);

    await fs.mkdir(outputBase, { recursive: true });

    const results = await convertFile(inputPath, outFormat, outputBase);

    // results: array of file paths (one or multiple outputs)
    const publicFiles = results.map(p => ({
      name: path.basename(p),
      url: `/outputs/${path.basename(outputBase)}/${path.basename(p)}`
    }));

    return res.json({ jobId, files: publicFiles });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Conversion failed' });
  }
});

// Serve outputs folder statically but only under /outputs
app.use('/outputs', express.static(OUTPUT_DIR, { index: false }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Converter app running on http://localhost:${PORT}`));

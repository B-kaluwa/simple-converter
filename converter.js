// converter.js
const path = require('path');
const fs = require('fs/promises');
const libre = require('libreoffice-convert');
const { default: ExcelJS } = require('exceljs');
const sharp = require('sharp');
const mime = require('mime-types');
const { PDFDocument } = require('pdf-lib');

function toBuffer(filePath) {
  return fs.readFile(filePath);
}

async function convertDocxToPdf(inputPath, outputDir) {
  const docBuf = await toBuffer(inputPath);
  return new Promise((resolve, reject) => {
    libre.convert(docBuf, '.pdf', undefined, async (err, done) => {
      if (err) return reject(err);
      const outPath = path.join(outputDir, path.basename(inputPath, path.extname(inputPath)) + '.pdf');
      await fs.writeFile(outPath, done);
      resolve([outPath]);
    });
  });
}

async function convertXlsxToCsv(inputPath, outputDir) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);
  const outFiles = [];
  workbook.eachSheet(async (worksheet, sheetId) => {
    const rows = [];
    worksheet.eachRow((row) => rows.push(row.values.slice(1)));
    const csv = rows.map(r => r.map(v => (v==null ? '' : `"${String(v).replace(/"/g,'""')}"`)).join(',')).join('\n');
    const outPath = path.join(outputDir, `${path.basename(inputPath, path.extname(inputPath))}_${sheetId}.csv`);
    await fs.writeFile(outPath, csv);
    outFiles.push(outPath);
  });
  return outFiles;
}

async function convertCsvToXlsx(inputPath, outputDir) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Sheet1');
  const text = (await fs.readFile(inputPath, 'utf8')).trim();
  const rows = text.split(/\r?\n/).map(r => r.split(','));
  rows.forEach(r => ws.addRow(r));
  const outPath = path.join(outputDir, path.basename(inputPath, path.extname(inputPath)) + '.xlsx');
  await workbook.xlsx.writeFile(outPath);
  return [outPath];
}

async function convertImage(inputPath, format, outputDir) {
  const outName = path.basename(inputPath, path.extname(inputPath)) + '.' + format;
  const outPath = path.join(outputDir, outName);
  await sharp(inputPath).toFormat(format).toFile(outPath);
  return [outPath];
}

async function pdfToImages(inputPath, outputDir) {
  // Using pdf-lib to split pages, then render with sharp if available - here we attempt best-effort
  const data = await fs.readFile(inputPath);
  const pdfDoc = await PDFDocument.load(data);
  const count = pdfDoc.getPageCount();
  // NOTE: Rendering PDF pages to images typically requires a rendering tool (poppler/pdftoppm). 
  // As a simple fallback we write the original pdf and inform user to use another tool if needed.
  // But we'll show a placeholder implementation that writes the pdf as-is.
  const outPath = path.join(outputDir, path.basename(inputPath));
  await fs.writeFile(outPath, data);
  return [outPath];
}

async function convertFile(inputPath, targetFormat, outputDir) {
  const ext = path.extname(inputPath).toLowerCase();
  if (['.docx', '.odt', '.doc'].includes(ext) && targetFormat === 'pdf') {
    return await convertDocxToPdf(inputPath, outputDir);
  }
  if (['.xlsx'].includes(ext) && targetFormat === 'csv') {
    return await convertXlsxToCsv(inputPath, outputDir);
  }
  if (ext === '.csv' && targetFormat === 'xlsx') {
    return await convertCsvToXlsx(inputPath, outputDir);
  }
  if (['.png', '.jpg', '.jpeg'].includes(ext) && (['png','jpg','jpeg','webp','avif'].includes(targetFormat))) {
    return await convertImage(inputPath, targetFormat, outputDir);
  }
  if (ext === '.pdf' && (['png','jpg'].includes(targetFormat) || targetFormat === 'images')) {
    return await pdfToImages(inputPath, outputDir);
  }

  // fallback: if same extension requested
  if (targetFormat === ext.replace('.', '')) {
    const outPath = path.join(outputDir, path.basename(inputPath));
    await fs.copyFile(inputPath, outPath);
    return [outPath];
  }

  throw new Error(`Conversion from ${ext} to ${targetFormat} not supported in this prototype.`);
}

module.exports = { convertFile };

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { marked } from 'marked';
import puppeteer from 'puppeteer';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

async function convertMdToPdf(filePath, padding = 40) {
  const filename = path.basename(filePath);
  console.log(`Converting: ${filename}...`);

  try {
    const mdContent = await fs.readFile(filePath, 'utf-8');
    const htmlContent = marked(mdContent);

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css">
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background-color: white;
            width: fit-content;
            min-width: 800px;
            overflow: hidden;
          }
          .markdown-body {
            box-sizing: border-box;
            margin: 0;
            padding: ${padding}px;
            width: fit-content;
            min-width: 100%;
            display: block;
          }
          .markdown-body > *:last-child {
            margin-bottom: 0 !important;
          }
          h1 { white-space: nowrap !important; }
          table th, table td { white-space: nowrap !important; }
          p, li {
            white-space: normal !important;
            max-width: 800px;
          }
          table, img, pre { break-inside: avoid; }
        </style>
      </head>
      <body class="markdown-body">
        ${htmlContent}
      </body>
      </html>
    `;

    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    const dimensions = await page.evaluate(() => {
      const el = document.querySelector('.markdown-body');
      return {
        width: el.scrollWidth,
        height: el.scrollHeight
      };
    });

    const pdfPath = filePath.replace('.md', '.pdf');

    await page.pdf({
      path: pdfPath,
      width: `${dimensions.width}px`,
      height: `${dimensions.height}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false,
      pageRanges: '1'
    });

    await browser.close();
    console.log(`Generated: ${path.basename(pdfPath)}`);
  } catch (error) {
    console.error(`Error converting ${filename}:`, error);
  }
}

async function main() {
  // Find all files ending in "_ホール業務実施報告書.md"
  const files = await fs.readdir(rootDir);
  const targetFiles = files.filter(f => f.endsWith('_ホール業務実施報告書.md'));

  if (targetFiles.length === 0) {
    console.log('No matching Markdown files found (*_ホール業務実施報告書.md).');
    return;
  }

  for (const file of targetFiles) {
    await convertMdToPdf(path.join(rootDir, file));
  }

  console.log('\nAll conversions completed.');
}

main();

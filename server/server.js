import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { marked } from 'marked';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// List markdown files in the root directory
app.get('/api/files', async (req, res) => {
  try {
    const files = await fs.readdir(rootDir);
    const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'README.md' && f !== 'Prompt.md' && f !== 'implementation_plan.md' && f !== 'task.md');
    res.json(mdFiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Convert markdown to PDF
app.post('/api/convert', async (req, res) => {
  const { filename, padding = 40 } = req.body;
  
  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  const filePath = path.join(rootDir, filename);
  if (!await fs.pathExists(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const mdContent = await fs.readFile(filePath, 'utf-8');
    const htmlContent = marked(mdContent);

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set HTML content with some basic styling and the user's padding
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
            display: block; /* Ensure no line-height issues */
          }
          .markdown-body > *:last-child {
            margin-bottom: 0 !important; /* Prevent margin collapsing issues at the end */
          }
          /* Prevent wrapping for title and tables */
          h1 {
            white-space: nowrap !important;
          }
          table th, table td {
            white-space: nowrap !important;
          }
          /* Allow wrapping for report sections (paragraphs and list items) */
          p, li {
            white-space: normal !important;
            max-width: 800px;
          }
          /* Custom styles to prevent splitting tables/images if possible */
          table, img, pre {
            break-inside: avoid;
          }
        </style>
      </head>
      <body class="markdown-body">
        ${htmlContent}
      </body>
      </html>
    `;

    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    // Calculate content dimensions with higher precision
    const dimensions = await page.evaluate(() => {
      const el = document.querySelector('.markdown-body');
      // Use offsetHeight/Width for integer values that often work better for PDF boundaries
      return {
        width: el.scrollWidth,
        height: el.scrollHeight
      };
    });

    const pdfPath = filePath.replace('.md', '.pdf');
    
    // Generate PDF with custom dimensions
    // We use pageRanges: '1' to strictly ensure only one page is produced.
    // Since the height is matched to the content, this will contain everything.
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
    res.json({ success: true, path: pdfPath });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

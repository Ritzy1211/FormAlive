// PDF text-extraction (browser only). Pure text heuristics live in resume-parse.ts
// so they remain unit-testable without loading pdfjs.

import * as pdfjs from 'pdfjs-dist';
// Vite-friendly worker import; bundles the worker as an asset.
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { parseResumeText, type ResumeSuggestion } from './resume-parse';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export type { ResumeSuggestion } from './resume-parse';
export { parseResumeText } from './resume-parse';

export async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const chunks: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    chunks.push(tc.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  return chunks.join('\n');
}

export async function parseResumeFile(file: File): Promise<ResumeSuggestion> {
  const text = await extractPdfText(file);
  return parseResumeText(text);
}

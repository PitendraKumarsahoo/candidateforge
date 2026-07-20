import { RawCandidateProfile } from './types';
import { extractFromText } from './heuristics';
import { createRequire } from 'module';

// @ts-ignore
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

// --- Resume PDF / DOCX Parser ---
export async function parseResume(fileBuffer: Buffer, filename: string, traceLogs?: string[]): Promise<RawCandidateProfile> {
  let extractedText = "";
  const ext = filename.split('.').pop()?.toLowerCase();

  traceLogs?.push(`Parsing resume file '${filename}' (format: ${ext})`);

  try {
    if (ext === 'pdf') {
      const data = await pdf(fileBuffer);
      extractedText = data.text;
    } else if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = result.value;
    } else {
      // Fallback for .txt or unrecognized extensions
      extractedText = fileBuffer.toString('utf-8');
    }

    if (!extractedText || !extractedText.trim()) {
      throw new Error("Resume file contains no readable content.");
    }

    const cleanedText = extractedText.trim();
    if (cleanedText.length < 50) {
      if (ext === 'pdf') {
        throw new Error("This PDF appears to be a scanned image or contains no selectable text. Text extraction is not supported.");
      }
      throw new Error(`Resume text is too short (${cleanedText.length} characters) to be parsed correctly.`);
    }

    if (cleanedText.startsWith("%PDF-")) {
      throw new Error("Failed to parse PDF binary data correctly (extracted text starts with PDF header '%PDF-').");
    }

    traceLogs?.push(`Successfully parsed resume content: ${extractedText.length} characters.`);
  } catch (err: any) {
    traceLogs?.push(`Resume file extraction error: ${err.message}`);
    throw new Error(`Invalid ${ext?.toUpperCase() || "Resume"} File: ${err.message}`);
  }

  // Extract candidate profile via our heuristics engine
  return extractFromText(extractedText, `Resume (${ext?.toUpperCase() || "File"})`, 0.95);
}

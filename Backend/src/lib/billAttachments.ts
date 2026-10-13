import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "../../uploads/bills");
const ATTACHMENTS_FILE = path.resolve(UPLOADS_DIR, "attachments.json");

export interface BillAttachment {
  filename: string;
  originalName: string;
  mimeType: string;
  url: string;
  uploadedAt: string;
}

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function readAttachmentsMap(): Record<string, BillAttachment> {
  ensureDir();
  if (!fs.existsSync(ATTACHMENTS_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(ATTACHMENTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeAttachmentsMap(map: Record<string, BillAttachment>) {
  ensureDir();
  fs.writeFileSync(ATTACHMENTS_FILE, JSON.stringify(map, null, 2), "utf-8");
}

export function saveBillAttachment(
  businessId: string,
  billNumber: string,
  billId: string | null,
  filename: string,
  originalName: string,
  mimeType: string
): BillAttachment {
  const map = readAttachmentsMap();
  const attachment: BillAttachment = {
    filename,
    originalName,
    mimeType,
    url: `/api/purchases/bills/files/${filename}`,
    uploadedAt: new Date().toISOString(),
  };

  // Key by businessId + billNumber and optionally billId
  map[`${businessId}:num:${billNumber}`] = attachment;
  if (billId) {
    map[`${businessId}:id:${billId}`] = attachment;
  }
  writeAttachmentsMap(map);
  return attachment;
}

export function linkBillIdToAttachment(businessId: string, billNumber: string, billId: string) {
  const map = readAttachmentsMap();
  const existing = map[`${businessId}:num:${billNumber}`];
  if (existing) {
    map[`${businessId}:id:${billId}`] = existing;
    writeAttachmentsMap(map);
  }
}

export function getBillAttachment(businessId: string, billIdOrNumber: string): BillAttachment | null {
  const map = readAttachmentsMap();
  return map[`${businessId}:id:${billIdOrNumber}`] || map[`${businessId}:num:${billIdOrNumber}`] || null;
}

export function getBusinessAttachmentsMap(businessId: string): Record<string, BillAttachment> {
  const map = readAttachmentsMap();
  const result: Record<string, BillAttachment> = {};
  const prefixId = `${businessId}:id:`;
  const prefixNum = `${businessId}:num:`;

  for (const [key, val] of Object.entries(map)) {
    if (key.startsWith(prefixId)) {
      result[key.substring(prefixId.length)] = val;
    } else if (key.startsWith(prefixNum)) {
      result[key.substring(prefixNum.length)] = val;
    }
  }
  return result;
}

export { UPLOADS_DIR };

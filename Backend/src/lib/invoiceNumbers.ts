import { prisma } from "./db";

const invoicePrefixForYear = (year: number) => `INV-${year}-`;

function parseSequence(invoiceNumber: string, prefix: string): number {
  if (!invoiceNumber.startsWith(prefix)) return 0;
  const seq = parseInt(invoiceNumber.slice(prefix.length), 10);
  return Number.isFinite(seq) && seq > 0 ? seq : 0;
}

export async function generateNextInvoiceNumber(businessId: string, year = new Date().getFullYear()): Promise<string> {
  const prefix = invoicePrefixForYear(year);
  const invoices = await prisma.salesInvoice.findMany({
    where: { businessId, invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });

  let maxSeq = 0;
  for (const inv of invoices) {
    const seq = parseSequence(inv.invoiceNumber, prefix);
    if (seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${(maxSeq + 1).toString().padStart(4, "0")}`;
}

export async function allocateUniqueInvoiceNumber(businessId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = await generateNextInvoiceNumber(businessId);
    const existing = await prisma.salesInvoice.findFirst({
      where: { businessId, invoiceNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

/** Keep the earliest invoice on a duplicated number; give later ones the next free sequence. */
export async function repairDuplicateInvoiceNumbers(businessId: string): Promise<number> {
  const invoices = await prisma.salesInvoice.findMany({
    where: { businessId },
    orderBy: [{ createdAt: "asc" }, { invoiceDate: "asc" }],
    select: { id: true, invoiceNumber: true },
  });

  const year = new Date().getFullYear();
  const prefix = invoicePrefixForYear(year);
  let maxSeq = 0;
  for (const inv of invoices) {
    const seq = parseSequence(inv.invoiceNumber, prefix);
    if (seq > maxSeq) maxSeq = seq;
  }

  const firstSeen = new Map<string, string>();
  let repaired = 0;

  for (const inv of invoices) {
    const key = inv.invoiceNumber.trim();
    if (!firstSeen.has(key)) {
      firstSeen.set(key, inv.id);
      continue;
    }

    maxSeq += 1;
    const nextNumber = `${prefix}${maxSeq.toString().padStart(4, "0")}`;
    await prisma.salesInvoice.update({
      where: { id: inv.id },
      data: { invoiceNumber: nextNumber },
    });
    firstSeen.set(nextNumber, inv.id);
    repaired += 1;
  }

  return repaired;
}

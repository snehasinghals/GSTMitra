export interface StateInfo {
  code: string;
  name: string;
}

export const INDIAN_STATES: StateInfo[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "28", name: "Andhra Pradesh (Old)" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
  { code: "99", name: "Centre Jurisdiction / Foreign Country" },
];

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGstin(gstin: string | null | undefined): { isValid: boolean; stateCode?: string; message?: string } {
  if (!gstin || gstin.trim() === "") {
    return { isValid: true }; // Optional for unregistered parties
  }
  const clean = gstin.trim().toUpperCase();
  if (clean.length !== 15) {
    return { isValid: false, message: "GSTIN must be exactly 15 characters long." };
  }
  if (!GSTIN_REGEX.test(clean)) {
    return { isValid: false, message: "Invalid GSTIN format. Example: 27AAAAA0000A1Z5." };
  }
  const stateCode = clean.substring(0, 2);
  const stateMatch = INDIAN_STATES.find((s) => s.code === stateCode);
  if (!stateMatch) {
    return { isValid: false, message: `Invalid state code '${stateCode}' in GSTIN.` };
  }
  return { isValid: true, stateCode };
}

export const COMMON_HSN_CODES = [
  { code: "998313", description: "Information technology (IT) design & software development", rate: 18, type: "SERVICE" },
  { code: "998314", description: "IT infrastructure management & cloud services", rate: 18, type: "SERVICE" },
  { code: "998311", description: "Management consulting and advisory services", rate: 18, type: "SERVICE" },
  { code: "998211", description: "Legal advisory and representation services", rate: 18, type: "SERVICE" },
  { code: "998222", description: "Accounting, auditing and tax preparation services", rate: 18, type: "SERVICE" },
  { code: "997212", description: "Renting of commercial office space", rate: 18, type: "SERVICE" },
  { code: "847130", description: "Laptops, computers and portable processing devices", rate: 18, type: "GOODS" },
  { code: "851712", description: "Smartphones & mobile handsets", rate: 18, type: "GOODS" },
  { code: "844331", description: "Printers, photocopiers & scanners", rate: 18, type: "GOODS" },
  { code: "940330", description: "Office wooden furniture & executive desks", rate: 18, type: "GOODS" },
  { code: "482010", description: "Stationery, registers, notebooks, receipt books", rate: 12, type: "GOODS" },
  { code: "610910", description: "Cotton T-shirts, garments & apparel", rate: 5, type: "GOODS" },
  { code: "040110", description: "Fresh milk & unbranded dairy products", rate: 0, type: "GOODS" },
  { code: "100630", description: "Unbranded food grains & rice", rate: 0, type: "GOODS" },
  { code: "870323", description: "Motor cars and motor vehicles", rate: 28, type: "GOODS" },
  { code: "620300", description: "Readymade garments & clothing", rate: 12, type: "GOODS" },
  { code: "300490", description: "Medicines & pharmaceutical formulations", rate: 12, type: "GOODS" },
];

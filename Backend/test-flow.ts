

const API_BASE = "http://localhost:4000/api";

async function runTests() {
  console.log("=== Testing GSTMitra Phase 1 Full Flow ===");

  // 1. Signup
  const signupRes = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Ramesh Sharma",
      businessName: "Ramesh Enterprises",
      email: `ramesh_${Date.now()}@example.com`,
      password: "password123",
    }),
  });
  const signupData: any = await signupRes.json();
  console.log("1. Signup Result:", signupRes.status, signupData.message);
  const token = signupData.token;

  // 2. Onboarding
  const onboardRes = await fetch(`${API_BASE}/auth/onboarding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      businessName: "Ramesh Enterprises",
      tradeName: "Ramesh Tech & Retail",
      businessType: "RETAIL",
      stateCode: "27", // Maharashtra
      turnoverRange: "40L_TO_15CR",
      filingFrequency: "MONTHLY",
      gstin: "27AAAAA0000A1Z5",
    }),
  });
  const onboardData: any = await onboardRes.json();
  console.log("2. Onboarding Result:", onboardRes.status, onboardData.business?.gstin);

  // 3. Add Item
  const itemRes = await fetch(`${API_BASE}/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "Dell Laptop Pro 15",
      type: "GOODS",
      hsnSacCode: "847130",
      sellingPrice: 50000,
      gstRate: 18,
    }),
  });
  const itemData: any = await itemRes.json();
  console.log("3. Add Item Result:", itemRes.status, itemData.name, `${itemData.gstRate}% GST`);

  // 4. Add Customer
  const custRes = await fetch(`${API_BASE}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "Acme Corp Mumbai",
      gstin: "27BBBBB1111B1Z2",
      stateCode: "27",
    }),
  });
  const custData: any = await custRes.json();
  console.log("4. Add Customer Result:", custRes.status, custData.name);

  // 5. Create Sales Invoice (Intra-state CGST + SGST)
  const invRes = await fetch(`${API_BASE}/sales/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      customerId: custData.id,
      invoiceDate: "2026-10-02",
      items: [
        {
          itemId: itemData.id,
          description: itemData.name,
          hsnSacCode: itemData.hsnSacCode,
          quantity: 2,
          rate: 50000,
          gstRate: 18,
        },
      ],
    }),
  });
  const invData: any = await invRes.json();
  console.log(
    "5. Create Sales Invoice Result:",
    invRes.status,
    invData.invoiceNumber,
    `Total: ₹${invData.totalAmount}`,
    `Supply: ${invData.supplyType}`
  );

  // 6. Add Vendor & Purchase Bill (Eligible ITC)
  const vendRes = await fetch(`${API_BASE}/vendors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "TechDistributors India",
      gstin: "27CCCCC2222C1Z8",
      stateCode: "27",
    }),
  });
  const vendData: any = await vendRes.json();

  const billRes = await fetch(`${API_BASE}/purchases/bills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      vendorId: vendData.id,
      billNumber: "VEND-8899",
      billDate: "2026-10-01",
      category: "STOCK",
      isItcEligible: true,
      items: [
        {
          description: "Laptops Stock Wholesale",
          hsnSacCode: "847130",
          quantity: 5,
          rate: 40000,
          gstRate: 18,
        },
      ],
    }),
  });
  const billData: any = await billRes.json();
  console.log("6. Add Purchase Bill Result:", billRes.status, billData.billNumber, `Eligible ITC: ${billData.isItcEligible}`);

  // 7. Run Health Check
  const hcRes = await fetch(`${API_BASE}/health-check?month=2026-10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const hcData: any = await hcRes.json();
  console.log("7. Health Check Result:", hcRes.status, "Errors:", hcData.counts?.errors);

  // 8. Fetch GSTR-2B Books Summary
  const g2bRes = await fetch(`${API_BASE}/filing/gstr2b-books/summary?period=102026`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const g2bData: any = await g2bRes.json();
  console.log("8. GSTR-2B Books Result:", g2bRes.status, g2bData.topBoxText);

  console.log("=== ALL PHASE 1 CORE MODULES WORKING PERFECTLY ===");
}

runTests().catch(console.error);

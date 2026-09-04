import { formatCurrency } from '../../utils/format';

interface Item {
  particular: string;
  hsnCode: string;
  purity: string;
  quantity: number;
  grossWeight: number;
  netWeight: number;
  ratePerGram: number;
  metalValue: number;
  makingCharges: number;
  chargeDetails: any[];
  hallMarkAmount: number;
  hallmarkNumber?: string;
  barcode?: string;
  discount: number;
  urd: number;
  cgst: number;
  sgst: number;
  totalAmount: number;
}

interface Bill {
  billNumber: string;
  billType: string;
  customerName: string;
  customerMobile?: string;
  customerGstin?: string;
  customerAddress?: string;
  billDate: string;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  discount: number;
  roundOff: number;
  grossAmount: number;
  netAmount: number;
  paidAmount: number;
  balanceAmount: number;
  isGst: boolean;
  items: Item[];
  payments: { amount: number; paymentMode: string; reference?: string; isProposed?: boolean }[];
  urdTransactions?: any[]; // old gold received against this bill
  urdDeduction?: number;   // line-level URD already removed from the taxable amount
}

interface Shop {
  shopName?: string;
  shopAddress?: string;
  shopCity?: string;
  shopState?: string;
  shopPin?: string;
  shopPhone?: string;
  shopEmail?: string;
  shopGstin?: string;
  logo?: string;
  invoicePrefix?: string;
}

function fmt(n: number) {
  return formatCurrency(n || 0);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function safeNum(n: any) {
  return (Number(n) || 0).toFixed(3);
}

function safeInt(n: any) {
  return Math.round(Number(n) || 0);
}

/* ==================== SETTLEMENT SUMMARY ==================== */
/** Every mode the bill was (or will be) settled with — URD, cash, online … */
const MODE_LABELS: Record<string, string> = {
  CASH: 'Cash', ONLINE: 'Online', UPI: 'UPI', DEBIT_CARD: 'Debit Card',
  CREDIT_CARD: 'Credit Card', BANK_TRANSFER: 'Bank Transfer', CHEQUE: 'Cheque',
  URD: 'URD / Old Gold',
};

function SettlementSummary({ bill }: { bill: Bill }) {
  const rows = bill.payments || [];
  const urd = bill.urdTransactions || [];
  if (rows.length === 0 && urd.length === 0) return null;
  const proposed = rows.some((p: any) => p.isProposed);
  return (
    <div style={{ marginTop: 12, fontSize: 11, border: '1px solid #ddd', background: '#fafafa' }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid #ddd', fontWeight: 700, letterSpacing: 0.3 }}>
        {proposed ? 'PROPOSED SETTLEMENT (not collected)' : 'PAYMENT DETAILS'}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <tbody>
          {rows.map((p, i) => (
            <tr key={'p' + i}>
              <td style={{ padding: '3px 8px' }}>{MODE_LABELS[p.paymentMode] || String(p.paymentMode).replace(/_/g, ' ')}</td>
              <td style={{ padding: '3px 8px', color: '#666' }}>{p.reference || ''}</td>
              <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {urd.length > 0 && (
        <div style={{ borderTop: '1px dashed #ccc', padding: '6px 8px' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>URD / Old gold received</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ color: '#666' }}>
                <th style={{ textAlign: 'left', padding: '2px 0' }}>URD No</th>
                <th style={{ textAlign: 'left', padding: '2px 0' }}>Metal / Purity</th>
                <th style={{ textAlign: 'right', padding: '2px 0' }}>Net Wt</th>
                <th style={{ textAlign: 'right', padding: '2px 0' }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '2px 0' }}>Deduction</th>
                <th style={{ textAlign: 'right', padding: '2px 0' }}>Melting</th>
                <th style={{ textAlign: 'right', padding: '2px 0' }}>Credited</th>
              </tr>
            </thead>
            <tbody>
              {urd.map((u: any) => (
                <tr key={u.id}>
                  <td style={{ padding: '2px 0' }}>{u.urdNumber}</td>
                  <td style={{ padding: '2px 0' }}>{u.metalType} {u.purity}</td>
                  <td style={{ textAlign: 'right', padding: '2px 0' }}>{safeNum(u.netWeight)} g</td>
                  <td style={{ textAlign: 'right', padding: '2px 0' }}>{fmt(u.rate)}</td>
                  <td style={{ textAlign: 'right', padding: '2px 0' }}>{u.deduction ? fmt(u.deduction) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 0' }}>{u.meltingLoss ? `${u.meltingLoss}%` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '2px 0', fontWeight: 700 }}>{fmt(u.finalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ==================== A4 GST TAX INVOICE ==================== */
function A4GST({ bill, shop, hideGst = false, estimate = null }: { bill: Bill; shop: Shop; hideGst?: boolean; estimate?: string | null }) {
  return (
    <div className="invoice-page">
      {/* Header */}
      <div className="invoice-header">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          {shop.logo && <img src={shop.logo} alt="logo" style={{ width: 48, height: 48, objectFit: 'contain' }} />}
          <div>
            <div className="shop-name">{shop.shopName || 'Jewellery Shop'}</div>
          <div className="shop-details">
            {shop.shopAddress && <div>{shop.shopAddress}</div>}
            {(shop.shopCity || shop.shopState) && <div>{[shop.shopCity, shop.shopState, shop.shopPin].filter(Boolean).join(', ')}</div>}
            {shop.shopPhone && <div>📞 {shop.shopPhone}</div>}
            {shop.shopEmail && <div>✉ {shop.shopEmail}</div>}
            {shop.shopGstin && <div><strong>GSTIN:</strong> {shop.shopGstin}</div>}
          </div>
          </div>
        </div>
        <div className="invoice-title">
          <h1>{estimate || bill.billType === 'ESTIMATE' ? 'ESTIMATE / QUOTATION' : hideGst ? 'INVOICE' : 'TAX INVOICE'}</h1>
          <div className="bill-no">#{bill.billNumber}</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Date: {fmtDate(bill.billDate)}</div>
        </div>
      </div>

      {/* Customer + Bill Info */}
      <div className="customer-info">
        <div className="info-block">
          <h4>Bill To</h4>
          <div className="value">{bill.customerName}</div>
          {bill.customerMobile && <div style={{ fontSize: 11 }}>📱 {bill.customerMobile}</div>}
          {bill.customerGstin && <div style={{ fontSize: 11 }}>GSTIN: {bill.customerGstin}</div>}
          {bill.customerAddress && <div style={{ fontSize: 11 }}>{bill.customerAddress}</div>}
        </div>
        <div className="info-block">
          <h4>Invoice Details</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
            <span>Bill No:</span><strong>{bill.billNumber}</strong>
            <span>Date:</span><strong>{fmtDate(bill.billDate)}</strong>
            <span>Type:</span><strong>{bill.billType}</strong>
            <span>Status:</span><strong>{estimate || bill.billType === 'ESTIMATE' ? 'ESTIMATE' : 'FINAL'}</strong>
            {estimate && <><span>Valid until:</span><strong>{estimate}</strong></>}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table>
        <thead>
          <tr>
            <th style={{ width: '4%' }}>#</th>
            <th style={{ width: '30%' }}>Particulars</th>
            <th style={{ width: '8%' }}>HSN</th>
            <th style={{ width: '8%' }}>Purity</th>
            <th style={{ width: '6%', textAlign: 'right' }}>Pcs</th>
            <th style={{ width: '9%', textAlign: 'right' }}>Gross Wt</th>
            <th style={{ width: '9%', textAlign: 'right' }}>Net Wt</th>
            <th style={{ width: '9%', textAlign: 'right' }}>Rate/g</th>
            <th style={{ width: '9%', textAlign: 'right' }}>Making</th>
            <th style={{ width: '9%', textAlign: 'right' }}>Hallmark</th>
            <th style={{ width: '9%', textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((item, idx) => (
            <tr key={idx}>
              <td>{idx + 1}</td>
              <td>
                <strong>{item.particular}</strong>
                {item.barcode && <div style={{ fontSize: 9, color: '#666' }}>{item.barcode}</div>}
              </td>
              <td>{item.hsnCode}</td>
              <td>{item.purity}</td>
              <td style={{ textAlign: 'right' }}>{safeInt(item.quantity)}</td>
              <td style={{ textAlign: 'right' }}>{safeNum(item.grossWeight)} g</td>
              <td style={{ textAlign: 'right' }}><strong>{safeNum(item.netWeight)} g</strong></td>
              <td style={{ textAlign: 'right' }}>₹{fmt(item.ratePerGram).replace('₹ ', '')}</td>
              <td style={{ textAlign: 'right' }}>{item.makingCharges > 0 ? '₹' + fmt(item.makingCharges).replace('₹ ', '') : '-'}</td>
              <td style={{ textAlign: 'right' }}>
                {item.hallMarkAmount > 0 ? '₹' + fmt(item.hallMarkAmount).replace('₹ ', '') : '-'}
                {item.hallmarkNumber && <div style={{ fontSize: 8, color: '#666' }}>{item.hallmarkNumber}</div>}
              </td>
              <td style={{ textAlign: 'right' }}><strong>₹{fmt(item.totalAmount).replace('₹ ', '')}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="total-section">
        <table className="total-table">
          <tbody>
            <tr>
              <td>Gross Amount</td>
              <td style={{ textAlign: 'right' }}>{fmt(bill.grossAmount)}</td>
            </tr>
            {bill.discount > 0 && (
              <tr>
                <td>Discount</td>
                <td style={{ textAlign: 'right', color: 'red' }}>− {fmt(bill.discount)}</td>
              </tr>
            )}
            {(bill.urdDeduction || 0) > 0 && (
              <tr>
                <td>Less URD (old gold, item level)</td>
                <td style={{ textAlign: 'right', color: 'red' }}>− {fmt(bill.urdDeduction || 0)}</td>
              </tr>
            )}
            <tr>
              <td>Taxable Amount</td>
              <td style={{ textAlign: 'right' }}>{fmt(bill.taxableAmount)}</td>
            </tr>
            {!hideGst && bill.isGst && bill.cgst > 0 && (
              <>
                <tr><td>CGST @1.5%</td><td style={{ textAlign: 'right' }}>{fmt(bill.cgst)}</td></tr>
                <tr><td>SGST @1.5%</td><td style={{ textAlign: 'right' }}>{fmt(bill.sgst)}</td></tr>
                {bill.igst > 0 && <tr><td>IGST @3%</td><td style={{ textAlign: 'right' }}>{fmt(bill.igst)}</td></tr>}
              </>
            )}
            <tr>
              <td>Round Off</td>
              <td style={{ textAlign: 'right' }}>{fmt(bill.roundOff)}</td>
            </tr>
            <tr className="grand-total">
              <td><strong>NET AMOUNT</strong></td>
              <td style={{ textAlign: 'right' }}><strong>{fmt(bill.netAmount)}</strong></td>
            </tr>
            {bill.paidAmount > 0 && (
              <>
                <tr><td>Amount Paid</td><td style={{ textAlign: 'right', color: 'green' }}>{fmt(bill.paidAmount)}</td></tr>
                {bill.balanceAmount > 0 && <tr><td>Balance</td><td style={{ textAlign: 'right', color: 'red' }}>{fmt(bill.balanceAmount)}</td></tr>}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Amount in words */}
      <div style={{ marginTop: 12, fontSize: 11 }}>
        <strong>Amount in Words:</strong> {numberToWords(safeInt(bill.netAmount))} Rupees Only
      </div>

      {/* Settlement — URD / cash / online … exactly as the customer paid */}
      <SettlementSummary bill={bill} />

      {/* Estimate terms */}
      {(estimate || bill.billType === 'ESTIMATE') && (
        <div style={{ marginTop: 14, padding: 10, border: '1px dashed #888', fontSize: 10, color: '#444' }}>
          <strong>Terms &amp; Conditions:</strong>
          <ul style={{ marginTop: 4, paddingLeft: 16 }}>
            <li>This estimate is valid for 7 days from the date of issue.</li>
            <li>Prices are based on current market gold/silver rates and may change.</li>
            <li>Making charges, wastage, and taxes apply as per prevailing rates.</li>
            <li>Hallmarking charges are extra as applicable.</li>
            <li>This is not a bill. Final billing happens at the time of purchase.</li>
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="footer">
        <div>
          <div>E&OE — Subject to {shop.shopCity || 'Jewellery'} Jurisdiction</div>
          <div style={{ marginTop: 4 }}>Thank you for your purchase!</div>
          <div style={{ marginTop: 8, fontSize: 9 }}>
            * Goods once sold will not be taken back<br/>
            * All disputes subject to local jurisdiction<br/>
            * E&OE: Errors & Omissions Excepted
          </div>
        </div>
        <div className="signature">
          <div style={{ marginTop: 40, borderTop: '1px solid #000', paddingTop: 4 }}>
            Authorized Signatory<br/>
            For {shop.shopName || 'Jewellery Shop'}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================== THERMAL RECEIPT (58/76/80 mm) ==================== */
function Thermal({ bill, shop, width = 80 }: { bill: Bill; shop: Shop; width?: 58 | 76 | 80 }) {
  const scale = width === 58 ? 0.88 : width === 76 ? 0.95 : 1;
  return (
    <div className="thermal-receipt" style={{ width: `${width - 6}mm`, fontSize: `${11 * scale}px` }}>
      {shop.logo && <div className="center" style={{ marginBottom: 2 }}><img src={shop.logo} alt="logo" style={{ height: 18 * scale, objectFit: 'contain' }} /></div>}
      <div className="center header">{shop.shopName || 'JEWeLLERY'}</div>
      {shop.shopAddress && <div className="center" style={{ fontSize: 10 }}>{shop.shopAddress}</div>}
      {(shop.shopCity || shop.shopState) && <div className="center" style={{ fontSize: 10 }}>{[shop.shopCity, shop.shopState].filter(Boolean).join(', ')}</div>}
      {shop.shopPhone && <div className="center" style={{ fontSize: 10 }}>Ph: {shop.shopPhone}</div>}
      {shop.shopGstin && <div className="center" style={{ fontSize: 10 }}>GSTIN: {shop.shopGstin}</div>}

      <div className="divider"></div>
      <div className="center bold">{bill.billType === 'ESTIMATE' ? '* ESTIMATE *' : '* TAX INVOICE *'}</div>
      <div className="divider"></div>

      <div className="row"><span>Bill#:</span><span className="bold">{bill.billNumber}</span></div>
      <div className="row"><span>Date:</span><span>{fmtDate(bill.billDate)}</span></div>
      <div className="row"><span>Customer:</span><span>{bill.customerName.substring(0, 22)}</span></div>
      {bill.customerMobile && <div className="row"><span>Mobile:</span><span>{bill.customerMobile}</span></div>}

      <div className="divider"></div>

      {bill.items.map((item, idx) => (
        <div key={idx} style={{ marginBottom: 4 }}>
          <div className="bold">{item.particular.substring(0, 26)}</div>
          <div style={{ fontSize: 10 }}>{item.purity} | {safeNum(item.netWeight)}g × ₹{safeInt(item.ratePerGram)}{item.hallmarkNumber ? ` | HM:${item.hallmarkNumber}` : ''}</div>
          <div className="row"><span>{safeInt(item.quantity)} × {fmt(item.totalAmount).replace('₹ ', '')}</span><span className="bold">{fmt(item.totalAmount)}</span></div>
        </div>
      ))}

      <div className="divider"></div>

      <div className="row"><span>Subtotal:</span><span>{fmt(bill.taxableAmount)}</span></div>
      {bill.discount > 0 && <div className="row"><span>Discount:</span><span>− {fmt(bill.discount)}</span></div>}
      {bill.isGst && (
        <>
          <div className="row"><span>CGST 1.5%:</span><span>{fmt(bill.cgst)}</span></div>
          <div className="row"><span>SGST 1.5%:</span><span>{fmt(bill.sgst)}</span></div>
        </>
      )}
      <div className="row"><span>Round Off:</span><span>{fmt(bill.roundOff)}</span></div>

      <div className="divider"></div>
      <div className="row bold" style={{ fontSize: 13 }}>
        <span>TOTAL:</span>
        <span>{fmt(bill.netAmount)}</span>
      </div>
      <div className="row"><span>Paid:</span><span>{fmt(bill.paidAmount)}</span></div>
      {bill.balanceAmount > 0 && <div className="row bold" style={{ color: 'red' }}><span>Balance:</span><span>{fmt(bill.balanceAmount)}</span></div>}

      <div className="divider"></div>

      {(bill.payments || []).length > 0 && (
        <div>
          <div style={{ marginBottom: 4 }}>
            <strong>{(bill.payments || []).some((p: any) => p.isProposed) ? 'Proposed payment:' : 'Payment:'}</strong>
          </div>
          {bill.payments.map((p, i) => (
            <div key={i} className="row" style={{ fontSize: 10 }}>
              <span>{MODE_LABELS[p.paymentMode] || String(p.paymentMode).replace(/_/g, ' ')}</span>
              <span>{fmt(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {(bill.urdTransactions || []).length > 0 && (
        <div>
          <div style={{ marginBottom: 4 }}><strong>URD / old gold:</strong></div>
          {bill.urdTransactions!.map((u: any) => (
            <div key={u.id} style={{ fontSize: 10 }}>
              <div className="row">
                <span>{u.metalType} {u.purity} · {safeNum(u.netWeight)}g</span>
                <span>{fmt(u.finalValue)}</span>
              </div>
              <div style={{ fontSize: 9, color: '#555' }}>
                rate {fmt(u.rate)}/g{u.deduction ? ` · ded ${fmt(u.deduction)}` : ''}{u.meltingLoss ? ` · melting ${u.meltingLoss}%` : ''} · {u.urdNumber}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="divider"></div>
      <div className="center" style={{ fontSize: 10 }}>Thank You for Shopping!</div>
      <div className="center" style={{ fontSize: 9, marginTop: 4 }}>{fmtDate(bill.billDate)}</div>
      <div style={{ marginTop: 8, fontSize: 8, textAlign: 'center' }}>E&OE</div>
    </div>
  );
}

/* ==================== ESTIMATE / QUOTATION ==================== */
/**
 * An estimate prints exactly like the bill — full item table, discount, URD,
 * GST (when the shop bills with GST), round off, net amount and the proposed
 * settlement — so the customer sees the same figures that will be billed.
 */
function Estimate({ bill, shop }: { bill: Bill; shop: Shop }) {
  const validityDate = new Date(new Date(bill.billDate).getTime() + 7 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return <A4GST bill={bill} shop={shop} hideGst={!bill.isGst} estimate={validityDate} />;
}

/* ==================== BARCODE LABEL ==================== */
function BarcodeLabel({ barcode, item, shop }: { barcode: string; item?: Item; shop: Shop }) {
  return (
    <div className="barcode-label">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{shop.shopName?.substring(0, 16) || 'Jewellery'}</strong>
        <span style={{ fontSize: 7 }}>{shop.shopGstin?.substring(0, 6) || ''}</span>
      </div>
      <div className="label-barcode">{barcode}</div>
      <div style={{ fontSize: 7, display: 'flex', justifyContent: 'space-between' }}>
        <span>{item?.purity || '22K'}</span>
        <span><strong>{item?.netWeight ? safeNum(item.netWeight) + 'g' : '-'}</strong></span>
      </div>
    </div>
  );
}

/* ==================== MAIN COMPONENT ==================== */
export type InvoiceFormat =
  | 'A4_GST'        // A4 GST tax invoice
  | 'A4_NON_GST'    // A4 plain invoice (no GST columns)
  | 'A5'            // A5 half-sheet compact invoice
  | 'THERMAL'       // 80mm thermal receipt
  | 'THERMAL_76'    // 76mm thermal roll
  | 'THERMAL_58'    // 58mm thermal roll (small POS)
  | 'ESTIMATE'      // A4 estimate / quotation
  | 'BARCODE_LABEL';

const PAGE_CSS: Record<InvoiceFormat, string> = {
  A4_GST: '@page { size: A4; margin: 10mm; }',
  A4_NON_GST: '@page { size: A4; margin: 10mm; }',
  A5: '@page { size: A5; margin: 6mm; }',
  THERMAL: '@page { size: 80mm auto; margin: 2mm; }',
  THERMAL_76: '@page { size: 76mm auto; margin: 2mm; }',
  THERMAL_58: '@page { size: 58mm auto; margin: 1.5mm; }',
  ESTIMATE: '@page { size: A4; margin: 10mm; }',
  BARCODE_LABEL: '@page { size: 50mm 25mm; margin: 1mm; }',
};

export function InvoicePrint({ bill, shop, format = 'A4_GST', barcode, item }: {
  bill: Bill;
  shop?: Shop;
  format?: InvoiceFormat;
  barcode?: string;
  item?: Item;
}) {
  const shopData: Shop = shop || {
    shopName: 'Jewellery Shop'
  };

  let content: React.ReactNode;
  if (format === 'BARCODE_LABEL' && barcode) {
    content = BarcodeLabel({ barcode, item, shop: shopData });
  } else if (format === 'THERMAL') {
    content = <Thermal bill={bill} shop={shopData} width={80} />;
  } else if (format === 'THERMAL_76') {
    content = <Thermal bill={bill} shop={shopData} width={76} />;
  } else if (format === 'THERMAL_58') {
    content = <Thermal bill={bill} shop={shopData} width={58} />;
  } else if (format === 'ESTIMATE') {
    content = <Estimate bill={bill} shop={shopData} />;
  } else if (format === 'A5') {
    content = <div style={{ zoom: 0.72 }}><A4GST bill={bill} shop={shopData} hideGst={!bill.isGst} /></div>;
  } else if (format === 'A4_NON_GST') {
    content = <A4GST bill={bill} shop={shopData} hideGst />;
  } else {
    content = <A4GST bill={bill} shop={shopData} />;
  }

  return (
    <>
      <style>{PAGE_CSS[format]}</style>
      {content}
    </>
  );
}

/* ==================== NUMBER TO WORDS ==================== */
function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
               'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const units = ['Crore', 'Lakh', 'Thousand', '', 'Hundred'];
  const getTwo = (n: number) => n < 20 ? ones[n] : (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
  function make(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return getTwo(n);
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + getTwo(n % 100) : '');
    return '';
  }
  const parts: string[] = [];
  parts.push(make(Math.floor(num / 10000000) % 100) + (units[0] && Math.floor(num / 10000000) % 100 ? ' ' + units[0] : ''));
  parts.push(make(Math.floor(num / 100000) % 100) + (Math.floor(num / 100000) % 100 ? ' ' + units[1] : ''));
  parts.push(make(Math.floor(num / 1000) % 100) + (Math.floor(num / 1000) % 100 ? ' ' + units[2] : ''));
  parts.push(make(num % 1000));
  return parts.filter(p => p && p.trim()).join(' ').trim();
}

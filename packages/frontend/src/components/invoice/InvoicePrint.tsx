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
  payments: { amount: number; paymentMode: string; reference?: string }[];
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

/* ==================== A4 GST TAX INVOICE ==================== */
function A4GST({ bill, shop }: { bill: Bill; shop: Shop }) {
  return (
    <div className="invoice-page">
      {/* Header */}
      <div className="invoice-header">
        <div style={{ flex: 1 }}>
          <div className="shop-name">{shop.shopName || 'Jewellery Shop'}</div>
          <div className="shop-details">
            {shop.shopAddress && <div>{shop.shopAddress}</div>}
            {(shop.shopCity || shop.shopState) && <div>{[shop.shopCity, shop.shopState, shop.shopPin].filter(Boolean).join(', ')}</div>}
            {shop.shopPhone && <div>📞 {shop.shopPhone}</div>}
            {shop.shopEmail && <div>✉ {shop.shopEmail}</div>}
            {shop.shopGstin && <div><strong>GSTIN:</strong> {shop.shopGstin}</div>}
          </div>
        </div>
        <div className="invoice-title">
          <h1>{bill.billType === 'ESTIMATE' ? 'ESTIMATE' : 'TAX INVOICE'}</h1>
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
            <span>Status:</span><strong>FINAL</strong>
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
            <tr>
              <td>Taxable Amount</td>
              <td style={{ textAlign: 'right' }}>{fmt(bill.taxableAmount)}</td>
            </tr>
            {bill.isGst && bill.cgst > 0 && (
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

      {/* Payment Mode */}
      {bill.payments && bill.payments.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11, padding: 8, background: '#fafafa', border: '1px solid #ddd' }}>
          <strong>Payment Mode:</strong>
          {bill.payments.map((p, i) => (
            <div key={i} style={{ marginLeft: 8 }}>
              • {p.paymentMode}: {fmt(p.amount)} {p.reference && <span>(Ref: {p.reference})</span>}
            </div>
          ))}
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

/* ==================== THERMAL RECEIPT (80mm) ==================== */
function Thermal({ bill, shop }: { bill: Bill; shop: Shop }) {
  return (
    <div className="thermal-receipt">
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
          <div style={{ fontSize: 10 }}>{item.purity} | {safeNum(item.netWeight)}g × ₹{safeInt(item.ratePerGram)}</div>
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

      {bill.payments && bill.payments.length > 0 && (
        <div>
          <div style={{ marginBottom: 4 }}><strong>Payment:</strong></div>
          {bill.payments.map((p, i) => (
            <div key={i} className="row" style={{ fontSize: 10 }}>
              <span>{p.paymentMode}</span>
              <span>{fmt(p.amount)}</span>
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
function Estimate({ bill, shop }: { bill: Bill; shop: Shop }) {
  const validityDate = new Date(new Date(bill.billDate).getTime() + 7 * 24 * 60 * 60 * 1000);
  return (
    <div className="invoice-page">
      <div className="invoice-header">
        <div style={{ flex: 1 }}>
          <div className="shop-name">{shop.shopName || 'Jewellery Shop'}</div>
          <div className="shop-details">
            {shop.shopAddress && <div>{shop.shopAddress}</div>}
            {(shop.shopCity || shop.shopState) && <div>{[shop.shopCity, shop.shopState, shop.shopPin].filter(Boolean).join(', ')}</div>}
            {shop.shopPhone && <div>📞 {shop.shopPhone}</div>}
            {shop.shopGstin && <div><strong>GSTIN:</strong> {shop.shopGstin}</div>}
          </div>
        </div>
        <div className="invoice-title">
          <h1>ESTIMATE</h1>
          <div className="bill-no">#{bill.billNumber}</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Date: {fmtDate(bill.billDate)}</div>
          <div style={{ fontSize: 11 }}>Valid till: {fmtDate(validityDate.toISOString())}</div>
        </div>
      </div>

      <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', padding: 8, marginBottom: 12, fontSize: 11, borderRadius: 4 }}>
        ⚠ This is an <strong>ESTIMATE</strong>. Prices are subject to change based on prevailing gold rates at the time of purchase.
      </div>

      <div className="customer-info">
        <div className="info-block">
          <h4>Estimate For</h4>
          <div className="value">{bill.customerName}</div>
          {bill.customerMobile && <div style={{ fontSize: 11 }}>📱 {bill.customerMobile}</div>}
          {bill.customerAddress && <div style={{ fontSize: 11 }}>{bill.customerAddress}</div>}
        </div>
        <div className="info-block">
          <h4>Estimate Details</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
            <span>Estimate No:</span><strong>{bill.billNumber}</strong>
            <span>Date:</span><strong>{new Date(bill.billDate).toLocaleDateString('en-IN')}</strong>
            <span>Valid:</span><strong>7 Days</strong>
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: '5%' }}>#</th>
            <th>Description</th>
            <th>HSN</th>
            <th>Purity</th>
            <th style={{ textAlign: 'right' }}>Net Wt (g)</th>
            <th style={{ textAlign: 'right' }}>Rate/g</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((item, idx) => (
            <tr key={idx}>
              <td>{idx + 1}</td>
              <td>{item.particular}</td>
              <td>{item.hsnCode}</td>
              <td>{item.purity}</td>
              <td style={{ textAlign: 'right' }}><strong>{safeNum(item.netWeight)}</strong></td>
              <td style={{ textAlign: 'right' }}>₹{safeInt(item.ratePerGram)}</td>
              <td style={{ textAlign: 'right' }}><strong>₹{fmt(item.totalAmount).replace('₹ ', '')}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="total-section">
        <table className="total-table">
          <tbody>
            <tr className="grand-total">
              <td><strong>ESTIMATE TOTAL</strong></td>
              <td style={{ textAlign: 'right' }}><strong>{fmt(bill.netAmount)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 30, padding: 12, border: '1px dashed #888', fontSize: 11, color: '#444' }}>
        <strong>Terms & Conditions:</strong>
        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
          <li>This estimate is valid for 7 days from the date of issue.</li>
          <li>Prices are based on current market gold/silver rates and may change.</li>
          <li>Making charges, wastage, and taxes apply as per prevailing rates.</li>
          <li>Hallmarking charges are extra as applicable.</li>
          <li>This is not a bill. Final billing happens at the time of purchase.</li>
        </ul>
      </div>

      <div className="signature" style={{ textAlign: 'right', fontSize: 11, marginTop: 30 }}>
        <div style={{ marginTop: 40, display: 'inline-block', borderTop: '1px solid #000', paddingTop: 4, minWidth: 180 }}>
          Authorized Signatory<br/>
          For {shop.shopName || 'Jewellery Shop'}
        </div>
      </div>
    </div>
  );
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
export type InvoiceFormat = 'A4_GST' | 'THERMAL' | 'ESTIMATE' | 'BARCODE_LABEL';

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

  if (format === 'BARCODE_LABEL' && barcode) {
    return BarcodeLabel({ barcode, item, shop: shopData });
  }

  if (format === 'THERMAL') return <Thermal bill={bill} shop={shopData} />;
  if (format === 'ESTIMATE') return <Estimate bill={bill} shop={shopData} />;
  return <A4GST bill={bill} shop={shopData} />;
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

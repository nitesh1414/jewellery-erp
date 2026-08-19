use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::sleep;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrinterInfo {
    pub name: String,
    pub port: String,
    pub printer_type: String, // "USB", "SERIAL", "NETWORK"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintOptions {
    pub copies: u8,
    pub cut_paper: bool,        // For thermal receipt printers
    pub open_drawer: bool,      // For cash drawer pop
    pub feed_lines_before: u8,
    pub feed_lines_after: u8,
}

impl Default for PrintOptions {
    fn default() -> Self {
        PrintOptions {
            copies: 1,
            cut_paper: true,
            open_drawer: false,
            feed_lines_before: 2,
            feed_lines_after: 4,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ThermalPrinter {
    pub name: String,
    /// ESC/POS commands buffer to print
    pub connected: bool,
}

impl ThermalPrinter {
    /// Build ESC/POS command for aligning text center
    pub fn align_center(buf: &mut Vec<u8>) {
        buf.extend_from_slice(&[0x1B, 0x61, 0x01]);
    }

    /// Build ESC/POS command for bold text
    pub fn set_bold(buf: &mut Vec<u8>, on: bool) {
        if on {
            buf.extend_from_slice(&[0x1B, 0x45, 0x01]);
        } else {
            buf.extend_from_slice(&[0x1B, 0x45, 0x00]);
        }
    }

    /// Build ESC/POS text line
    pub fn line(buf: &mut Vec<u8>, s: &str, width: usize) {
        let display = if s.len() > width {
            // Truncate with ellipsis
            format!("{}…", &s[..width.saturating_sub(1)])
        } else {
            s.to_string()
        };
        let pad = width.saturating_sub(display.len());
        buf.extend_from_slice(display.as_bytes());
        buf.resize(buf.len() + pad, b' ');
        buf.extend_from_slice(&[0x0A, 0x0D]); // LF + CR
    }

    /// Center a short text line
    pub fn center_line(buf: &mut Vec<u8>, s: &str, width: usize) {
        if s.len() >= width {
            Self::line(buf, s, width);
            return;
        }
        let pad_total = width - s.len();
        let pad_left = pad_total / 2;
        for _ in 0..pad_left {
            buf.push(b' ');
        }
        buf.extend_from_slice(s.as_bytes());
        for _ in 0..(pad_total - pad_left) {
            buf.push(b' ');
        }
        buf.extend_from_slice(&[0x0A, 0x0D]);
    }

    /// Print a divider of line width
    pub fn divider(buf: &mut Vec<u8>, char: u8, width: usize) {
        for _ in 0..width {
            buf.push(char);
        }
        buf.extend_from_slice(&[0x0A, 0x0D]);
    }

    /// Feed paper lines
    pub fn feed(buf: &mut Vec<u8>, lines: u8) {
        for _ in 0..lines {
            buf.push(0x0A);
        }
    }

    /// Cut paper (if printer supports it)
    pub fn cut(buf: &mut Vec<u8>, partial: bool) {
        if partial {
            buf.extend_from_slice(&[0x1B, 0x6D]); // Partial cut
        } else {
            buf.extend_from_slice(&[0x1B, 0x69]); // Full cut
        }
    }

    /// Open cash drawer (kick-out)
    pub fn open_drawer(buf: &mut Vec<u8>) {
        buf.extend_from_slice(&[0x1B, 0x70, 0x00, 0x19, 0xFA]);
    }

    /// Build complete thermal receipt from a bill payload
    pub fn build_thermal_receipt(payload: &ThermalReceiptPayload, options: &PrintOptions) -> Vec<u8> {
        let mut buf = Vec::new();

        // Initialize printer
        buf.extend_from_slice(&[0x1B, 0x40]); // ESC @ (init)

        Self::feed(&mut buf, options.feed_lines_before);

        // Header
        Self::align_center(&mut buf);
        Self::set_bold(&mut buf, true);
        Self::center_line(&mut buf, &payload.shop_name, 40);
        Self::set_bold(&mut buf, false);
        if !payload.shop_address.is_empty() {
            Self::center_line(&mut buf, &payload.shop_address, 40);
        }
        if !payload.shop_gstin.is_empty() {
            Self::center_line(&mut buf, &format!("GSTIN: {}", payload.shop_gstin), 40);
        }
        Self::divider(&mut buf, b'-', 40);

        // Bill info
        Self::line(&mut buf, &format!("Bill#: {}", payload.bill_number), 40);
        Self::line(&mut buf, &format!("Date: {}", payload.bill_date), 40);
        Self::line(&mut buf, &format!("Cust: {}", payload.customer_name), 40);
        if !payload.customer_mobile.is_empty() {
            Self::line(&mut buf, &format!("Ph: {}", payload.customer_mobile), 40);
        }
        Self::divider(&mut buf, b'-', 40);

        // Items
        Self::set_bold(&mut buf, true);
        Self::line(&mut buf, "DESCRIPTION", 28);
        Self::line(&mut buf, "G  W  P  A", 12);
        Self::set_bold(&mut buf, false);
        Self::divider(&mut buf, b'-', 40);

        for item in &payload.items {
            // Item line: particular, gross, net, purity, amount
            let line1 = format!("{} {} {}", item.particular, item.purity,
                                  if item.qty > 1 { format!("x{}", item.qty) } else { String::new() });
            Self::line(&mut buf, if line1.len() > 40 { &line1[..40] } else { &line1 }, 40);

            Self::line(&mut buf, &format!("{:.2}g @ {}", item.net_weight, item.rate_per_gram), 40);
            Self::set_bold(&mut buf, true);
            Self::line(&mut buf, &format!("        {}", item.amount), 40);
            Self::set_bold(&mut buf, false);
        }

        Self::divider(&mut buf, b'-', 40);

        // Totals
        Self::line(&mut buf, &format!("Subtotal   : {}", payload.subtotal), 40);
        if !payload.discount.is_empty() && payload.discount != "0" {
            Self::line(&mut buf, &format!("Discount   : -{}", payload.discount), 40);
        }
        if !payload.cgst.is_empty() {
            Self::line(&mut buf, &format!("CGST@1.5%  : +{}", payload.cgst), 40);
            Self::line(&mut buf, &format!("SGST@1.5%  : +{}", payload.sgst), 40);
        }
        Self::line(&mut buf, &format!("Round Off  : {}", payload.round_off), 40);

        Self::divider(&mut buf, b'=', 40);
        Self::set_bold(&mut buf, true);
        Self::line(&mut buf, &format!("TOTAL      : {}", payload.total), 40);
        Self::set_bold(&mut buf, false);
        if !payload.paid.is_empty() {
            Self::line(&mut buf, &format!("Paid       : {}", payload.paid), 40);
        }
        if !payload.balance.is_empty() && payload.balance != "0" {
            Self::line(&mut buf, &format!("Balance    : {}", payload.balance), 40);
        }
        Self::divider(&mut buf, b'=', 40);

        // Payment mode
        if !payload.payment_mode.is_empty() {
            Self::line(&mut buf, &format!("Payment: {}", payload.payment_mode), 40);
        }

        Self::feed(&mut buf, 2);
        Self::set_bold(&mut buf, true);
        Self::center_line(&mut buf, "Thank You!", 40);
        Self::set_bold(&mut buf, false);

        Self::feed(&mut buf, options.feed_lines_after);

        if options.cut_paper {
            Self::cut(&mut buf, true);
        }

        if options.open_drawer {
            Self::open_drawer(&mut buf);
        }

        buf
    }
}

/// Frontend will pass this structured payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThermalReceiptPayload {
    pub shop_name: String,
    pub shop_address: String,
    pub shop_gstin: String,
    pub bill_number: String,
    pub bill_date: String,
    pub customer_name: String,
    pub customer_mobile: String,
    pub items: Vec<ThermalReceiptItem>,
    pub subtotal: String,
    pub discount: String,
    pub cgst: String,
    pub sgst: String,
    pub round_off: String,
    pub total: String,
    pub paid: String,
    pub balance: String,
    pub payment_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThermalReceiptItem {
    pub particular: String,
    pub purity: String,
    pub net_weight: f64,
    pub rate_per_gram: u64,
    pub qty: u32,
    pub amount: String,
}

#[allow(dead_code)]
async fn _unused_sleep() {
    sleep(Duration::from_millis(1)).await;
}

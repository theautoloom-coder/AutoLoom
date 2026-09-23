/**
 * PowerSync client schema.
 *
 * GENERATED from the Postgres `powersync` publication by scripts/gen-schema.py.
 * Do not hand-edit: change the migration, run `supabase db reset`, regenerate.
 *
 * Type mapping: uuid/text/date/timestamptz/jsonb -> text,
 *               integer/boolean -> integer (booleans are 1/0),
 *               numeric -> real.
 */
import { column, Schema, Table } from '@powersync/common';

export const app_settings = new Table(
  {
    value: column.text,
    description: column.text,
    updated_at: column.text,
  },
  {}
);

export const audit_logs = new Table(
  {
    user_id: column.text,
    device_id: column.text,
    at: column.text,
    table_name: column.text,
    row_id: column.text,
    action: column.text,
    old_data: column.text,
    new_data: column.text,
    reason: column.text,
  },
  {}
);

export const brands = new Table(
  {
    name: column.text,
    code: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const categories = new Table(
  {
    family_id: column.text,
    parent_id: column.text,
    name: column.text,
    level: column.integer,
    sort_order: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { parent: ['parent_id'] } }
);

export const change_requests = new Table(
  {
    kind: column.text,
    status: column.text,
    payload: column.text,
    note: column.text,
    review_note: column.text,
    revision: column.integer,
    submitted_by: column.text,
    submitted_at: column.text,
    reviewed_by: column.text,
    reviewed_at: column.text,
    applied_product_id: column.text,
    location_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const company_settings = new Table(
  {
    legal_name: column.text,
    trade_name: column.text,
    gstin: column.text,
    pan: column.text,
    state_code: column.text,
    state_name: column.text,
    address_line1: column.text,
    address_line2: column.text,
    city: column.text,
    pincode: column.text,
    phone: column.text,
    email: column.text,
    bank_name: column.text,
    bank_account_no: column.text,
    bank_ifsc: column.text,
    upi_id: column.text,
    invoice_footer: column.text,
    invoice_terms: column.text,
    fy_start_month: column.integer,
    round_to_rupee: column.integer,
    logo_path: column.text,
    created_at: column.text,
    updated_at: column.text,
    whatsapp_number: column.text,
    upi_payee_name: column.text,
  },
  {}
);

export const customer_prices = new Table(
  {
    customer_id: column.text,
    variant_id: column.text,
    price: column.real,
    effective_from: column.text,
    approved_by: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { customer: ['customer_id'], variant: ['variant_id'] } }
);

export const customer_vehicles = new Table(
  {
    customer_id: column.text,
    registration_no: column.text,
    model_id: column.text,
    generation_id: column.text,
    vehicle_variant_id: column.text,
    color: column.text,
    notes: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { customer: ['customer_id'], reg: ['registration_no'] } }
);

export const customers = new Table(
  {
    code: column.text,
    name: column.text,
    business_name: column.text,
    owner_name: column.text,
    mobile: column.text,
    alt_phone: column.text,
    email: column.text,
    gstin: column.text,
    pan: column.text,
    address_line1: column.text,
    address_line2: column.text,
    city: column.text,
    state_code: column.text,
    state_name: column.text,
    pincode: column.text,
    customer_type: column.text,
    price_list_id: column.text,
    credit_limit: column.real,
    credit_days: column.integer,
    opening_balance: column.real,
    opening_balance_date: column.text,
    notes: column.text,
    search_text: column.text,
    is_active: column.integer,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { mobile: ['mobile'], code: ['code'] } }
);

export const devices = new Table(
  {
    user_id: column.text,
    name: column.text,
    platform: column.text,
    numbering_series_code: column.text,
    last_seen_at: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const document_sequences = new Table(
  {
    series_code: column.text,
    doc_type: column.text,
    financial_year: column.text,
    prefix: column.text,
    next_number: column.integer,
    pad_width: column.integer,
    location_id: column.text,
    owner_device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { series: ['series_code', 'doc_type', 'financial_year'] } }
);

export const expenses = new Table(
  {
    expense_date: column.text,
    category: column.text,
    amount: column.real,
    mode: column.text,
    paid_to: column.text,
    note: column.text,
    location_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const hsn_codes = new Table(
  {
    code: column.text,
    description: column.text,
    default_tax_rate_id: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const job_card_labour = new Table(
  {
    job_card_id: column.text,
    description: column.text,
    amount: column.real,
    sac_code: column.text,
    tax_rate_pct: column.real,
    technician_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { job: ['job_card_id'] } }
);

export const job_card_lines = new Table(
  {
    job_card_id: column.text,
    variant_id: column.text,
    description: column.text,
    qty: column.real,
    rate: column.real,
    tax_rate_pct: column.real,
    line_total: column.real,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { job: ['job_card_id'] } }
);

export const job_cards = new Table(
  {
    doc_no: column.text,
    doc_date: column.text,
    customer_id: column.text,
    customer_vehicle_id: column.text,
    location_id: column.text,
    technician_id: column.text,
    requirement: column.text,
    odometer_km: column.integer,
    status: column.text,
    parts_total: column.real,
    labour_total: column.real,
    discount_total: column.real,
    tax_total: column.real,
    grand_total: column.real,
    invoice_id: column.text,
    closed_at: column.text,
    notes: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { customer: ['customer_id'] } }
);

export const ledger_entries = new Table(
  {
    party_type: column.text,
    party_id: column.text,
    entry_date: column.text,
    doc_type: column.text,
    doc_id: column.text,
    doc_no: column.text,
    debit: column.real,
    credit: column.real,
    narration: column.text,
    reversal_of_id: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
  },
  { indexes: { party: ['party_type', 'party_id'] } }
);

export const locations = new Table(
  {
    code: column.text,
    name: column.text,
    type: column.text,
    address: column.text,
    is_active: column.integer,
    sort_order: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const party_balances = new Table(
  {
    party_type: column.text,
    party_id: column.text,
    balance: column.real,
    last_txn_at: column.text,
    updated_at: column.text,
  },
  { indexes: { party: ['party_type', 'party_id'] } }
);

export const payment_allocations = new Table(
  {
    payment_id: column.text,
    doc_type: column.text,
    doc_id: column.text,
    amount: column.real,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { payment: ['payment_id'], doc: ['doc_id'] } }
);

export const payments = new Table(
  {
    direction: column.text,
    party_type: column.text,
    party_id: column.text,
    doc_no: column.text,
    payment_date: column.text,
    amount: column.real,
    mode: column.text,
    reference_no: column.text,
    bank_name: column.text,
    notes: column.text,
    status: column.text,
    cancelled_at: column.text,
    cancel_reason: column.text,
    received_by: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
    proof_path: column.text,
    remarks: column.text,
  },
  { indexes: { party: ['party_type', 'party_id'] } }
);

export const price_list_items = new Table(
  {
    price_list_id: column.text,
    variant_id: column.text,
    price: column.real,
    effective_from: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { list: ['price_list_id'], variant: ['variant_id'] } }
);

export const price_lists = new Table(
  {
    code: column.text,
    name: column.text,
    price_column: column.text,
    is_default: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const product_families = new Table(
  {
    code: column.text,
    name: column.text,
    description: column.text,
    sku_prefix: column.text,
    sku_template: column.text,
    default_hsn_code: column.text,
    default_unit_id: column.text,
    default_tax_rate_id: column.text,
    is_fitment_required: column.integer,
    icon: column.text,
    sort_order: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const product_fitments = new Table(
  {
    product_id: column.text,
    variant_id: column.text,
    model_id: column.text,
    generation_id: column.text,
    vehicle_variant_id: column.text,
    year_from: column.integer,
    year_to: column.integer,
    position: column.text,
    notes: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { product: ['product_id'], model: ['model_id'], variant: ['variant_id'] } }
);

export const product_images = new Table(
  {
    product_id: column.text,
    variant_id: column.text,
    storage_path: column.text,
    sort_order: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const product_variants = new Table(
  {
    product_id: column.text,
    variant_name: column.text,
    sku: column.text,
    barcode: column.text,
    mrp: column.real,
    retail_price: column.real,
    wholesale_price: column.real,
    dealer_price: column.real,
    min_selling_price: column.real,
    min_stock: column.real,
    reorder_level: column.real,
    reorder_qty: column.real,
    last_purchase_cost: column.real,
    avg_cost: column.real,
    search_text: column.text,
    sort_order: column.integer,
    is_active: column.integer,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
    pack_size: column.real,
    pack_label: column.text,
    warranty_months: column.integer,
  },
  { indexes: { product: ['product_id'], sku: ['sku'], barcode: ['barcode'] } }
);

export const products = new Table(
  {
    family_id: column.text,
    category_id: column.text,
    subcategory_id: column.text,
    brand_id: column.text,
    name: column.text,
    description: column.text,
    hsn_code: column.text,
    unit_id: column.text,
    tax_rate_id: column.text,
    is_universal_fit: column.integer,
    search_text: column.text,
    is_active: column.integer,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { family: ['family_id'], brand: ['brand_id'] } }
);

export const profiles = new Table(
  {
    full_name: column.text,
    mobile: column.text,
    role: column.text,
    default_location_id: column.text,
    pin_hash: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const purchase_lines = new Table(
  {
    purchase_id: column.text,
    line_no: column.integer,
    variant_id: column.text,
    description: column.text,
    hsn_code: column.text,
    qty: column.real,
    unit_code: column.text,
    rate: column.real,
    discount_pct: column.real,
    discount_amt: column.real,
    taxable_value: column.real,
    tax_rate_pct: column.real,
    cgst: column.real,
    sgst: column.real,
    igst: column.real,
    line_total: column.real,
    landed_unit_cost: column.real,
    mrp: column.real,
    batch_no: column.text,
    warranty_months: column.integer,
    against_line_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { purchase: ['purchase_id'], variant: ['variant_id'] } }
);

export const purchases = new Table(
  {
    doc_type: column.text,
    doc_no: column.text,
    doc_date: column.text,
    supplier_id: column.text,
    supplier_invoice_no: column.text,
    supplier_invoice_date: column.text,
    location_id: column.text,
    supplier_name: column.text,
    supplier_gstin: column.text,
    supplier_state_code: column.text,
    is_interstate: column.integer,
    subtotal: column.real,
    discount_total: column.real,
    taxable_total: column.real,
    cgst_total: column.real,
    sgst_total: column.real,
    igst_total: column.real,
    other_charges: column.real,
    round_off: column.real,
    grand_total: column.real,
    paid_total: column.real,
    due_date: column.text,
    status: column.text,
    posted_at: column.text,
    cancelled_at: column.text,
    cancelled_by: column.text,
    cancel_reason: column.text,
    against_purchase_id: column.text,
    notes: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { supplier: ['supplier_id'], date: ['doc_date'] } }
);

export const role_permissions = new Table(
  {
    role: column.text,
    permission: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const sales_invoice_lines = new Table(
  {
    invoice_id: column.text,
    line_no: column.integer,
    variant_id: column.text,
    description: column.text,
    hsn_code: column.text,
    qty: column.real,
    unit_code: column.text,
    mrp: column.real,
    list_price: column.real,
    rate: column.real,
    discount_pct: column.real,
    discount_amt: column.real,
    taxable_value: column.real,
    tax_rate_pct: column.real,
    cgst: column.real,
    sgst: column.real,
    igst: column.real,
    line_total: column.real,
    unit_cost_at_sale: column.real,
    price_source: column.text,
    override_approved_by: column.text,
    return_condition: column.text,
    against_line_id: column.text,
    created_at: column.text,
    updated_at: column.text,
    return_note: column.text,
  },
  { indexes: { invoice: ['invoice_id'], variant: ['variant_id'] } }
);

export const sales_invoices = new Table(
  {
    doc_type: column.text,
    doc_no: column.text,
    doc_date: column.text,
    customer_id: column.text,
    customer_vehicle_id: column.text,
    location_id: column.text,
    price_list_id: column.text,
    customer_name: column.text,
    customer_gstin: column.text,
    customer_state_code: column.text,
    place_of_supply_state: column.text,
    is_interstate: column.integer,
    is_b2b: column.integer,
    subtotal: column.real,
    discount_total: column.real,
    taxable_total: column.real,
    cgst_total: column.real,
    sgst_total: column.real,
    igst_total: column.real,
    other_charges: column.real,
    round_off: column.real,
    grand_total: column.real,
    paid_total: column.real,
    payment_mode: column.text,
    credit_days: column.integer,
    due_date: column.text,
    status: column.text,
    posted_at: column.text,
    cancelled_at: column.text,
    cancelled_by: column.text,
    cancel_reason: column.text,
    against_invoice_id: column.text,
    credit_flag: column.integer,
    credit_override_by: column.text,
    salesperson_id: column.text,
    notes: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { customer: ['customer_id'], date: ['doc_date'], status: ['status'] } }
);

export const spec_definitions = new Table(
  {
    family_id: column.text,
    code: column.text,
    name: column.text,
    data_type: column.text,
    unit: column.text,
    is_required: column.integer,
    is_variant_axis: column.integer,
    is_filterable: column.integer,
    show_in_variant_name: column.integer,
    help_text: column.text,
    sort_order: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { family: ['family_id'] } }
);

export const spec_options = new Table(
  {
    spec_definition_id: column.text,
    value: column.text,
    code: column.text,
    aliases: column.text,
    sort_order: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { def: ['spec_definition_id'] } }
);

export const spec_values = new Table(
  {
    product_id: column.text,
    variant_id: column.text,
    spec_definition_id: column.text,
    value_text: column.text,
    value_number: column.real,
    value_bool: column.integer,
    option_id: column.text,
    option_ids: column.text,
    display_value: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { product: ['product_id'], variant: ['variant_id'], def: ['spec_definition_id'] } }
);

export const stock_adjustment_lines = new Table(
  {
    adjustment_id: column.text,
    variant_id: column.text,
    qty_delta: column.real,
    unit_cost: column.real,
    reason_code: column.text,
    note: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { adj: ['adjustment_id'] } }
);

export const stock_adjustments = new Table(
  {
    doc_no: column.text,
    doc_date: column.text,
    location_id: column.text,
    reason: column.text,
    notes: column.text,
    status: column.text,
    approved_by: column.text,
    posted_at: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const stock_audit_lines = new Table(
  {
    audit_id: column.text,
    variant_id: column.text,
    system_qty: column.real,
    counted_qty: column.real,
    difference: column.real,
    reason_code: column.text,
    counted_by: column.text,
    counted_at: column.text,
    note: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { audit: ['audit_id'] } }
);

export const stock_audits = new Table(
  {
    doc_no: column.text,
    location_id: column.text,
    name: column.text,
    filter_family_id: column.text,
    filter_brand_id: column.text,
    status: column.text,
    started_at: column.text,
    closed_at: column.text,
    closed_by: column.text,
    adjustment_id: column.text,
    notes: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const stock_levels = new Table(
  {
    variant_id: column.text,
    location_id: column.text,
    qty: column.real,
    reserved_qty: column.real,
    last_movement_at: column.text,
    updated_at: column.text,
  },
  { indexes: { variant: ['variant_id'] } }
);

export const stock_movements = new Table(
  {
    variant_id: column.text,
    location_id: column.text,
    qty: column.real,
    movement_type: column.text,
    ref_type: column.text,
    ref_id: column.text,
    ref_line_id: column.text,
    unit_cost: column.real,
    batch_no: column.text,
    serial_no: column.text,
    occurred_at: column.text,
    reversal_of_id: column.text,
    note: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
  },
  { indexes: { variant_loc: ['variant_id', 'location_id'], ref: ['ref_type', 'ref_id'] } }
);

export const stock_transfer_lines = new Table(
  {
    transfer_id: column.text,
    variant_id: column.text,
    qty: column.real,
    unit_cost: column.real,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { transfer: ['transfer_id'] } }
);

export const stock_transfers = new Table(
  {
    doc_no: column.text,
    doc_date: column.text,
    from_location_id: column.text,
    to_location_id: column.text,
    status: column.text,
    notes: column.text,
    dispatched_at: column.text,
    dispatched_by: column.text,
    received_at: column.text,
    received_by: column.text,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const supplier_products = new Table(
  {
    supplier_id: column.text,
    variant_id: column.text,
    supplier_sku: column.text,
    last_rate: column.real,
    last_date: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const suppliers = new Table(
  {
    code: column.text,
    name: column.text,
    company_name: column.text,
    contact_person: column.text,
    mobile: column.text,
    alt_phone: column.text,
    email: column.text,
    gstin: column.text,
    pan: column.text,
    address_line1: column.text,
    address_line2: column.text,
    city: column.text,
    state_code: column.text,
    state_name: column.text,
    pincode: column.text,
    payment_terms_days: column.integer,
    opening_balance: column.real,
    opening_balance_date: column.text,
    notes: column.text,
    search_text: column.text,
    is_active: column.integer,
    created_by: column.text,
    device_id: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const tax_rates = new Table(
  {
    name: column.text,
    rate_pct: column.real,
    cgst_pct: column.real,
    sgst_pct: column.real,
    igst_pct: column.real,
    cess_pct: column.real,
    effective_from: column.text,
    effective_to: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const units = new Table(
  {
    code: column.text,
    name: column.text,
    allow_decimal: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const vehicle_generations = new Table(
  {
    model_id: column.text,
    name: column.text,
    year_from: column.integer,
    year_to: column.integer,
    is_facelift: column.integer,
    body_type: column.text,
    seating: column.integer,
    notes: column.text,
    sort_order: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { model: ['model_id'] } }
);

export const vehicle_makes = new Table(
  {
    name: column.text,
    code: column.text,
    sort_order: column.integer,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const vehicle_model_aliases = new Table(
  {
    model_id: column.text,
    alias: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { model: ['model_id'] } }
);

export const vehicle_models = new Table(
  {
    make_id: column.text,
    name: column.text,
    code: column.text,
    body_type: column.text,
    segment: column.text,
    search_text: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { make: ['make_id'] } }
);

export const vehicle_spec_map = new Table(
  {
    generation_id: column.text,
    spec_definition_id: column.text,
    position_label: column.text,
    option_id: column.text,
    value_text: column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { gen: ['generation_id'] } }
);

export const vehicle_variants = new Table(
  {
    generation_id: column.text,
    name: column.text,
    fuel: column.text,
    transmission: column.text,
    engine: column.text,
    seating: column.integer,
    notes: column.text,
    is_active: column.integer,
    created_at: column.text,
    updated_at: column.text,
  },
  {}
);

export const AppSchema = new Schema({
  app_settings,
  audit_logs,
  brands,
  categories,
  change_requests,
  company_settings,
  customer_prices,
  customer_vehicles,
  customers,
  devices,
  document_sequences,
  expenses,
  hsn_codes,
  job_card_labour,
  job_card_lines,
  job_cards,
  ledger_entries,
  locations,
  party_balances,
  payment_allocations,
  payments,
  price_list_items,
  price_lists,
  product_families,
  product_fitments,
  product_images,
  product_variants,
  products,
  profiles,
  purchase_lines,
  purchases,
  role_permissions,
  sales_invoice_lines,
  sales_invoices,
  spec_definitions,
  spec_options,
  spec_values,
  stock_adjustment_lines,
  stock_adjustments,
  stock_audit_lines,
  stock_audits,
  stock_levels,
  stock_movements,
  stock_transfer_lines,
  stock_transfers,
  supplier_products,
  suppliers,
  tax_rates,
  units,
  vehicle_generations,
  vehicle_makes,
  vehicle_model_aliases,
  vehicle_models,
  vehicle_spec_map,
  vehicle_variants,
});

export type Database = (typeof AppSchema)['types'];
export type AppSettingsRow = Database['app_settings'];
export type AuditLogsRow = Database['audit_logs'];
export type BrandsRow = Database['brands'];
export type CategoriesRow = Database['categories'];
export type ChangeRequestsRow = Database['change_requests'];
export type CompanySettingsRow = Database['company_settings'];
export type CustomerPricesRow = Database['customer_prices'];
export type CustomerVehiclesRow = Database['customer_vehicles'];
export type CustomersRow = Database['customers'];
export type DevicesRow = Database['devices'];
export type DocumentSequencesRow = Database['document_sequences'];
export type ExpensesRow = Database['expenses'];
export type HsnCodesRow = Database['hsn_codes'];
export type JobCardLabourRow = Database['job_card_labour'];
export type JobCardLinesRow = Database['job_card_lines'];
export type JobCardsRow = Database['job_cards'];
export type LedgerEntriesRow = Database['ledger_entries'];
export type LocationsRow = Database['locations'];
export type PartyBalancesRow = Database['party_balances'];
export type PaymentAllocationsRow = Database['payment_allocations'];
export type PaymentsRow = Database['payments'];
export type PriceListItemsRow = Database['price_list_items'];
export type PriceListsRow = Database['price_lists'];
export type ProductFamiliesRow = Database['product_families'];
export type ProductFitmentsRow = Database['product_fitments'];
export type ProductImagesRow = Database['product_images'];
export type ProductVariantsRow = Database['product_variants'];
export type ProductsRow = Database['products'];
export type ProfilesRow = Database['profiles'];
export type PurchaseLinesRow = Database['purchase_lines'];
export type PurchasesRow = Database['purchases'];
export type RolePermissionsRow = Database['role_permissions'];
export type SalesInvoiceLinesRow = Database['sales_invoice_lines'];
export type SalesInvoicesRow = Database['sales_invoices'];
export type SpecDefinitionsRow = Database['spec_definitions'];
export type SpecOptionsRow = Database['spec_options'];
export type SpecValuesRow = Database['spec_values'];
export type StockAdjustmentLinesRow = Database['stock_adjustment_lines'];
export type StockAdjustmentsRow = Database['stock_adjustments'];
export type StockAuditLinesRow = Database['stock_audit_lines'];
export type StockAuditsRow = Database['stock_audits'];
export type StockLevelsRow = Database['stock_levels'];
export type StockMovementsRow = Database['stock_movements'];
export type StockTransferLinesRow = Database['stock_transfer_lines'];
export type StockTransfersRow = Database['stock_transfers'];
export type SupplierProductsRow = Database['supplier_products'];
export type SuppliersRow = Database['suppliers'];
export type TaxRatesRow = Database['tax_rates'];
export type UnitsRow = Database['units'];
export type VehicleGenerationsRow = Database['vehicle_generations'];
export type VehicleMakesRow = Database['vehicle_makes'];
export type VehicleModelAliasesRow = Database['vehicle_model_aliases'];
export type VehicleModelsRow = Database['vehicle_models'];
export type VehicleSpecMapRow = Database['vehicle_spec_map'];
export type VehicleVariantsRow = Database['vehicle_variants'];

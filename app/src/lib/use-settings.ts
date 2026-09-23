/** Shop-level settings every screen needs: GST on/off, WhatsApp/UPI, templates. */
import { useQuery } from '@powersync/react';
import { useMemo } from 'react';

import { DEFAULT_TEMPLATES, type WaSettings } from './whatsapp';

type Company = { legal_name: string; trade_name: string | null; whatsapp_number: string | null; upi_id: string | null; upi_payee_name: string | null; state_code: string; round_to_rupee: number };

export function useShopSettings(): { gstEnabled: boolean; company: Company | null; wa: WaSettings; allowNegativeStock: boolean } {
  const { data: companies } = useQuery<Company>('SELECT legal_name, trade_name, whatsapp_number, upi_id, upi_payee_name, state_code, round_to_rupee FROM company_settings LIMIT 1');
  const { data: settings } = useQuery<{ id: string; value: string }>("SELECT id, value FROM app_settings WHERE id IN ('gst_enabled','wa_template_slip','wa_template_reminder','wa_template_paid','allow_negative_stock')");
  return useMemo(() => {
    const get = (id: string) => { const r = settings?.find((s) => s.id === id); if (!r) return undefined; try { return JSON.parse(r.value); } catch { return r.value; } };
    const company = companies?.[0] ?? null;
    return {
      gstEnabled: get('gst_enabled') === true,
      allowNegativeStock: get('allow_negative_stock') !== false,
      company,
      wa: {
        shopName: company?.trade_name || company?.legal_name || 'AutoLoom',
        whatsappNumber: company?.whatsapp_number ?? null,
        upiId: company?.upi_id ?? null,
        upiPayeeName: company?.upi_payee_name ?? null,
        templates: {
          slip: (get('wa_template_slip') as string) || DEFAULT_TEMPLATES.slip,
          reminder: (get('wa_template_reminder') as string) || DEFAULT_TEMPLATES.reminder,
          paid: (get('wa_template_paid') as string) || DEFAULT_TEMPLATES.paid,
        },
      },
    };
  }, [companies, settings]);
}

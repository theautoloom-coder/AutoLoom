/**
 * Kaise chalayein — the manual, written the way the shop thinks.
 *
 * Organised by the job somebody is trying to do, not by the screens the app
 * happens to have. Nobody at a counter thinks "I need the invoice module";
 * they think "maal bik gaya, bill banao". So the headings are the jobs, in the
 * order a day actually runs, and each one names the exact buttons on the real
 * screens so it can be followed while standing up with a customer waiting.
 *
 * Everything is folded shut. An open manual is a wall of text; a list of
 * questions is something you can scan.
 *
 * Rewritten after the app was cut down to five places and a "+". The old
 * manual described a Bill tab, a Stock tab that was a menu, and "Aur →
 * Hisaab-kitab"; none of those exist now, so those topics are gone rather than
 * reworded. A manual that names a button nobody can find is worse than none.
 *
 * Rewritten again when AutoLoom went wholesale (6 Oct 2026): one godown, a
 * Khata tab, staff stock waiting for the owner's approval, kharab maal going
 * back to the supplier, the partners' money and PDF reports. Every topic
 * carries its route so the button here is a way in, not only directions.
 *
 * Every topic question and every button name in the steps is the string that is
 * actually on the screen. When a screen is renamed, this file is renamed with
 * it in the same commit — a manual that names a button nobody can find is worse
 * than none.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import type { Permission } from '@domain';

import { useSession } from '@/lib/session';
import { Button, Card, IconBadge, Row, Screen, SectionTitle, Text } from '@/ui';
import { Disclosure } from '@/ui/forms';
import { space } from '@/ui/theme';

type Topic = {
  q: string;
  icon: string;
  accent: string;
  /** Each line is a step. Kept short enough to follow at the counter. */
  steps: string[];
  /** The thing people get wrong, or the thing that saves them later. */
  note?: string;
  /** Where the job is actually done. */
  go?: { label: string; href: string };
  /** Shown only to those who hold this — partner topics stay off a staff phone. */
  need?: Permission;
};

const TOPICS: Topic[] = [
  {
    q: 'Bill Banao — maal diya, bill kaise banayein?',
    icon: 'arrow-up-circle-outline',
    accent: 'blue',
    steps: [
      'Neeche laal “Nayi entry” dabao, phir “Bill Banao”.',
      '“Kaun le raha hai” mein pehle se “Cash Grahak” hota hai — turant paisa dene wala. Khata wali dukaan ya banda ho to uska naam chuno; naya ho to naam likh ke “+ Naya banao”.',
      'Maal scan karo ya naam likho — socket, watt, gaadi sab list mein dikhta hai. Qty aur rate dekh lo.',
      '“Paisa kaise aaya” — Cash, Online / UPI, Card, Bank. Khata wale grahak ke liye “Udhaar” bhi.',
      '“Bill bana do” dabao. Stock kam ho gaya, udhaar ho to khaate mein chadh gaya.',
      'Bill ban gaya to “WhatsApp parchi” se grahak ko bhej do.',
    ],
    note: 'Cash Grahak ka udhaar nahi hota. Udhaar dena hai to us dukaan ya bande ka khata banao — naam aur mobile kaafi hai.',
    go: { label: 'Bill Banao', href: '/invoice/edit' },
  },
  {
    q: 'Stock Chadhao — supplier se maal aaya',
    icon: 'arrow-down-circle-outline',
    accent: 'green',
    steps: [
      '“Nayi entry” → “Stock Chadhao”.',
      'Supplier chuno. Naya ho to naam likh ke bana lo.',
      'Maal scan karo ya naam likho, aur gin ke “Kitne aaye” bharo. Ek saath kai item daal sakte ho.',
      'Supplier ke bill ki photo laga sakte ho (zaroori nahi).',
      'Staff: “… pcs owner ko bhejo”. Owner gin ke dekhega, rate bharega, approve karega — tab stock badhega.',
      'Owner: kharid rate bhar do (zaroori nahi) aur “… pcs chadha do” — stock turant badhega.',
      'Bhejne ke baad galti dikhi? “Aur” → “Maine kya bheja” → “Review mein” wali entry kholo, qty ya maal theek karo, “Ho gaya”. Approve hone tak badal sakte ho.',
    ],
    note: 'Item list mein nahi hai to “admin ko bhejo” dabao — owner item bana dega, phir wo list mein mil jaayega. Approve ya mana hone ke baad entry sirf owner badal sakta hai — “Maine kya bheja” mein dikhega kya hua aur kyun.',
    go: { label: 'Stock Chadhao', href: '/stock/add' },
  },
  {
    q: 'Approval — staff ka maal kaise approve karein? (owner)',
    need: 'purchase.approve',
    icon: 'checkmark-done-outline',
    accent: 'rose',
    steps: [
      'Stock tab par “Approval baaki” dikhe, ya “Aur” → “Approval” kholo.',
      '“Aaya hua maal — approve karo” mein entry par tap karo.',
      'Qty sahi hai na dekh lo. Har item ka “Kharid rate” bharo — pichhla rate dikh raha ho to “₹… lagao” dabao.',
      '“Approve karo — stock chadhao”. Stock badh gaya aur supplier ke khaate mein sahi rakam chadh gayi.',
      'Kuch galat hai to wajah likh ke “Wapas bhejo” — staff theek karke dobara bhejega. Bilkul nahi lena to wajah likh ke “Mana karo”.',
      '“Badla gaya” dikhe to staff ne bhejne ke baad entry badli hai — jo screen par hai wahi taaza hai.',
    ],
    note: 'Approve hone tak wo maal stock mein nahi ginta — na bill par dikhega, na Hisab mein. Isliye roz shaam ek baar dekh lo.',
    go: { label: 'Approval kholo', href: '/requests' },
  },
  {
    q: 'Naya item kaise banayein — category, gaadi, socket?',
    icon: 'add-circle-outline',
    accent: 'violet',
    steps: [
      '“Aur” → “Saara maal” → naya item, ya maal dhoondte waqt naam likh ke “+ Naya item”.',
      'Category chuno — Bulb, Mats, Seat cover… Uske hisaab se detail ke box khulte hain: bulb mein socket (H4, H7…), watt, colour; mat mein type, colour.',
      'Gaadi chuno — company, model, aur kis saal se kis saal tak. Har gaadi mein lagne wala ho to “Sab gaadi” chuno.',
      'Bechne ka rate aur kharid rate bharo, phir “Item bana do”.',
    ],
    note: 'Jo detail bharoge wahi stock list, bill ki search aur item ke page par dikhegi — “H4 · 60/55W · Creta 2019–2023”. Search mein socket ya gaadi likh ke bhi item mil jaata hai.',
    go: { label: 'Naya item', href: '/admin/item' },
  },
  {
    q: 'Kharab maal — toota, kharab nikla, ya supplier ko wapas bhejna',
    icon: 'alert-circle-outline',
    accent: 'rose',
    steps: [
      '“Nayi entry” → “Kharab Likho”. Kya hua chuno — Kharab nikla, Toot gaya, Supplier se kharab aaya…',
      'Maal aur kitne pcs daalo, “… pcs kharab mein daalo”. Wo godown se nikal ke “Kharab maal” mein chala jaata hai — bechne wale stock mein nahi ginta.',
      'Owner: “Aur” → “Kharab maal” → “Supplier ko wapas bhejo”. Supplier chuno, pcs daalo, “Wapsi likh do”. Supplier ke khaate se itna kam ho jaata hai.',
      'Supplier replacement de to wapsi kholo → “Replacement aaya” → jitna aaya utna likho → approve. Poora aa gaya to wapsi apne aap settle.',
      'Supplier paisa kaat de (doosre maal mein adjust) to wapsi par “Paisa mein adjust karo”.',
    ],
    note: 'Kuch replacement, kuch paisa — dono chalta hai. Jo maal sach mein bekaar hai aur supplier nahi lega, “Kharab maal” mein “Fenk do” — tab wo nuksan Hisab mein judta hai.',
    go: { label: 'Kharab maal', href: '/kharab' },
  },
  {
    q: 'Grahak ne maal wapas kiya to?',
    icon: 'return-down-back-outline',
    accent: 'amber',
    steps: [
      'Us grahak ka bill kholo (Khata → grahak → bill), phir “Maal wapas”.',
      'Bill ka maal pehle se bhara aata hai. Jitna sach mein wapas aaya utna rakho.',
      'Theek hai to “Theek hai · stock mein wapas”. Toota/kharab hai to “Kharab · supplier ko jayega”.',
      '“Wapasi likh do” — rakam grahak ke khaate se kam ho gayi.',
    ],
    note: 'Kharab mark kiya hua maal seedha “Kharab maal” mein jaata hai, wahan se supplier ko.',
  },
  {
    q: 'Ginti Karo — godown ka maal app se milana',
    icon: 'checkbox-outline',
    accent: 'teal',
    steps: [
      '“Nayi entry” → “Ginti Karo”.',
      'Maal scan karo ya naam likho, “Ginti mein kitna nikla” mein jitna gina wo likho. Farak upar dikh jaata hai.',
      'Farak ki wajah chuno, phir “… item theek kar do” → “Haan, ginti theek kar do”.',
    ],
  },
  {
    q: 'Paisa aaya — udhaar ka paisa kaise likhein?',
    icon: 'cash-outline',
    accent: 'teal',
    steps: [
      '“Nayi entry” → “Paisa Aaya”, ya Khata → grahak → “Paisa aa gaya”.',
      'Grahak chuno, rakam likho — “Poora paisa” dabao to poora baaki bhar jaata hai.',
      'Kaise aaya chuno — Cash, Online / UPI, Bank, Cheque. UPI ka ref ya screenshot laga sakte ho.',
      '“Paisa likh do”. Purane bill se pehle kat-ta hai.',
    ],
    go: { label: 'Paisa Aaya', href: '/payment/edit?direction=in' },
  },
  {
    q: 'Kharcha Likho — chai, bhada, transport',
    icon: 'wallet-outline',
    accent: 'amber',
    steps: [
      '“Nayi entry” → “Kharcha Likho”.',
      'Kitna, kis cheez ka (chip dabao), kaise diya, kisne diya.',
      '“₹… ka kharcha likh do”.',
    ],
    note: '₹40 ki chai bhi likho — tabhi din ka cash milega. Partner ka apna nikala paisa yahan nahi, “Partner ka paisa” mein likho.',
    go: { label: 'Kharcha Likho', href: '/expenses' },
  },
  {
    q: 'Khata — kisse kitna lena hai, kisko kitna dena hai',
    icon: 'people-outline',
    accent: 'blue',
    steps: [
      'Neeche “Khata” tab kholo. Upar do dabbe — “Grahak” (lena hai) aur “Supplier” (dena hai).',
      'Naam, firm, mobile ya shehar likh ke dhoondo, phir tap karo.',
      'Grahak ke page par: “Naya bill”, “Paisa aa gaya”, “Yaad dilao”, “Hisaab bhejo”.',
      'Neeche poora khata — har bill, har payment, aur har line ke baad kitna baaki.',
    ],
    go: { label: 'Khata kholo', href: '/khata' },
  },
  {
    q: 'Udhaar ki yaad kaise dilayein?',
    icon: 'logo-whatsapp',
    accent: 'green',
    steps: [
      '“Aur” → “Yaad dilao”. Kisse kitna lena hai, poori list.',
      '“Sabko bhejo” — har baar dabane par agle grahak ka WhatsApp khulta hai, message pehle se likha hua.',
      'Ek hi grahak ko bhejna ho to uske aage “Yaad dilao”.',
    ],
    note: 'Jiska mobile number nahi hai usko message nahi ja sakta — khaate mein mobile bhar do.',
    go: { label: 'Yaad dilao', href: '/reminders' },
  },
  {
    q: 'Partner ka paisa — kisne kitna lagaya, kitna nikala (owner)',
    need: 'partner.capital',
    icon: 'briefcase-outline',
    accent: 'rose',
    steps: [
      '“Aur” → “Partner ka paisa”.',
      'Partner chuno, “Paisa lagaya” ya “Paisa nikala”, rakam, tareekh aur kaise.',
      '“… likh do”. Upar har partner ka lagaya, nikala aur business mein kitna hai — dikh jaata hai.',
      '“PDF” se poora hisaab nikal lo.',
    ],
    note: 'Ye kharcha ya munafa nahi hai — partner ka apna hisaab hai, isliye Hisab ke munafa mein nahi ginta.',
    go: { label: 'Partner ka paisa', href: '/partner-paisa' },
  },
  {
    q: 'Sale aur munafa kaise dekhein? (owner)',
    need: 'reports.view_margin',
    icon: 'stats-chart-outline',
    accent: 'violet',
    steps: [
      'Neeche “Hisab” tab — Aaj, 7 Din, Is Mahine ya apni tareekh.',
      'Sale, Maal ki cost, Maal par munafa, Kharcha, Kharab/nuksan aur aakhir mein asli Munafa.',
      'Kisi bhi line par tap karo to uske peeche ki entries khul jaati hain.',
      'Din ki saari entries dekhni ho to Hisab mein “Aaj ki entries”.',
    ],
    note: 'Staff ko kharid rate, munafa aur nuksan nahi dikhta. Jis maal ka kharid rate nahi bhara, uski cost ₹0 ginti hai — Stock tab ka “Rate baaki” khaali rakho.',
    go: { label: 'Hisab kholo', href: '/hisab' },
  },
  {
    q: 'Report ki PDF kaise nikalein? (owner)',
    need: 'reports.view',
    icon: 'document-text-outline',
    accent: 'blue',
    steps: [
      '“Aur” → “Report — PDF”.',
      'Report chuno — Sale, Party ka khata, Stock, Munafa, Partner ka paisa, Kharcha.',
      'Din chuno — Aaj, 7 din, Is mahine, Pichhla mahina, Is saal, ya apni tareekh.',
      '“… ki PDF banao” — phone par WhatsApp/print khulega, computer par print (“Save as PDF”).',
    ],
    go: { label: 'Report kholo', href: '/reports' },
  },
  {
    q: 'Net na ho to kya hoga?',
    icon: 'cloud-offline-outline',
    accent: 'blue',
    steps: [
      'App bina net ke bhi poora chalta hai — bill, stock, paisa sab phone par save hota hai.',
      'Net aate hi sab apne aap server par chala jaata hai, aur doosre phones par aa jaata hai.',
      '“Aur” → “Sync ka haal” mein dikhta hai kitna bhejna baaki hai.',
    ],
    note: 'Phone se app mat hatao jab tak “Sync ka haal” mein sab bheja na dikhe — warna jo bheja nahi gaya wo chala jaayega.',
  },
  {
    q: 'Staff ka password bhool gaye?',
    need: 'admin.users',
    icon: 'key-outline',
    accent: 'amber',
    steps: [
      'Owner: “Aur” → “Staff” → us bande par tap.',
      '“Naya password” likho, “Badlo” dabao, aur unhe bata do.',
    ],
    note: 'Email par kuch nahi jaata — password owner hi set karta hai.',
    go: { label: 'Staff', href: '/admin/users' },
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const { can } = useSession();

  return (
    <Screen>
      <Text variant="display">Kaise chalayein</Text>
      <Text color="textMuted">
        Jo kaam karna hai wo dhoondo aur khol lo. Har ek mein wahi button likhe hain jo screen par hain.
      </Text>

      <Card>
        <Text>
          Neeche paanch jagah hain: Ghar · Stock · Khata · Bill (owner ke liye Hisab) · Aur. Unke upar laal “+”
          har nayi entry ka darwaza hai — Stock Chadhao, Bill Banao, Paisa Aaya, Kharcha Likho, Kharab Likho, Ginti Karo.
        </Text>
        <Text variant="small" color="textMuted">
          Tab wo jagah hai jahan aap jaate ho. “+” wo kaam hai jo aap karte ho.
        </Text>
      </Card>

      <SectionTitle>Roz ke kaam</SectionTitle>
      {TOPICS.filter((t) => !t.need || can(t.need)).map((t) => (
        <Disclosure key={t.q} title={t.q} titleVariant="heading">
          <Row gap={space.md} align="flex-start">
            <IconBadge name={t.icon as never} accent={t.accent} />
            <View style={{ flex: 1, gap: space.sm }}>
              {t.steps.map((s, i) => (
                <Row key={i} gap={space.sm} align="flex-start">
                  <Text variant="small" color="textFaint" mono style={{ width: 16 }}>
                    {i + 1}
                  </Text>
                  <Text style={{ flex: 1 }}>{s}</Text>
                </Row>
              ))}
              {t.note ? (
                <Text variant="small" color="textMuted">
                  {t.note}
                </Text>
              ) : null}
              {t.go ? (
                <Button
                  title={t.go.label}
                  size="sm"
                  tone="secondary"
                  onPress={() => router.push(t.go!.href as never)}
                />
              ) : null}
            </View>
          </Row>
        </Disclosure>
      ))}

      <SectionTitle>Kuch samajh na aaye to</SectionTitle>
      <Card>
        <Text>
          Dukan se poochho. Agar app mein hi kuch galat lag raha hai — koi number theek na ho, ya kuch
          gayab ho — to “Aur” tab mein “Sync ka haal” kholo aur dekho ki sab bheja ja chuka hai ya nahi.
        </Text>
        {can('reports.view') ? (
          <Button title="Sync ka haal dekho" tone="secondary" size="sm" onPress={() => router.push('/sync')} />
        ) : null}
      </Card>
    </Screen>
  );
}

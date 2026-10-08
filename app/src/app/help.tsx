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
      'Supplier chuno (naya ho to naam likh ke bana lo). “Maal kab aaya” — Aaj, Kal, Parso, ya “Aur tareekh…” se calendar.',
      'Item ka naam likho aur item chuno — jaise “Philips X-tremeVision”.',
      'Kaunsi kism aayi — chip dabao (H4, H7, Creta 2019–2023…). Nayi kism ho to “+ Nayi kism”: socket/colour chuno, gaadi chuno (chunte hi jud jaati hai), saal ki chip dabao.',
      '“Kitne aaye” bharo, “Line jodo”. Aur maal ho to “+ Maal jodo” — ek entry mein kitne bhi item.',
      'Staff: “… pcs owner ko bhejo”. Owner gin ke dekhega, rate bharega, approve karega — tab stock badhega.',
      'Owner: kharid rate bhar do (zaroori nahi) aur “… pcs chadha do” — stock turant badhega.',
      'Bhejne ke baad galti dikhi? “Aur” → “Maine kya bheja” → “Review mein” wali entry kholo, qty ya maal theek karo, “Ho gaya”. Approve hone tak badal sakte ho.',
    ],
    note: 'Jo kism pehle se hai use dobara “Nayi kism” mein chuna to app wahi purani kism le leta hai — do same kism kabhi nahi bante. Item hi list mein nahi hai to “+ Naya item banao” (staff: “Owner ko naya item bhejo”).',
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
    q: 'Kism ya item mein galti — gaadi, saal, detail, rate kaise badlein?',
    icon: 'construct-outline',
    accent: 'violet',
    steps: [
      'Item kholo (Stock → item par tap). Galat kism ki chip chuno.',
      'Staff: kism ke paas “Badlav bhejo”, ya upar “Item mein badlav” (naam, category, common detail ke liye). Owner: “Kism badlo” / “Item badlo”.',
      'Form mein abhi wala sab bhara aata hai — jo galat hai wahi theek karo: gaadi hatao (✕) ya jodo, saal, socket/colour, rate.',
      'Staff: “Badlav owner ko bhejo”. Owner Approval mein “Badlav · …” kholta hai — har cheez “pehle → ab” dikhti hai — “Approve karo — badlav lagao” ya wajah likh ke “Wapas bhejo”.',
    ],
    note: 'Kism ka badlav sirf usi kism par lagta hai — item ki baaki kism aur unki gaadiyan waisi hi rehti hain. Approve hone tak bheja hua badlav dobara khol ke badal sakte ho.',
  },
  {
    q: 'Naya item kaise banayein?',
    icon: 'add-circle-outline',
    accent: 'violet',
    steps: [
      'Item ek hi baar banta hai: “Aur” → “Saara maal” → “+ Naya item”, ya Stock Chadhao mein naam likh ke “+ Naya item banao”.',
      'Category chuno (Bulb, Mats, Seat cover…), item ka naam likho — jaise “ABC 7D Mat”.',
      'Bechne ka rate bharo — har nayi kism isi se shuru hogi. Kharid rate zaroori nahi.',
      'Jo detail har kism mein same hai (voltage, warranty…) wo “Common detail” mein. Har gaadi mein lagta hai to “Har gaadi mein lagta hai”.',
      '“Item bana do”. Ab kism (socket, colour, gaadi, saal) stock chadhate waqt chunoge — item dobara nahi banana.',
    ],
    note: 'Naam likhte hi “Ye item pehle se hai?” dikhe to wahi use karo — same naam ka doosra item nahi banta. Kism ka rate ya detail badalni ho to item kholo → kism par tap karo.',
    go: { label: 'Naya item', href: '/admin/item' },
  },
  {
    q: 'Category aur detail — socket, colour, size ki list (owner)',
    need: 'catalog.edit',
    icon: 'options-outline',
    accent: 'violet',
    steps: [
      '“Aur” → “Category aur detail”. Nayi category ho to naam likh ke “Category banao”.',
      'Category kholo — uski detail dikhti hai (Socket / Base, Colour, Wattage…). Nayi chahiye to neeche “Nayi detail” mein naam likh ke “Detail jodo”.',
      'Detail par “Kism ki pehchaan” lagao to wo stock chadhate waqt kism mein poochi jaati hai aur kism ke naam mein aati hai. Baaki item ki common detail.',
      'Options mein naya option jodo (jaise naya socket “H16”) — sab phones par turant aa jaata hai.',
    ],
    note: 'Kuch delete nahi hota — galat detail ya option “Band” kar do. Purani kism ka data waisa hi rehta hai. App update ki zaroorat nahi.',
    go: { label: 'Category kholo', href: '/admin/categories' },
  },
  {
    q: 'Supplier aur grahak ki list — naam, number, band karna',
    need: 'party.edit',
    icon: 'albums-outline',
    accent: 'blue',
    steps: [
      '“Aur” → “Supplier aur grahak ki list”, ya Khata tab mein “Saari list”.',
      'Upar “Grahak” ya “Supplier”. Naam, firm, mobile, shehar ya code se dhoondo; grahak ko type (dealer, retail…) se chhaanto.',
      '“+ Grahak” / “+ Supplier” se naya. Kisi ke aage “Badlo” se naam, number, type theek karo.',
      'Owner: jisse kaam band ho gaya use “Band karo” — naye bill mein nahi aayega, purana khata waisa hi. “Band wale bhi” se dekh ke “Chalu karo”.',
    ],
    go: { label: 'List kholo', href: '/parties' },
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
    q: 'Stock theek karo — shelf aur app mein farak, upar ya neeche',
    icon: 'checkbox-outline',
    accent: 'teal',
    steps: [
      'Item kholo → kism ke neeche “Stock theek karo”. Ya “Nayi entry” → “Stock theek karo” aur maal dhoondo.',
      '“App ka stock” dikhta hai. “Asal mein kitna hai” mein jitna sach mein hai wo likho — farak (+ ya −) apne aap dikh jaata hai.',
      'Wajah chuno — Ginti galat thi, Galat chadha tha, Kharab, Nahi mila, Mil gaya.',
      '“… item theek kar do” → staff: “Haan, owner ko bhejo”. Owner: “Haan, stock theek kar do” — turant lagta hai.',
      'Owner: “Aur” → “Approval” → “Stock theek karna” mein request kholo — app ka stock, asal ginti aur farak dikhega. “Approve karo” ya wajah likh ke “Mana karo”.',
    ],
    note: 'Staff ki request se stock tab tak nahi badalta jab tak owner approve na kare. Galti se bheji to request kholke “Wapas lo”. Approve hua sudhaar bhi owner “Ye sudhaar ulta karo” se palat sakta hai.',
    go: { label: 'Stock theek karo', href: '/stock-check' },
  },
  {
    q: 'Approve hui entry galat nikli — sudhaar kaise karein?',
    icon: 'create-outline',
    accent: 'amber',
    steps: [
      'Woh entry kholo — Approval → “Haal ke faisle”, ya Supplier → uska maal → entry.',
      'Staff: “Galti hai — sudhaar bhejo”. Owner: “Entry sudhaaro”.',
      'Entry ki copy khulti hai. Jo galat hai theek karo — qty badlo, galat kism “Hatao”, chhooti hui jodo. Har line ke neeche “Pehle 5 → ab 4” dikhta hai.',
      'Staff: “Sudhaar owner ko bhejo”. Owner approval mein “Sudhaar …” wali entry kholke “Sudhaar lagao”.',
    ],
    note: 'Sudhaar lagte hi purani entry cancel hoti hai aur sahi wali lagti hai — stock aur supplier ka khata dono theek, us entry par diya paisa nayi par chala jaata hai. Jis entry ka maal supplier ko wapas ja chuka hai uska sudhaar nahi hota — tab “Stock theek karo” se karo.',
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
      'Kitna, kis cheez ka (chip dabao), kaise diya, kisne diya. Kal ka kharcha aaj likh rahe ho to “Kab hua” mein “Kal”.',
      '“₹… ka kharcha likh do”.',
    ],
    note: '₹40 ki chai bhi likho — tabhi din ka cash milega. Kharche ke prakar (chai, bhada…) owner “Aur” → “Dukan settings” → “Kharche ke prakar” se badalta hai. Partner ka apna nikala paisa yahan nahi, “Partner ka paisa” mein likho.',
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

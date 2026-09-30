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
 * Some of these screens have no other way in yet — Yaad dilao, Maal kahan pada
 * hai and Partner ka paisa likho are reached from their button here. That is
 * why every topic carries the route rather than only directions.
 *
 * Every topic question and every button name in the steps is the string that is
 * actually on the screen. When a screen is renamed, this file is renamed with
 * it in the same commit — a manual that names a button nobody can find is worse
 * than none.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

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
};

const TOPICS: Topic[] = [
  {
    q: 'Bill Banao — maal bik gaya, bill kaise banayein?',
    icon: 'arrow-up-circle-outline',
    accent: 'blue',
    steps: [
      'Neeche laal “+” dabao, phir “Bill Banao” chuno.',
      'Grahak chuno. Naya ho to naam likho aur “+ Add” dabao — grahak wala form khul jaayega.',
      'Maal “Scan karo ya SKU / naam likho” wale box se daalo. Phone par “Scan” se barcode bhi padh lo.',
      'Har line par Qty, Rate aur “Chhoot %” dekh lo.',
      '“Payment aur total” mein paisa kaise aaya wo chuno — Cash, Online / UPI, ya “Udhaar (pay later)”.',
      'Neeche “Maal ki cost”, “Bechne ka” aur “Is bill par munafa” likha hai. Ek nazar maar lo.',
      '“Bill post karo” dabao. Stock apne aap kam ho gaya.',
    ],
    note: 'Udhaar chuna to wo grahak ke khate mein apne aap chadh jaata hai — alag se kuch likhne ki zaroorat nahi. “Is bill par munafa” laal dikhe to maal lagat se neeche ja raha hai; post karne se pehle rate dekh lo.',
    go: { label: 'Bill Banao', href: '/invoice/edit' },
  },
  {
    q: 'Stock Chadhao — naya maal aaya, kaise chadhayein?',
    icon: 'arrow-down-circle-outline',
    accent: 'green',
    steps: [
      'Neeche laal “+” dabao, phir “Stock Chadhao” chuno.',
      'Supplier chuno. Naya hai to naam likho aur “+ Add” dabao — wahin ban jaayega.',
      'Date dekh lo — aaj ki pehle se bhari hai.',
      'Maal scan karo ya naam likho. Ek saath kai cheezein daal sakte ho.',
      'Har line par “Kitne aaye” aur “Kitne ka pada” bharo — rate ek piece ka.',
      'Bill ki photo laga do, note likh do, phir “Chadha do” dabao.',
    ],
    note: 'Rate zaroor daalo. Ye purchase hai, aur yahi rate us maal ki cost banta hai. Rate zero chhoda to wo maal jab bikega tab poora paisa munafa dikhega, aur hisaab jhootha ho jaayega.',
    go: { label: 'Stock Chadhao', href: '/stock/add' },
  },
  {
    q: 'Naya item kaise banayein?',
    icon: 'add-circle-outline',
    accent: 'violet',
    steps: [
      'Stock Chadhao ya Bill Banao mein naam likho. Na mile to “+ … naya item banao” wali line par tap karo.',
      'Ya “Aur” tab → “Saara maal” → wahan se banao.',
      'Photo kheencho — counter par dhoondhne mein sabse zyada yahi kaam aati hai.',
      'Category chuno, “Item ka naam” likho, “Qty” aur “Bechne ka rate” daalo.',
      'Gaadi, colour, “Kharid rate”, warranty — sab “Aur detail” ke andar hain. Zaroorat ho tabhi kholo.',
      '“Save item” dabao.',
    ],
    note: 'Staff ke paas item banane ka haq nahi hota. Unke paas wahi button “Admin ko bhejo” likha aata hai, aur owner “Aur” tab → “Staff ne kya bheja” mein se haan karta hai.',
    go: { label: 'Naya item', href: '/admin/item' },
  },
  {
    q: 'Kharab Likho — toota-phoota maal kaise nikalein?',
    icon: 'alert-circle-outline',
    accent: 'rose',
    steps: [
      'Neeche laal “+” dabao, phir “Kharab Likho” chuno. (“Aur” tab → Godown mein bhi hai.)',
      '“Kya hua?” mein se ek chuno — Kharab, Reject, Nahi mila, Toot Gaya, Ginti ka farak ya Aur kuch.',
      'Maal scan karo ya naam likho.',
      '“Kitne kharab” bharo aur “Ek ka kharid rate” dekh lo.',
      'Photo aur note laga do, phir “Kharab likho” dabao.',
    ],
    note: 'Rate khali mat chhodo. Stock to waise bhi kam ho jaayega, par rate ke bina nuksan ₹0 likha jaayega — aur Hisab mein “Kharab / Loss” utna hi kam dikhega. Jiska rate pata nahi, wo line khud bata deti hai.',
    go: { label: 'Kharab Likho', href: '/kharab-maal' },
  },
  {
    q: 'Ginti Karo — godown ka maal app se kaise milayein?',
    icon: 'checkbox-outline',
    accent: 'teal',
    steps: [
      'Neeche laal “+” dabao, phir “Ginti Karo” chuno. (“Aur” tab → Godown mein bhi hai.)',
      'Jitne item ginne hain, sab scan karo ya naam likh ke daal lo.',
      '“System Stock” app ka number hai. “Actual Stock” mein ginti karke apna number likho.',
      '“Difference” apne aap aa jaayega. Farak ho to neeche se wajah chuno.',
      '“… item theek karo” dabao, phir “Ek baar dekh lo” wali list par “Haan, stock theek kar do”.',
    ],
    note: 'Jis item ka “Actual Stock” khali chhoda, wo waise ka waisa rahega — app khud kuch nahi badalta. Poora godown ek din mein ginna zaroori nahi; ek rack karo, note mein likh do kis rack ka tha.',
    go: { label: 'Ginti Karo', href: '/stock-check' },
  },
  {
    q: 'Kharcha Likho — dukan ka paisa bahar gaya to?',
    icon: 'wallet-outline',
    accent: 'amber',
    steps: [
      'Neeche laal “+” dabao, phir “Kharcha Likho” chuno. (“Aur” tab → “Kharcha Likho” bhi wahi kholta hai.)',
      '“Kitna kharcha hua?” mein paisa daalo.',
      '“KIS CHEEZ KA” mein se chuno — Transport, Petrol, Rent, Bijli, Loading, Packing, Repair, Chai/Pani. Aur kuch ho to “Other”.',
      '“PAISA KAISE DIYA” chuno — Cash, Online ya UPI. “Kisne diya” mein naam chuno.',
      '“₹… likh do” dabao. Chit hai to “Receipt ki photo aur note” kholke photo laga do.',
    ],
    note: 'Maal kharidna kharcha nahi hai — wo “Stock Chadhao” se jaata hai. Yahan sirf wo paisa likho jo dukaan chalane mein gaya.',
    go: { label: 'Kharcha Likho', href: '/expenses' },
  },
  {
    q: 'Partner ka paisa kaise likhein?',
    icon: 'person-outline',
    accent: 'rose',
    steps: [
      '“Aur” tab → “Partner ka paisa likho” kholo. Ye sirf owner ko dikhta hai.',
      '“Kaunsa partner” chuno — naam likh ke naya partner bhi bana sakte ho.',
      '“Kitna paisa” daalo.',
      '“YE PAISA KIS TARAH KA HAI” mein do mein se ek dabao — “Business Kharcha” ya “Personal Paisa Nikala”.',
      'Baaki kharche jaisa hi — kis cheez ka, paisa kaise diya, kisne diya, tareekh. Phir “₹… likh do”.',
    ],
    note: 'Yahi ek cheez hai jo galat hui to seedha paise ka nuksan hai. Partner ne dukaan ke liye kisi ko diya — wo “Business Kharcha”. Partner apne ghar ke liye le gaya — wo “Personal Paisa Nikala”, aur wo business ka kharcha NAHI hai. Ghar wala paisa Business Kharcha mein likh diya to har mahine munafa kam dikhega, aur us jhoothe number par rate, maal aur staff sab tay ho jaayenge. Ek chune bina kuch save nahi hoga — jaan-boojh kar.',
    go: { label: 'Partner ka paisa likho', href: '/partner-kharcha' },
  },
  {
    q: 'Kiska kitna udhaar hai — khata kaise dekhein?',
    icon: 'people-outline',
    accent: 'amber',
    steps: [
      '“Aur” tab → Paisa mein “Grahak” kholo.',
      'Naam, firm, mobile ya shehar likh ke dhoondo, phir grahak par tap karo.',
      'Neeche “Khata” mein har entry hai — kya liya, kab, kitna diya.',
      'Paisa aa gaya ho to upar “Paisa aa gaya” dabao.',
      'Poora hisaab bhejna ho to “Hisaab bhejo”, sirf yaad dilana ho to “Yaad dilao”.',
    ],
    note: 'Plus ka matlab unka aapko dena hai. Supplier ke khate mein ulta hota hai — plus matlab aapko unhe dena hai.',
    go: { label: 'Grahak dekho', href: '/customers' },
  },
  {
    q: 'Udhaar ki yaad kaise dilayein?',
    icon: 'logo-whatsapp',
    accent: 'green',
    steps: [
      '“Aur” tab → “Yaad dilao” kholo — kisse paise lene hain, poori list aa jaayegi.',
      'Upar kul baaki paisa dikhta hai. “Sab”, “Aaj bill hua” aur “Overdue” se chhaant lo.',
      'Ek aadmi ko bhejne ke liye uske aage laal “Yaad dilao” dabao — ya sabko ek saath bhejne ke liye upar “Sabko bhejo”.',
      'WhatsApp khud khul jaayega, message pehle se likha hua. Aapko bas bhejna hai.',
      'Paisa aa gaya ho to usi line par “Paid” dabao. QR bhejna ho to QR wala button.',
    ],
    note: 'Message usi WhatsApp se jaata hai jo us phone par chalu hai. Counter wale phone par apna Business number rakhna. Jiska mobile number nahi hai, usko message nahi ja sakta.',
    go: { label: 'Yaad dilao', href: '/reminders' },
  },
  {
    q: 'Aaj din bhar kya-kya hua?',
    icon: 'receipt-outline',
    accent: 'blue',
    steps: [
      'Neeche “Bill” tab kholo.',
      'Upar se din chuno — “Aaj”, “Kal”, “7 Din”, “Is Mahine”, ya “Tareekh” se koi bhi din.',
      'Har kaam ek hi list mein hai, samay ke saath — bill, naya stock, kharcha, payment, kharab.',
      'Bill, supplier ke bill ya stock wali line par tap karo to wahi parchi khul jaayegi.',
    ],
    note: 'Subah ki entries yahan dikh rahi hain to app theek chal rahi hai. “App chal rahi hai ya nahi” ka sabse seedha jawab yahi hai.',
    go: { label: 'Bill kholo', href: '/parchi' },
  },
  {
    q: 'Kaunsa maal khatam ho raha hai?',
    icon: 'cube-outline',
    accent: 'violet',
    steps: [
      'Neeche “Stock” tab kholo.',
      'Upar wale box mein SKU, barcode ya naam likh ke dhoondo.',
      'Chips se chhaant lo — “Sab”, “Kam hai”, “Khatam”.',
      'Kisi item par tap karo to uska poora page, rate aur photo khul jaate hain.',
    ],
    note: '“Kam hai” ka matlab stock us item ke apne minimum tak aa gaya hai. Mangwane wali list “Aur” tab mein “Kya mangwana hai” se banti hai.',
    go: { label: 'Stock kholo', href: '/stock' },
  },
  {
    q: 'Maal kahan pada hai?',
    icon: 'business-outline',
    accent: 'teal',
    steps: [
      '“Aur” tab → Godown mein “Maal kahan pada hai” kholo.',
      'Har jagah ka apna tile hai — kitne pcs pade hain aur kitne ka maal hai.',
      'Jagah par tap karo — wahan ka saara maal neeche khul jaayega.',
      'Kisi item par tap karo to uska apna page khul jaayega.',
    ],
    note: '“Stock” tab par bhi “Maal kahan pada hai” likha aata hai, par wo sirf ginti batata hai. Andar kya-kya pada hai, wo yahan dikhta hai. Jis jagah kuch nahi hai wo bhi dikhegi — “kuch nahi hai” bhi ek jawab hai.',
    go: { label: 'Maal kahan pada hai', href: '/warehouse' },
  },
  {
    q: 'Mahine ka hisaab kaise dekhein?',
    icon: 'stats-chart-outline',
    accent: 'violet',
    steps: [
      'Neeche “Hisab” tab kholo.',
      'Upar se din chuno — “Aaj”, “7 Din”, “Is Mahine”, ya “Tareekh” mein apni “Se” aur “Tak” bharo.',
      'Ek hi jagah par: Sale, Maal Ki Cost, Gross Profit, Business Kharcha, Kharab / Loss, aur sabse neeche Munafa.',
      'Kisi bhi figure par tap karo — us number ke peeche ki saari entries khul jaayengi.',
    ],
    note: 'Hisab sirf maalik ko dikhta hai. Counter par baithe aadmi ko apne kaam ke liye Ghar aur Stock hi chahiye.',
    go: { label: 'Hisab kholo', href: '/hisab' },
  },
  {
    q: 'Munafa kaise nikalta hai?',
    icon: 'cash-outline',
    accent: 'green',
    steps: [
      'Sale — jitne ke bill bane.',
      'Usme se “Maal Ki Cost” ghatao — jo maal bika, wo aapko kitne ka pada tha. Jo bacha wo “Gross Profit”.',
      'Usme se “Business Kharcha” ghatao — rent, bijli, diesel, chai.',
      'Usme se “Kharab / Loss” ghatao — jo maal toota ya kharab hua, uski cost.',
      'Jo bacha, wahi Munafa hai. Hisab mein “Munafa” par tap karo — poora hisaab likha hua khul jaayega.',
    ],
    note: 'Maal kharidna kharcha NAHI hai. Maal aaya to sirf cash gaya aur maal aaya — wo cost tab banti hai jab wahi maal bikta hai. Dono ginenge to ek hi maal do baar kat jaayega. Isi tarah supplier ko diya paisa purani udhaar chukana hai, naya kharcha nahi; aur partner ka “personal nikala” paisa bhi Business Kharcha mein nahi aata.',
    go: { label: 'Hisab kholo', href: '/hisab' },
  },
  {
    q: 'Stock minus mein dikh raha hai — kya karein?',
    icon: 'warning-outline',
    accent: 'rose',
    steps: [
      'Iska matlab hai maal becha gaya, par wo us jagah kabhi chadha hi nahi.',
      '“Stock” tab sabse upar “Gadbad — stock minus mein hai” mein bata deta hai ki kaunsa maal aur kahan.',
      'Us line par tap karo — us item ka poora aana-jaana khul jaayega.',
      'Ya to maal aane ki entry reh gayi — “+” se “Stock Chadhao” karke chadha do.',
      'Ya koi bill galat bana hai — wo bill kholke dekh lo.',
    ],
    note: 'Zero stock par bill banane ki chhoot jaan-boojh kar hai, kyunki offline phone ko taaza ginti nahi pata hoti. Isliye baad mein mila lena zaroori hai.',
    go: { label: 'Stock kholo', href: '/stock' },
  },
  {
    q: 'Net na ho to kya hoga?',
    icon: 'cloud-offline-outline',
    accent: 'teal',
    steps: [
      'Sab kuch waise hi chalega — bill, khata, stock, kharcha, sab.',
      'App phone ke apne database se chalti hai, internet se nahi.',
      'Net aate hi sab apne aap server par chala jaayega.',
      '“Aur” tab mein “Sync ka haal” kholo — kitna bheja jaana baaki hai wahan dikhta hai.',
    ],
    note: 'Sirf photo upload karne ke liye net chahiye. Baaki sab offline chalta hai.',
    go: { label: 'Sync ka haal', href: '/sync' },
  },
  {
    q: 'Staff ka password bhool gaye?',
    icon: 'key-outline',
    accent: 'blue',
    steps: [
      'Owner: “Aur” tab → Dukan mein “Staff” kholo. Us aadmi par tap karo.',
      'Neeche “Password bhool gaye?” ke andar “Naya password” likho aur “Badlo” dabao.',
      'Unhe naya password khud bata do — email par kuch nahi jaata.',
    ],
    note: 'Apna password khud badalna ho to “Aur” tab mein “Apna password badlo”. Owner khud bhool jaye to login screen par “Password bhool gaye?” se email par link aata hai.',
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
          Neeche paanch jagah hain: Ghar · Stock · Bill · Hisab · Aur. Unke upar laal “+” har nayi
          entry ka darwaza hai — Stock Chadhao, Bill Banao, Kharcha Likho, Kharab Likho, Ginti Karo.
        </Text>
        <Text variant="small" color="textMuted">
          Tab wo jagah hai jahan aap jaate ho. “+” wo kaam hai jo aap karte ho.
        </Text>
      </Card>

      <SectionTitle>Roz ke kaam</SectionTitle>
      {TOPICS.map((t) => (
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

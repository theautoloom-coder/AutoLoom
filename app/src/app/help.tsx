/**
 * Kaise chalayein — the manual, written the way the shop thinks.
 *
 * Organised by the job somebody is trying to do, not by the screens the app
 * happens to have. Nobody at a counter thinks "I need the invoice module";
 * they think "bill banana hai". So the headings are the jobs, in the order a
 * day actually runs, and each one names the exact buttons on the real screens
 * so it can be followed while standing up with a customer waiting.
 *
 * Everything is folded shut. An open manual is a wall of text; a list of
 * questions is something you can scan.
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
    q: 'Bill kaise banayein?',
    icon: 'receipt-outline',
    accent: 'blue',
    steps: [
      'Neeche "Bill" tab kholo, phir "Naya bill" dabao.',
      'Grahak chuno. Naya grahak ho to wahin bana sakte ho.',
      'Maal ka naam, SKU ya barcode likho — ya scan kar lo.',
      'Qty aur rate dekh lo. Chhoot deni ho to "Chhoot %" mein daalo.',
      'Neeche payment chuno — cash, online, ya udhaar.',
      '"Post karo" dabao. Bill ban gaya aur stock apne aap kam ho gaya.',
    ],
    note: 'Udhaar chuna to wo grahak ke khate mein apne aap chadh jaata hai. Alag se kuch likhne ki zaroorat nahi.',
    go: { label: 'Naya bill banao', href: '/invoice/edit' },
  },
  {
    q: 'Naya maal aaya — stock kaise chadhayein?',
    icon: 'cube-outline',
    accent: 'green',
    steps: [
      '"Stock" tab kholo, upar "Maal aaya" dabao.',
      'Maal scan karo ya naam likho.',
      'Jitne piece aaye hain, wo qty daalo. + aur − se bhi badal sakte ho.',
      '"Chadha do" dabao. Bas.',
    ],
    note: 'Supplier ka bill bhi chadhana ho — rate, udhaar, sab — to "Maal aaya" ki jagah "Purchase bill" use karo.',
    go: { label: 'Maal aaya', href: '/stock/add' },
  },
  {
    q: 'Naya item kaise banayein?',
    icon: 'add-circle-outline',
    accent: 'violet',
    steps: [
      '"Stock" tab mein "Naya item" dabao.',
      'Photo kheencho — counter par dhoondhne mein sabse zyada yahi kaam aati hai.',
      'Category chuno, item ka naam likho, qty aur bechne ka rate daalo.',
      'Gaadi, colour, warranty jaisi cheezein "Aur detail" ke andar hain — zaroorat ho tabhi kholo.',
      '"Save karo" dabao.',
    ],
    note: 'Staff ke paas item banane ka haq nahi hota. Wo bhejte hain, aur owner "Requests" mein se approve karta hai.',
    go: { label: 'Naya item', href: '/admin/item' },
  },
  {
    q: 'Kiska kitna udhaar hai — khata kaise dekhein?',
    icon: 'people-outline',
    accent: 'amber',
    steps: [
      '"Ghar" tab par "Pending khata" mein sabse bade bakaya dikhte hain.',
      'Kisi bhi naam par tap karo — uska poora khata khul jaayega.',
      '"Khata" wale hisse mein har entry hai: kya liya, kab, kitna diya.',
      'Paisa aa gaya ho to "Paisa aa gaya" dabao.',
    ],
    note: 'Plus ka matlab unka aapko dena hai. Supplier ke khate mein ulta hota hai — plus matlab aapko unhe dena hai.',
    go: { label: 'Grahak dekho', href: '/customers' },
  },
  {
    q: 'Udhaar ki yaad kaise dilayein?',
    icon: 'logo-whatsapp',
    accent: 'green',
    steps: [
      '"Bill" tab mein "WhatsApp par yaad dilao aur parchi bhejo" kholo.',
      'Jise bhejna hai uske aage "Yaad dilao" dabao — ya sabko ek saath bhejne ke liye "Sabko bhejo".',
      'WhatsApp khud khul jaayega, message pehle se likha hua. Aapko bas bhejna hai.',
    ],
    note: 'Message usi WhatsApp se jaata hai jo us phone par chalu hai. Counter wale phone par apna Business number rakhna.',
    go: { label: 'Yaad dilao', href: '/reminders' },
  },
  {
    q: 'Mahine ka hisaab kaise nikaalein?',
    icon: 'bar-chart-outline',
    accent: 'violet',
    steps: [
      '"Aur" tab mein "Hisaab-kitab" kholo.',
      'Upar se date ka range chuno — aaj, is hafte, is mahine, ya apni marzi ki tareekh.',
      'Jo hisaab chahiye wo chuno: bikri, baaki paisa, stock ki keemat, margin.',
      'PDF chahiye to "PDF / print" dabao.',
    ],
    go: { label: 'Hisaab-kitab', href: '/reports' },
  },
  {
    q: 'Net na ho to kya hoga?',
    icon: 'cloud-offline-outline',
    accent: 'teal',
    steps: [
      'Sab kuch waise hi chalega — bill, khata, stock, sab.',
      'App phone ke apne database se chalti hai, internet se nahi.',
      'Net aate hi sab apne aap server par chala jaayega.',
      'Kitna bheja jaana baaki hai wo "Aur" tab mein "Sync ka haal" mein dikhta hai.',
    ],
    note: 'Sirf photo upload karne ke liye net chahiye. Baaki sab offline chalta hai.',
    go: { label: 'Sync ka haal', href: '/sync' },
  },
  {
    q: 'Stock minus mein dikh raha hai — kya karein?',
    icon: 'alert-circle-outline',
    accent: 'rose',
    steps: [
      'Iska matlab hai maal becha gaya par wo us jagah kabhi chadha hi nahi.',
      '"Stock" tab sabse upar bata deta hai ki kaunsa maal aur kahan.',
      'Ya to maal aane ki entry reh gayi — "Maal aaya" se chadha do.',
      'Ya koi bill galat bana hai — wo bill kholke dekh lo.',
    ],
    note: 'Zero stock par bill banane ki chhoot jaan-boojh kar hai, kyunki offline phone ko taaza ginti nahi pata hoti. Isliye baad mein mila lena zaroori hai.',
  },
  {
    q: 'Staff ka password bhool gaye?',
    icon: 'key-outline',
    accent: 'blue',
    steps: [
      'Owner: "Aur" tab → "Admin kholo" → Staff. Us aadmi par tap karo.',
      'Neeche "Password bhool gaye?" mein naya password likho aur "Badlo" dabao.',
      'Unhe naya password bata do.',
    ],
    note: 'Apna password khud badalna ho to "Aur" tab mein profile ke neeche "Apna password badlo". Owner khud bhool jaye to login screen par "Password bhool gaye?" se email par link aata hai.',
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

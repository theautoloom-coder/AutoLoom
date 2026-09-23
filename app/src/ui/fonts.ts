/**
 * Font loading.
 *
 * Native loads the three families from the bundled TTFs through expo-font.
 *
 * Web cannot: `app.json` uses `web.output: "single"`, and in that SPA mode
 * Expo Router serves a fixed HTML template and ignores `+html.tsx`, so there
 * is nowhere to put a stylesheet link at build time. `theme.ts` still names
 * the families in CSS, which means without this the browser matched the name,
 * found nothing, and silently fell back to system type — the design looked
 * right in the computed styles and wrong on screen. So on web the link is
 * injected at runtime instead, once, before first paint.
 *
 * Keep the families here in step with `fonts` in ./theme.ts.
 */
import { useFonts } from 'expo-font';
import { Platform } from 'react-native';
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';

const WEB_CSS =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

let webInjected = false;

function injectWebFonts() {
  if (webInjected || typeof document === 'undefined') return;
  webInjected = true;
  for (const [rel, href] of [
    ['preconnect', 'https://fonts.googleapis.com'],
    ['preconnect', 'https://fonts.gstatic.com'],
    ['stylesheet', WEB_CSS],
  ]) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (rel === 'preconnect' && href.includes('gstatic')) link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}

export function useAppFonts(): boolean {
  // `display=swap` means text paints in a fallback and reflows when the real
  // face lands, so web never blocks the first screen on the network.
  if (Platform.OS === 'web') {
    injectWebFonts();
    return true;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- Platform.OS is constant for the life of the process.
  const [loaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  return loaded;
}

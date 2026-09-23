/**
 * Font loading for the light design pass. New file: `app/src/ui/fonts.ts`.
 *
 * Install once:
 *   npx expo install expo-font @expo-google-fonts/bricolage-grotesque \
 *     @expo-google-fonts/ibm-plex-sans @expo-google-fonts/ibm-plex-mono
 *
 * Then in `app/src/app/_layout.tsx`, gate the tree on it (the splash screen
 * is already held there — keep it visible until `ready` is true):
 *
 *   const ready = useAppFonts();
 *   if (!ready) return null;
 *
 * On web, Metro serves the same families through the Google Fonts CSS that
 * `public/index.html` (or `app/+html.tsx`) loads, so this hook resolves
 * immediately and nothing blocks the first paint.
 */
import { useFonts } from 'expo-font';
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';

export function useAppFonts(): boolean {
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

import { Redirect } from 'expo-router';
import React from 'react';

/** The customer list lives in the Khata tab now; old links land there. */
export default function Go() {
  return <Redirect href={'/khata?tab=customer' as never} />;
}

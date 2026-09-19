import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

import {
  closeAllMockBroadcastChannels,
  installMockBroadcastChannel
} from './mockBroadcastChannel';

// Replace Node's native BroadcastChannel (injected into jsdom by Vitest).
// Native delivery throws: MessageEvent is not an instance of Event for EventTarget.
installMockBroadcastChannel();

afterEach(() => {
  // Safety net: close any channels left open by a test that forgot unsubscribe/unmount.
  closeAllMockBroadcastChannels();
});

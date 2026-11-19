// Compile-only consumer: this never connects to a desktop.
import { connect, screenshot, capabilities, RelayError } from '@appport/screen-relay';

const checkTypes = async () => {
  const desktop = await connect({ url: 'http://127.0.0.1:18094', timeout: 5000 });
  const pixels: Uint8Array = await screenshot({ url: 'http://127.0.0.1:18094' });
  const width: number = (await capabilities()).width;
  await capabilities({ url: 'https://127.0.0.1:18094', ca: 'ca.pem' });
  await capabilities({ url: 'https://127.0.0.1:18094', certificate: 'cert.pem' });
  await desktop.input({ type: 'pointerMove', x: 0.5, y: 0.5 });
  await desktop.input({ type: 'wheel', axis: 'vertical', delta: 120, x: 0, y: 1 });
  // @ts-expect-error Only the three supported mouse buttons are part of the API.
  await desktop.input({ type: 'buttonDown', button: 4, x: 0, y: 0 });
  // @ts-expect-error Keyboard input requires a USB HID usage.
  await desktop.input({ type: 'keyDown' });
  const error: Error = new RelayError('NETWORK_ERROR', 'Unavailable');
  desktop.close();
  return { pixels, width, error };
};
void checkTypes;

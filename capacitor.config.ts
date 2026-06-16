import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.miu.app',
  appName: 'MIU',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: { CapacitorHttp: { enabled: false } },
};
export default config;

import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'FormAlive',
  version: pkg.version,
  description: pkg.description,
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'FormAlive'
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module'
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
      all_frames: true
    }
  ],
  permissions: ['storage', 'activeTab', 'scripting', 'webNavigation'],
  host_permissions: [],
  icons: {
    16: 'src/assets/icon-16.png',
    48: 'src/assets/icon-48.png',
    128: 'src/assets/icon-128.png'
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'"
  }
});

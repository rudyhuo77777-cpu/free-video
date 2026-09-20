import fs from 'node:fs';
import crypto from 'node:crypto';

const expected = {
  'apps/web/app/globals.css':'75ad636a4eadb32633060c3fc4c66bf7b66b533666ed68ec5ee226499e42993d',
  'apps/web/app/layout.tsx':'78438edd01c56fa4de131b646c5890c04fee7f30437c792d0613a78111ad505e',
  'apps/web/app/page.tsx':'654308c083b0d8dc158071785c5357276bab62109fea1dce5c2b47c7c4aafcd3',
  'apps/web/app/projects/page.tsx':'82382c84700aee5b675e8c25d89ead52f75ab473f93571f226089a173b397bb6',
  'apps/web/app/tools/page.tsx':'11fcfbeed9df6a600b330fc658b212cf4194f423fb8b9bd23fd8582a8ccb4264',
  'apps/web/app/video/page.tsx':'f813fa4471102125cc165291a7f411512905d2981114b88bcf153944ea6cfd1e',
  'apps/web/components/LanguageProvider.tsx':'455f0a2ac0b401d07dc82de7a9cccaa606466b3dbd32c987b2144c518c4b0351',
  'apps/web/components/Nav.tsx':'dc8f91cbddefa809b58127779b9ddb1874138403c89e40c6f634542a5017a6e4',
  'apps/web/components/PwaRegistrar.tsx':'d980e0a967e332805f8a0c85b93078e675df47ff16abb040ebf067e34573da1e',
  'apps/web/components/TurnstileBox.tsx':'a21f9bd3d6e398770b43193937a15199719ab9617dfecb7dea74de118072156e',
  'apps/web/lib/client/tts.ts':'56d21d68bd842a204669c16215f264ea19d92b98d06208eb0b401f666f303c7e',
  'apps/web/lib/client/video-renderer.ts':'ba843e7c5acfc9d104acc5ba34dfa7b03460082ff77ba38da0657c3e281c12b5',
  'apps/web/public/fyp-local.html':'61dd65490620ac804d14f04b92b67dc85f52e2aa1dc2f99c090501c6a6d08a40',
  'apps/web/public/icon-192.png':'9d8fec8d115bf9edc6187e3dea0bdbcf07df8db023de04aebe81c9b56a8d2668',
  'apps/web/public/icon-512.png':'9077f2919306625c55b1894c876120d284ab0d4723461d86a9f468c7deeb86cc',
  'apps/web/public/icon.svg':'290a79f99a99c60df1906541d377d26612a041b8a9986e927c8d7cb7aa603623',
  'apps/web/public/manifest.webmanifest':'2bb2ee224b08e00be0f4150589a05faa985b241a68c2ed7d5a4b7503d1368124',
  'apps/web/public/reset-local-cache.html':'2ee3f0ddad3ae46a0b0a16da53b3344904df183971025daaeaa41c4df9fc5f93'
};

let failed=0;
for (const [file,want] of Object.entries(expected)) {
  const got=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const ok=got===want;
  console.log(`${ok?'PASS':'FAIL'} ${file}`);
  if(!ok){ console.log(`  expected ${want}\n  got      ${got}`); failed++; }
}
console.log(`\nUI integrity: ${Object.keys(expected).length-failed}/${Object.keys(expected).length} PASS`);
if(failed) process.exit(1);

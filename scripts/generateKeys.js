const { generateKeyPairSync } = require('crypto');

const signing = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const signingPrivate = signing.privateKey.export({ type: 'pkcs8', format: 'pem' });
const signingPublic = signing.publicKey.export({ type: 'spki', format: 'pem' });

const encryption = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const encryptionPrivate = encryption.privateKey.export({ type: 'pkcs8', format: 'pem' });
const encryptionPublic = encryption.publicKey.export({ type: 'spki', format: 'pem' });

console.log('MYINFO_PRIVATE_SIGNING_KEY=' + JSON.stringify(signingPrivate));
console.log('MYINFO_PUBLIC_SIGNING_KEY=' + JSON.stringify(signingPublic));
console.log('MYINFO_PRIVATE_ENCRYPTION_KEY=' + JSON.stringify(encryptionPrivate));
console.log('MYINFO_PUBLIC_ENCRYPTION_KEY=' + JSON.stringify(encryptionPublic));
/** Captured with OpenSSH 10.4p1 and OpenSSL 3.6.3 under LC_ALL=C on Linux. */

export const SSH_FIXTURE_VERSION = "OpenSSH_10.4p1";

export const sshFixtures = {
  fingerprintEd25519:
    "256 SHA256:HW9RqUZzUcV77QKLbkDAI5pzoivy7Oz/wm0oiGIBj4Y test@eda.invalid (ED25519)",

  fingerprintRsa: "2048 SHA256:kazDdgkK3LRagZCETT1fOqkAigmdb/k+mPatTcwwaBY rsa@eda.invalid (RSA)",

  fingerprintMd5:
    "256 MD5:76:6d:06:2b:15:77:9b:2d:bd:81:e9:6c:d1:7f:02:5d test@eda.invalid (ED25519)",

  publicKeyEd25519:
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICeMzDKk+JCgEuImVtTsfzBq31hOEHotEBLM5xbIADgx test@eda.invalid",

  publicKeyWithSpacedComment:
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICeMzDKk+JCgEuImVtTsfzBq31hOEHotEBLM5xbIADgx Eda work laptop",

  agentOneKey:
    "256 SHA256:HW9RqUZzUcV77QKLbkDAI5pzoivy7Oz/wm0oiGIBj4Y test@eda.invalid (ED25519)\n",

  agentTwoKeys:
    "256 SHA256:HW9RqUZzUcV77QKLbkDAI5pzoivy7Oz/wm0oiGIBj4Y work@eda.invalid (ED25519)\n" +
    "2048 SHA256:kazDdgkK3LRagZCETT1fOqkAigmdb/k+mPatTcwwaBY personal@eda.invalid (RSA)\n",

  agentEmpty: "The agent has no identities.\n",

  agentUnreachable: "Could not open a connection to your authentication agent.\n",

  agentAdded: "Identity added: k1 (test@eda.invalid)\n",

  probeEncrypted: 'Load key "k3": incorrect passphrase supplied to decrypt private key\n',

  probeUnencrypted:
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICeMzDKk+JCgEuImVtTsfzBq31hOEHotEBLM5xbIADgx\n",

  probeUnreadable: 'Load key "k3": Permission denied\n',

  keygenWouldOverwrite: "k1 already exists.\nOverwrite (y/n)? ",

  githubGreeting:
    "Hi eda! You've successfully authenticated, but GitHub does not provide shell access.\n",
  gitlabGreeting: "Welcome to GitLab, @eda!\n",
} as const;

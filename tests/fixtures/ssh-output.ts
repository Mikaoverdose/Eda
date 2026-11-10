// Synthetic OpenSSH 10.4p1 output: the Ed25519 blob uses 32 bytes of 0x01
// with computed fingerprints; the RSA digest uses 32 bytes of 0x02.

export const SSH_FIXTURE_VERSION = "OpenSSH_10.4p1";

export const sshFixtures = {
  fingerprintEd25519:
    "256 SHA256:RXm/ruZ0eTzRXKwi1AQEDynB0VgHQ2ac9KPSFdf/YnA test@eda.invalid (ED25519)",

  fingerprintRsa: "2048 SHA256:AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI rsa@eda.invalid (RSA)",

  fingerprintMd5:
    "256 MD5:d6:9a:30:45:17:cf:91:c4:27:94:f3:22:92:a3:00:0e test@eda.invalid (ED25519)",

  publicKeyEd25519:
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB test@eda.invalid",

  publicKeyWithSpacedComment:
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB Eda work laptop",

  agentOneKey:
    "256 SHA256:RXm/ruZ0eTzRXKwi1AQEDynB0VgHQ2ac9KPSFdf/YnA test@eda.invalid (ED25519)\n",

  agentTwoKeys:
    "256 SHA256:RXm/ruZ0eTzRXKwi1AQEDynB0VgHQ2ac9KPSFdf/YnA work@eda.invalid (ED25519)\n" +
    "2048 SHA256:AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI personal@eda.invalid (RSA)\n",

  agentEmpty: "The agent has no identities.\n",

  agentUnreachable: "Could not open a connection to your authentication agent.\n",

  agentAdded: "Identity added: k1 (test@eda.invalid)\n",

  probeEncrypted: 'Load key "k3": incorrect passphrase supplied to decrypt private key\n',

  probeUnencrypted:
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB\n",

  probeUnreadable: 'Load key "k3": Permission denied\n',

  keygenWouldOverwrite: "k1 already exists.\nOverwrite (y/n)? ",

  githubGreeting:
    "Hi eda! You've successfully authenticated, but GitHub does not provide shell access.\n",
  gitlabGreeting: "Welcome to GitLab, @eda!\n",
} as const;

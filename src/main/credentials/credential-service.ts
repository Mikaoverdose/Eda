import { errorText, type ErrorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type { Identity } from "@shared/identity/identity";
import type { AgentStatus, SecretMetadata, UnlockCredentialRequest } from "@shared/identity/ssh";
import type { IdentityRepository } from "../persistence/identity-repository";
import type { SecretStore } from "../secrets/secret-store";
import { secretKeys } from "../secrets/secret-store";
import type { SshService } from "../ssh/ssh-service";

export class CredentialService {
  constructor(
    private readonly identities: IdentityRepository,
    private readonly secrets: SecretStore,
    private readonly ssh: Pick<SshService, "unlockKey">,
  ) {}

  async getSecretMetadata(captured?: Identity): Promise<SecretMetadata> {
    const identity = captured ?? this.requireActiveIdentity();
    const remembered = this.secrets.available
      ? (await this.secrets.get(secretKeys.sshPassphrase(identity.id))) !== undefined
      : false;

    return {
      available: this.secrets.available,
      remembered,
      ...(!this.secrets.available && this.secrets.unavailableReason
        ? { reason: this.secrets.unavailableReason }
        : {}),
    };
  }

  async unlockActiveKey(
    request: UnlockCredentialRequest,
    suppliedPassphrase?: string,
    captured?: Identity,
  ): Promise<AgentStatus> {
    const identity = captured ?? this.requireActiveIdentity();

    if (!identity.sshKeyPath) {
      throw invalid(
        errorText("main.credentials.credentialService.thisIdentityHasNoAssignedSshKey"),
        errorText("main.credentials.credentialService.assignAKeyThenTryAgain"),
      );
    }

    const key = secretKeys.sshPassphrase(identity.id);
    const passphrase =
      suppliedPassphrase || (this.secrets.available ? await this.secrets.get(key) : undefined);

    if (!passphrase) {
      throw invalid(
        errorText("main.credentials.credentialService.enterTheKeySPassphrase"),
        errorText(
          "main.credentials.credentialService.theRememberedPassphraseIsUnavailableOrWasRemoved",
        ),
      );
    }

    const status = await this.ssh.unlockKey(
      {
        keyPath: identity.sshKeyPath,
        ...(request.lifetimeSeconds !== undefined && { lifetimeSeconds: request.lifetimeSeconds }),
      },
      passphrase,
    );

    if (suppliedPassphrase && this.secrets.available) {
      if (request.remember) await this.secrets.set(key, suppliedPassphrase);
      else await this.secrets.delete(key);
    }

    return status;
  }

  async forgetActivePassphrase(captured?: Identity): Promise<void> {
    const identity = captured ?? this.requireActiveIdentity();
    await this.secrets.delete(secretKeys.sshPassphrase(identity.id));
  }

  private requireActiveIdentity() {
    const id = this.identities.getActiveId();
    const identity = id ? this.identities.findById(id) : undefined;
    if (!identity)
      throw invalid(
        errorText("main.credentials.credentialService.thereIsNoActiveIdentity"),
        errorText("main.credentials.credentialService.selectAnIdentityAndTryAgain"),
      );
    return identity;
  }
}

function invalid(message: ErrorText, suggestedAction: ErrorText): GitError {
  return new GitError({
    kind: "invalid-input",
    operation: t("operations.unlockSshKey"),
    message,
    suggestedAction,
  });
}

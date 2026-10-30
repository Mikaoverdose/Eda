export interface RepositorySummary {
  id: string;
  identityId: string;
  name: string;
  path: string;
  favourite: boolean;
  lastOpenedAt?: string;
  available: boolean;
}

export interface InitRepositoryOptions {
  branch: string;
  readme: boolean;
  ignore: "none" | "node" | "python";
  license: "none" | "MIT";
}

export type RepositoryProvider = "github" | "gitlab";

export interface ProviderRepository {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  cloneUrl: string;
  private: boolean;
  archived: boolean;
  updatedAt: string | null;
}

export interface ProviderRepositoryPage {
  repositories: ProviderRepository[];
  nextPage: number | null;
}

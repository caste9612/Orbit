// Stato del workspace: cartella aperta, file attivo, ramo git.
// In milestone 2 è quasi vuoto; le milestone successive lo popolano.

export const workspace = $state({
  rootPath: null as string | null,
  rootName: null as string | null,
  branch: null as string | null,
});

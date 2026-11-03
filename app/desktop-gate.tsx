import { useEffect, useState } from "react";
import { ElectronNoteStorage } from "./electron-storage";
import { IndexedDbNoteStorage, type IndexedDbExport } from "./indexeddb-storage";
import { Button } from "./components/ui/button";
import { DEFAULT_FOLDER_ID } from "./storage";
import DashboardPage from "./page";

type VaultPathState = {
  path: string | null;
  valid: boolean;
  missing?: boolean;
};

function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 96 68" className="h-12 w-16 text-[#7763f6]" fill="currentColor">
      <path d="M24 0h60v38H60v30H0V30h24z" />
      <path d="M80 54h16v14H80z" />
    </svg>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DesktopGate() {
  const [vault, setVault] = useState<VaultPathState | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [warning, setWarning] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [legacy, setLegacy] = useState<IndexedDbExport | null>(null);
  const [legacyDecision, setLegacyDecision] = useState<"import" | "skip" | null>(null);

  async function checkSavedVault() {
    setChecking(true);
    setError("");
    try {
      const state = await window.ElixirDesktop!.getVaultPath();
      setVault(state);
      setSelectedPath("");
      setLegacy(null);
      setLegacyDecision(null);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void checkSavedVault();
  }, []);

  async function pickFolder() {
    setError("");
    try {
      const result = await window.ElixirDesktop!.chooseVaultFolder();
      if (!result) return;
      setSelectedPath(result.path);
      setWarning(result.warning);
      setLegacy(await new IndexedDbNoteStorage().exportExistingWorkspace());
      setLegacyDecision(null);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function importLegacy(storage: ElectronNoteStorage, exported: IndexedDbExport) {
    const folders = exported.folders.filter((folder) => folder.id !== DEFAULT_FOLDER_ID);
    for (const folder of folders) await storage.createFolder(folder);
    for (const note of exported.notes) await storage.writeNote(note);
    for (const file of exported.vaultFiles) {
      if (typeof file.value === "string") {
        await storage.writeVaultFile(file.path, file.value);
      } else {
        await storage.writeVaultAttachment(file.path, file.value);
      }
    }
    for (const bookmark of exported.bookmarks) {
      await storage.setBookmark(bookmark, true);
    }
  }

  async function continueToVault() {
    if (!selectedPath || busy || (legacy && legacyDecision === null)) return;
    setBusy(true);
    setError("");
    try {
      await window.ElixirDesktop!.chooseVaultFolder(selectedPath);
      const storage = new ElectronNoteStorage();
      if (legacy && legacyDecision === "import") await importLegacy(storage, legacy);
      setVault({ path: selectedPath, valid: true });
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-[#090b10]" aria-label="Loading vault" />;
  }
  if (vault?.valid) return <DashboardPage storage={new ElectronNoteStorage()} vaultPath={vault.path ?? ""} />;

  const missingPath = vault?.missing ? vault.path : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090b10] px-5 py-10 text-[#e8eaf0]">
      <section className="w-full max-w-xl rounded-2xl border border-white/[0.09] bg-[#11141c] p-7 shadow-2xl sm:p-10">
        <div className="mb-7 flex justify-center"><Logo /></div>
        <h1 className="text-center text-2xl font-medium tracking-tight text-[#f0efff]">
          Where should Elixir keep your notes?
        </h1>
        <p className="mx-auto mt-3 max-w-md text-center text-sm leading-6 text-[#9298a9]">
          Your notes are saved as plain Markdown files in a folder on your device.
        </p>

        {missingPath && !selectedPath && (
          <div className="mt-7 rounded-lg border border-[#ff929b]/25 bg-[#ff929b]/[0.06] p-4 text-sm text-[#ffb2b8]">
            <p>We can&apos;t find your vault at {missingPath}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void pickFolder()}>
                Choose another folder
              </Button>
              <Button variant="outline" size="sm" onClick={() => void checkSavedVault()}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {!selectedPath && !missingPath ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button className="h-12 justify-center bg-[#7763f6] text-white hover:bg-[#8875ff]" onClick={() => void pickFolder()}>
              Create new vault
            </Button>
            <Button variant="outline" className="h-12 justify-center" onClick={() => void pickFolder()}>
              Open existing folder
            </Button>
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-white/[0.08] bg-[#0c0f15] p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-all text-sm text-[#d4d7e0]" data-text-selectable>{selectedPath}</p>
              <button type="button" className="shrink-0 text-xs text-[#a99cff] hover:text-white" onClick={() => void pickFolder()}>
                Change
              </button>
            </div>
            {warning && (
              <p className="mt-3 text-xs leading-5 text-[#ffcf85]">
                This is a system folder or drive root. Choose a regular folder for safer storage.
              </p>
            )}
            {legacy && (
              <div className="mt-4 border-t border-white/[0.08] pt-4">
                <p className="text-sm text-[#e8eaf0]">Import your existing notes into this vault?</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant={legacyDecision === "import" ? "default" : "outline"} onClick={() => setLegacyDecision("import")}>Import</Button>
                  <Button size="sm" variant={legacyDecision === "skip" ? "default" : "outline"} onClick={() => setLegacyDecision("skip")}>Skip</Button>
                </div>
              </div>
            )}
            <Button
              className="mt-5 w-full justify-center bg-[#7763f6] text-white hover:bg-[#8875ff]"
              disabled={busy || (legacy !== null && legacyDecision === null)}
              onClick={() => void continueToVault()}
            >
              {busy ? "Opening vault..." : "Continue"}
            </Button>
          </div>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-[#ff929b]">{error}</p>}
      </section>
    </main>
  );
}

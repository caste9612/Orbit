import { describe, expect, it } from "vitest";
import { canonPath, isUnder, langLabel, pathKey, relativeTime, runCommand, samePath, shQuote } from "./util";

describe("percorsi canonici (M59: lo stesso file non si apre due volte)", () => {
  it("su Windows i separatori diventano \\", () => {
    expect(canonPath("D:\\Progetti\\Orbit\\src/lib/x.ts")).toBe("D:\\Progetti\\Orbit\\src\\lib\\x.ts");
    expect(canonPath("c:/a/b.txt")).toBe("c:\\a\\b.txt");
    expect(canonPath("//server/share/a.txt")).toBe("\\\\server\\share\\a.txt");
  });
  it("altrove e per gli id sintetici il percorso resta com'è", () => {
    expect(canonPath("/home/u/src/x.ts")).toBe("/home/u/src/x.ts");
    expect(canonPath("activity://board")).toBe("activity://board");
    expect(canonPath("commit:abc123")).toBe("commit:abc123");
  });
  it("stesso file con separatori e maiuscole diversi (solo su Windows)", () => {
    expect(samePath("D:\\Progetti\\Orbit\\src\\x.ts", "D:\\Progetti\\Orbit\\src/x.ts")).toBe(true);
    expect(samePath("D:\\Progetti\\Orbit\\src\\x.ts", "d:/progetti/orbit/SRC/X.ts")).toBe(true);
    expect(samePath("/home/u/A.ts", "/home/u/a.ts")).toBe(false); // Linux distingue le maiuscole
    expect(samePath("D:\\a\\x.ts", "D:\\a\\y.ts")).toBe(false);
  });
  it("chiave e appartenenza a una cartella", () => {
    expect(pathKey("D:\\A\\b.ts")).toBe("d:/a/b.ts");
    expect(isUnder("D:\\Repo\\src\\x.ts", "d:/repo/src")).toBe(true);
    expect(isUnder("D:\\Repo\\src\\x.ts", "D:\\Repo\\src\\")).toBe(true);
    expect(isUnder("D:\\Repo\\src", "D:\\Repo\\src")).toBe(true);
    expect(isUnder("D:\\Repo\\src2\\x.ts", "D:\\Repo\\src")).toBe(false);
    expect(isUnder("/home/u/src/x.ts", "/home/u/src")).toBe(true);
  });
});

describe("testi dell'interfaccia in inglese (M60)", () => {
  it("tempo relativo", () => {
    const now = Date.now() / 1000;
    expect(relativeTime(now - 20)).toBe("now");
    expect(relativeTime(now - 5 * 60)).toBe("5 min ago");
    expect(relativeTime(now - 2 * 3600)).toBe("2 h ago");
    expect(relativeTime(now - 3 * 86400)).toBe("3 d ago");
    expect(relativeTime(Date.UTC(2025, 2, 12, 12) / 1000)).toBe("12 Mar 2025");
  });
  it("linguaggio dei file di testo e sconosciuti", () => {
    expect(langLabel("notes.txt")).toBe("Plain Text");
    expect(langLabel("LICENSE")).toBe("Plain Text");
  });
});

describe("shQuote (M75)", () => {
  it("apici singoli: $, backtick e virgolette restano testo", () => {
    expect(shQuote("costa $5 e `x`")).toBe("'costa $5 e `x`'");
    expect(shQuote('dice "ciao"')).toBe(`'dice "ciao"'`);
  });
  it("un apice interno chiude, si escapa e riapre", () => {
    expect(shQuote("l'ordine")).toBe(String.raw`'l'\''ordine'`);
  });
});

describe("runCommand per piattaforma (M75)", () => {
  it("Windows: PowerShell, batch e bash, nome fra virgolette doppie", () => {
    expect(runCommand("build.ps1", true)).toBe('powershell -NoProfile -ExecutionPolicy Bypass -File "build.ps1"');
    expect(runCommand("x.CMD", true)).toBe('cmd /c "x.CMD"');
    expect(runCommand("a.sh", true)).toBe('bash "a.sh"');
  });
  it("Linux: pwsh per i .ps1, niente batch, nome fra apici singoli", () => {
    expect(runCommand("build.ps1", false)).toBe("pwsh -NoProfile -File 'build.ps1'");
    expect(runCommand("x.cmd", false)).toBeNull();
    expect(runCommand("x.bat", false)).toBeNull();
    expect(runCommand("it's.sh", false)).toBe(String.raw`bash 'it'\''s.sh'`);
    expect(runCommand("readme.md", false)).toBeNull();
  });
});

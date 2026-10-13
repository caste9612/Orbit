import { describe, expect, it } from "vitest";
import {
  buildCommand,
  buildProject,
  buildSolution,
  canRun,
  expandable,
  lazyChildren,
  nestParent,
  runCommandFor,
  type ProjModelDto,
  type SlnModelDto,
  type SNode,
} from "./solutionTree";

const names = (list: SNode[]) => list.map((n) => n.name);

const sln: SlnModelDto = {
  path: "C:\\r\\Demo.sln",
  name: "Demo",
  hiddenDirs: [],
  rootIsProject: false,
  nodes: [
    { id: "P1", name: "Demo.Web", kind: "project", path: "C:\\r\\src\\Demo.Web\\Demo.Web.csproj", parent: "F1", exists: true, files: [] },
    { id: "F1", name: "src", kind: "folder", path: null, parent: null, exists: true, files: ["C:\\r\\README.md"] },
    { id: "F2", name: "apps", kind: "folder", path: null, parent: "F1", exists: true, files: [] },
    { id: "P2", name: "Demo.Core", kind: "project", path: "C:\\r\\Demo.Core\\Demo.Core.csproj", parent: null, exists: true, files: [] },
    { id: "P3", name: "Native", kind: "project", path: "C:\\r\\Native\\Native.vcxproj", parent: null, exists: false, files: [] },
    { id: "F3", name: "Build", kind: "folder", path: null, parent: null, exists: true, files: [] },
  ],
};

describe("buildSolution (soluzione, cartelle di soluzione, progetti)", () => {
  const root = buildSolution(sln);
  it("prima le cartelle, poi i progetti, ciascuno in ordine alfabetico", () => {
    expect(root.detail).toBe("3 projects");
    expect(names(root.children)).toEqual(["Build", "src", "Demo.Core", "Native"]);
  });
  it("dentro una cartella: sottocartelle, progetti, poi i file della soluzione", () => {
    const src = root.children.find((n) => n.name === "src")!;
    expect(names(src.children)).toEqual(["apps", "Demo.Web", "README.md"]);
    expect(src.children[2].kind).toBe("file");
  });
  it("progetti con linguaggio, cartella e file mancante", () => {
    const core = root.children.find((n) => n.name === "Demo.Core")!;
    expect(core).toMatchObject({ kind: "project", lang: "cs", dir: "C:\\r\\Demo.Core" });
    const native = root.children.find((n) => n.name === "Native")!;
    expect(native).toMatchObject({ lang: "cpp", missing: true });
    expect(expandable(native)).toBe(false);
  });
});

const proj = (over: Partial<ProjModelDto>): ProjModelDto => ({
  path: "C:\\r\\App\\App.csproj",
  dir: "C:\\r\\App",
  style: "sdk",
  lang: "cs",
  outputType: "WinExe",
  tfms: ["net8.0-windows"],
  items: [],
  deps: { frameworks: [], packages: [], projects: [], assemblies: [] },
  truncated: false,
  ...over,
});

describe("buildProject (contenuto del progetto)", () => {
  it("Dependencies in cima, poi Properties, le altre cartelle e i file", () => {
    const kids = buildProject(
      proj({
        items: [
          { v: "Views", p: "C:\\r\\App\\Views", dir: true },
          { v: "Properties", p: "C:\\r\\App\\Properties", dir: true },
          { v: "Views/Main.xaml", p: "C:\\r\\App\\Views\\Main.xaml" },
          { v: "Properties/AssemblyInfo.cs", p: "x" },
          { v: "App.xaml", p: "C:\\r\\App\\App.xaml" },
          { v: "Assets/logo.png", p: "C:\\r\\shared\\logo.png", link: true },
        ],
        deps: {
          frameworks: [{ name: "Microsoft.NETCore.App" }],
          packages: [{ name: "Serilog", detail: "4.0.0" }],
          projects: [{ name: "Core", path: "C:\\r\\Core\\Core.csproj" }],
          assemblies: [],
        },
      }),
      "p:app",
    );
    expect(names(kids)).toEqual(["Dependencies", "Properties", "Assets", "Views", "App.xaml"]);
    const deps = kids[0];
    expect(names(deps.children)).toEqual(["Frameworks", "Packages", "Projects"]);
    expect(deps.children[1].children[0]).toMatchObject({ name: "Serilog", detail: "4.0.0" });
    expect(deps.children[2].children[0].target).toBe("C:\\r\\Core\\Core.csproj");
    // cartella dei soli file collegati: virtuale, senza percorso su disco
    const assets = kids.find((n) => n.name === "Assets")!;
    expect(assets.path).toBeNull();
    expect(assets.children[0].link).toBe(true);
    expect(kids.find((n) => n.name === "Views")!.dir).toBe("C:\\r\\App\\Views");
  });

  it("annida i file come Visual Studio", () => {
    const kids = buildProject(
      proj({
        items: [
          { v: "App.xaml" },
          { v: "App.xaml.cs" },
          { v: "Form1.cs" },
          { v: "Form1.Designer.cs" },
          { v: "Form1.resx" },
          { v: "Properties/Resources.resx" },
          { v: "Properties/Resources.Designer.cs" },
          { v: "Model.cs" },
          { v: "Model.g.cs", dep: "Model.cs" },
          { v: "appsettings.json" },
          { v: "appsettings.Development.json" },
        ],
      }),
      "p:app",
    );
    expect(names(kids)).toEqual(["Properties", "App.xaml", "appsettings.json", "Form1.cs", "Model.cs"]);
    expect(names(kids.find((n) => n.name === "App.xaml")!.children)).toEqual(["App.xaml.cs"]);
    expect(names(kids.find((n) => n.name === "Form1.cs")!.children)).toEqual(["Form1.Designer.cs", "Form1.resx"]);
    expect(names(kids.find((n) => n.name === "Model.cs")!.children)).toEqual(["Model.g.cs"]);
    expect(names(kids.find((n) => n.name === "appsettings.json")!.children)).toEqual(["appsettings.Development.json"]);
    expect(names(kids[0].children)).toEqual(["Resources.resx"]);
    expect(names(kids[0].children[0].children)).toEqual(["Resources.Designer.cs"]);
  });

  it("un DependentUpon circolare non fa sparire i file", () => {
    const kids = buildProject(proj({ items: [{ v: "a.cs", dep: "b.cs" }, { v: "b.cs", dep: "a.cs" }] }), "p:x");
    const all = kids.flatMap((n) => [n.name, ...n.children.map((c) => c.name)]);
    expect(all.sort()).toEqual(["a.cs", "b.cs"]);
  });

  it("progetti vecchio stile e C++: un nodo References; filtri virtuali", () => {
    const kids = buildProject(
      proj({
        style: "cpp",
        lang: "cpp",
        items: [{ v: "Source Files", dir: true }, { v: "Source Files/main.cpp", p: "C:\\r\\N\\main.cpp" }],
        deps: { frameworks: [], packages: [], projects: [{ name: "Lib", path: "C:\\r\\Lib\\Lib.vcxproj" }], assemblies: [] },
      }),
      "p:n",
    );
    expect(names(kids)).toEqual(["References", "Source Files"]);
    expect(kids[1].path).toBeNull();
  });

  it("Show All Files: cartelle escluse da aprire a richiesta, in grigio", () => {
    const kids = buildProject(proj({ items: [{ v: "bin", p: "C:\\r\\App\\bin", dir: true, excluded: true, lazy: true }, { v: "old.txt", p: "x", excluded: true }] }), "p:a");
    expect(kids[0]).toMatchObject({ name: "bin", lazy: true, excluded: true });
    expect(expandable(kids[0])).toBe(true);
    expect(kids[1].excluded).toBe(true);
    const inner = lazyChildren([{ name: "Debug", path: "C:\\r\\App\\bin\\Debug", isDir: true }], kids[0].id);
    expect(inner[0]).toMatchObject({ kind: "dir", lazy: true, excluded: true });
  });
});

describe("nestParent", () => {
  const set = (...n: string[]) => new Set(n.map((x) => x.toLowerCase()));
  it("regole", () => {
    expect(nestParent("MainWindow.xaml.cs", set("MainWindow.xaml"))).toBe("MainWindow.xaml");
    expect(nestParent("Settings.Designer.cs", set("Settings.settings"))).toBe("Settings.settings");
    expect(nestParent("Index.razor.css", set("Index.razor"))).toBe("Index.razor");
    expect(nestParent("Resources.resx", set("Resources.Designer.cs"))).toBeNull();
    expect(nestParent("Program.cs", set("Program.cs"))).toBeNull();
  });
});

describe("comandi", () => {
  it("build con l'MSBuild di Visual Studio, in PowerShell", () => {
    const msb = "C:\\Program Files\\Microsoft Visual Studio\\18\\Community\\MSBuild\\Current\\Bin\\amd64\\MSBuild.exe";
    expect(buildCommand("rebuild", "C:\\r\\Demo.sln", msb)).toEqual({
      shell: "powershell.exe",
      command: `& "${msb}" "C:\\r\\Demo.sln" -t:Rebuild -restore -m -nologo -v:minimal -p:Configuration=Debug`,
    });
    expect(buildCommand("clean", "x.csproj", msb).command).not.toContain("-restore");
  });
  it("senza Visual Studio: dotnet", () => {
    expect(buildCommand("build", "x.csproj", null)).toEqual({ shell: null, command: 'dotnet build "x.csproj" -c Debug' });
    expect(buildCommand("rebuild", "x.csproj", null).command).toBe('dotnet build "x.csproj" -c Debug --no-incremental');
    expect(buildCommand("clean", "x.csproj", null).command).toBe('dotnet clean "x.csproj" -c Debug');
  });
  it("Run solo sui progetti SDK eseguibili; con più framework il primo", () => {
    expect(canRun(proj({}))).toBe(true);
    expect(canRun(proj({ outputType: "Library" }))).toBe(false);
    expect(canRun(proj({ style: "legacy", outputType: "Exe" }))).toBe(false);
    expect(canRun(proj({ style: "cpp", lang: "cpp", outputType: "Application" }))).toBe(false);
    expect(runCommandFor(proj({ tfms: ["net8.0", "net48"] }))).toBe('dotnet run --project "C:\\r\\App\\App.csproj" -c Debug -f net8.0');
  });
});
